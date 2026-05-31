import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';
import { Transform, plainToInstance } from 'class-transformer';
import { APP_ROLES, AppRole, resolveAppRole } from './app-role';

class SharedAppConfig {
  @IsIn(APP_ROLES)
  readonly APP_ROLE: AppRole;

  @IsString()
  readonly NODE_ENV: string;

  @IsString()
  readonly APP_ADDRESS: string;

  @IsNumber()
  readonly APP_PORT: number;
}

class AuthAppConfig extends SharedAppConfig {
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
  readonly ACCESS_TOKEN_SECRET: string;

  @IsString()
  readonly REFRESH_TOKEN_SECRET: string;

  @IsString()
  readonly EXPIRES_IN_ACCESS_TOKEN: string;

  @IsString()
  readonly EXPIRES_IN_REFRESH_TOKEN: string;

  @IsString()
  readonly MAIN_APP_URL: string;

  @IsString()
  readonly INTERNAL_WEBHOOK_SECRET: string;

  @IsString()
  readonly BOT_TOKEN: string;
}

class SlotsAppConfig extends SharedAppConfig {
  @IsString()
  readonly DATABASE_URL: string;

  @IsString()
  readonly MOBULE_SECRET_TOKEN: string;

  @IsOptional()
  @IsString()
  readonly MOBULE_ALLOWED_IPS?: string;

  @IsString()
  readonly MAIN_APP_URL: string;

  @IsString()
  readonly ACCESS_TOKEN_SECRET: string;

  @IsString()
  readonly REFRESH_TOKEN_SECRET: string;
}

class PaymentsAppConfig extends SharedAppConfig {
  @IsString()
  readonly CRYPTO_BOT_API_TOKEN: string;

  @IsString()
  readonly INTERNAL_WEBHOOK_SECRET: string;

  @IsString()
  readonly MAIN_APP_URL: string;

  @IsOptional()
  @IsString()
  readonly MAIN_CRYPTO_BOT_WEBHOOK_URL?: string;
}

/** Полный конфиг для локальной разработки (APP_ROLE=all). */
class AllAppConfig extends AuthAppConfig {
  @IsString()
  readonly DATABASE_URL: string;

  @IsString()
  readonly MOBULE_SECRET_TOKEN: string;

  @IsOptional()
  @IsString()
  readonly MOBULE_ALLOWED_IPS?: string;

  @IsString()
  readonly CRYPTO_BOT_API_TOKEN: string;

  @IsOptional()
  @IsString()
  readonly MAIN_CRYPTO_BOT_WEBHOOK_URL?: string;
}

export type AppConfig = AllAppConfig;

export function validateAppConfig(config: Record<string, unknown>) {
  const role = resolveAppRole(
    typeof config.APP_ROLE === 'string' ? config.APP_ROLE : undefined,
  );
  const withRole = { ...config, APP_ROLE: role };
  const options = { enableImplicitConversion: true };

  let validatedConfig: object;
  switch (role) {
    case 'auth':
      validatedConfig = plainToInstance(AuthAppConfig, withRole, options);
      break;
    case 'slots':
      validatedConfig = plainToInstance(SlotsAppConfig, withRole, options);
      break;
    case 'payments':
      validatedConfig = plainToInstance(PaymentsAppConfig, withRole, options);
      break;
    default:
      validatedConfig = plainToInstance(AllAppConfig, withRole, options);
  }

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(errors.toString());
  }
  return validatedConfig;
}
