import { Controller, Get } from '@nestjs/common';
import type { AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { Public } from '../auth/public.decorator';
import { HealthService } from './health.service';

/**
 * Health endpoints are intentionally public — uptime monitors and the web
 * app's status checks must work without a session.
 */
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /** GET /api/health — application liveness. */
  @Get()
  getAppHealth(): AppHealth {
    return this.healthService.getAppHealth();
  }

  /** GET /api/health/database — CognoDB reachability. */
  @Get('database')
  getDatabaseHealth(): Promise<DatabaseHealth> {
    return this.healthService.getDatabaseHealth();
  }
}
