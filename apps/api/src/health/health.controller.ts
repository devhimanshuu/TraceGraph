import { Controller, Get } from '@nestjs/common';
import type { AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { HealthService } from './health.service';

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
