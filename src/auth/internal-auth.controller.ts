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
} from './auth.dto';
import { AuthTokenPairDto } from './auth.types';
import { InternalWebhookGuard } from './internal-webhook.guard';

@Controller('internal/auth')
@UseGuards(InternalWebhookGuard)
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class InternalAuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('telegram')
  async telegram(@Body() body: AuthenticateTelegramDto): Promise<AuthTokenPairDto> {
    return this.authService.authenticateTelegramWidget(body);
  }

  @Post('connect-telegram')
  async connectTelegram(@Body() body: ConnectTelegramDto): Promise<{ tgId: number }> {
    const tgId = await this.authService.connectTelegramToUser(body);
    return { tgId };
  }
}
