import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export function EmptyRelationshipState({
  title,
  description,
  icon: Icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <Card className="border-dashed border-border/80 bg-card/20">
      <CardContent className="flex flex-col items-center justify-center gap-2.5 py-12 text-center">
        <div className="flex size-10 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          <Icon className="size-5" />
        </div>
        <h4 className="text-sm font-medium">{title}</h4>
        <p className="max-w-md text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}
