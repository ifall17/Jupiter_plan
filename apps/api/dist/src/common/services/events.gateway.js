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
const socket_io_1 = require("socket.io");
let EventsGateway = EventsGateway_1 = class EventsGateway {
    constructor() {
        this.logger = new common_1.Logger(EventsGateway_1.name);
    }
    handleConnection(client) {
        this.logger.log({ event_type: 'socket.connected', socket_id: client.id });
    }
    handleDisconnect(client) {
        this.logger.log({ event_type: 'socket.disconnected', socket_id: client.id });
    }
    handleJoinOrg(client, payload) {
        const orgId = (payload.org_id ?? '').trim();
        if (!orgId) {
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
    })
], EventsGateway);
//# sourceMappingURL=events.gateway.js.map