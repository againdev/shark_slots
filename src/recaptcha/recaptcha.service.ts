import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppConfig } from 'src/app.config';

@Injectable()
export class RecaptchaService {
  private readonly logger = new Logger(RecaptchaService.name);
  private static readonly VERIFY_URL =
    'https://www.google.com/recaptcha/api/siteverify';

  constructor(private readonly configService: ConfigService) {}

  async verify(token: string | undefined | null): Promise<boolean> {
    const trimmed = token?.trim();
    if (!trimmed) {
      return false;
    }

    const secret = this.configService.get<AppConfig['RECAPTCHA_SECRET_KEY']>(
      'RECAPTCHA_SECRET_KEY',
    );
    if (!secret) {
      this.logger.error('RECAPTCHA_SECRET_KEY is not configured');
      return false;
    }

    try {
      const { data } = await axios.post<{ success?: boolean }>(
        RecaptchaService.VERIFY_URL,
        new URLSearchParams({
          secret,
          response: trimmed,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10_000,
        },
      );
      return Boolean(data?.success);
    } catch (err) {
      this.logger.warn(
        `reCAPTCHA verify failed: ${err instanceof Error ? err.message : err}`,
      );
      return false;
    }
  }
}
