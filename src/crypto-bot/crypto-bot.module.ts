import { Module } from '@nestjs/common';
import { CryptoBotController } from './crypto-bot.controller';
import { CryptoBotProxyService } from './crypto-bot.service';

@Module({
  controllers: [CryptoBotController],
  providers: [CryptoBotProxyService],
})
export class CryptoBotModule {}
