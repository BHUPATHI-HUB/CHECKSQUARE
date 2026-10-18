import { useAuth } from '@/contexts/AuthContext.jsx';
import { useState, useEffect } from 'react';
import { outboxStats, getStorageEstimate } from '@/lib/localStore.js';
import { onSyncChange, requestSync, retryFailed } from '@/services/syncEngine.js';

// Exposes offline sync state for UI:
//   • pending  — total queued operations
//   • failed   — queued ops that already failed at least once
//   • storage  — { usage, quota, ratio } on-device storage pressure
//   • syncNow / retryFailed — manual triggers
export function useSyncStatus() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ total: 0, failed: 0 });
  const [storage, setStorage] = useState({ usage: 0, quota: 0, ratio: 0 });

  useEffect(() => {
    let mounted = true;
    const refreshStorage = () => getStorageEstimate().then((s) => { if (mounted) setStorage(s); });
    outboxStats(user?.id).then((s) => { if (mounted) setStats(s); }).catch(() => {});
    refreshStorage();
    const off = onSyncChange((s) => {
      if (!mounted) return;
      outboxStats(user?.id).then((next) => { if (mounted) setStats(next); });
      refreshStorage();
    });
    return () => { mounted = false; off(); };
  }, [user?.id]);

  return {
    pending: stats.total,
    failed: stats.failed,
    storage,
    syncNow: requestSync,
    retryFailed,
  };
}

export default useSyncStatus;
