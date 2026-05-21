import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AppConfig } from 'src/app.config';
import { verifyCryptoPayWebhookSignature } from './crypto-pay-signature';

const WEBHOOK_PATH = '/crypto-bot/y825xaasdtq9ds4zacsfodra6me7qg';

@Injectable()
export class CryptoBotProxyService {
  private readonly logger = new Logger(CryptoBotProxyService.name);

  constructor(private readonly configService: ConfigService) {}

  async forwardDepositWebhook(
    rawBody: Buffer,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<void> {
    const apiToken = this.configService.get<AppConfig['CRYPTO_BOT_API_TOKEN']>(
      'CRYPTO_BOT_API_TOKEN',
    )!;
    const internalSecret = this.configService.get<
      AppConfig['INTERNAL_WEBHOOK_SECRET']
    >('INTERNAL_WEBHOOK_SECRET')!;

    const signature = this.headerValue(headers, 'crypto-pay-api-signature');
    if (!verifyCryptoPayWebhookSignature(apiToken, rawBody, signature)) {
      this.logger.warn('Crypto Pay webhook rejected: invalid signature');
      throw new ForbiddenException('Invalid Crypto Pay signature');
    }

    const forwardUrl = this.resolveForwardUrl();

    try {
      const response = await axios.post(forwardUrl, rawBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Webhook-Secret': internalSecret,
          ...(signature ? { 'crypto-pay-api-signature': signature } : {}),
        },
        transformRequest: [(data) => data],
        timeout: 30_000,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      this.logger.log(
        `Forwarded Crypto Pay webhook to main, status=${response.status}`,
      );
    } catch (err) {
      const message = err?.response?.data ?? err?.message ?? err;
      this.logger.error(
        `Failed to forward Crypto Pay webhook to ${forwardUrl}: ${JSON.stringify(message)}`,
      );
      throw new ServiceUnavailableException(
        'Failed to forward webhook to main backend',
      );
    }
  }

  private resolveForwardUrl(): string {
    const explicit = this.configService.get<
      AppConfig['MAIN_CRYPTO_BOT_WEBHOOK_URL']
    >('MAIN_CRYPTO_BOT_WEBHOOK_URL');
    if (explicit?.trim()) {
      return explicit.trim();
    }

    const mainBase = this.configService
      .get<AppConfig['MAIN_APP_URL']>('MAIN_APP_URL')!
      .replace(/\/$/, '');
    return `${mainBase}${WEBHOOK_PATH}`;
  }

  private headerValue(
    headers: Record<string, string | string[] | undefined>,
    name: string,
  ): string | undefined {
    const lower = name.toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() !== lower) continue;
      if (Array.isArray(value)) return value[0];
      return value;
    }
    return undefined;
  }
}
