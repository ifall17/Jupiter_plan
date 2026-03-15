"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const helmet_1 = require("helmet");
const express = require("express");
const cookieParser = require("cookie-parser");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const http_exception_filter_1 = require("./common/filters/http-exception.filter");
const logging_interceptor_1 = require("./common/interceptors/logging.interceptor");
const transform_interceptor_1 = require("./common/interceptors/transform.interceptor");
function getCorsOrigins(rawWebUrl) {
    return rawWebUrl
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
        .map((origin) => {
        try {
            const normalized = new URL(origin);
            return normalized.origin;
        }
        catch {
            throw new Error(`Invalid WEB_URL origin: ${origin}`);
        }
    });
}
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, {
        logger: ['log', 'error', 'warn', 'debug', 'verbose'],
    });
    const configService = app.get(config_1.ConfigService);
    const logger = new common_1.Logger('Bootstrap');
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                objectSrc: ["'none'"],
            },
        },
        hsts: { maxAge: 31536000, includeSubDomains: true },
    }));
    const webUrl = configService.get('WEB_URL') ?? configService.get('webUrl');
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
        exclude: [{ path: '', method: common_1.RequestMethod.GET }],
    });
    app.useGlobalPipes(new common_1.ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
    }));
    app.useGlobalFilters(new http_exception_filter_1.HttpExceptionFilter());
    app.useGlobalInterceptors(new logging_interceptor_1.LoggingInterceptor(), new transform_interceptor_1.TransformInterceptor());
    if ((configService.get('NODE_ENV') ?? configService.get('nodeEnv')) !== 'production') {
        const swaggerConfig = new swagger_1.DocumentBuilder()
            .setTitle('Jupiter_Plan API')
            .setVersion('1.0')
            .addBearerAuth()
            .build();
        const document = swagger_1.SwaggerModule.createDocument(app, swaggerConfig);
        swagger_1.SwaggerModule.setup('docs', app, document);
    }
    const port = configService.get('port') ?? Number(configService.get('PORT') ?? 3001);
    await app.listen(port);
    logger.log(`API listening on port ${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map