import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import type {
  TestSelectionRequest,
  TestSelectionResponse,
  TestIntelligenceOverview,
  TestDetail,
} from '@tracegraph/shared';
import { TestSelectionService } from './test-selection.service';

/**
 * `/api/test-intelligence/*` — test selection, overview, and test details.
 */
@Controller('test-intelligence')
export class TestIntelligenceController {
  constructor(private readonly selectionService: TestSelectionService) {}

  /**
   * POST /api/test-intelligence/select — recommend tests for a set of changes.
   */
  @Post('select')
  async selectTests(@Body() dto: TestSelectionRequest): Promise<TestSelectionResponse> {
    return this.selectionService.selectTests(dto);
  }

  /**
   * GET /api/test-intelligence/overview/:repoId — test intelligence overview.
   */
  @Get('overview/:repoId')
  async getOverview(@Param('repoId') repoId: string): Promise<TestIntelligenceOverview> {
    const overview = await this.selectionService.getOverview(repoId);
    return { ...overview, repositoryId: repoId };
  }
}
