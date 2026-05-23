import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy } from 'passport-google-oauth20';
import { Request, Response } from 'express';
import { AppConfig } from 'src/app.config';
import { AuthService } from '../auth.service';
import { GoogleUser } from '../auth.types';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: configService.get<AppConfig['GOOGLE_CLIENT_ID']>('GOOGLE_CLIENT_ID'),
      clientSecret: configService.get<AppConfig['GOOGLE_CLIENT_SECRET']>(
        'GOOGLE_CLIENT_SECRET',
      ),
      callbackURL: configService.get<AppConfig['GOOGLE_CALLBACK_URL']>(
        'GOOGLE_CALLBACK_URL',
      ),
      scope: ['profile', 'email'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
  ) {
    const { id, displayName, emails, photos } = profile;
    const email = emails?.[0]?.value;
    const res: Response = req.res as Response;

    const userData: GoogleUser = {
      id,
      email,
      firstName: displayName?.split(' ')[0] || '',
      lastName: displayName?.split(' ')[1] || '',
      photoUrl: photos?.[0]?.value,
    };

    return this.authService.handleGoogleAuth({
      googleUser: userData,
      response: res,
      request: req,
    });
  }
}
