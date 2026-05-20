import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../prisma/generated/main-client';

@Injectable()
export class MainPrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
