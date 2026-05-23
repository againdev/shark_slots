import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { MainPrismaService } from 'src/main-prisma.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { InternalAuthController } from './internal-auth.controller';
import { ReferalAuthService } from './referal-auth.service';
import { GoogleAuthGuard } from './utils/google-guard';
import { GoogleStrategy } from './utils/google-strategy';
import { GoogleOAuthCompletionService } from './google-oauth-completion.service';
import { RecaptchaModule } from 'src/recaptcha/recaptcha.module';
import { RecaptchaPageController } from './recaptcha-page.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'google' }),
    JwtModule.register({}),
    RecaptchaModule,
  ],
  controllers: [AuthController, InternalAuthController, RecaptchaPageController],
  providers: [
    AuthService,
    MainPrismaService,
    ReferalAuthService,
    GoogleStrategy,
    GoogleAuthGuard,
    GoogleOAuthCompletionService,
  ],
  exports: [AuthService],
})
export class AuthModule {}
