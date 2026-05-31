import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MainPrismaService } from 'src/main-prisma.service';
import { AuthService } from './auth.service';
import { InternalAuthController } from './internal-auth.controller';
import { ReferalAuthService } from './referal-auth.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [InternalAuthController],
  providers: [AuthService, MainPrismaService, ReferalAuthService],
  exports: [AuthService],
})
export class AuthModule {}
