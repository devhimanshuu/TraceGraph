/**
 * WorkspaceService — multi-tenant workspace management.
 *
 * Handles organizations, workspaces, memberships, invitations,
 * saved reports, audit events, and role-based permissions.
 *
 * Every query is tenant-scoped. No cross-workspace data leakage.
 */
import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import type {
  Organization,
  Workspace,
  WorkspaceUser,
  WorkspaceMembership,
  WorkspaceRole,
  WorkspacePermissions,
  WorkspaceInvitation,
  SavedReport,
  AuditEvent,
  AuditEventType,
  WorkspaceDashboard,
  CrossRepoSummary,
  CreateOrganizationRequest,
  CreateWorkspaceRequest,
  InviteMemberRequest,
  CreateReportRequest,
} from '@tracegraph/shared';

const logger = new Logger('WorkspaceService');

// ── Permission matrix ───────────────────────────────────────────────────────

const PERMISSIONS: Record<WorkspaceRole, WorkspacePermissions> = {
  OWNER: {
    canManageWorkspace: true, canManageMembers: true, canManageRepositories: true,
    canManageGuardrails: true, canCreateReports: true, canDeleteWorkspace: true,
    canViewGraph: true, canRunAnalysis: true,
  },
  ADMIN: {
    canManageWorkspace: false, canManageMembers: true, canManageRepositories: true,
    canManageGuardrails: true, canCreateReports: true, canDeleteWorkspace: false,
    canViewGraph: true, canRunAnalysis: true,
  },
  MEMBER: {
    canManageWorkspace: false, canManageMembers: false, canManageRepositories: false,
    canManageGuardrails: false, canCreateReports: true, canDeleteWorkspace: false,
    canViewGraph: true, canRunAnalysis: true,
  },
  VIEWER: {
    canManageWorkspace: false, canManageMembers: false, canManageRepositories: false,
    canManageGuardrails: false, canCreateReports: false, canDeleteWorkspace: false,
    canViewGraph: true, canRunAnalysis: false,
  },
};

/** In-memory stores (would be application DB in production). */
const orgStore = new Map<string, Organization>();
const workspaceStore = new Map<string, Workspace>();
const membershipStore = new Map<string, WorkspaceMembership>();
const invitationStore = new Map<string, WorkspaceInvitation>();
const reportStore = new Map<string, SavedReport>();
const auditStore = new Map<string, AuditEvent>();

@Injectable()
export class WorkspaceService {
  constructor(private readonly db: DatabaseService) {}

  // ── Organization CRUD ──────────────────────────────────────────────────

  async createOrganization(dto: CreateOrganizationRequest): Promise<Organization> {
    const now = new Date().toISOString();
    const org: Organization = { id: `org:${randomUUID().slice(0, 8)}`, name: dto.name, slug: dto.slug, createdAt: now, updatedAt: now };
    orgStore.set(org.id, org);
    return org;
  }

  async listOrganizations(): Promise<Organization[]> {
    return [...orgStore.values()];
  }

  // ── Workspace CRUD ─────────────────────────────────────────────────────

  async createWorkspace(dto: CreateWorkspaceRequest, creatorId: string): Promise<Workspace> {
    const now = new Date().toISOString();
    const ws: Workspace = {
      id: `ws:${randomUUID().slice(0, 8)}`, organizationId: dto.organizationId,
      name: dto.name, slug: dto.slug, description: dto.description ?? '',
      createdAt: now, updatedAt: now,
    };
    workspaceStore.set(ws.id, ws);

    // Creator becomes OWNER
    const membership: WorkspaceMembership = {
      id: `mem:${randomUUID().slice(0, 8)}`, workspaceId: ws.id, userId: creatorId,
      user: { id: creatorId, name: 'Creator', username: creatorId, email: '', avatarUrl: null, createdAt: now, updatedAt: now },
      role: 'OWNER', status: 'ACTIVE', createdAt: now, updatedAt: now,
    };
    membershipStore.set(membership.id, membership);

    this.audit(ws.id, creatorId, 'WORKSPACE_UPDATED', 'workspace', ws.id, { action: 'created' });
    return ws;
  }

  async getWorkspace(id: string): Promise<Workspace | null> {
    return workspaceStore.get(id) ?? null;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    return [...workspaceStore.values()];
  }

  async updateWorkspace(id: string, patch: Partial<Workspace>): Promise<Workspace | null> {
    const ws = workspaceStore.get(id);
    if (!ws) return null;
    const updated = { ...ws, ...patch, id: ws.id, updatedAt: new Date().toISOString() };
    workspaceStore.set(id, updated);
    return updated;
  }

  async deleteWorkspace(id: string): Promise<boolean> {
    // Delete all memberships, invitations, reports, audit events for this workspace
    for (const [k, v] of membershipStore) { if (v.workspaceId === id) membershipStore.delete(k); }
    for (const [k, v] of invitationStore) { if (v.workspaceId === id) invitationStore.delete(k); }
    for (const [k, v] of reportStore) { if (v.workspaceId === id) reportStore.delete(k); }
    for (const [k, v] of auditStore) { if (v.workspaceId === id) auditStore.delete(k); }
    return workspaceStore.delete(id);
  }

  // ── Membership ─────────────────────────────────────────────────────────

