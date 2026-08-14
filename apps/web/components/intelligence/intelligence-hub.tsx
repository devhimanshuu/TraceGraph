'use client';

import { GitCompareArrows, Radar, ScanSearch } from 'lucide-react';
import { RepoChooser } from '@/components/onboarding/repo-chooser';
import { SectionError } from '@/components/dashboard/section-error';
import { useRepositoryContext } from '@/components/layout/repository-provider';
import { BlastRadiusTool } from '@/components/intelligence/blast-radius-tool';
import { SmellsSection } from '@/components/intelligence/smells-section';
import { OrphansSection } from '@/components/intelligence/orphans-section';
import { TestGapsSection } from '@/components/intelligence/test-gaps-section';
import { KnowledgeSection } from '@/components/intelligence/knowledge-section';

/**
 * Codebase Intelligence hub (Phase 11.5) — deterministic findings derived from
 * the dependency graph, with the PR blast-radius tool as the centerpiece. Each
 * section owns its fetch + loading/empty/error state so one slow endpoint
 * never blocks the rest of the page.
 */
export function IntelligenceHub() {
  const { repository, loading: repoLoading, error: repoError, refresh: refreshRepo } =
    useRepositoryContext();

  if (repoLoading) {
    return (
      <div className="flex flex-col gap-6 py-2" data-testid="intelligence-loading">
        <div className="flex flex-col gap-3">
          <div className="h-3 w-48 animate-pulse rounded bg-muted" />
          <div className="h-8 w-80 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full max-w-xl animate-pulse rounded bg-muted" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (repoError === 'empty') {
    return (
      <div className="flex flex-col gap-6 py-10">
        <div className="mx-auto flex max-w-lg flex-col items-center gap-2 text-center">
          <h1 className="text-xl font-semibold tracking-tight">No repository yet</h1>
          <p className="text-sm text-muted-foreground">
            Intelligence findings need a mapped codebase. Choose one of your GitHub repositories.
          </p>
        </div>
        <RepoChooser />
      </div>
    );
  }

  if (repoError || !repository) {
    return (
      <div className="mx-auto max-w-lg py-10">
        <SectionError
          title="We couldn't load the repository"
          message={repoError ?? 'The repository is unavailable right now.'}
          onRetry={() => void refreshRepo()}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10">
      {/* Header */}
      <section className="flex flex-col gap-3">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          Deterministic findings · derived from the dependency graph
        </p>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-3xl font-semibold tracking-tight">Codebase Intelligence</h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Dead code, architecture smells, test coverage gaps, PR blast radius and who-to-ask —
            every finding is computed from the modeled graph, never guessed.
          </p>
        </div>
      </section>

      {/* PR blast radius — the interactive centerpiece */}
      <section className="flex flex-col gap-4">
        <SectionHeading icon={GitCompareArrows} label="PR blast radius" />
        <BlastRadiusTool />
      </section>

      {/* Architecture smells */}
      <section className="flex flex-col gap-4">
        <SectionHeading icon={Radar} label="Architecture smells" />
        <SmellsSection />
      </section>

      {/* Dead code + test gaps + knowledge */}
      <div className="grid items-start gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="flex flex-col gap-4">
            <SectionHeading icon={ScanSearch} label="Dead code" />
            <OrphansSection />
          </div>
          <div className="flex flex-col gap-4">
            <SectionHeading icon={ScanSearch} label="Test coverage gaps" />
            <TestGapsSection />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <SectionHeading icon={ScanSearch} label="Who to ask" />
          <KnowledgeSection />
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, label }: { icon: typeof Radar; label: string }) {
  return (
    <h2 className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
      <Icon className="size-4" />
      {label}
    </h2>
  );
}
