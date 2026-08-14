'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Dialog } from '@base-ui/react/dialog';
import { Loader2, Search, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSearch } from '@/hooks/use-search';
import {
  getNodeTypeColor,
  NodeTypeBadge,
  NodeTypeIcon,
} from '@/components/dependencies/relationship-badge';

const FEATURED_ENTITIES = [
  {
    id: 'class:apps/api/services/payment.service.ts:PaymentService',
    label: 'PaymentService',
    type: 'Class',
    description: 'Payment orchestration & Stripe integration',
  },
  {
    id: 'class:apps/api/services/checkout.service.ts:CheckoutService',
    label: 'CheckoutService',
    type: 'Class',
    description: 'Checkout workflow & validation',
  },
  {
    id: 'class:apps/api/services/order.service.ts:OrderService',
    label: 'OrderService',
    type: 'Class',
    description: 'Order lifecycle & persistence',
  },
  {
    id: 'fn:apps/api/services/payment.service.ts:processPayment',
    label: 'processPayment',
    type: 'Function',
    description: 'PaymentService.processPayment() method',
  },
  {
    id: 'class:packages/database/database.service.ts:DatabaseService',
    label: 'DatabaseService',
    type: 'Class',
    description: 'CognoDB / database queries',
  },
  {
    id: 'class:lib/stripe.client.ts:StripeClient',
    label: 'StripeClient',
    type: 'Class',
    description: 'Stripe payment gateway client',
  },
  {
    id: 'file:apps/api/services/payment.service.ts',
    label: 'payment.service.ts',
    type: 'File',
    description: 'Payment service source file',
  },
] as const;

export function EntitySearchDialog({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When provided, selection is handed back instead of navigating to /dependencies. */
  onSelect?: (id: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const { results, loading } = useSearch(query);

  const handleSelect = (id: string) => {
    onOpenChange(false);
    setQuery('');
    if (onSelect) {
      onSelect(id);
      return;
    }
    router.push(`/dependencies?node=${encodeURIComponent(id)}`);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs animate-in fade-in" />
        <Dialog.Popup className="fixed left-1/2 top-[20%] z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border border-border/80 bg-card p-0 shadow-2xl outline-none animate-in zoom-in-95 duration-150">
          {/* Header search input */}
          <div className="flex items-center border-b border-border/60 px-4 py-3">
            <Search className="size-4 text-muted-foreground mr-2.5" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search functions, classes, files, services..."
              autoFocus
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground mr-2" /> : null}
            <Dialog.Close
              render={
                <Button variant="ghost" size="icon" className="size-7 rounded-md">
                  <X className="size-4" />
                </Button>
              }
            />
          </div>

          {/* Results / Quick Picks */}
          <div className="max-h-80 overflow-y-auto p-3">
            {query.trim() ? (
              results.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <p className="px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Search Results ({results.length})
                  </p>
                  {results.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSelect(item.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60 focus:bg-muted/60 outline-none"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${getNodeTypeColor(item.type)}`}
                        >
                          <NodeTypeIcon type={item.type} className="size-3.5" />
                        </span>
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate">{item.label}</span>
                          <span className="font-mono text-[10px] text-muted-foreground truncate">
                            {item.id}
                          </span>
                        </div>
                      </div>
                      <NodeTypeBadge type={item.type} />
                    </button>
                  ))}
                </div>
              ) : !loading ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No codebase symbols matching &ldquo;{query}&rdquo;
                </div>
              ) : null
            ) : (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1.5 px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="size-3 text-primary" />
                  <span>Featured Codebase Entities</span>
                </div>
                {FEATURED_ENTITIES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-xs transition-colors hover:bg-muted/60 focus:bg-muted/60 outline-none"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`flex size-7 shrink-0 items-center justify-center rounded-md border ${getNodeTypeColor(item.type)}`}
                      >
                        <NodeTypeIcon type={item.type} className="size-3.5" />
                      </span>
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium text-foreground truncate">{item.label}</span>
                        <span className="text-[11px] text-muted-foreground truncate">
                          {item.description}
                        </span>
                      </div>
                    </div>
                    <NodeTypeBadge type={item.type} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
