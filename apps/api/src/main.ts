import { Logger, RequestMethod, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as express from 'express';
import * as cookieParser from 'cookie-parser';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

function getCorsOrigins(rawWebUrl: string): string[] {
  return rawWebUrl
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0)
    .map((origin) => {
      try {
        const normalized = new URL(origin);
        return normalized.origin;
      } catch {
        throw new Error(`Invalid WEB_URL origin: ${origin}`);
      }
    });
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'error', 'warn', 'debug', 'verbose'],
  });
  const configService = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
    }),
  );

  const webUrl = configService.get<string>('WEB_URL') ?? configService.get<string>('webUrl');
  if (!webUrl) {
    throw new Error('WEB_URL is required.');
  }

  const allowedOrigins = getCorsOrigins(webUrl);
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: '', method: RequestMethod.GET }],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  app.useGlobalInterceptors(new LoggingInterceptor(), new TransformInterceptor());

  if ((configService.get<string>('NODE_ENV') ?? configService.get<string>('nodeEnv')) !== 'production') {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Jupiter_Plan API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = configService.get<number>('port') ?? Number(configService.get<string>('PORT') ?? 3001);
  await app.listen(port);
  logger.log(`API listening on port ${port}`);
}

bootstrap();
