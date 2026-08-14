'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCircle2, FileCode, FlaskConical, Search } from 'lucide-react';
import type { TestCoverage } from '@tracegraph/shared';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryErrorState } from '@/components/dependencies/category-error-state';
import { EmptyRelationshipState } from '@/components/dependencies/empty-relationship-state';

export interface TestCoverageViewProps {
  tests: TestCoverage[] | null;
  loading: boolean;
  error: string | null;
  currentLabel: string;
  onRetry?: () => void;
}

export function TestCoverageView({
  tests,
  loading,
  error,
  currentLabel,
  onRetry,
}: TestCoverageViewProps) {
  const [searchTerm, setSearchTerm] = useState('');

  // Group tests by test file path
  const groupedByFile = useMemo(() => {
    if (!tests) return new Map<string, TestCoverage[]>();

    let filtered = tests;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.filePath.toLowerCase().includes(q) ||
          t.target.label.toLowerCase().includes(q) ||
          t.framework.toLowerCase().includes(q),
      );
    }

    const map = new Map<string, TestCoverage[]>();
    for (const test of filtered) {
      const list = map.get(test.filePath) ?? [];
      list.push(test);
      map.set(test.filePath, list);
    }
    return map;
  }, [tests, searchTerm]);

  if (loading) {
    return (
      <div className="flex flex-col gap-4 py-2" data-testid="tests-skeleton">
        <Skeleton className="h-9 w-64" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardHeader className="py-3 px-4">
                <Skeleton className="h-4 w-72" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2 p-4 pt-0">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <CategoryErrorState
        title="Failed to load test coverage"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  if (!tests || tests.length === 0) {
    return (
      <EmptyRelationshipState
        title="No test coverage found"
        description={`No automated tests are currently modeled as targeting ${currentLabel} via TESTS relationships.`}
        icon={FlaskConical}
      />
    );
  }

  const totalFilteredCount = Array.from(groupedByFile.values()).reduce(
    (acc, list) => acc + list.length,
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header filter */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter test suites & cases..."
            aria-label="Filter tests"
            className="h-9 w-full rounded-md border border-border/80 bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {totalFilteredCount} {totalFilteredCount === 1 ? 'test case' : 'test cases'} across{' '}
          {groupedByFile.size} {groupedByFile.size === 1 ? 'suite' : 'suites'}
        </p>
      </div>

      {/* Grouped test files */}
      {groupedByFile.size > 0 ? (
        <div className="flex flex-col gap-4">
          {Array.from(groupedByFile.entries()).map(([filePath, suiteTests]) => (
            <Card key={filePath} className="border-border/60 bg-card/30 overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/40 bg-card/60 px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCode className="size-4 shrink-0 text-amber-400" />
                  <CardTitle className="font-mono text-xs font-medium truncate" title={filePath}>
                    {filePath}
                  </CardTitle>
                </div>
                <Badge variant="outline" className="font-mono text-[10px] shrink-0">
                  {suiteTests.length} {suiteTests.length === 1 ? 'test' : 'tests'}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col divide-y divide-border/30 p-0">
                {suiteTests.map((test) => (
                  <div
                    key={test.id}
                    className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400 mt-0.5" />
                      <div className="flex flex-col gap-0.5 min-w-0">
                        <span className="text-xs font-medium text-foreground truncate">
                          {test.name}
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>tests function</span>
                          <span className="font-mono text-foreground/90 font-medium">
                            {test.target.label}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        variant="outline"
                        className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[10px] uppercase font-mono"
                      >
                        {test.framework}
                      </Badge>
                      <Link
                        href={`/dependencies?node=${encodeURIComponent(test.target.id)}`}
                        className={buttonVariants({
                          variant: 'ghost',
                          size: 'sm',
                          className: 'h-7 text-xs px-2 gap-1',
                        })}
                      >
                        View Target
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          <p>No tests matching &ldquo;{searchTerm}&rdquo;</p>
          <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')} className="h-7 text-xs">
            Clear filter
          </Button>
        </div>
      )}
    </div>
  );
}
