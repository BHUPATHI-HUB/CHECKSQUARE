import React from 'react';
import { RefreshCw } from 'lucide-react';
import { useSyncStatus } from '@/hooks/useSyncStatus.js';

// Floating indicator shown only when there are offline operations waiting to
// sync. Tapping it forces a sync attempt. Hidden entirely when the queue is
// empty, so it never adds noise when everything is up to date.
const SyncStatusBadge = () => {
  const { pending, syncNow } = useSyncStatus();
  if (!pending) return null;
  return (
    <button
      type="button"
      onClick={() => syncNow()}
      title="Items saved on this device are waiting to upload. Tap to sync now."
      className="fixed bottom-4 right-4 z-[60] inline-flex items-center gap-2 rounded-full bg-foreground text-background shadow-lg px-4 py-2 text-xs font-medium hover:opacity-90 transition"
    >
      <RefreshCw className="w-3.5 h-3.5" />
      {pending} waiting to sync
    </button>
  );
};

export default SyncStatusBadge;
