import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class CalcEngineClient {
  constructor(private readonly configService: ConfigService) {}

  async post<TResponse>(path: string, payload: unknown): Promise<TResponse> {
    const baseUrl = this.configService.get<string>('CALC_ENGINE_URL') ?? this.configService.get<string>('calcEngine.url');
    if (!baseUrl) {
      throw new InternalServerErrorException('CalcEngine unavailable.');
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new InternalServerErrorException('CalcEngine unavailable.');
    }

    return (await response.json()) as TResponse;
  }
}
