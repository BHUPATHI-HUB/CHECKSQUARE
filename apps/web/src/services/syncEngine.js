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
import data from '@/services/dataService.js';
import {
  listOutbox, updateOutbox, deleteOutbox,
  getPhotoBlob, markPhotoSynced,
  getPendingInspection, completePendingInspection, outboxStats,
  getPendingSettings, completePendingSettings,
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
  const { data: { session } } = await supabase.auth.getSession();
  const stats = await outboxStats(session?.user?.id);
  listeners.forEach((l) => { try { l(stats); } catch { /* ignore */ } });
};

let running = false;

async function handleOp(op) {
  if (op.type === 'uploadPhoto') {
    const rec = await getPhotoBlob(op.path);
    if (!rec?.blob) throw new Error('Queued photo is missing from device storage.');
    if (rec.syncStatus === 'synced') {
      return;
    }
    const { error } = await supabase.storage
      .from(SUPABASE_PHOTO_BUCKET)
      .upload(op.path, rec.blob, { contentType: rec.contentType || 'image/jpeg', upsert: true });
    if (error) throw error;
    await markPhotoSynced(op.path);
    // Keep the synced local blob so a reopened report still renders offline.
  } else if (op.type === 'upsertInspection') {
    const insp = await getPendingInspection(op.inspectionId || op.id);
    if (!insp) return;
    const saved = await data.upsertInspection(insp);
    await completePendingInspection(insp.id, insp.localRevision, saved.version);
  } else if (op.type === 'upsertSettings') {
    const pending = await getPendingSettings(op.ownerId);
    if (!pending) return;
    await data.upsertAppSettings(pending.payload);
    await completePendingSettings(op.ownerId, pending.localRevision);
  }
}

export async function drainOutbox() {
  if (running) return;
  if (!isSupabaseConfigured) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
  running = true;
  try {
    // Make sure the access token is fresh (it can expire while offline).
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user?.id) return;
    const activeUserId = session.user.id;

    const ops = (await listOutbox()).sort((a, b) => a.id - b.id);
    for (const op of ops) {
      // Auth may change while a previous network operation is in flight.
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (currentSession?.user?.id !== activeUserId) break;
      // Never send work from a shared device through another user's session.
      if (op.ownerId && op.ownerId !== activeUserId) continue;
      if (op.type === 'upsertSettings' && !op.ownerId) continue;
      if (op.type === 'uploadPhoto' && !op.ownerId) continue;
      if (op.type === 'upsertInspection') {
        // eslint-disable-next-line no-await-in-loop
        const pending = await getPendingInspection(op.inspectionId || op.id);
        if (pending && (pending.ownerId || pending.inspector) !== activeUserId) continue;
      }
      if (op.nextAttemptAt && op.nextAttemptAt > Date.now()) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        await handleOp(op);
        // eslint-disable-next-line no-await-in-loop
        await deleteOutbox(op.id);
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
export function requestSync() {
  // Refresh the badge even while offline; drainOutbox intentionally returns
  // early without emitting when there is no network.
  if (isSupabaseConfigured) notify().catch(() => {});
  if (scheduled) return;
  scheduled = setTimeout(() => { scheduled = null; drainOutbox(); }, 300);
}

// Force every queued op to retry now (clears backoff), e.g. from a "Retry" tap.
export async function retryFailed() {
  await resetOutboxBackoff();
  drainOutbox();
}

let started = false;
export function startSyncEngine() {
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
  setInterval(() => { if (navigator.onLine !== false) drainOutbox(); }, 30000);
  // Kick once on start.
  requestSync();
}
