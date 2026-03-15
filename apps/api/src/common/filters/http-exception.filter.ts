import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Une erreur inattendue est survenue';
    let code = 'INTERNAL_ERROR';

    if (isHttpException) {
      const payload = exception.getResponse() as
        | { message?: string | string[]; code?: string }
        | string;

      if (status < 500) {
        if (typeof payload === 'string') {
          message = payload;
        } else {
          const rawMessage = payload.message;
          if (Array.isArray(rawMessage)) {
            message = rawMessage.join(', ');
          } else if (typeof rawMessage === 'string') {
            message = rawMessage;
          }
          code = payload.code ?? code;
        }
      } else {
        this.logger.error({
          timestamp: new Date().toISOString(),
          event_type: 'http.exception',
          path: request.url,
          method: request.method,
          status_code: status,
          error: exception instanceof Error ? exception.message : 'unknown',
          stack: exception instanceof Error ? exception.stack : undefined,
        });
      }
    } else {
      this.logger.error({
        timestamp: new Date().toISOString(),
        event_type: 'http.exception',
        path: request.url,
        method: request.method,
        status_code: status,
        error: exception instanceof Error ? exception.message : 'unknown',
        stack: exception instanceof Error ? exception.stack : undefined,
      });
    }

    response.status(status).json({
      success: false,
      code,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
