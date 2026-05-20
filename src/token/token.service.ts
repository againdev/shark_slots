import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload, verify } from 'jsonwebtoken';
import { AppConfig } from 'src/app.config';

@Injectable()
export class TokenService {
  constructor(private configService: ConfigService) {}

  validateToken(token: string): JwtPayload | null {
    const accessTokenSecret = this.configService.get<
      AppConfig['ACCESS_TOKEN_SECRET']
    >('ACCESS_TOKEN_SECRET');

    if (!token) {
      throw new UnauthorizedException('Access token is missing');
    }

    const tokenWithoutBearer = token.startsWith('Bearer ')
      ? token.slice(7)
      : token;

    try {
      console.log(tokenWithoutBearer);
      const decoded = verify(
        tokenWithoutBearer,
        accessTokenSecret,
      ) as JwtPayload;
      console.log('Decoded Token:', decoded);
      return decoded;
    } catch (error) {
      console.error('Token validation error:', error.message);
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