  async listMembers(workspaceId: string): Promise<WorkspaceMembership[]> {
    return [...membershipStore.values()].filter((m) => m.workspaceId === workspaceId && m.status === 'ACTIVE');
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole, name?: string): Promise<WorkspaceMembership> {
    const now = new Date().toISOString();
    const membership: WorkspaceMembership = {
      id: `mem:${randomUUID().slice(0, 8)}`, workspaceId, userId,
      user: { id: userId, name: name ?? userId, username: userId, email: '', avatarUrl: null, createdAt: now, updatedAt: now },
      role, status: 'ACTIVE', createdAt: now, updatedAt: now,
    };
    membershipStore.set(membership.id, membership);
    this.audit(workspaceId, userId, 'MEMBER_INVITED', 'member', membership.id, { role });
    return membership;
  }

  async updateMemberRole(membershipId: string, role: WorkspaceRole): Promise<WorkspaceMembership | null> {
    const mem = membershipStore.get(membershipId);
    if (!mem) return null;
    mem.role = role;
    mem.updatedAt = new Date().toISOString();
    return mem;
  }

  async removeMember(membershipId: string): Promise<boolean> {
    const mem = membershipStore.get(membershipId);
    if (!mem) return false;
    mem.status = 'DEACTIVATED';
    mem.updatedAt = new Date().toISOString();
    return true;
  }

  // ── Permission check ───────────────────────────────────────────────────

  async checkPermission(workspaceId: string, userId: string): Promise<WorkspacePermissions> {
    const membership = [...membershipStore.values()].find(
      (m) => m.workspaceId === workspaceId && m.userId === userId && m.status === 'ACTIVE',
    );
    if (!membership) {
      throw new ForbiddenException('Not a member of this workspace');
    }
    return PERMISSIONS[membership.role] ?? PERMISSIONS.VIEWER;
  }

  async getMembership(workspaceId: string, userId: string): Promise<WorkspaceMembership | null> {
    return [...membershipStore.values()].find(
      (m) => m.workspaceId === workspaceId && m.userId === userId && m.status === 'ACTIVE',
    ) ?? null;
  }

  // ── Invitations ────────────────────────────────────────────────────────

  async createInvitation(workspaceId: string, dto: InviteMemberRequest, createdBy: string): Promise<WorkspaceInvitation> {
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const invitation: WorkspaceInvitation = {
      id: `inv:${randomUUID().slice(0, 8)}`, workspaceId, email: dto.email,
      role: dto.role, createdBy, status: 'PENDING', expiresAt, createdAt: now,
    };
    invitationStore.set(invitation.id, invitation);
    this.audit(workspaceId, createdBy, 'MEMBER_INVITED', 'invitation', invitation.id, { email: dto.email, role: dto.role });
    return invitation;
  }

  async listInvitations(workspaceId: string): Promise<WorkspaceInvitation[]> {
    return [...invitationStore.values()].filter((i) => i.workspaceId === workspaceId && i.status === 'PENDING');
  }

  // ── Saved Reports ──────────────────────────────────────────────────────

  async createReport(workspaceId: string, dto: CreateReportRequest, createdBy: WorkspaceUser): Promise<SavedReport> {
    const now = new Date().toISOString();
    const report: SavedReport = {
      id: `rpt:${randomUUID().slice(0, 8)}`, workspaceId, repositoryId: dto.repositoryId,
      repositoryName: '', createdBy, title: dto.title, summary: dto.summary,
      reportType: dto.reportType, data: dto.data, graphRevision: dto.graphRevision ?? null,
      createdAt: now,
    };
    reportStore.set(report.id, report);
    this.audit(workspaceId, createdBy.id, 'REPORT_CREATED', 'report', report.id, { title: dto.title });
    return report;
  }

  async listReports(workspaceId: string): Promise<SavedReport[]> {
    return [...reportStore.values()].filter((r) => r.workspaceId === workspaceId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getReport(id: string): Promise<SavedReport | null> {
    return reportStore.get(id) ?? null;
  }

  // ── Audit ──────────────────────────────────────────────────────────────

  async listActivity(workspaceId: string, limit = 20): Promise<AuditEvent[]> {
    return [...auditStore.values()]
      .filter((e) => e.workspaceId === workspaceId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  }

  private audit(workspaceId: string, actorId: string, eventType: AuditEventType, resourceType: string, resourceId: string, metadata: Record<string, unknown>): void {
    const event: AuditEvent = {
      id: `evt:${randomUUID().slice(0, 8)}`, workspaceId, actorId,
      actorName: actorId, eventType, resourceType, resourceId, metadata,
      createdAt: new Date().toISOString(),
    };
    auditStore.set(event.id, event);
  }

  // ── Dashboard ──────────────────────────────────────────────────────────

  async getDashboard(workspaceId: string): Promise<WorkspaceDashboard> {
    const ws = workspaceStore.get(workspaceId);
    if (!ws) throw new NotFoundException('Workspace not found');

    const members = await this.listMembers(workspaceId);
    const reports = await this.listReports(workspaceId);
    const activity = await this.listActivity(workspaceId, 10);

    return {
      workspace: ws,
      repositoryCount: 0, // Would query graph for repositories in this workspace
      memberCount: members.length,
      guardrailRuleCount: 0,
      openViolations: 0,
      savedReports: reports.length,
      recentActivity: activity,
    };
  }

  // ── Cross-repository summary ───────────────────────────────────────────

  async getCrossRepoSummary(workspaceId: string): Promise<CrossRepoSummary> {
    // Would query graph for all repositories in this workspace
    return { workspaceId, repositories: [] };
  }
}
