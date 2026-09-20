import React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function LoadingState({ label = 'Loading workspace', fullPage = false }) {
  return (
    <div className={`cs-loading ${fullPage ? 'cs-loading-page' : ''}`} role="status" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 text-sm font-medium text-muted-foreground">
        <Loader2 className="h-5 w-5 motion-safe:animate-spin" aria-hidden="true" />
        <span>{label}…</span>
      </div>
      <div className="cs-skeleton-lines" aria-hidden="true">
        <div /><div /><div />
      </div>
    </div>
  );
}

export function ErrorState({ title = 'Unable to load this page', message = 'Please try again. Your saved work is still available.', onRetry }) {
  return (
    <div className="cs-error-state" role="alert">
      <AlertCircle className="h-6 w-6 shrink-0 text-destructive" aria-hidden="true" />
      <div className="min-w-0 flex-1"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{message}</p></div>
      {onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}
    </div>
  );
}
