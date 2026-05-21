import {
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';
import { Transform, plainToInstance } from 'class-transformer';

export class AppConfig {
  @IsString()
  readonly NODE_ENV: string;

  @IsString()
  readonly APP_ADDRESS: string;

  @IsNumber()
  readonly APP_PORT: number;

  @IsArray()
  @Transform(({ value }) => value.split(','))
  readonly CORS_ALLOWED_HEADERS: string[];

  @IsBoolean()
  readonly CORS_CREDENTIALS: boolean;

  @IsArray()
  @Transform(({ value }) => value.split(','))
  readonly CORS_METHODS: string[];

  @IsString()
  readonly CORS_ORIGIN: string;

  @IsString()
  readonly DATABASE_URL: string;

  @IsString()
  readonly ACCESS_TOKEN_SECRET: string;

  @IsString()
  readonly REFRESH_TOKEN_SECRET: string;

  @IsString()
  readonly EXPIRES_IN_ACCESS_TOKEN: string;

  @IsString()
  readonly EXPIRES_IN_REFRESH_TOKEN: string;

  @IsString()
  readonly MOBULE_SECRET_TOKEN: string;

  @IsString()
  readonly MAIN_APP_URL: string;

  /** IP Mobule / прокси для колбэков, через запятую. Если не задано — дефолт в MobuleService. */
  @IsOptional()
  @IsString()
  readonly MOBULE_ALLOWED_IPS?: string;

  /** Токен Crypto Pay (@CryptoBot) — для проверки подписи входящего webhook. */
  @IsString()
  readonly CRYPTO_BOT_API_TOKEN: string;

  /**
   * Общий секрет shark_slots → main (заголовок X-Internal-Webhook-Secret).
   * Должен совпадать с INTERNAL_WEBHOOK_SECRET на основном бэкенде.
   */
  @IsString()
  readonly INTERNAL_WEBHOOK_SECRET: string;

  /**
   * Полный URL обработчика на main (если не задан — MAIN_APP_URL + /crypto-bot/y825...).
   * Пример: https://api.shark.example/crypto-bot/y825xaasdtq9ds4zacsfodra6me7qg
   */
  @IsOptional()
  @IsString()
  readonly MAIN_CRYPTO_BOT_WEBHOOK_URL?: string;
}

export function validateAppConfig(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(AppConfig, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
