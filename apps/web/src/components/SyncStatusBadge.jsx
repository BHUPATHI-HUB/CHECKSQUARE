import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';
import { useSyncStatus } from '@/hooks/useSyncStatus.js';

// Floating indicator shown only when there are offline operations waiting to
// sync (or storage is getting full). Tapping it forces a sync / retry. Hidden
// entirely when the queue is empty and storage is healthy, so it never adds
// noise when everything is up to date.
const SyncStatusBadge = () => {
  const { pending, failed, storage, syncNow, retryFailed } = useSyncStatus();

  const storageFull = storage?.ratio >= 0.85;
  if (!pending && !storageFull) return null;

  const hasFailed = failed > 0;

  return (
    <div className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2">
      {storageFull && (
        <div className="inline-flex items-center gap-2 rounded-full bg-[hsl(var(--warning))] text-black shadow-lg px-3 py-1.5 text-[11px] font-medium">
          <AlertTriangle className="w-3.5 h-3.5" />
          Device storage almost full — sync soon
        </div>
      )}
      {pending > 0 && (
        <button
          type="button"
          onClick={() => (hasFailed ? retryFailed() : syncNow())}
          title={hasFailed
            ? `${failed} item(s) failed to upload. Tap to retry now.`
            : 'Items saved on this device are waiting to upload. Tap to sync now.'}
          className={`inline-flex items-center gap-2 rounded-full shadow-lg px-4 py-2 text-xs font-medium transition hover:opacity-90 ${
            hasFailed ? 'bg-destructive text-white' : 'bg-foreground text-background'
          }`}
        >
          {hasFailed
            ? <AlertTriangle className="w-3.5 h-3.5" />
            : <RefreshCw className="w-3.5 h-3.5" />}
          {hasFailed
            ? `${failed} failed · retry`
            : `${pending} waiting to sync`}
        </button>
      )}
    </div>
  );
};

export default SyncStatusBadge;
