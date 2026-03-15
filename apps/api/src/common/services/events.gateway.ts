import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class EventsGateway {
  private readonly logger = new Logger(EventsGateway.name);

  emit(event: string, payload: Record<string, unknown>): void {
    this.logger.log({ event_type: 'socket.emit', event, payload });
  }
}
