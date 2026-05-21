import {
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { CryptoBotProxyService } from './crypto-bot.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('crypto-bot')
export class CryptoBotController {
  private readonly logger = new Logger(CryptoBotController.name);

  constructor(private readonly cryptoBotProxyService: CryptoBotProxyService) {}

  @Post('y825xaasdtq9ds4zacsfodra6me7qg')
  @HttpCode(200)
  async handleDepositWebhook(
    @Req() req: RawBodyRequest,
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const rawBody = req.rawBody;
    if (!rawBody?.length) {
      this.logger.warn('Crypto Pay webhook: empty body');
      return { ok: true };
    }

    this.logger.log(`Crypto Pay webhook received, ${rawBody.length} bytes`);

    await this.cryptoBotProxyService.forwardDepositWebhook(rawBody, headers);

    return { ok: true };
  }
}
