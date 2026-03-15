import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';

type RequestWithOrg = {
  user?: { org_id?: string };
  resource?: { org_id?: string };
};

@Injectable()
export class OrgGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    try {
      const request = context.switchToHttp().getRequest<RequestWithOrg>();
      const userOrgId = request.user?.org_id;

      if (!userOrgId) {
        throw new NotFoundException();
      }

      const resourceOrgId = request.resource?.org_id;
      if (resourceOrgId && resourceOrgId !== userOrgId) {
        throw new NotFoundException();
      }

      return true;
    } catch {
      throw new NotFoundException();
    }
  }
}
