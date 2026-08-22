import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import type {
  Organization, Workspace, WorkspaceMembership, WorkspaceRole,
  WorkspaceInvitation, SavedReport, AuditEvent, WorkspaceDashboard,
  CrossRepoSummary, CreateOrganizationRequest, CreateWorkspaceRequest,
  InviteMemberRequest, UpdateMemberRoleRequest, CreateReportRequest,
} from '@tracegraph/shared';
import { WorkspaceService } from './workspace.service';

@Controller()
export class WorkspaceController {
  constructor(private readonly workspaceService: WorkspaceService) {}

  // ── Organizations ────────────────────────────────────────────────────

  @Post('organizations')
  createOrganization(@Body() dto: CreateOrganizationRequest): Promise<Organization> {
    return this.workspaceService.createOrganization(dto);
  }

  @Get('organizations')
  listOrganizations(): Promise<Organization[]> {
    return this.workspaceService.listOrganizations();
  }

  // ── Workspaces ───────────────────────────────────────────────────────

  @Post('workspaces')
  createWorkspace(@Body() dto: CreateWorkspaceRequest & { creatorId?: string }): Promise<Workspace> {
    return this.workspaceService.createWorkspace(dto, dto.creatorId ?? 'user:default');
  }

  @Get('workspaces')
  listWorkspaces(): Promise<Workspace[]> {
    return this.workspaceService.listWorkspaces();
  }

  @Get('workspaces/:id')
  getWorkspace(@Param('id') id: string): Promise<Workspace | null> {
    return this.workspaceService.getWorkspace(id);
  }

  @Patch('workspaces/:id')
  updateWorkspace(@Param('id') id: string, @Body() dto: Partial<Workspace>): Promise<Workspace | null> {
    return this.workspaceService.updateWorkspace(id, dto);
  }

  @Delete('workspaces/:id')
  deleteWorkspace(@Param('id') id: string): Promise<{ deleted: boolean }> {
    return this.workspaceService.deleteWorkspace(id).then((deleted) => ({ deleted }));
  }

  // ── Members ──────────────────────────────────────────────────────────

  @Get('workspaces/:id/members')
  listMembers(@Param('id') id: string): Promise<WorkspaceMembership[]> {
    return this.workspaceService.listMembers(id);
  }

  @Post('workspaces/:id/members')
  addMember(
    @Param('id') id: string,
    @Body() dto: { userId: string; role: WorkspaceRole; name?: string },
  ): Promise<WorkspaceMembership> {
    return this.workspaceService.addMember(id, dto.userId, dto.role, dto.name);
  }

  @Patch('workspaces/:id/members/:memberId')
  updateMemberRole(
    @Param('memberId') memberId: string,
    @Body() dto: UpdateMemberRoleRequest,
  ): Promise<WorkspaceMembership | null> {
    return this.workspaceService.updateMemberRole(memberId, dto.role);
  }

  @Delete('workspaces/:id/members/:memberId')
  removeMember(@Param('memberId') memberId: string): Promise<{ removed: boolean }> {
    return this.workspaceService.removeMember(memberId).then((removed) => ({ removed }));
  }

  // ── Invitations ──────────────────────────────────────────────────────

  @Get('workspaces/:id/invitations')
  listInvitations(@Param('id') id: string): Promise<WorkspaceInvitation[]> {
    return this.workspaceService.listInvitations(id);
  }

  @Post('workspaces/:id/invitations')
  createInvitation(
    @Param('id') id: string,
    @Body() dto: InviteMemberRequest,
  ): Promise<WorkspaceInvitation> {
    return this.workspaceService.createInvitation(id, dto, 'user:default');
  }

  // ── Reports ──────────────────────────────────────────────────────────

  @Get('workspaces/:id/reports')
  listReports(@Param('id') id: string): Promise<SavedReport[]> {
    return this.workspaceService.listReports(id);
  }

  @Post('workspaces/:id/reports')
  createReport(
    @Param('id') id: string,
    @Body() dto: CreateReportRequest,
  ): Promise<SavedReport> {
    return this.workspaceService.createReport(id, dto, {
      id: 'user:default', name: 'User', username: 'user', email: '',
      avatarUrl: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    });
  }

  @Get('reports/:id')
  getReport(@Param('id') id: string): Promise<SavedReport | null> {
    return this.workspaceService.getReport(id);
  }

  // ── Activity ─────────────────────────────────────────────────────────

  @Get('workspaces/:id/activity')
  listActivity(@Param('id') id: string): Promise<AuditEvent[]> {
    return this.workspaceService.listActivity(id);
  }

  // ── Dashboard ────────────────────────────────────────────────────────

  @Get('workspaces/:id/dashboard')
  getDashboard(@Param('id') id: string): Promise<WorkspaceDashboard> {
    return this.workspaceService.getDashboard(id);
  }

  @Get('workspaces/:id/cross-repo')
  getCrossRepoSummary(@Param('id') id: string): Promise<CrossRepoSummary> {
    return this.workspaceService.getCrossRepoSummary(id);
  }
}
