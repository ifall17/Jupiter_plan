import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventsGateway } from './events.gateway';

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let jwtService: jest.Mocked<JwtService>;
  let configService: { get: jest.Mock };

  type MockSocketClient = {
    id: string;
    handshake: {
      auth: Record<string, unknown>;
      headers: Record<string, unknown>;
    };
    data: {
      user?: {
        sub?: string;
        org_id?: string;
      };
    };
    join: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;

    configService = {
      get: jest.fn().mockReturnValue('secret'),
    };

    gateway = new EventsGateway(jwtService, configService as unknown as ConfigService);
  });

  it('should authenticate the socket and join the organization room', () => {
    const client: MockSocketClient = {
      id: 'socket-1',
      handshake: {
        auth: { Authorization: 'Bearer token-123' },
        headers: {},
      },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    jwtService.verify.mockReturnValue({
      sub: 'user-1',
      org_id: 'org-1',
      role: 'FPA',
      email: 'user@example.com',
      iat: 1,
      exp: 2,
    } as never);

    gateway.handleConnection(client as never);

    expect(client.join).toHaveBeenCalledWith('org:org-1');
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.data.user).toMatchObject({ sub: 'user-1', org_id: 'org-1' });
  });

  it('should reject sockets without a bearer token', () => {
    const client: MockSocketClient = {
      id: 'socket-2',
      handshake: {
        auth: {},
        headers: {},
      },
      data: {},
      join: jest.fn(),
      disconnect: jest.fn(),
    };

    gateway.handleConnection(client as never);

    expect(client.join).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('should refuse joining another organization room', () => {
    const client = {
      id: 'socket-3',
      data: {
        user: {
          sub: 'user-1',
          org_id: 'org-1',
        },
      },
      join: jest.fn(),
    };

    gateway.handleJoinOrg(client as never, { org_id: 'org-2' });

    expect(client.join).not.toHaveBeenCalled();
  });
});