import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Queue } from 'bullmq';
import * as argon2 from 'argon2';
import { UserRole } from '@shared/enums';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { RedisService } from '../../redis/redis.service';

jest.mock('argon2', () => ({
  hash: jest.fn(),
  verify: jest.fn(),
  argon2id: 2,
}));

describe('UsersService', () => {
  let service: UsersService;
  let usersRepository: jest.Mocked<UsersRepository>;
  let redisService: jest.Mocked<RedisService>;
  let notifQueue: jest.Mocked<Queue>;

  const currentUser = {
    sub: 'admin-1',
    org_id: 'org-1',
    role: UserRole.SUPER_ADMIN,
    email: 'admin@diallo.sn',
  };

  beforeEach(() => {
    usersRepository = {
      findPaginated: jest.fn(),
      findByIdInOrg: jest.fn(),
      findByEmailInOrg: jest.fn(),
      findForPasswordCheck: jest.fn(),
      createInvitedUser: jest.fn(),
      updateUserByIdInOrg: jest.fn(),
      setActiveState: jest.fn(),
      updatePassword: jest.fn(),
      createAuditLog: jest.fn(),
    } as unknown as jest.Mocked<UsersRepository>;

    redisService = {
      del: jest.fn(),
    } as unknown as jest.Mocked<RedisService>;

    notifQueue = {
      add: jest.fn(),
    } as unknown as jest.Mocked<Queue>;

    service = new UsersService(usersRepository, redisService, notifQueue);
  });

  it('should return paginated users when role is SUPER_ADMIN', async () => {
    // Arrange
    usersRepository.findPaginated.mockResolvedValue({
      items: [
        {
          id: 'u1',
          email: 'u1@diallo.sn',
          first_name: 'A',
          last_name: 'B',
          role: UserRole.FPA,
          org_id: 'org-1',
          is_active: true,
          last_login_at: null,
          created_at: new Date(),
          department_scopes: [],
        },
      ],
      total: 1,
    });

    // Act
    const result = await service.listUsers({ currentUser, page: 1, limit: 20 });

    // Assert
    expect(result.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).not.toHaveProperty('password_hash');
  });

  it('should throw NotFoundException when user belongs to different org', async () => {
    // Arrange
    usersRepository.findByIdInOrg.mockResolvedValue(null);

    // Act
    const act = service.getById(currentUser, 'other-org-user');

    // Assert
    await expect(act).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when SUPER_ADMIN deactivates himself', async () => {
    // Arrange
    usersRepository.findByIdInOrg.mockResolvedValue({
      id: currentUser.sub,
      email: currentUser.email,
      first_name: 'Admin',
      last_name: 'Root',
      role: UserRole.SUPER_ADMIN,
      org_id: currentUser.org_id,
      is_active: true,
      last_login_at: null,
      created_at: new Date(),
      department_scopes: [],
    });

    // Act
    const act = service.toggleUser(currentUser, currentUser.sub);

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  it('should throw BadRequestException when confirm_password does not match', async () => {
    // Arrange
    const dto = {
      current_password: 'CurrentPass1!',
      new_password: 'NewPass1!',
      confirm_password: 'NotSamePass1!',
    };

    // Act
    const act = service.changeMyPassword(currentUser, dto);

    // Assert
    await expect(act).rejects.toThrow(BadRequestException);
  });

  it('should create department_scope when role is CONTRIBUTEUR', async () => {
    // Arrange
    usersRepository.findByEmailInOrg.mockResolvedValue(null);
    usersRepository.createInvitedUser.mockResolvedValue({
      id: 'u2',
      email: 'contrib@diallo.sn',
      first_name: 'Ibrahima',
      last_name: 'Fall',
      role: UserRole.CONTRIBUTEUR,
      org_id: currentUser.org_id,
      is_active: true,
      last_login_at: null,
      created_at: new Date(),
      department_scopes: [{ department: 'VENTES', can_read: true, can_write: true }],
    });
    (argon2.hash as jest.Mock).mockResolvedValue('hash');

    // Act
    const result = await service.inviteUser(currentUser, {
      email: 'contrib@diallo.sn',
      first_name: 'Ibrahima',
      last_name: 'Fall',
      role: UserRole.CONTRIBUTEUR,
      department: 'VENTES',
    });

    // Assert
    expect(usersRepository.createInvitedUser).toHaveBeenCalledWith(
      expect.objectContaining({ role: UserRole.CONTRIBUTEUR, department: 'VENTES' }),
    );
    expect(result.department_scope).toEqual([{ department: 'VENTES', can_read: true, can_write: true }]);
  });

  it('should invalidate Redis session when user is deactivated', async () => {
    // Arrange
    usersRepository.findByIdInOrg.mockResolvedValue({
      id: 'u3',
      email: 'fpa@diallo.sn',
      first_name: 'Aminata',
      last_name: 'Sow',
      role: UserRole.FPA,
      org_id: currentUser.org_id,
      is_active: true,
      last_login_at: null,
      created_at: new Date(),
      department_scopes: [],
    });

    // Act
    const result = await service.toggleUser(currentUser, 'u3');

    // Assert
    expect(redisService.del).toHaveBeenCalledWith('refresh:u3');
    expect(result.is_active).toBe(false);
  });

  it('should never return password_hash in any response', async () => {
    // Arrange
    usersRepository.findByIdInOrg.mockResolvedValue({
      id: 'u4',
      email: 'lecteur@diallo.sn',
      first_name: 'L',
      last_name: 'R',
      role: UserRole.LECTEUR,
      org_id: currentUser.org_id,
      is_active: true,
      last_login_at: null,
      created_at: new Date(),
      department_scopes: [],
    });

    // Act
    const result = await service.getById(currentUser, 'u4');

    // Assert
    expect(result).not.toHaveProperty('password_hash');
  });

  it('should throw INVALID_CREDENTIALS when current_password is wrong', async () => {
    // Arrange
    usersRepository.findForPasswordCheck.mockResolvedValue({
      id: 'u5',
      org_id: currentUser.org_id,
      email: currentUser.email,
      password_hash: 'stored-hash',
    });
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    // Act
    const act = service.changeMyPassword(currentUser, {
      current_password: 'WrongPass1!',
      new_password: 'NewPass1!',
      confirm_password: 'NewPass1!',
    });

    // Assert
    await expect(act).rejects.toThrow(UnauthorizedException);
  });
});
