"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RedisService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ioredis_1 = require("ioredis");
let RedisService = class RedisService {
    constructor(configService) {
        this.configService = configService;
        const redisUrl = this.configService.get('REDIS_URL');
        const options = {
            password: this.configService.get('REDIS_PASSWORD'),
            db: Number(this.configService.get('REDIS_DB') ?? 0),
            lazyConnect: true,
            maxRetriesPerRequest: 1,
        };
        this.client = redisUrl
            ? new ioredis_1.default(redisUrl, options)
            : new ioredis_1.default({
                host: this.configService.get('REDIS_HOST') ?? '127.0.0.1',
                port: Number(this.configService.get('REDIS_PORT') ?? 6379),
                ...options,
            });
    }
    async get(key) {
        return this.withConnection(() => this.client.get(key));
    }
    async set(key, value, mode, ttlSeconds) {
        return this.withConnection(() => this.client.set(key, value, mode, ttlSeconds));
    }
    async del(key) {
        return this.withConnection(() => this.client.del(key));
    }
    async incr(key) {
        return this.withConnection(() => this.client.incr(key));
    }
    async expire(key, ttlSeconds) {
        return this.withConnection(() => this.client.expire(key, ttlSeconds));
    }
    async withConnection(fn) {
        try {
            if (this.client.status === 'wait') {
                await this.client.connect();
            }
            return await fn();
        }
        catch {
            throw new common_1.InternalServerErrorException('Redis operation failed.');
        }
    }
};
exports.RedisService = RedisService;
exports.RedisService = RedisService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], RedisService);
//# sourceMappingURL=redis.service.js.map