import { Controller, Get, Param, Query } from '@nestjs/common';
import type { OwnershipResult, OwnershipOverview, DeveloperExpertise } from '@tracegraph/shared';
import { OwnershipService } from './ownership.service';

/**
 * `/api/ownership/*` — ownership intelligence endpoints.
 */
@Controller('ownership')
export class OwnershipController {
  constructor(private readonly ownershipService: OwnershipService) {}

  /** Get ownership candidates for an entity. */
  @Get('entity')
  getOwnership(@Query('id') id: string): Promise<OwnershipResult> {
    return this.ownershipService.getOwnership(id);
  }

  /** Get ownership overview for a repository. */
  @Get('repository/:repoId')
  getOverview(@Param('repoId') repoId: string): Promise<OwnershipOverview> {
    return this.ownershipService.getOverview(repoId);
  }

  /** Get developer expertise profile. */
  @Get('developer/:username')
  getDeveloperExpertise(@Param('username') username: string): Promise<DeveloperExpertise | null> {
    return this.ownershipService.getDeveloperExpertise(username);
  }
}
