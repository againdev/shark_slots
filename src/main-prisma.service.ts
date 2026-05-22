import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '../prisma/generated/main-client';

const RECONNECT_INTERVAL_MS = 10_000;

@Injectable()
export class MainPrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MainPrismaService.name);
  private connected = false;
  private connecting = false;
  private reconnectInterval?: NodeJS.Timeout;

  async onModuleInit() {
    void this.tryConnect();
    this.reconnectInterval = setInterval(() => {
      if (!this.connected && !this.connecting) {
        void this.tryConnect();
      }
    }, RECONNECT_INTERVAL_MS);
  }

  async onModuleDestroy() {
    if (this.reconnectInterval) {
      clearInterval(this.reconnectInterval);
    }
    await this.$disconnect().catch(() => undefined);
  }

  isConnected(): boolean {
    return this.connected;
  }

  private async tryConnect(): Promise<void> {
    if (this.connecting) {
      return;
    }
    this.connecting = true;
    const wasConnected = this.connected;
    try {
      await this.$connect();
      this.connected = true;
      if (!wasConnected) {
        this.logger.log('Connected to main database');
      }
    } catch (error) {
      this.connected = false;
      const message =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to connect to main database (next retry in ${RECONNECT_INTERVAL_MS / 1000}s): ${message}`,
      );
      await this.$disconnect().catch(() => undefined);
    } finally {
      this.connecting = false;
    }
  }
}
