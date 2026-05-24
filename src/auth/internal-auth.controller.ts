import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  AuthenticateTelegramDto,
  ConnectTelegramDto,
  VerifyRecaptchaDto,
} from './auth.dto';
import { AuthTokenPairDto } from './auth.types';
import { InternalWebhookGuard } from './internal-webhook.guard';
import { RecaptchaService } from 'src/recaptcha/recaptcha.service';

@Controller('internal/auth')
@UseGuards(InternalWebhookGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InternalAuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly recaptchaService: RecaptchaService,
  ) {}

  @Post('telegram')
  async telegram(@Body() body: AuthenticateTelegramDto): Promise<AuthTokenPairDto> {
    return this.authService.authenticateTelegramWidget(body);
  }

  @Post('connect-telegram')
  async connectTelegram(@Body() body: ConnectTelegramDto): Promise<{ tgId: number }> {
    const tgId = await this.authService.connectTelegramToUser(body);
    return { tgId };
  }

  @Post('verify-recaptcha')
  async verifyRecaptcha(
    @Body() body: VerifyRecaptchaDto,
  ): Promise<{ valid: boolean }> {
    const valid = await this.recaptchaService.verify(body.token);
    return { valid };
  }
}
