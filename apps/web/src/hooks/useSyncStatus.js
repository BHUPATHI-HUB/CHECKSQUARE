import { useState, useEffect } from 'react';
import { outboxCount } from '@/lib/localStore.js';
import { onSyncChange, requestSync } from '@/services/syncEngine.js';

// Exposes the number of pending (not-yet-synced) offline operations plus a
// manual trigger, so UI can show a "waiting to sync" indicator.
export function useSyncStatus() {
  const [pending, setPending] = useState(0);
  useEffect(() => {
    let mounted = true;
    outboxCount().then((c) => { if (mounted) setPending(c); }).catch(() => {});
    const off = onSyncChange((c) => { if (mounted) setPending(c); });
    return () => { mounted = false; off(); };
  }, []);
  return { pending, syncNow: requestSync };
}

export default useSyncStatus;
