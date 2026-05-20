import { Module } from '@nestjs/common';
import { MobuleService } from './mobule.service';
import { MobuleController } from './mobule.controller';
import { JwtService } from '@nestjs/jwt';
import { MainPrismaService } from 'src/main-prisma.service';
import { LocalPrismaService } from 'src/local-prisma.service';

@Module({
  providers: [MobuleService, JwtService, MainPrismaService, LocalPrismaService],
  controllers: [MobuleController],
})
export class MobuleModule {}
