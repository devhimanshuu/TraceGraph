import type { AppHealth, DatabaseHealth } from '@tracegraph/shared';
import { apiClient } from '@/lib/api-client';

/** Health domain service. Health endpoints are public — no session token. */
export const healthService = {
  getAppHealth: (): Promise<AppHealth> => apiClient.getAppHealth(),
  getDatabaseHealth: (): Promise<DatabaseHealth> => apiClient.getDatabaseHealth(),
};
