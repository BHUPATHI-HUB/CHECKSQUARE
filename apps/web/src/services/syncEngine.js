// syncEngine — drains the offline outbox to Supabase when connectivity allows.
//
// Ops (see localStore.enqueue):
//   • uploadPhoto     { path, contentType }  → upload the locally-stored Blob
//   • upsertInspection{ id }                 → push the locally-saved inspection
//
// Triggered on: app start, `online` event, a periodic timer, and manual
// requestSync(). Retries with capped exponential backoff. Never throws to the
// caller — failures stay queued and are retried later, so data is never lost.

import { supabase, isSupabaseConfigured, SUPABASE_PHOTO_BUCKET } from '@/lib/supabaseClient.js';
import { cloudData } from '@/services/dataService.js';
import { IS_OFFLINE_ADMIN } from '@/lib/appTarget.js';
import {
  listOutbox, updateOutbox, deleteOutbox,
  getPhotoBlob, markPhotoSynced, deletePhotoBlob,
  getPendingInspection, deletePendingInspection, outboxStats,
  resetOutboxBackoff, requestPersistentStorage,
} from '@/lib/localStore.js';

export const isNetworkError = (e) => {
  if (!e) return false;
  if (e.__offline) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const msg = String(e.message || e).toLowerCase();
  return /failed to fetch|network|networkerror|fetch failed|load failed|timeout/.test(msg);
};

const listeners = new Set();
export const onSyncChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const notify = async () => {
  const stats = await outboxStats();
  listeners.forEach((l) => { try { l(stats); } catch { /* ignore */ } });
};

let running = false;

const getSyncPolicy = () => {
  try {
    const settings = JSON.parse(localStorage.getItem('app-settings') || '{}');
    return { mode: 'on-submit', photoBatchSize: 4, ...(settings.syncPolicy || {}) };
  } catch {
    return { mode: 'on-submit', photoBatchSize: 4 };
  }
};

const automaticSyncAllowed = () => {
  const policy = getSyncPolicy();
  if (policy.mode === 'manual') return false;
  if (policy.mode === 'wifi-only') {
    const connection = typeof navigator !== 'undefined' ? navigator.connection : null;
    // Desktop browsers and Android WebViews may not expose Network
    // Information. In that case, do not block a connected user.
    if (connection?.saveData || ['slow-2g', '2g', '3g'].includes(connection?.effectiveType)) return false;
  }
  return true;
};

async function handleOp(op) {
  if (op.type === 'uploadPhoto') {
    if (!isSupabaseConfigured) throw new Error('Photo storage is not configured.');
    const rec = await getPhotoBlob(op.path);
    if (!rec?.blob) return; // already cleaned up / nothing to send
    const { error } = await supabase.storage
      .from(SUPABASE_PHOTO_BUCKET)
      .upload(op.path, rec.blob, { contentType: rec.contentType || 'image/jpeg', upsert: true });
    if (error) throw error;
    await markPhotoSynced(op.path);
    await deletePhotoBlob(op.path); // signed URLs serve it from now on
  } else if (op.type === 'upsertInspection') {
    const inspectionId = op.inspectionId || op.id;
    const insp = await getPendingInspection(inspectionId);
    if (!insp) return;
    await cloudData.upsertInspection(insp);
    await deletePendingInspection(inspectionId);
  } else if (op.type === 'inspectionStatus') {
    await cloudData.transitionInspectionStatus(op.inspectionId, op.payload || {});
  }
}

export async function drainOutbox() {
  // The single-user offline build has no cloud counterpart. Hybrid APKs do:
  // their local SQLite capture is drained through cloudData when online.
  if (IS_OFFLINE_ADMIN) return;
  if (running) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  running = true;
  try {
    // Make sure the access token is fresh (it can expire while offline).
    try { if (isSupabaseConfigured) await supabase.auth.getSession(); } catch { /* ignore */ }

    const ops = (await listOutbox()).sort((a, b) => a.id - b.id);
    const photoBatchSize = Math.max(1, Number(getSyncPolicy().photoBatchSize) || 4);
    let photosHandled = 0;
    for (const op of ops) {
      if (op.nextAttemptAt && op.nextAttemptAt > Date.now()) continue;
      if (op.type === 'uploadPhoto' && photosHandled >= photoBatchSize) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await handleOp(op);
        // eslint-disable-next-line no-await-in-loop
        await deleteOutbox(op.id);
        if (op.type === 'uploadPhoto') photosHandled += 1;
      } catch (e) {
        op.tries = (op.tries || 0) + 1;
        op.nextAttemptAt = Date.now() + Math.min(5 * 60 * 1000, 1000 * 2 ** op.tries);
        op.lastError = String(e?.message || e);
        // eslint-disable-next-line no-await-in-loop
        await updateOutbox(op);
        if (isNetworkError(e)) break; // stop hammering a dead connection
      }
    }
  } finally {
    running = false;
    await notify();
  }
}

// Debounced public trigger.
let scheduled = null;
export function requestSync({ force = false } = {}) {
  if (IS_OFFLINE_ADMIN) return;
  if (!force && !automaticSyncAllowed()) return;
  if (scheduled) return;
  scheduled = setTimeout(() => { scheduled = null; drainOutbox(); }, 300);
}

// Force every queued op to retry now (clears backoff), e.g. from a "Retry" tap.
export async function retryFailed() {
  if (IS_OFFLINE_ADMIN) return;
  await resetOutboxBackoff();
  requestSync({ force: true });
}

let started = false;
export function startSyncEngine() {
  if (IS_OFFLINE_ADMIN) return;
  if (started || typeof window === 'undefined') return;
  started = true;
  // Ask for durable storage so queued photos aren't evicted under pressure.
  requestPersistentStorage();
  window.addEventListener('online', () => requestSync());
  // Flush whenever the app returns to the foreground (covers the "reopened
  // after being backgrounded / closed" case without a service-worker sync).
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') requestSync();
    });
  }
  // Periodic safety-net flush.
  setInterval(() => { if (navigator.onLine !== false) requestSync(); }, 30000);
  // Kick once on start.
  requestSync();
}
