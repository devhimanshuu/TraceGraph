/**
 * Live API audit — boots the real Nest app (real CognoDB), mints a session in
 * the same process (sessions live in a server-side store), and exercises every
 * endpoint. Prints a status table and flags failures.
 */
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { SessionService } from '../src/auth/session.service';
import type { AppConfig } from '../src/config/configuration';

async function main(): Promise<void> {
  const http = await NestFactory.create(AppModule, { logger: false });
  const config = http.get(ConfigService).getOrThrow<AppConfig>('app');
  configureApp(http, config);
  await http.listen(0);
  // Mint the session from THIS app's DI container — sessions live in the
  // server-side in-memory store, so the token only verifies in this process.
  const sessions = http.get(SessionService);
  AUTH_TOKEN = await sessions.createSession(
    { id: 'audit-user', login: 'auditor', name: 'Audit User', avatarUrl: '' },
    '',
  );
  const address = http.getHttpServer().address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const base = `http://127.0.0.1:${port}/api`;

  const checks: Array<{ name: string; path: string; probe?: (body: any) => boolean }> = [
    { name: 'health', path: '/health' },
    { name: 'db health', path: '/health/database' },
    { name: 'repository overview', path: '/repository', probe: (b) => b?.name === 'nest' || b?.fullName?.includes('nestjs') },
    { name: 'repository components', path: '/repository/components?limit=5' },
    { name: 'repository activity', path: '/repository/activity?limit=5' },
    { name: 'graph neighborhood', path: '/graph?depth=2&limit=50', probe: (b) => Array.isArray(b?.nodes) && b.nodes.length > 0 },
    { name: 'search', path: '/search?q=Module&limit=5' },
  ];

  // Node-detail checks need an id from the graph.
  const graph = await fetchJson(`${base}/graph?depth=1&limit=50`);
  const someNode = graph?.nodes?.[0] as { id?: string } | undefined;
  if (someNode?.id) {
    const id = encodeURIComponent(someNode.id);
    checks.push(
      { name: 'node detail', path: `/nodes/${id}`, probe: (b) => Boolean(b?.id) },
      { name: 'relationship summary', path: `/nodes/${id}/relationship-summary` },
      { name: 'dependencies', path: `/nodes/${id}/dependencies?limit=5` },
      { name: 'dependents', path: `/nodes/${id}/dependents?limit=5` },
      { name: 'callers', path: `/nodes/${id}/callers?limit=5` },
      { name: 'callees', path: `/nodes/${id}/callees?limit=5` },
      { name: 'tests', path: `/nodes/${id}/tests?limit=5` },
      { name: 'commits', path: `/nodes/${id}/commits?limit=5` },
      { name: 'pull requests', path: `/nodes/${id}/pull-requests?limit=5` },
      { name: 'issues', path: `/nodes/${id}/issues?limit=5` },
      { name: 'traversal depth=3', path: `/traversal/${id}?depth=3&limit=50` },
      { name: 'impact depth=3', path: `/impact/${id}?depth=3&limit=50` },
      { name: 'impact history', path: '/impact-history?limit=10' },
    );
  }

  let failures = 0;
  for (const check of checks) {
    try {
      const [status, body] = await fetchJsonWithStatus(`${base}${check.path}`);
      const ok = status < 400 && (!check.probe || check.probe(body));
      if (!ok) failures += 1;
      const probeMsg = check.probe ? (ok ? 'probe-ok' : 'PROBE-FAIL') : '';
      const snippet =
        typeof body === 'object' && body !== null
          ? JSON.stringify(body).slice(0, 120)
          : String(body).slice(0, 120);
      console.log(`${ok ? 'PASS' : 'FAIL'} ${status} ${check.path} ${probeMsg} :: ${snippet}`);
    } catch (err) {
      failures += 1;
      console.log(`FAIL ERR ${check.path} :: ${err instanceof Error ? err.message : err}`);
    }
  }

  await http.close();
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}

async function fetchJson(url: string): Promise<any> {
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
    });
    return (await response.json()) as any;
  } catch {
    return undefined;
  }
}

let AUTH_TOKEN = '';

async function fetchJsonWithStatus(url: string): Promise<[number, any]> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}`, Accept: 'application/json' },
  });
  let body: any;
  try {
    body = (await response.json()) as any;
  } catch {
    body = null;
  }
  return [response.status, body];
}

void main();
