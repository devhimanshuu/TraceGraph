import { Injectable, Logger } from '@nestjs/common';
import type { AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(private readonly databaseService: DatabaseService) {}

  getAppHealth(): AppHealth {
    return {
      status: 'ok',
      service: 'tracegraph-api',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '0.1.0',
    };
  }

  /**
   * Verifies connectivity to CognoDB. Never exposes the connection string,
   * credentials, or stack traces — on failure the response carries only a
   * generic, human-readable reason.
   */
  async getDatabaseHealth(): Promise<DatabaseHealth> {
    const started = performance.now();
    try {
      await this.databaseService.verifyConnectivity();
      return { status: 'up', latencyMs: Math.round(performance.now() - started) };
    } catch {
      this.logger.warn('CognoDB health check failed');
      return {
        status: 'down',
        latencyMs: Math.round(performance.now() - started),
        error: 'CognoDB is unreachable',
      };
    }
  }
}
