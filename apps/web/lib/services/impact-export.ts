import type { ImpactResponse } from '@tracegraph/shared';

/**
 * Impact report export helpers. `buildImpactMarkdown` turns the server-computed
 * ImpactResponse into a self-contained, PR/ticket-ready markdown document —
 * same data as the printable report, one function, fully testable. JSON export
 * is just the raw response (the single source of truth) pretty-printed.
 */

const esc = (value: string): string => value.replace(/\|/g, '\\|');

/** Safe filename fragment from an entity label (e.g. "PaymentService"). */
export function impactFileName(label: string, depth: number, ext: 'md' | 'json'): string {
  const safe = label.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return `impact-report-${safe || 'entity'}-${depth}hop${depth > 1 ? 's' : ''}.${ext}`;
}

/**
 * Builds the markdown export. `generatedAt` is optional display metadata only —
 * every factual number comes from the response.
 */
export function buildImpactMarkdown(
  response: ImpactResponse,
  options: { generatedAt?: string } = {},
): string {
  const { root, depth, summary, directImpact, indirectImpact, tests, history, paths } = response;
  const lines: string[] = [];

  lines.push('# Impact Analysis Report', '');
  lines.push(`**Entity:** ${root.label}`);
  lines.push(`**Identifier:** \`${root.id}\``);
  lines.push(`**Type:** ${root.type} · **Depth:** ${depth} hop${depth > 1 ? 's' : ''}`);
  lines.push(`**Impact score:** ${summary.score}`);
  if (options.generatedAt) {
    lines.push(`**Generated:** ${options.generatedAt}`);
  }
  lines.push('');

  // ── Summary ──
  lines.push('## Summary', '');
  lines.push('| Metric | Count |');
  lines.push('| --- | --- |');
  lines.push(`| Direct | ${summary.direct} |`);
  lines.push(`| Indirect | ${summary.indirect} |`);
  lines.push(`| Potentially affected tests | ${summary.tests} |`);
  lines.push(`| Commits | ${summary.commits} |`);
  lines.push(`| Pull requests | ${summary.pullRequests} |`);
  lines.push(`| Issues | ${summary.issues} |`);
  lines.push('');

  if (summary.scoreReasons.length > 0) {
    lines.push(`**Why this score?** (${summary.score})`, '');
    for (const reason of summary.scoreReasons) {
      lines.push(`- ${reason}`);
    }
    lines.push('');
  }

  // ── Affected components ──
  lines.push('## Potentially Affected Components', '');
  if (directImpact.length + indirectImpact.length === 0) {
    lines.push(
      'No modeled dependencies were found within the selected analysis depth. This does not ' +
        'necessarily mean the component is isolated — absence from the graph is not proof of ' +
        'absence in reality.',
      '',
    );
  } else {
    if (directImpact.length > 0) {
      lines.push(`### Direct impact (${directImpact.length})`, '');
      for (const entity of directImpact) {
        const via = entity.via ? ` via \`${entity.via.label}\`` : '';
        lines.push(`- **${esc(entity.label)}** — ${entity.relationship}${via}`);
        lines.push(`  - ${entity.reason}`);
      }
      lines.push('');
    }

    if (indirectImpact.length > 0) {
      lines.push(`### Indirect impact (${indirectImpact.length})`, '');
      for (const entity of indirectImpact) {
        lines.push(`- **${esc(entity.label)}** — distance ${entity.distance}`);
        const chain = entity.path.nodes.map((n) => n.label).join(' → ');
        lines.push(`  - Path: ${chain}`);
        lines.push(`  - ${entity.reason}`);
      }
      lines.push('');
    }
  }

  // ── Evidence paths ──
  if (paths.length > 0) {
    lines.push('## Evidence Paths', '');
    for (const path of paths) {
      const chain = path.nodes.map((n) => n.label).join(' → ');
      const rels = path.relTypes.length > 0 ? ` (${path.relTypes.join(', ')})` : '';
      lines.push(`- ${chain}${rels}`);
    }
    lines.push('');
  }

  // ── Tests ──
  lines.push(`## Potentially Affected Tests (${tests.length})`, '');
  if (tests.length === 0) {
    lines.push(
      'No test coverage is modeled for the selected entity or its directly-affected components.',
      '',
    );
  } else {
    const byFile = new Map<string, typeof tests>();
    for (const test of tests) {
      const list = byFile.get(test.filePath) ?? [];
      list.push(test);
      byFile.set(test.filePath, list);
    }
    for (const [filePath, suiteTests] of byFile) {
      lines.push(`- \`${filePath}\``);
      for (const test of suiteTests) {
        lines.push(`  - ${test.name} (${test.framework})`);
      }
    }
    lines.push('');
  }

  // ── History ──
  lines.push('## Engineering History', '');
  if (history.commits.length === 0 && history.pullRequests.length === 0 && history.issues.length === 0) {
    lines.push('No engineering history is modeled for this entity.', '');
  } else {
    if (history.commits.length > 0) {
      lines.push(`### Commits (${history.commits.length})`);
      for (const commit of history.commits.slice(0, 5)) {
        lines.push(`- \`${commit.sha.slice(0, 7)}\` — ${commit.message}`);
      }
      lines.push('');
    }
    if (history.pullRequests.length > 0) {
      lines.push(`### Pull requests (${history.pullRequests.length})`);
      for (const pr of history.pullRequests.slice(0, 4)) {
        lines.push(`- #${pr.number} — ${pr.title}`);
      }
      lines.push('');
    }
    if (history.issues.length > 0) {
      lines.push(`### Issues (${history.issues.length})`);
      for (const issue of history.issues.slice(0, 4)) {
        lines.push(`- #${issue.number} — ${issue.title}`);
      }
      lines.push('');
    }
  }

  // ── Footer ──
  lines.push('---', '');
  lines.push(
    '*Generated by TraceGraph from the modeled dependency graph. Affected components are ' +
      '**potentially** affected based on modeled relationships — this report does not claim they ' +
      'will break. Absence from the graph is not proof of absence in reality.*',
  );
  lines.push('');

  return lines.join('\n');
}

/** Triggers a browser download of a text file (no server round-trip needed). */
export function downloadTextFile(filename: string, content: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/** Downloads the raw analysis as pretty-printed JSON. */
export function downloadImpactJson(response: ImpactResponse): void {
  downloadTextFile(
    impactFileName(response.root.label, response.depth, 'json'),
    `${JSON.stringify(response, null, 2)}\n`,
    'application/json',
  );
}
