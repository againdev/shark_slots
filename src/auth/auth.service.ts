import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from 'prisma/generated/main-client';
import { Request } from 'express';
import * as crypto from 'crypto';
import { AppConfig } from 'src/app.config';
import { MainPrismaService } from 'src/main-prisma.service';
import { AuthTokenPairDto, JwtSubject } from './auth.types';
import { ReferalAuthService } from './referal-auth.service';
import { AuthenticateTelegramDto, ConnectTelegramDto } from './auth.dto';

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
  ) {}

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

  private extractIp(
    request: Pick<Request, 'headers'> & { socket?: { remoteAddress?: string } },
  ): string {
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
