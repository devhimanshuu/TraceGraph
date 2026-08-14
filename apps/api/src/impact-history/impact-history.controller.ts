import { Body, Controller, Delete, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { ImpactHistoryListResponse } from '@tracegraph/shared';
import { ImpactHistoryService } from './impact-history.service';
import { ImpactHistoryQueryDto } from './dto/impact-history-query.dto';
import { RecordImpactSnapshotDto } from './dto/record-impact-snapshot.dto';

/**
 * `/api/impact-history` — the CognoDB-backed analysis ledger.
 * Auth-gated like every other route (global GitHub session guard). Thin controller:
 * repo resolution, dedup, and retention live in ImpactHistoryService.
 */
@Controller('impact-history')
export class ImpactHistoryController {
  constructor(private readonly impactHistoryService: ImpactHistoryService) {}

  /** All recorded snapshots for the repository, newest first. */
  @Get()
  list(@Query() query: ImpactHistoryQueryDto): Promise<ImpactHistoryListResponse> {
    return this.impactHistoryService.list(query.limit);
  }

  /** Records a completed analysis and returns the updated ledger. */
  @Post()
  record(
    @Body() dto: RecordImpactSnapshotDto,
    @Req() req: Request,
  ): Promise<ImpactHistoryListResponse> {
    const user = (req as Request & { user?: unknown }).user;
    return this.impactHistoryService.record(dto, user);
  }

  /** Deletes every snapshot for the repository. */
  @Delete()
  clear(): Promise<{ deleted: number }> {
    return this.impactHistoryService.clear();
  }
}
