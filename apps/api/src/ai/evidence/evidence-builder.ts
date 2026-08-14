/**
 * EvidenceBuilder.
 *
 * Converts the deterministic `ImpactResponse` into a bounded,
 * compact evidence payload with stable local ids (E1, E2, …) that the LLM can
 * cite and the frontend can render as clickable chips.
 *
 * The payload is deliberately bounded — caps for paths, tests, commits, PRs and
 * issues — so the model gets structured engineering facts, not the whole graph.
 * Long free-text fields are truncated. Nothing here is inferred: every item
 * comes from the impact analysis result.
 */
import { Injectable } from '@nestjs/common';
import type { AiEvidenceItem, ImpactedEntity, ImpactResponse } from '@tracegraph/shared';
import {
  MAX_EVIDENCE_COMMITS,
  MAX_EVIDENCE_ISSUES,
  MAX_EVIDENCE_PATHS,
  MAX_EVIDENCE_PULL_REQUESTS,
  MAX_EVIDENCE_TESTS,
  MAX_EVIDENCE_TEXT_LENGTH,
} from '../ai.constants';

export interface BuiltEvidence {
  items: AiEvidenceItem[];
  /** All valid evidence ids (E1, …, En) — used to validate model citations. */
  idSet: Set<string>;
  /** Compact fact object handed to the LLM inside the prompt. */
  payload: EvidencePayload;
}

/** The structured facts passed to the LLM — data, never instructions. */
export interface EvidencePayload {
  root: { label: string; type: string };
  impact: { direct: string[]; indirect: string[] };
  evidence: Array<{
    id: string;
    kind: AiEvidenceItem['kind'];
    direction?: 'direct' | 'indirect';
    description: string;
  }>;
}

/** Truncate long free-text (commit messages, PR/issue titles) for the payload. */
export function truncateText(text: string, max = MAX_EVIDENCE_TEXT_LENGTH): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/** "OrderService → CALLS → CheckoutService → CALLS → PaymentService". */
function describePath(entity: ImpactedEntity): string {
  const parts: string[] = [];
  entity.path.nodes.forEach((node, i) => {
    if (i > 0) {
      const rel = entity.path.relTypes[i - 1] ?? entity.relationship;
      parts.push(rel);
    }
    parts.push(node.label);
  });
  return parts.join(' → ');
}

@Injectable()
export class EvidenceBuilder {
  build(response: ImpactResponse): BuiltEvidence {
    const items: AiEvidenceItem[] = [];
    let nextId = 1;
    const next = (): string => `E${nextId++}`;

    // 1. Path evidence (direct first, then indirect — the traversal order).
    const entities = [...response.directImpact, ...response.indirectImpact];
    for (const entity of entities.slice(0, MAX_EVIDENCE_PATHS)) {
      items.push({
        id: next(),
        kind: 'path',
        direction: entity.impactType === 'DIRECT' ? 'direct' : 'indirect',
        description: describePath(entity),
        label: entity.label,
        nodes: entity.path.nodes.map((n) => n.id),
        relTypes: entity.path.relTypes,
      });
    }

    // 2. Test evidence.
    for (const test of response.tests.slice(0, MAX_EVIDENCE_TESTS)) {
      items.push({
        id: next(),
        kind: 'test',
        description: `${test.filePath} — "${truncateText(test.name)}"`,
        label: test.filePath,
      });
    }

    // 3. Engineering history evidence.
    for (const commit of response.history.commits.slice(0, MAX_EVIDENCE_COMMITS)) {
      items.push({
        id: next(),
        kind: 'commit',
        description: `${commit.sha} — ${truncateText(commit.message)}`,
        label: commit.sha,
      });
    }
    for (const pr of response.history.pullRequests.slice(0, MAX_EVIDENCE_PULL_REQUESTS)) {
      items.push({
        id: next(),
        kind: 'pullRequest',
        description: `PR #${pr.number} — ${truncateText(pr.title)}`,
        label: `PR #${pr.number}`,
      });
    }
    for (const issue of response.history.issues.slice(0, MAX_EVIDENCE_ISSUES)) {
      items.push({
        id: next(),
        kind: 'issue',
        description: `Issue #${issue.number} — ${truncateText(issue.title)}`,
        label: `Issue #${issue.number}`,
      });
    }

    const idSet = new Set(items.map((item) => item.id));
    const payload: EvidencePayload = {
      root: { label: response.root.label, type: response.root.type },
      impact: {
        direct: response.directImpact.map((e) => e.label),
        indirect: response.indirectImpact.map((e) => e.label),
      },
      evidence: items.map(({ id, kind, direction, description }) => ({
        id,
        kind,
        ...(direction ? { direction } : {}),
        description,
      })),
    };

    return { items, idSet, payload };
  }
}
