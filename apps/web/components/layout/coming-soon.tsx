import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
  eta: string;
}

/**
 * Honest placeholder for modules that ship in later phases — no fake data,
 * just a clear statement of what's coming and a way back to the dashboard.
 */
export function ComingSoon({ title, description, icon: Icon, eta }: ComingSoonProps) {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-1">
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
          TraceGraph
        </p>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>

      <Card className="max-w-2xl">
        <CardContent className="flex flex-col items-start gap-4">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="size-5" />
          </span>
          <div className="flex flex-col gap-1.5">
            <p className="flex items-center gap-2 text-sm font-medium">
              {title}
              <Badge variant="outline" className="text-xs">
                {eta}
              </Badge>
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Link
            href="/dashboard"
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <ArrowLeft className="size-3.5" />
            Back to overview
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
