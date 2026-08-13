import { Injectable, Logger } from '@nestjs/common';
import type { AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { DatabaseService } from '../database';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /** GET /api/health — liveness of the backend application itself. */
  getAppHealth(): AppHealth {
    return {
      status: 'ok',
      service: 'tracegraph-api',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }

  /**
   * GET /api/health/database — real CognoDB connectivity probe.
   * `verifyConnection` never throws and returns a sanitized, structured
   * result, so a down database yields a safe degraded response (HTTP 200 with
   * `status: "down"`) rather than an error or leaked driver detail.
   */
  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const health = await this.databaseService.verifyConnection();
    if (health.status === 'down') {
      this.logger.warn('CognoDB health check: down');
    }
    return health;
  }
}
