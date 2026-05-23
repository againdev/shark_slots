import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAppConfig } from './app.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TokenService } from './token/token.service';
import { MobuleModule } from './mobule/mobule.module';
import { CryptoBotModule } from './crypto-bot/crypto-bot.module';
import { AuthModule } from './auth/auth.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';

function buildRedisUrl(): string {
  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT) || 6380;
  const password = process.env.REDIS_PASSWORD;
  if (password) {
    return `redis://:${encodeURIComponent(password)}@${host}:${port}`;
  }
  return `redis://${host}:${port}`;
}

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppConfig,
    }),
    RedisModule.forRoot({
      config: {
        url: buildRedisUrl(),
      },
    }),
    MobuleModule,
    CryptoBotModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService, TokenService],
})
export class AppModule {}
