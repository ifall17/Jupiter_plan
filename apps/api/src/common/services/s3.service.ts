import { Injectable } from '@nestjs/common';

@Injectable()
export class S3Service {
  private readonly storage = new Map<string, Buffer>();

  async uploadObject(key: string, content: Buffer, _mimeType: string): Promise<void> {
    this.storage.set(key, Buffer.from(content));
  }

  async deleteObject(key: string): Promise<void> {
    this.storage.delete(key);
  }

  async getObject(key: string): Promise<Buffer | null> {
    return this.storage.get(key) ?? null;
  }
}
