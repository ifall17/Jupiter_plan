import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { JwtPayload } from '../../modules/auth/strategies/jwt.strategy';

type JoinOrgPayload = {
  org_id?: string;
};

type AuthenticatedSocket = Socket & {
  data: {
    user?: JwtPayload;
  };
};

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  @WebSocketServer()
  private server!: Server;

  handleConnection(client: Socket): void {
    try {
      const authenticatedClient = client as AuthenticatedSocket;
      const token = this.extractBearerToken(client);
      if (!token) {
        throw new UnauthorizedException('Missing socket bearer token');
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
        algorithms: ['HS256'],
      });

      if (!payload?.sub || !payload.org_id) {
        throw new UnauthorizedException('Invalid socket token payload');
      }

      authenticatedClient.data.user = payload;
      client.join(this.orgRoom(payload.org_id));

      this.logger.log({
        event_type: 'socket.connected',
        socket_id: client.id,
        user_id: payload.sub,
        org_id: payload.org_id,
      });
    } catch (error) {
      this.logger.warn({
        event_type: 'socket.connection_rejected',
        socket_id: client.id,
        reason: error instanceof Error ? error.message : 'unknown',
      });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    this.logger.log({ event_type: 'socket.disconnected', socket_id: client.id });
  }

  @SubscribeMessage('JOIN_ORG')
  handleJoinOrg(@ConnectedSocket() client: Socket, @MessageBody() payload: JoinOrgPayload): void {
    const authenticatedClient = client as AuthenticatedSocket;
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

  emit(event: string, payload: Record<string, unknown>): void {
    if (!this.server) {
      this.logger.warn({ event_type: 'socket.emit.skipped', reason: 'server_not_ready', event });
      return;
    }

    this.server.emit(event, payload);
    this.logger.log({ event_type: 'socket.emit', event, payload });
  }

  emitToOrg(orgId: string, event: string, payload: Record<string, unknown>): void {
    if (!this.server) {
      this.logger.warn({ event_type: 'socket.emit_org.skipped', reason: 'server_not_ready', event, org_id: orgId });
      return;
    }

    this.server.to(this.orgRoom(orgId)).emit(event, payload);
    this.logger.log({ event_type: 'socket.emit', event, payload });
  }

  private orgRoom(orgId: string): string {
    return `org:${orgId}`;
  }

  private extractBearerToken(client: Socket): string | null {
    const authHeader =
      this.readHandshakeValue(client, 'Authorization') ??
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

  private readHandshakeValue(client: Socket, key: 'Authorization' | 'authorization'): unknown {
    const auth = client.handshake.auth as Record<string, unknown> | undefined;
    const headers = client.handshake.headers as Record<string, unknown> | undefined;
    return auth?.[key] ?? headers?.[key];
  }
}
