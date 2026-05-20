import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAppConfig } from './app.config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TokenService } from './token/token.service';
import { MobuleModule } from './mobule/mobule.module';
import { RedisModule } from '@liaoliaots/nestjs-redis';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateAppConfig,
    }),
    RedisModule.forRoot({
      config: {
        url: `redis://${process.env.REDIS_HOST || '127.0.0.1'}:${Number(process.env.REDIS_PORT) || 6380}`,
      },
    }),
    MobuleModule,
  ],
  controllers: [AppController],
  providers: [AppService, TokenService],
})
export class AppModule {}
