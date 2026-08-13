import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.constants';

/**
 * Marks a controller or handler as public — the global `ClerkAuthGuard`
 * skips routes carrying this metadata. Use sparingly (health checks only).
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
