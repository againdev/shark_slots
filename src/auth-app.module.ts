import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateAppConfig } from './app.config';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';
import { RedisModule } from '@liaoliaots/nestjs-redis';
import { buildRedisUrl } from './redis-url';

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
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AuthAppModule {}
