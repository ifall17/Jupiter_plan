import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserRole } from '@shared/enums';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as { role?: UserRole } | undefined;
    if (!user?.role) {
      throw new ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
    }

    if (!requiredRoles.includes(user.role)) {
      throw new ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
    }

    return true;
  }
}
