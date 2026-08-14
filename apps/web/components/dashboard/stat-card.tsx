import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: number;
  description?: string;
  icon?: LucideIcon;
  /** Optional target — makes the whole card a link. */
  href?: string;
  /** Icon tile accent classes (default: primary tint). */
  accent?: string;
}

/** Generic statistics card — not coupled to any API response shape. */
export function StatCard({
  label,
  value,
  description,
  icon: Icon,
  href,
  accent = 'bg-primary/10 text-primary',
}: StatCardProps) {
  const body = (
    <Card className="h-full transition-shadow hover:shadow-[0_10px_28px_-16px_rgba(2,6,23,0.28)]">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-2xl font-semibold tabular-nums leading-none">{value.toLocaleString()}</p>
          {Icon ? (
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-lg',
                accent,
              )}
            >
              <Icon className="size-4" />
            </span>
          ) : null}
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">{label}</p>
          {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
        </div>
      </CardContent>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {body}
      </Link>
    );
  }
  return body;
}
