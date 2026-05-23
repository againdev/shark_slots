import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { resolveFrontendOrigin } from './auth-frontend-url';
import { GoogleAuthGuard } from './utils/google-guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly configService: ConfigService) {}

  @Get('google/login')
  @UseGuards(GoogleAuthGuard)
  googleAuth() {
    return { msg: 'Redirecting to Google...' };
  }

  @Get('google/redirect')
  @UseGuards(GoogleAuthGuard)
  googleAuthCallback(@Res() res: Response) {
    const origin = resolveFrontendOrigin(this.configService);
    const target =
      typeof res.locals.googleOAuthRedirect === 'string'
        ? res.locals.googleOAuthRedirect
        : `${origin}/`;
    res.redirect(target);
  }
}
