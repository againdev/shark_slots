import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAppConfig } from './app.config';
import { CryptoBotModule } from './crypto-bot/crypto-bot.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppConfig,
    }),
    CryptoBotModule,
  ],
  controllers: [HealthController],
})
export class PaymentsAppModule {}
