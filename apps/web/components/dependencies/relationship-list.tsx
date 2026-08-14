'use client';

import { useMemo, useState } from 'react';
import { Filter, Search, Workflow } from 'lucide-react';
import type { DependencyTarget } from '@tracegraph/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { CategoryErrorState } from '@/components/dependencies/category-error-state';
import { EmptyRelationshipState } from '@/components/dependencies/empty-relationship-state';
import { RelationshipItem } from '@/components/dependencies/relationship-item';

export interface RelationshipListProps {
  items: DependencyTarget[] | null;
  loading: boolean;
  error: string | null;
  direction: 'dependency' | 'dependent' | 'caller' | 'callee';
  currentLabel: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}

type SortOption = 'name-asc' | 'name-desc' | 'type' | 'relType';

export function RelationshipList({
  items,
  loading,
  error,
  direction,
  currentLabel,
  onRetry,
  emptyTitle = 'No relationships found',
  emptyDescription = 'No direct relationships of this type are currently modeled for this entity.',
}: RelationshipListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [sortBy, setSortBy] = useState<SortOption>('name-asc');

  // Distinct node types present in the data
  const availableTypes = useMemo(() => {
    if (!items) return [];
    const set = new Set(items.map((i) => i.type));
    return Array.from(set);
  }, [items]);

  // Filtered & sorted items
  const processedItems = useMemo(() => {
    if (!items) return [];

    let filtered = items;

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          item.relationshipType.toLowerCase().includes(q) ||
          (item.via && item.via.label.toLowerCase().includes(q)),
      );
    }

    // Type filter
    if (typeFilter !== 'ALL') {
      filtered = filtered.filter((item) => item.type === typeFilter);
    }

    // Sorting
    return [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'name-asc':
          return a.label.localeCompare(b.label);
        case 'name-desc':
          return b.label.localeCompare(a.label);
        case 'type':
          return a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
        case 'relType':
          return (
            a.relationshipType.localeCompare(b.relationshipType) ||
            a.label.localeCompare(b.label)
          );
        default:
          return 0;
      }
    });
  }, [items, searchTerm, typeFilter, sortBy]);

  if (loading) {
    return (
      <div className="flex flex-col gap-3 py-2" data-testid="relationship-skeleton">
        <div className="flex items-center justify-between gap-4">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-32" />
        </div>
        <div className="flex flex-col gap-3 pt-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <CategoryErrorState
        title="Failed to load relationships"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  if (!items || items.length === 0) {
    return (
      <EmptyRelationshipState
        title={emptyTitle}
        description={emptyDescription}
        icon={Workflow}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Controls: Search, Type filter, Sort */}
      <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter relationships..."
            aria-label="Filter relationships"
            className="h-9 w-full rounded-md border border-border/80 bg-background pl-8 pr-3 text-xs placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchTerm ? (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-xs text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Type filters */}
          {availableTypes.length > 1 ? (
            <div className="flex items-center rounded-md border border-border/60 bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setTypeFilter('ALL')}
                className={`rounded px-2 py-1 transition-colors ${
                  typeFilter === 'ALL'
                    ? 'bg-background font-medium text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({items.length})
              </button>
              {availableTypes.map((t) => {
                const count = items.filter((i) => i.type === t).length;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTypeFilter(t)}
                    className={`rounded px-2 py-1 transition-colors ${
                      typeFilter === t
                        ? 'bg-background font-medium text-foreground shadow-xs'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t} ({count})
                  </button>
                );
              })}
            </div>
          ) : null}

          {/* Sort selector */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            aria-label="Sort relationships"
            className="h-9 rounded-md border border-border/80 bg-background px-2.5 text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="name-asc">Sort: Name (A-Z)</option>
            <option value="name-desc">Sort: Name (Z-A)</option>
            <option value="type">Sort: Node Type</option>
            <option value="relType">Sort: Relationship Type</option>
          </select>
        </div>
      </div>

      {/* List */}
      {processedItems.length > 0 ? (
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>
              Showing {processedItems.length} of {items.length} relationships
            </span>
          </div>
          {processedItems.map((item) => (
            <RelationshipItem
              key={`${item.id}-${item.relationshipType}-${item.via?.id ?? ''}`}
              item={item}
              currentLabel={currentLabel}
              direction={direction}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
          <Filter className="size-4 text-muted-foreground/60" />
          <p>No relationships matching &ldquo;{searchTerm}&rdquo;</p>
          <Button variant="ghost" size="sm" onClick={() => setSearchTerm('')} className="h-7 text-xs">
            Clear filter
          </Button>
        </div>
      )}
    </div>
  );
}
