import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { AppConfig } from 'src/app.config';

@Injectable()
export class InternalWebhookGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const expected = this.configService.get<AppConfig['INTERNAL_WEBHOOK_SECRET']>(
      'INTERNAL_WEBHOOK_SECRET',
    );
    const incoming = req.headers['x-internal-webhook-secret'];

    if (!expected || incoming !== expected) {
      throw new ForbiddenException('Forbidden');
    }
    return true;
  }
}
