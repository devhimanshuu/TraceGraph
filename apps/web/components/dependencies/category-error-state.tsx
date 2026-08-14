import { AlertCircle, RotateCcw } from 'lucide-react';
import { SignInAgainLink } from '@/components/auth/sign-in-link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { isAuthErrorMessage } from '@/lib/api-client';

export function CategoryErrorState({
  title = 'Unable to load relationships',
  message,
  onRetry,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
}) {
  const authError = message ? isAuthErrorMessage(message) : false;
  return (
    <Card className="border-destructive/30 bg-destructive/5">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-8 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="size-5" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">{title}</h4>
            <p className="text-xs text-muted-foreground">
              {message ?? 'An unexpected error occurred while querying relationship data.'}
            </p>
          </div>
        </div>
        {authError ? (
          <SignInAgainLink />
        ) : onRetry ? (
          <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0 gap-1.5">
            <RotateCcw className="size-3.5" />
            Retry
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
