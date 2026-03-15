import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: { sub?: string; org_id?: string } }>();
    const response = http.getResponse<Response>();
    const startedAt = Date.now();

    const userId = request.user?.sub ?? 'anonymous';
    const orgId = request.user?.org_id ?? null;
    const ipAddress =
      (request.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      request.ip ||
      'unknown';

    this.logger.log({
      timestamp: new Date().toISOString(),
      event_type: 'http.request',
      method: request.method,
      path: request.originalUrl || request.url,
      user_id: userId,
      org_id: orgId,
      ip_address: ipAddress,
    });

    return next.handle().pipe(
      tap(() => {
        this.logger.log({
          timestamp: new Date().toISOString(),
          event_type: 'http.response',
          method: request.method,
          path: request.originalUrl || request.url,
          status_code: response.statusCode,
          duration_ms: Date.now() - startedAt,
          user_id: userId,
        });
      }),
    );
  }
}
