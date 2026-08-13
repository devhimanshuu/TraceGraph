import { TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface SectionErrorProps {
  title: string;
  message: string;
  onRetry: () => void;
}

/**
 * Section-level error state. Safe, human message only — never a stack trace
 * or driver detail. Retry actually re-requests the failed resource.
 */
export function SectionError({ title, message, onRetry }: SectionErrorProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-red-400">
          <TriangleAlert className="size-4" aria-hidden />
          {title}
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </CardContent>
    </Card>
  );
}
