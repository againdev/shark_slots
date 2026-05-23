import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User, Prisma } from 'prisma/generated/main-client';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import { AppConfig } from 'src/app.config';
import { MainPrismaService } from 'src/main-prisma.service';
import { AuthTokenPairDto, GoogleUser, JwtSubject } from './auth.types';
import { ReferalAuthService } from './referal-auth.service';
import { AuthenticateTelegramDto, ConnectTelegramDto } from './auth.dto';
import { resolveFrontendOrigin } from './auth-frontend-url';
import { GoogleOAuthCompletionService } from './google-oauth-completion.service';

interface TelegramAuthData {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: MainPrismaService,
    private readonly referalAuthService: ReferalAuthService,
    private readonly googleOAuthCompletion: GoogleOAuthCompletionService,
  ) {}

  async consumeGoogleOAuthCompletion(code: string): Promise<AuthTokenPairDto> {
    return this.googleOAuthCompletion.consume(code);
  }

  async createGoogleLinkState(userId: string): Promise<string> {
    return this.googleOAuthCompletion.createLinkState(userId);
  }

  async resolveGoogleLinkState(state: string): Promise<string | null> {
    return this.googleOAuthCompletion.consumeLinkState(state);
  }

  async validateTelegramAuth(data: TelegramAuthData): Promise<boolean> {
    const authTelegramToken = this.configService
      .get<AppConfig['BOT_TOKEN']>('BOT_TOKEN')
      ?.trim();
    if (!authTelegramToken) {
      throw new Error('Telegram bot token not configured');
    }

    const dataToCheck = { ...data };
    const receivedHash = dataToCheck.hash;
    delete (dataToCheck as { hash?: string }).hash;

    const allowedFields = [
      'id',
      'first_name',
      'last_name',
      'username',
      'photo_url',
      'auth_date',
    ];
    const filteredData: Record<string, string> = {};

    for (const field of allowedFields) {
      const value = dataToCheck[field as keyof typeof dataToCheck];
      if (value !== undefined && value !== null && value !== '') {
        filteredData[field] = String(value);
      }
    }

    const sortedKeys = Object.keys(filteredData).sort();
    let dataCheckString = '';
    for (const key of sortedKeys) {
      dataCheckString += `${key}=${filteredData[key]}\n`;
    }
    dataCheckString = dataCheckString.trim();

    const secretKey = crypto.createHash('sha256').update(authTelegramToken).digest();
    const computedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computedHash, 'hex'),
        Buffer.from(receivedHash, 'hex'),
      );
    } catch {
      return false;
    }
  }

  async authenticateTelegramWidget(
    dto: AuthenticateTelegramDto,
  ): Promise<AuthTokenPairDto> {
    const isValid = await this.validateTelegramAuth({
      id: Number(dto.id),
      first_name: dto.first_name,
      last_name: dto.last_name,
      username: dto.username,
      photo_url: dto.photo_url,
      auth_date: dto.auth_date,
      hash: dto.hash,
    });
    if (!isValid) {
      throw new BadRequestException('Failed hash validation');
    }

    const req = this.fakeRequest(dto.headers, dto.cookies);
    const created = await this.updateOrCreateUser(
      {
        id: Number(dto.id),
        first_name: dto.first_name,
        username: dto.username,
        language_code: 'en',
        allows_write_to_pm: false,
        photo_url: dto.photo_url,
      },
      dto.deviceHeight,
      dto.deviceWidth,
      req,
    );
    return this.buildTokenPair(created);
  }

  async connectTelegramToUser(dto: ConnectTelegramDto): Promise<number> {
    const isValid = await this.validateTelegramAuth({
      id: Number(dto.id),
      first_name: dto.first_name,
      last_name: dto.last_name,
      username: dto.username,
      photo_url: dto.photo_url,
      auth_date: dto.auth_date,
      hash: dto.hash,
    });
    if (!isValid) {
      throw new BadRequestException('Failed hash validation');
    }
    return this.connectTgAccountToUser(dto.userId, Number(dto.id));
  }

  async handleGoogleAuth(params: {
    googleUser: GoogleUser;
    response: Response;
    request: Request;
  }): Promise<User> {
    const { googleUser, response, request } = params;
    const linkUserId = request.cookies?.google_link_user_id as string | undefined;

    if (linkUserId) {
      return this.finishGoogleAccountLink({
        linkUserId,
        googleUser,
        request,
        response,
      });
    }

    const { id, email, firstName, lastName, photoUrl } = googleUser;
    const deviceHeight = Number(request.cookies?.device_height);
    const deviceWidth = Number(request.cookies?.device_width);
    const refCode = request.cookies?.ref_code;

    const existingUser = await this.prisma.user.findFirst({
      where: { googleId: id },
    });

    const clientSeed = crypto.randomBytes(16).toString('hex');
    const referalCode = crypto.randomBytes(8).toString('hex');
    const ip = this.extractIp(request);

    const updatedOrCreatedUser = await this.prisma.user.upsert({
      where: { googleId: id },
      update: {
        lastName,
        username: email,
        lastLoginIp: ip,
        deviceHeight,
        deviceWidth,
      },
      create: {
        googleId: id,
        firstName,
        lastName,
        username: email,
        photoUrl,
        clientSeed,
        referalCode,
        registerIp: ip,
        lastLoginIp: ip,
        deviceHeight,
        deviceWidth,
      },
    });

    try {
      if (
        refCode &&
        refCode !== updatedOrCreatedUser.referalCode &&
        !existingUser
      ) {
        await this.referalAuthService.createRelationsBetweenUserAndReferal(
          updatedOrCreatedUser.id,
          refCode,
          null,
        );
      }
    } catch (err) {
      this.logger.error(
        `Referral after Google auth: ${err instanceof Error ? err.message : err}`,
      );
    }

    response.locals.googleOAuthRedirect = await this.buildMainFinishRedirect(
      updatedOrCreatedUser,
      '/?oauth=google',
    );
    return updatedOrCreatedUser;
  }

  buildTokenPair(user: User): AuthTokenPairDto {
    const payload = { sub: user.id };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<AppConfig['ACCESS_TOKEN_SECRET']>(
        'ACCESS_TOKEN_SECRET',
      ),
      expiresIn: this.configService.get<AppConfig['EXPIRES_IN_ACCESS_TOKEN']>(
        'EXPIRES_IN_ACCESS_TOKEN',
      ),
    });
    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<AppConfig['REFRESH_TOKEN_SECRET']>(
        'REFRESH_TOKEN_SECRET',
      ),
      expiresIn: this.configService.get<AppConfig['EXPIRES_IN_REFRESH_TOKEN']>(
        'EXPIRES_IN_REFRESH_TOKEN',
      ),
    });
    return { accessToken, refreshToken, userId: user.id };
  }

  private issueTokens(user: User, response: Response): void {
    const { accessToken, refreshToken } = this.buildTokenPair(user);
    this.setCookie(response, 'access_token', accessToken, true);
    this.setCookie(response, 'refresh_token', refreshToken, true);
  }

  private async updateOrCreateUser(
    user: JwtSubject,
    deviceHeight: number,
    deviceWidth: number,
    request: Pick<Request, 'headers' | 'cookies'>,
  ): Promise<User> {
    if (!user.is_premium) user.is_premium = false;

    const clientSeed = crypto.randomBytes(16).toString('hex');
    const referalCode = crypto.randomBytes(8).toString('hex');

    const existingUser = await this.prisma.user.findUnique({
      where: { tgId: BigInt(user.id) },
    });

    const ip = this.extractIp(request);

    const updatedOrCreatedUser = await this.prisma.user.upsert({
      where: { tgId: BigInt(user.id) },
      update: {
        lastName: user.last_name,
        username: user.username,
        isPremium: user.is_premium,
        allowsWriteToPm: user.allows_write_to_pm,
        lastLoginIp: ip,
        deviceHeight,
        deviceWidth,
      },
      create: {
        tgId: BigInt(user.id),
        firstName: user.first_name ?? 'User',
        lastName: user.last_name,
        username: user.username,
        isPremium: user.is_premium,
        languageCode: user.language_code,
        allowsWriteToPm: user.allows_write_to_pm,
        photoUrl: user.photo_url,
        clientSeed,
        referalCode,
        registerIp: ip,
        lastLoginIp: ip,
        deviceHeight,
        deviceWidth,
      },
    });

    const refCode = request.cookies?.ref_code;

    try {
      if (
        refCode &&
        refCode !== updatedOrCreatedUser.referalCode &&
        !existingUser
      ) {
        await this.referalAuthService.createRelationsBetweenUserAndReferal(
          updatedOrCreatedUser.id,
          refCode,
          user.id,
        );
      }
    } catch (err) {
      this.logger.error(
        `Referral after Telegram auth: ${err instanceof Error ? err.message : err}`,
      );
    }

    return updatedOrCreatedUser;
  }

  private async connectTgAccountToUser(userId: string, tgId: number): Promise<number> {
    const existingUserWithTgId = await this.prisma.user.findUnique({
      where: { tgId: BigInt(tgId) },
    });

    if (existingUserWithTgId && existingUserWithTgId.id !== userId) {
      throw new BadRequestException(
        'This account already connected to another user',
      );
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { tgId: BigInt(tgId) },
    });

    if (!updatedUser?.tgId || updatedUser.tgId !== BigInt(tgId)) {
      throw new BadRequestException('Fail to connect telegram account');
    }

    return tgId;
  }

  private async finishGoogleAccountLink(params: {
    linkUserId: string;
    googleUser: GoogleUser;
    request: Request;
    response: Response;
  }): Promise<User> {
    const { linkUserId, googleUser, request, response } = params;
    const origin = this.frontendOrigin();
    const clear = () => this.clearGoogleLinkIntentCookie(response);

    const resumeSessionRedirect = async (
      hash: string,
      user: User | null,
    ): Promise<User | null> => {
      if (!user) {
        response.locals.googleOAuthRedirect = `${origin}/profile?tab=settings${hash}`;
        return null;
      }
      response.locals.googleOAuthRedirect = await this.buildMainFinishRedirect(
        user,
        `/profile?tab=settings${hash}`,
      );
      return user;
    };

    const token = request.cookies?.access_token;
    if (!token) {
      clear();
      const user = await this.prisma.user.findUnique({ where: { id: linkUserId } });
      const u = await resumeSessionRedirect('#google_link_error=session', user);
      if (u) return u;
      throw new BadRequestException('User not found');
    }

    let sub: string;
    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(token, {
        secret: this.configService.get<AppConfig['ACCESS_TOKEN_SECRET']>(
          'ACCESS_TOKEN_SECRET',
        ),
      });
      sub = payload.sub;
    } catch {
      clear();
      const user = await this.prisma.user.findUnique({ where: { id: linkUserId } });
      const u = await resumeSessionRedirect('#google_link_error=session', user);
      if (u) return u;
      throw new BadRequestException('User not found');
    }

    if (sub !== linkUserId) {
      clear();
      const user = await this.prisma.user.findUnique({ where: { id: linkUserId } });
      const u = await resumeSessionRedirect(
        '#google_link_error=session_mismatch',
        user,
      );
      if (u) return u;
      throw new BadRequestException('User not found');
    }

    try {
      const linked = await this.linkGoogleToExistingUser(linkUserId, googleUser);
      clear();
      response.locals.googleOAuthRedirect = await this.buildMainFinishRedirect(
        linked,
        '/profile?tab=settings#google_linked=1',
      );
      return linked;
    } catch (e) {
      clear();
      const errCode = this.googleLinkErrorCode(e);
      const user = await this.prisma.user.findUnique({ where: { id: linkUserId } });
      const u = await resumeSessionRedirect(`#google_link_error=${errCode}`, user);
      if (u) return u;
      throw e;
    }
  }

  private async linkGoogleToExistingUser(
    userId: string,
    googleUser: GoogleUser,
  ): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.googleId) {
      throw new BadRequestException('Google is already linked to this account');
    }

    const occupied = await this.prisma.user.findFirst({
      where: { googleId: googleUser.id },
    });
    if (occupied) {
      throw new BadRequestException(
        'This Google account is already linked to another user',
      );
    }

    const data: Prisma.UserUpdateInput = { googleId: googleUser.id };
    const emailTrim = googleUser.email?.trim();
    if (emailTrim && !user.email) {
      data.email = emailTrim;
    }
    if (googleUser.photoUrl && !user.photoUrl) {
      data.photoUrl = googleUser.photoUrl;
    }

    try {
      return await this.prisma.user.update({ where: { id: userId }, data });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException(
          'This email is already used by another account',
        );
      }
      throw e;
    }
  }

  private googleLinkErrorCode(e: unknown): string {
    if (e instanceof BadRequestException) {
      const r = e.getResponse();
      const msg =
        typeof r === 'string' ? r : (r as { message?: string | string[] })?.message;
      const text = Array.isArray(msg) ? msg[0] : msg;
      if (text === 'Google is already linked to this account') return 'already_linked';
      if (text === 'This Google account is already linked to another user') {
        return 'google_taken';
      }
      if (
        typeof text === 'string' &&
        text.toLowerCase().includes('email') &&
        text.toLowerCase().includes('already')
      ) {
        return 'email_conflict';
      }
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return 'email_conflict';
    }
    return 'generic';
  }

  private frontendOrigin(): string {
    return resolveFrontendOrigin(this.configService);
  }

  /** Редирект на main: GET /auth/google/finish?code=…&next=… (cookies ставит main). */
  private async buildMainFinishRedirect(
    user: User,
    nextPath: string,
  ): Promise<string> {
    const origin = this.frontendOrigin();
    const code = await this.googleOAuthCompletion.store(this.buildTokenPair(user));
    const next = encodeURIComponent(nextPath);
    return `${origin}/auth/google/finish?code=${encodeURIComponent(code)}&next=${next}`;
  }

  private setCookie(
    res: Response,
    name: string,
    value: string,
    httpOnly: boolean,
    maxAge?: number,
  ): void {
    res.cookie(name, value, {
      httpOnly,
      path: '/',
      sameSite: 'lax',
      secure: true,
      maxAge,
    });
  }

  private clearGoogleLinkIntentCookie(res: Response): void {
    res.clearCookie('google_link_user_id', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
    });
  }

  private extractIp(request: Pick<Request, 'headers'> & { socket?: { remoteAddress?: string } }): string {
    const ipRaw =
      request.headers['x-forwarded-for'] || request.socket?.remoteAddress;
    let ip = Array.isArray(ipRaw) ? ipRaw[0] : ipRaw ?? '0.0.0.0';
    ip = String(ip).split(',')[0].trim();
    return ip;
  }

  private fakeRequest(
    headers?: Record<string, string>,
    cookies?: Record<string, string>,
  ): Pick<Request, 'headers' | 'cookies'> {
    return {
      headers: {
        'x-forwarded-for': headers?.['x-forwarded-for'] ?? headers?.['X-Forwarded-For'],
        ...headers,
      },
      cookies: cookies ?? {},
    };
  }
}
