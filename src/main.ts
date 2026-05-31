import { Type } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppConfig } from './app.config';
import { AppModule } from './app.module';
import { AuthAppModule } from './auth-app.module';
import { SlotsAppModule } from './slots-app.module';
import { PaymentsAppModule } from './payments-app.module';
import { AppRole, resolveAppRole } from './app-role';
import * as cookieParser from 'cookie-parser';

const ROLE_MODULES: Record<AppRole, Type<unknown>> = {
  all: AppModule,
  auth: AuthAppModule,
  slots: SlotsAppModule,
  payments: PaymentsAppModule,
};

async function bootstrap() {
  const role = resolveAppRole(process.env.APP_ROLE);
  const rootModule = ROLE_MODULES[role];

  const app = await NestFactory.create(rootModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const configService = app.get(ConfigService);

  const adress = configService.get<AppConfig['APP_ADDRESS']>('APP_ADDRESS')!;
  const port = configService.get<AppConfig['APP_PORT']>('APP_PORT');

  if (role === 'auth' || role === 'all') {
    app.use(cookieParser());
  }

  if (role === 'auth' || role === 'all') {
    app.setGlobalPrefix('api');
  } else if (role === 'payments') {
    app.setGlobalPrefix('api');
  }

  if (role === 'auth' || role === 'all') {
    const allowedHeaders = configService.get<
      AppConfig['CORS_ALLOWED_HEADERS']
    >('CORS_ALLOWED_HEADERS');
    const credentials =
      configService.get<AppConfig['CORS_CREDENTIALS']>('CORS_CREDENTIALS');
    const methods = configService.get<AppConfig['CORS_METHODS']>('CORS_METHODS');
    const originString =
      configService.get<AppConfig['CORS_ORIGIN']>('CORS_ORIGIN');

    const origins = originString
      ? originString.split(',').map((o) => o.trim())
      : [];

    app.enableCors({
      origin: origins,
      credentials,
      allowedHeaders,
      methods,
    });
  }

  await app.listen(port, adress);
}
bootstrap();
