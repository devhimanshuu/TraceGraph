'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Braces,
  CheckCircle2,
  Copy,
  FileDown,
  GitCompare,
  Printer,
  Radar,
} from 'lucide-react';
import { useGitHubSession } from '@/hooks/use-github-session';
import type { ImpactResponse } from '@tracegraph/shared';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { SectionError } from '@/components/dashboard/section-error';
import { impactService } from '@/lib/services/impact.service';
import {
  buildImpactMarkdown,
  downloadImpactJson,
  downloadTextFile,
  impactFileName,
} from '@/lib/services/impact-export';
import { EntitySearchDialog } from '@/components/dependencies/entity-search-dialog';
import { ImpactReportDocument } from '@/components/impact/impact-report-document';

function ReportLoading() {
  return (
    <div className="flex flex-col gap-6" data-testid="report-loading">
      <Skeleton className="h-10 w-72" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-40 rounded-xl" />
      <Skeleton className="h-52 rounded-xl" />
    </div>
  );
}

/**
 * Shareable, printable impact report. Renders the
 * analysis as a static document: summary + score, affected components with
 * reasons, evidence paths, potentially affected tests, and engineering
 * history. Everything comes from one server-computed ImpactResponse — the
 * document never re-derives counts. `window.print()` yields a paper-friendly
 * light document via the .tg-impact-report print styles in globals.css.
 */
export function ImpactReport() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nodeId = searchParams.get('node');
  const depthParam = searchParams.get('depth');
  const { getToken } = useGitHubSession();

  const depth = useMemo(() => {
    const n = Number(depthParam);
    return Number.isInteger(n) && n >= 1 && n <= 4 ? n : 2;
  }, [depthParam]);

  const [analysis, setAnalysis] = useState<ImpactResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState('');
  const [copied, setCopied] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [compareOpen, setCompareOpen] = useState(false);

  useEffect(() => {
    let ignore = false;
    if (!nodeId) return;
    const targetId = nodeId;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        const data = await impactService.getImpact(targetId, { depth, limit: 100 }, token);
        if (!ignore) {
          setAnalysis(data);
          setGeneratedAt(
            new Date().toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }),
          );
          setLoading(false);
        }
      } catch (err) {
        if (!ignore) {
          setError(err instanceof Error ? err.message : 'Impact analysis failed');
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      ignore = true;
    };
  }, [nodeId, depth, refreshTrigger, getToken]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. non-secure context) — ignore.
    }
  }, []);

  // ── No entity selected ─────────────────────────────────────────────────────
  if (!nodeId) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white">
          <Radar className="size-6" />
        </span>
        <h1 className="text-xl font-semibold tracking-tight">Impact Analysis Report</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Select an entity to generate its printable impact report.
        </p>
        <Link href="/impact" className={buttonVariants({ className: 'mt-2 gap-2' })}>
          <Radar className="size-4" />
          Open Impact Analysis
        </Link>
      </div>
    );
  }

  if (loading) {
    return <ReportLoading />;
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <SectionError
          title="Could not generate the report"
          message="We couldn't complete the graph traversal for this report. Please try again."
          onRetry={() => setRefreshTrigger((c) => c + 1)}
        />
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="tg-impact-report flex flex-col gap-8">
      {/* Screen-only action bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-xs text-muted-foreground">
          Shareable report · open with anyone on this workspace
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCompareOpen(true)}
            className="h-8 gap-1.5 text-xs"
          >
            <GitCompare className="size-3.5" />
            Compare with…
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={copyLink}
            className="h-8 gap-1.5 text-xs"
          >
            {copied ? <CheckCircle2 className="size-3.5" /> : <Copy className="size-3.5" />}
            {copied ? 'Link copied' : 'Copy report link'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              downloadTextFile(
                impactFileName(analysis.root.label, analysis.depth, 'md'),
                buildImpactMarkdown(analysis, { generatedAt: generatedAt || undefined }),
                'text/markdown',
              )
            }
            className="h-8 gap-1.5 text-xs"
          >
            <FileDown className="size-3.5" />
            Export MD
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadImpactJson(analysis)}
            className="h-8 gap-1.5 text-xs"
          >
            <Braces className="size-3.5" />
            Export JSON
          </Button>
          <Button size="sm" onClick={() => window.print()} className="h-8 gap-1.5 text-xs">
            <Printer className="size-3.5" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <ImpactReportDocument analysis={analysis} depth={depth} generatedAt={generatedAt} />

      {/* Compare-with picker — replaces the current entity as slot A */}
      <EntitySearchDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        onSelect={(otherId) => {
          if (otherId === nodeId) return;
          router.push(
            `/impact/compare?nodeA=${encodeURIComponent(nodeId)}&nodeB=${encodeURIComponent(otherId)}&depth=${depth}`,
          );
        }}
      />
    </div>
  );
}
