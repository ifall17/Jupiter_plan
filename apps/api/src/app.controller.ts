import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  @Get()
  getRoot(): { success: boolean; service: string; version: string; docs: string; apiBase: string } {
    return {
      success: true,
      service: 'Jupiter_Plan API',
      version: '1.0',
      docs: '/docs',
      apiBase: '/api/v1',
    };
  }
}
