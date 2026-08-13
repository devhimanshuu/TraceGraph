/**
 * Assembles the complete deterministic seed dataset for commerce-platform.
 *
 * Every count below is a pure function of these files, so `db:verify` compares
 * the live graph against the same definitions (guaranteeing idempotency and
 * catching partial clears).
 */
import type { SeedDataset } from '../types';
import {
  containmentRels as fileContainment,
  directoryNodes,
  fileNodes,
  importRels,
  repositoryNodes,
} from './files';
import {
  callRels,
  classNodes,
  containmentRels as symbolContainment,
  extendsRels,
  functionNodes,
} from './symbols';
import { testNodes, testRels } from './tests';
import { commitNodes, developerNodes, historyRels, issueNodes, pullRequestNodes } from './history';

export function buildDataset(): SeedDataset {
  return {
    nodes: [
      ...repositoryNodes(),
      ...directoryNodes(),
      ...fileNodes(),
      ...classNodes(),
      ...functionNodes(),
      ...testNodes(),
      ...developerNodes(),
      ...commitNodes(),
      ...pullRequestNodes(),
      ...issueNodes(),
    ],
    rels: [
      ...fileContainment(),
      ...symbolContainment(),
      ...importRels(),
      ...callRels(),
      ...extendsRels(),
      ...testRels(),
      ...historyRels(),
    ],
  };
}

/** Per-label node counts — used for progress output and verification. */
export function nodeCounts(): Record<string, number> {
  const dataset = buildDataset();
  const counts: Record<string, number> = {};
  for (const node of dataset.nodes) {
    counts[node.label] = (counts[node.label] ?? 0) + 1;
  }
  return counts;
}

/** Per-type relationship counts — used for progress output and verification. */
export function relCounts(): Record<string, number> {
  const dataset = buildDataset();
  const counts: Record<string, number> = {};
  for (const rel of dataset.rels) {
    counts[rel.type] = (counts[rel.type] ?? 0) + 1;
  }
  return counts;
}
