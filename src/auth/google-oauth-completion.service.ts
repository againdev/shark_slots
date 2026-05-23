import { BadRequestException, Injectable } from '@nestjs/common';
import { RedisService } from '@liaoliaots/nestjs-redis';
import * as crypto from 'crypto';
import { AuthTokenPairDto } from './auth.types';

const KEY_PREFIX = 'oauth:google:';
const LINK_KEY_PREFIX = 'oauth:google:link:';
const TTL_SECONDS = 120;
const LINK_TTL_SECONDS = 600;

@Injectable()
export class GoogleOAuthCompletionService {
  constructor(private readonly redisService: RedisService) {}

  async store(pair: AuthTokenPairDto): Promise<string> {
    const code = crypto.randomBytes(32).toString('hex');
    const redis = this.redisService.getOrThrow();
    await redis.set(
      `${KEY_PREFIX}${code}`,
      JSON.stringify(pair),
      'EX',
      TTL_SECONDS,
    );
    return code;
  }

  async createLinkState(userId: string): Promise<string> {
    const state = crypto.randomBytes(24).toString('hex');
    const redis = this.redisService.getOrThrow();
    await redis.set(`${LINK_KEY_PREFIX}${state}`, userId, 'EX', LINK_TTL_SECONDS);
    return state;
  }

  async consumeLinkState(state: string): Promise<string | null> {
    const trimmed = state?.trim();
    if (!trimmed) return null;
    const redis = this.redisService.getOrThrow();
    const key = `${LINK_KEY_PREFIX}${trimmed}`;
    const userId = await redis.get(key);
    if (!userId) return null;
    await redis.del(key);
    return userId;
  }

  async consume(code: string): Promise<AuthTokenPairDto> {
    const trimmed = code?.trim();
    if (!trimmed || trimmed.length < 32) {
      throw new BadRequestException('Invalid OAuth completion code');
    }

    const redis = this.redisService.getOrThrow();
    const key = `${KEY_PREFIX}${trimmed}`;
    const raw = await redis.get(key);
    if (!raw) {
      throw new BadRequestException('OAuth completion code expired or invalid');
    }
    await redis.del(key);

    try {
      return JSON.parse(raw) as AuthTokenPairDto;
    } catch {
      throw new BadRequestException('OAuth completion data corrupted');
    }
  }
}
