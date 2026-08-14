import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import type {
  BlastRadiusResponse,
  KnowledgeResponse,
  OrphanListResponse,
  SmellResponse,
  TestGapResponse,
  TestsForChangeResponse,
} from '@tracegraph/shared';
import { IntelligenceService } from './intelligence.service';
import { BlastRadiusDto, TestsForChangeDto } from './dto/blast-radius.dto';
import { IntelligenceQueryDto } from './dto/intelligence-query.dto';

/**
 * `/api/intelligence*` — deterministic repository intelligence.
 * Thin controller: every finding (orphans, smells, test gaps, blast radius,
 * tests-to-run, knowledge) is computed in IntelligenceService from the bounded
 * Cypher catalog. All routes are auth-gated by the global session guard.
 */
@Controller('intelligence')
export class IntelligenceController {
  constructor(private readonly intelligenceService: IntelligenceService) {}

  /** Dead-code / orphan candidates, most recently-changed first. */
  @Get('orphans')
  getOrphans(@Query() query: IntelligenceQueryDto): Promise<OrphanListResponse> {
    return this.intelligenceService.getOrphans(query.limit);
  }

  /** Architecture smells: cycles, god modules, fragile entities. */
  @Get('smells')
  getSmells(): Promise<SmellResponse> {
    return this.intelligenceService.getSmells();
  }

  /** Files with zero test coverage, ranked by risk context. */
  @Get('test-gaps')
  getTestGaps(@Query() query: IntelligenceQueryDto): Promise<TestGapResponse> {
    return this.intelligenceService.getTestGaps(query.limit);
  }

  /** PR/diff blast radius: batch impact over a set of changed files. */
  @Post('blast-radius')
  blastRadius(@Body() dto: BlastRadiusDto): Promise<BlastRadiusResponse> {
    return this.intelligenceService.blastRadius(dto);
  }

  /** Exact tests to run for a change, ranked by changed-surface coverage. */
  @Post('tests-for-change')
  testsForChange(@Body() dto: TestsForChangeDto): Promise<TestsForChangeResponse> {
    return this.intelligenceService.testsForChange(dto);
  }

  /** "Who to ask": developers ranked by authorship on a repo or entity. */
  @Get('knowledge')
  getKnowledge(@Query() query: IntelligenceQueryDto): Promise<KnowledgeResponse> {
    return this.intelligenceService.getKnowledge(query.entityId, query.limit);
  }
}
