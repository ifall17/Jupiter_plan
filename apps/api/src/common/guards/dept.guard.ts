import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@shared/enums';

type RequestWithUser = {
  user?: {
    role?: UserRole;
    department_scope?: Array<{ department: string; can_read: boolean; can_write: boolean }>;
  };
  params?: { department?: string };
  body?: { department?: string; lines?: Array<{ department?: string }> };
  resource?: { department?: string };
};

@Injectable()
export class DeptGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user?.role) {
      throw new ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
    }

    if (user.role !== UserRole.CONTRIBUTEUR) {
      return true;
    }

    const scopeDepartments = new Set((user.department_scope ?? []).filter((scope) => scope.can_read).map((scope) => scope.department));
    const lineDepartments = request.body?.lines?.map((line) => line.department).filter((value): value is string => Boolean(value)) ?? [];

    if (lineDepartments.length > 0) {
      const unauthorized = lineDepartments.some((department) => !scopeDepartments.has(department));
      if (unauthorized) {
        throw new ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
      }

      return true;
    }

    const resourceDepartment = request.resource?.department ?? request.body?.department ?? request.params?.department;
    if (!resourceDepartment || !scopeDepartments.has(resourceDepartment)) {
      throw new ForbiddenException({ code: 'AUTH_004', message: 'Insufficient permissions.' });
    }

    return true;
  }
}
