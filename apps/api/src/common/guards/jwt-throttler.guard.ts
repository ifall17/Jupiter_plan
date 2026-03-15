import { ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

type RequestWithUser = {
  user?: { sub?: string };
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class JwtThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: RequestWithUser): Promise<string> {
    const userId = req.user?.sub;
    if (userId) {
      return `jwt:${userId}`;
    }

    const forwardedFor = req.headers['x-forwarded-for'];
    const ipFromHeader = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor?.split(',')[0]?.trim();

    return ipFromHeader || req.ip || 'anonymous';
  }

  protected getRequestResponse(context: ExecutionContext): {
    req: RequestWithUser;
    res: Record<string, unknown>;
  } {
    const http = context.switchToHttp();
    return { req: http.getRequest<RequestWithUser>(), res: http.getResponse<Record<string, unknown>>() };
  }
}
