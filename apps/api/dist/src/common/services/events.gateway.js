"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EventsGateway_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const socket_io_1 = require("socket.io");
let EventsGateway = EventsGateway_1 = class EventsGateway {
    constructor(jwtService, configService) {
        this.jwtService = jwtService;
        this.configService = configService;
        this.logger = new common_1.Logger(EventsGateway_1.name);
    }
    handleConnection(client) {
        try {
            const authenticatedClient = client;
            const token = this.extractBearerToken(client);
            if (!token) {
                throw new common_1.UnauthorizedException('Missing socket bearer token');
            }
            const payload = this.jwtService.verify(token, {
                secret: this.configService.get('JWT_SECRET'),
                algorithms: ['HS256'],
            });
            if (!payload?.sub || !payload.org_id) {
                throw new common_1.UnauthorizedException('Invalid socket token payload');
            }
            authenticatedClient.data.user = payload;
            client.join(this.orgRoom(payload.org_id));
            this.logger.log({
                event_type: 'socket.connected',
                socket_id: client.id,
                user_id: payload.sub,
                org_id: payload.org_id,
            });
        }
        catch (error) {
            this.logger.warn({
                event_type: 'socket.connection_rejected',
                socket_id: client.id,
                reason: error instanceof Error ? error.message : 'unknown',
            });
            client.disconnect(true);
        }
    }
    handleDisconnect(client) {
        this.logger.log({ event_type: 'socket.disconnected', socket_id: client.id });
    }
    handleJoinOrg(client, payload) {
        const authenticatedClient = client;
        const authenticatedOrgId = authenticatedClient.data.user?.org_id;
        const orgId = (payload.org_id ?? '').trim();
        if (!orgId || !authenticatedOrgId) {
            return;
        }
        if (orgId !== authenticatedOrgId) {
            this.logger.warn({
                event_type: 'socket.join_org_rejected',
                socket_id: client.id,
                requested_org_id: orgId,
                authenticated_org_id: authenticatedOrgId,
            });
            return;
        }
        client.join(this.orgRoom(orgId));
        this.logger.log({ event_type: 'socket.join_org', socket_id: client.id, org_id: orgId });
    }
    emit(event, payload) {
        if (!this.server) {
            this.logger.warn({ event_type: 'socket.emit.skipped', reason: 'server_not_ready', event });
            return;
        }
        this.server.emit(event, payload);
        this.logger.log({ event_type: 'socket.emit', event, payload });
    }
    emitToOrg(orgId, event, payload) {
        if (!this.server) {
            this.logger.warn({ event_type: 'socket.emit_org.skipped', reason: 'server_not_ready', event, org_id: orgId });
            return;
        }
        this.server.to(this.orgRoom(orgId)).emit(event, payload);
        this.logger.log({ event_type: 'socket.emit', event, payload });
    }
    orgRoom(orgId) {
        return `org:${orgId}`;
    }
    extractBearerToken(client) {
        const authHeader = this.readHandshakeValue(client, 'Authorization') ??
            this.readHandshakeValue(client, 'authorization');
        if (typeof authHeader !== 'string') {
            return null;
        }
        const normalized = authHeader.trim();
        if (!normalized.toLowerCase().startsWith('bearer ')) {
            return null;
        }
        const token = normalized.slice(7).trim();
        return token || null;
    }
    readHandshakeValue(client, key) {
        const auth = client.handshake.auth;
        const headers = client.handshake.headers;
        return auth?.[key] ?? headers?.[key];
    }
};
exports.EventsGateway = EventsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], EventsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('JOIN_ORG'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __param(1, (0, websockets_1.MessageBody)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [socket_io_1.Socket, Object]),
    __metadata("design:returntype", void 0)
], EventsGateway.prototype, "handleJoinOrg", null);
exports.EventsGateway = EventsGateway = EventsGateway_1 = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: true,
            credentials: true,
        },
    }),
    __metadata("design:paramtypes", [jwt_1.JwtService,
        config_1.ConfigService])
], EventsGateway);
//# sourceMappingURL=events.gateway.js.map