import { TriangleAlert } from 'lucide-react';
import { SignInAgainLink } from '@/components/auth/sign-in-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isAuthErrorMessage } from '@/lib/api-client';

interface SectionErrorProps {
  title: string;
  message: string;
  onRetry: () => void;
}

/**
 * Section-level error state. Safe, human message only — never a stack trace
 * or driver detail. Retry actually re-requests the failed resource. When the
 * failure is a dead session (the API guard's fixed 401 messages), a
 * "Sign in again" recovery action is shown instead of a retry that would
 * never succeed.
 */
export function SectionError({ title, message, onRetry }: SectionErrorProps) {
  const authError = isAuthErrorMessage(message);
  return (
    <Card>
      <CardContent className="flex flex-col items-start gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <TriangleAlert className="size-4" aria-hidden />
          {title}
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
        <div className="flex flex-wrap items-center gap-2">
          {authError ? (
            <SignInAgainLink />
          ) : (
            <Button variant="outline" size="sm" onClick={onRetry}>
              Retry
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
