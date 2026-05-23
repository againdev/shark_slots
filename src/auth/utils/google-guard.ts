import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { AppConfig } from 'src/app.config';
import { AuthService } from '../auth.service';

@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authService: AuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse<Response>();
    const { width, height, ref, link, link_state: linkState } = request.query;

    if (width !== undefined && width !== null) {
      this.setCookie(response, 'device_width', width.toString(), false);
    }
    if (height !== undefined && height !== null) {
      this.setCookie(response, 'device_height', height.toString(), false);
    }
    if (ref !== undefined && ref !== null && ref !== '') {
      this.setCookie(response, 'ref_code', ref.toString(), false);
    }

    const path = request.path ?? '';
    const isLoginRoute = path.endsWith('/google/login');
    const isLinkFlow = link === '1' || link === 'true';

    if (!isLinkFlow && isLoginRoute) {
      this.clearGoogleLinkIntentCookie(response);
    } else if (isLinkFlow && isLoginRoute) {
      let userId: string | null = null;

      if (typeof linkState === 'string' && linkState) {
        userId = await this.authService.resolveGoogleLinkState(linkState);
      } else {
        const token = request.cookies?.access_token;
        if (token) {
          try {
            const payload = await this.jwtService.verifyAsync<{ sub: string }>(
              token,
              {
                secret: this.configService.get<AppConfig['ACCESS_TOKEN_SECRET']>(
                  'ACCESS_TOKEN_SECRET',
                ),
              },
            );
            userId = payload?.sub ?? null;
          } catch {
            userId = null;
          }
        }
      }

      if (!userId) {
        throw new UnauthorizedException('Login required to link Google');
      }

      this.setCookie(response, 'google_link_user_id', userId, true, 10 * 60 * 1000);
    }

    return super.canActivate(context) as Promise<boolean>;
  }

  private clearGoogleLinkIntentCookie(res: Response) {
    res.clearCookie('google_link_user_id', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  }

  private setCookie(
    res: Response,
    name: string,
    value: string,
    httpOnly: boolean,
    maxAge?: number,
  ) {
    res.cookie(name, value, {
      httpOnly,
      path: '/',
      sameSite: 'lax',
      secure: true,
      maxAge,
    });
  }
}
