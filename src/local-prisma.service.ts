import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../prisma/generated/local-client';

@Injectable()
export class LocalPrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}