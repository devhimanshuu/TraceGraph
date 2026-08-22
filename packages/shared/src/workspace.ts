/**
 * @tracegraph/shared — Team Workspace types (Phase 20)
 *
 * Models for organizations, workspaces, memberships, invitations,
 * saved reports, audit events, and cross-repository intelligence.
 */

// ── Organization ────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

// ── Workspace ───────────────────────────────────────────────────────────────

export interface Workspace {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ── User ────────────────────────────────────────────────────────────────────

export interface WorkspaceUser {
  id: string;
  name: string;
  username: string;
  email: string;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Membership ──────────────────────────────────────────────────────────────

export type WorkspaceRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
export type MembershipStatus = 'ACTIVE' | 'PENDING' | 'DEACTIVATED';

export interface WorkspaceMembership {
  id: string;
  workspaceId: string;
  userId: string;
  user: WorkspaceUser;
  role: WorkspaceRole;
  status: MembershipStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Permission matrix ───────────────────────────────────────────────────────

export interface WorkspacePermissions {
  canManageWorkspace: boolean;
  canManageMembers: boolean;
  canManageRepositories: boolean;
  canManageGuardrails: boolean;
  canCreateReports: boolean;
  canDeleteWorkspace: boolean;
  canViewGraph: boolean;
  canRunAnalysis: boolean;
}

// ── Invitation ──────────────────────────────────────────────────────────────

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED';

export interface WorkspaceInvitation {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  createdBy: string;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
}

// ── Saved Report ────────────────────────────────────────────────────────────

export interface SavedReport {
  id: string;
  workspaceId: string;
  repositoryId: string;
  repositoryName: string;
  createdBy: WorkspaceUser;
  title: string;
  summary: string;
  reportType: 'impact' | 'guardrail' | 'test-selection';
  /** Immutable snapshot of the report data. */
  data: Record<string, unknown>;
  graphRevision: string | null;
  createdAt: string;
}

// ── Audit Event ─────────────────────────────────────────────────────────────

export type AuditEventType =
  | 'REPOSITORY_ADDED'
  | 'INDEX_STARTED'
  | 'INDEX_COMPLETED'
  | 'GUARDRAIL_CREATED'
  | 'GUARDRAIL_EVALUATED'
  | 'REPORT_CREATED'
  | 'MEMBER_INVITED'
  | 'MEMBER_REMOVED'
  | 'WORKSPACE_UPDATED'
  | 'SYNC_STARTED'
  | 'SYNC_COMPLETED';

export interface AuditEvent {
  id: string;
  workspaceId: string;
  actorId: string;
  actorName: string;
  eventType: AuditEventType;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

// ── Workspace Dashboard ─────────────────────────────────────────────────────

export interface WorkspaceDashboard {
  workspace: Workspace;
  repositoryCount: number;
  memberCount: number;
  guardrailRuleCount: number;
  openViolations: number;
  savedReports: number;
  recentActivity: AuditEvent[];
}

// ── Cross-repository intelligence ───────────────────────────────────────────

export interface CrossRepoSummary {
  workspaceId: string;
  repositories: Array<{
    id: string;
    name: string;
    language: string;
    fileCount: number;
    entityCount: number;
    lastSyncAt: string | null;
    healthStatus: 'healthy' | 'stale' | 'error';
    openViolations: number;
    ownershipCoverage: number;
  }>;
}

// ── API DTOs ────────────────────────────────────────────────────────────────

export interface CreateOrganizationRequest {
  name: string;
  slug: string;
}

export interface CreateWorkspaceRequest {
  organizationId: string;
  name: string;
  slug: string;
  description?: string;
}

export interface InviteMemberRequest {
  email: string;
  role: WorkspaceRole;
}

export interface UpdateMemberRoleRequest {
  role: WorkspaceRole;
}

export interface CreateReportRequest {
  repositoryId: string;
  title: string;
  summary: string;
  reportType: 'impact' | 'guardrail' | 'test-selection';
  data: Record<string, unknown>;
  graphRevision?: string;
}
