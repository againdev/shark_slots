import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { MainPrismaService } from 'src/main-prisma.service';
import { AuthService } from './auth.service';
import { InternalAuthController } from './internal-auth.controller';
import { ReferalAuthService } from './referal-auth.service';
import { RecaptchaModule } from 'src/recaptcha/recaptcha.module';
import { RecaptchaPageController } from './recaptcha-page.controller';

@Module({
  imports: [JwtModule.register({}), RecaptchaModule],
  controllers: [InternalAuthController, RecaptchaPageController],
  providers: [AuthService, MainPrismaService, ReferalAuthService],
  exports: [AuthService],
})
export class AuthModule {}
