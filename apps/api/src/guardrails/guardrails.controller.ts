import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import type {
  ArchitectureRule,
  ArchitectureViolation,
  EvaluationRequest,
  EvaluationResponse,
  GuardrailDashboard,
} from '@tracegraph/shared';
import { GuardrailEngine } from './guardrail-engine';

/**
 * `/api/guardrails/*` — architecture rule CRUD, evaluation, and violations.
 */
@Controller('guardrails')
export class GuardrailsController {
  constructor(private readonly engine: GuardrailEngine) {}

  /** List rules for a repository. */
  @Get()
  listRules(@Query('repositoryId') repositoryId: string): Promise<ArchitectureRule[]> {
    return this.engine.listRules(repositoryId);
  }

  /** Get a single rule. */
  @Get(':id')
  getRule(@Param('id') id: string): Promise<ArchitectureRule | null> {
    return this.engine.getRule(id);
  }

  /** Create a new architecture rule. */
  @Post()
  createRule(@Body() dto: Omit<ArchitectureRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<ArchitectureRule> {
    return this.engine.createRule(dto);
  }

  /** Update a rule. */
  @Patch(':id')
  updateRule(@Param('id') id: string, @Body() dto: Partial<ArchitectureRule>): Promise<ArchitectureRule | null> {
    return this.engine.updateRule(id, dto);
  }

  /** Delete a rule. */
  @Delete(':id')
  deleteRule(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.engine.deleteRule(id).then((deleted) => ({ deleted }));
  }

  /** Evaluate rules against the graph. */
  @Post('evaluate')
  evaluate(@Body() dto: EvaluationRequest): Promise<EvaluationResponse> {
    return this.engine.evaluate(dto.repositoryId, dto.ruleIds, dto.revision);
  }

  /** Get the guardrails dashboard. */
  @Get('dashboard/:repositoryId')
  getDashboard(@Param('repositoryId') repositoryId: string): Promise<GuardrailDashboard> {
    return this.engine.getDashboard(repositoryId);
  }

  /** Suppress a violation. */
  @Post('violations/:id/suppress')
  suppressViolation(
    @Param('id') id: string,
    @Body() dto: { reason: string; expiresAt?: string },
  ): ArchitectureViolation | null {
    return this.engine.suppressViolation(id, dto.reason, dto.expiresAt);
  }

  /** Seed default rules for a repository. */
  @Post('seed/:repositoryId')
  seedRules(@Param('repositoryId') repositoryId: string): Promise<ArchitectureRule[]> {
    return this.engine.seedDefaultRules(repositoryId);
  }
}
