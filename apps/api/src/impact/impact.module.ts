import { Module } from '@nestjs/common';

/**
 * ImpactModule — the flagship "Analyze Impact" feature: variable-length
 * traversal over CALLS edges, grouping by hop depth, and path explanations
 * (GET /api/impact/:id, Phase 6+).
 *
 * Phase 2 establishes the module boundary only; no domain logic is
 * implemented yet.
 */
@Module({})
export class ImpactModule {}
