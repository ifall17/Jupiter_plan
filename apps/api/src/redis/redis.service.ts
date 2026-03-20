import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService {
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const options = {
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: Number(this.configService.get<string>('REDIS_DB') ?? 0),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
    };

    this.client = redisUrl
      ? new Redis(redisUrl, options)
      : new Redis({
          host: this.configService.get<string>('REDIS_HOST') ?? '127.0.0.1',
          port: Number(this.configService.get<string>('REDIS_PORT') ?? 6379),
          ...options,
        });
  }

  async get(key: string): Promise<string | null> {
    return this.withConnection(() => this.client.get(key));
  }

  async set(key: string, value: string, mode: 'EX', ttlSeconds: number): Promise<'OK' | null> {
    return this.withConnection(() => this.client.set(key, value, mode, ttlSeconds));
  }

  async del(key: string): Promise<number> {
    return this.withConnection(() => this.client.del(key));
  }

  async delByPattern(pattern: string): Promise<number> {
    return this.withConnection(async () => {
      const keys = await this.client.keys(pattern);
      if (keys.length === 0) {
        return 0;
      }
      return this.client.del(...keys);
    });
  }

  async incr(key: string): Promise<number> {
    return this.withConnection(() => this.client.incr(key));
  }

  async expire(key: string, ttlSeconds: number): Promise<number> {
    return this.withConnection(() => this.client.expire(key, ttlSeconds));
  }

  private async withConnection<T>(fn: () => Promise<T>): Promise<T> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }
      return await fn();
    } catch {
      throw new InternalServerErrorException('Redis operation failed.');
    }
  }
}
