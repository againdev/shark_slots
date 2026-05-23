import { ConfigService } from '@nestjs/config';
import { AppConfig } from 'src/app.config';

/** URL фронта после OAuth — MAIN_APP_URL, не первый localhost из CORS_ORIGIN. */
export function resolveFrontendOrigin(configService: ConfigService): string {
  const main = configService
    .get<AppConfig['MAIN_APP_URL']>('MAIN_APP_URL')
    ?.trim()
    .replace(/\/$/, '');
  if (main) {
    return main;
  }

  const origins = (configService.get<string>('CORS_ORIGIN') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return (
    origins.find((o) => o.startsWith('https://')) ??
    origins[0] ??
    'http://localhost:3000'
  );
}
