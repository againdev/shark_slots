import { Controller, Get } from '@nestjs/common';
import { resolveAppRole } from 'src/app-role';

@Controller()
export class HealthController {
  @Get('health')
  health() {
    return {
      ok: true,
      role: resolveAppRole(process.env.APP_ROLE),
    };
  }
}
