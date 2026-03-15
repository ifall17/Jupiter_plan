"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const argon2 = require("argon2");
const enums_1 = require("../../shared/enums");
const users_service_1 = require("./users.service");
jest.mock('argon2', () => ({
    hash: jest.fn(),
    verify: jest.fn(),
    argon2id: 2,
}));
describe('UsersService', () => {
    let service;
    let usersRepository;
    let redisService;
    let notifQueue;
    const currentUser = {
        sub: 'admin-1',
        org_id: 'org-1',
        role: enums_1.UserRole.SUPER_ADMIN,
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
        };
        redisService = {
            del: jest.fn(),
        };
        notifQueue = {
            add: jest.fn(),
        };
        service = new users_service_1.UsersService(usersRepository, redisService, notifQueue);
    });
    it('should return paginated users when role is SUPER_ADMIN', async () => {
        usersRepository.findPaginated.mockResolvedValue({
            items: [
                {
                    id: 'u1',
                    email: 'u1@diallo.sn',
                    first_name: 'A',
                    last_name: 'B',
                    role: enums_1.UserRole.FPA,
                    org_id: 'org-1',
                    is_active: true,
                    last_login_at: null,
                    created_at: new Date(),
                    department_scopes: [],
                },
            ],
            total: 1,
        });
        const result = await service.listUsers({ currentUser, page: 1, limit: 20 });
        expect(result.total).toBe(1);
        expect(result.data).toHaveLength(1);
        expect(result.data[0]).not.toHaveProperty('password_hash');
    });
    it('should throw NotFoundException when user belongs to different org', async () => {
        usersRepository.findByIdInOrg.mockResolvedValue(null);
        const act = service.getById(currentUser, 'other-org-user');
        await expect(act).rejects.toThrow(common_1.NotFoundException);
    });
    it('should throw BadRequestException when SUPER_ADMIN deactivates himself', async () => {
        usersRepository.findByIdInOrg.mockResolvedValue({
            id: currentUser.sub,
            email: currentUser.email,
            first_name: 'Admin',
            last_name: 'Root',
            role: enums_1.UserRole.SUPER_ADMIN,
            org_id: currentUser.org_id,
            is_active: true,
            last_login_at: null,
            created_at: new Date(),
            department_scopes: [],
        });
        const act = service.toggleUser(currentUser, currentUser.sub);
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should throw BadRequestException when confirm_password does not match', async () => {
        const dto = {
            current_password: 'CurrentPass1!',
            new_password: 'NewPass1!',
            confirm_password: 'NotSamePass1!',
        };
        const act = service.changeMyPassword(currentUser, dto);
        await expect(act).rejects.toThrow(common_1.BadRequestException);
    });
    it('should create department_scope when role is CONTRIBUTEUR', async () => {
        usersRepository.findByEmailInOrg.mockResolvedValue(null);
        usersRepository.createInvitedUser.mockResolvedValue({
            id: 'u2',
            email: 'contrib@diallo.sn',
            first_name: 'Ibrahima',
            last_name: 'Fall',
            role: enums_1.UserRole.CONTRIBUTEUR,
            org_id: currentUser.org_id,
            is_active: true,
            last_login_at: null,
            created_at: new Date(),
            department_scopes: [{ department: 'VENTES', can_read: true, can_write: true }],
        });
        argon2.hash.mockResolvedValue('hash');
        const result = await service.inviteUser(currentUser, {
            email: 'contrib@diallo.sn',
            first_name: 'Ibrahima',
            last_name: 'Fall',
            role: enums_1.UserRole.CONTRIBUTEUR,
            department: 'VENTES',
        });
        expect(usersRepository.createInvitedUser).toHaveBeenCalledWith(expect.objectContaining({ role: enums_1.UserRole.CONTRIBUTEUR, department: 'VENTES' }));
        expect(result.department_scope).toEqual([{ department: 'VENTES', can_read: true, can_write: true }]);
    });
    it('should invalidate Redis session when user is deactivated', async () => {
        usersRepository.findByIdInOrg.mockResolvedValue({
            id: 'u3',
            email: 'fpa@diallo.sn',
            first_name: 'Aminata',
            last_name: 'Sow',
            role: enums_1.UserRole.FPA,
            org_id: currentUser.org_id,
            is_active: true,
            last_login_at: null,
            created_at: new Date(),
            department_scopes: [],
        });
        const result = await service.toggleUser(currentUser, 'u3');
        expect(redisService.del).toHaveBeenCalledWith('refresh:u3');
        expect(result.is_active).toBe(false);
    });
    it('should never return password_hash in any response', async () => {
        usersRepository.findByIdInOrg.mockResolvedValue({
            id: 'u4',
            email: 'lecteur@diallo.sn',
            first_name: 'L',
            last_name: 'R',
            role: enums_1.UserRole.LECTEUR,
            org_id: currentUser.org_id,
            is_active: true,
            last_login_at: null,
            created_at: new Date(),
            department_scopes: [],
        });
        const result = await service.getById(currentUser, 'u4');
        expect(result).not.toHaveProperty('password_hash');
    });
    it('should throw INVALID_CREDENTIALS when current_password is wrong', async () => {
        usersRepository.findForPasswordCheck.mockResolvedValue({
            id: 'u5',
            org_id: currentUser.org_id,
            email: currentUser.email,
            password_hash: 'stored-hash',
        });
        argon2.verify.mockResolvedValue(false);
        const act = service.changeMyPassword(currentUser, {
            current_password: 'WrongPass1!',
            new_password: 'NewPass1!',
            confirm_password: 'NewPass1!',
        });
        await expect(act).rejects.toThrow(common_1.UnauthorizedException);
    });
});
//# sourceMappingURL=users.service.spec.js.map