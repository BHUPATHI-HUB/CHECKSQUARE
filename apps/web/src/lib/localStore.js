// localStore — a tiny promise-based IndexedDB layer for offline-first capture.
//
// No external dependency (avoids a build/install step): a minimal wrapper over
// the native IndexedDB API. Three object stores:
//   • photos      — resized photo Blobs, keyed by their storage path
//                   ("<inspectionId>/<roomKey>/<photoId>.jpg"). Lets the UI
//                   render instantly and keeps images safe with no signal.
//   • outbox      — ordered queue of pending sync operations.
//   • inspections — inspections saved while offline (syncStatus = 'pending'),
//                   so they still appear in dashboards until they sync.
//
// Everything degrades gracefully: if IndexedDB is unavailable the helpers
// resolve to no-ops / nulls so the online flow is never blocked.

const DB_NAME = 'checksquare-offline';
const DB_VERSION = 2;
const STORES = { photos: 'photos', outbox: 'outbox', inspections: 'inspections', lists: 'lists' };

let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORES.photos)) {
        db.createObjectStore(STORES.photos, { keyPath: 'path' });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const s = db.createObjectStore(STORES.outbox, { keyPath: 'id', autoIncrement: true });
        s.createIndex('nextAttemptAt', 'nextAttemptAt');
      }
      if (!db.objectStoreNames.contains(STORES.inspections)) {
        db.createObjectStore(STORES.inspections, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.lists)) {
        db.createObjectStore(STORES.lists, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  let db;
  try { db = await openDB(); } catch { return undefined; }
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    let result;
    Promise.resolve(fn(store)).then((r) => { result = r; }).catch(reject);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

const reqToPromise = (req) => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});

export const isOfflineStoreAvailable = () => typeof indexedDB !== 'undefined';

// ─── photos ───────────────────────────────────────────────────────────────
export async function putPhotoBlob({ path, blob, contentType, inspectionId }) {
  try {
    await tx(STORES.photos, 'readwrite', (s) => s.put({
      path, blob, contentType: contentType || 'image/jpeg',
      inspectionId: inspectionId || null,
      syncStatus: 'pending', createdAt: Date.now(),
    }));
  } catch { /* non-fatal */ }
}

export async function getPhotoBlob(path) {
  try { return await tx(STORES.photos, 'readonly', (s) => reqToPromise(s.get(path))); }
  catch { return null; }
}

export async function markPhotoSynced(path) {
  try {
    await tx(STORES.photos, 'readwrite', async (s) => {
      const rec = await reqToPromise(s.get(path));
      if (rec) { rec.syncStatus = 'synced'; s.put(rec); }
    });
  } catch { /* non-fatal */ }
}

export async function deletePhotoBlob(path) {
  try { await tx(STORES.photos, 'readwrite', (s) => s.delete(path)); }
  catch { /* non-fatal */ }
}

// ─── outbox ─────────────────────────────────────────────────────────────
export async function enqueue(op) {
  try {
    return await tx(STORES.outbox, 'readwrite', (s) => reqToPromise(s.add({
      ...op, tries: 0, nextAttemptAt: Date.now(), createdAt: Date.now(),
    })));
  } catch { return null; }
}

export async function listOutbox() {
  try { return (await tx(STORES.outbox, 'readonly', (s) => reqToPromise(s.getAll()))) || []; }
  catch { return []; }
}

export async function updateOutbox(rec) {
  try { await tx(STORES.outbox, 'readwrite', (s) => s.put(rec)); }
  catch { /* non-fatal */ }
}

export async function deleteOutbox(id) {
  try { await tx(STORES.outbox, 'readwrite', (s) => s.delete(id)); }
  catch { /* non-fatal */ }
}

export async function outboxCount() {
  try { return (await tx(STORES.outbox, 'readonly', (s) => reqToPromise(s.count()))) || 0; }
  catch { return 0; }
}

// Aggregate queue stats: total pending + how many have already failed at least
// one attempt (so the UI can flag "waiting" vs "needs attention").
export async function outboxStats() {
  try {
    const all = await listOutbox();
    return { total: all.length, failed: all.filter((o) => (o.tries || 0) > 0).length };
  } catch { return { total: 0, failed: 0 }; }
}

// Clear the backoff timers so a manual "retry" attempts every op immediately.
export async function resetOutboxBackoff() {
  try {
    const all = await listOutbox();
    for (const o of all) { o.nextAttemptAt = Date.now(); await updateOutbox(o); }
  } catch { /* non-fatal */ }
}

// ─── storage durability ──────────────────────────────────────────────────
// Ask the browser to make our storage persistent so it is NOT evicted under
// pressure (critical when an inspector holds many un-synced photos offline).
export async function requestPersistentStorage() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
    if (navigator.storage.persisted && await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch { return false; }
}

// Current on-device storage usage (bytes) + quota, for a "storage getting full"
// warning before an inspector loses the ability to add more photos offline.
export async function getStorageEstimate() {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
      return { usage: 0, quota: 0, ratio: 0 };
    }
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return { usage, quota, ratio: quota ? usage / quota : 0 };
  } catch { return { usage: 0, quota: 0, ratio: 0 }; }
}

// ─── inspections (offline-saved) ─────────────────────────────────────────
export async function putPendingInspection(inspection) {
  try {
    await tx(STORES.inspections, 'readwrite', (s) => s.put({
      ...inspection, syncStatus: 'pending', updatedAt: Date.now(),
    }));
  } catch { /* non-fatal */ }
}

export async function getPendingInspection(id) {
  try { return await tx(STORES.inspections, 'readonly', (s) => reqToPromise(s.get(id))); }
  catch { return null; }
}

export async function listPendingInspections() {
  try {
    const all = (await tx(STORES.inspections, 'readonly', (s) => reqToPromise(s.getAll()))) || [];
    return all.filter((i) => i.syncStatus !== 'synced');
  } catch { return []; }
}

export async function deletePendingInspection(id) {
  try { await tx(STORES.inspections, 'readwrite', (s) => s.delete(id)); }
  catch { /* non-fatal */ }
}

// ─── cached lists (offline dashboard browsing) ───────────────────────────
// Snapshot the last successfully-fetched list so dashboards still render with
// no connectivity. Keyed by a caller-defined string (e.g. 'inspections:all').
export async function putCachedList(key, rows) {
  try { await tx(STORES.lists, 'readwrite', (s) => s.put({ key, rows: rows || [], at: Date.now() })); }
  catch { /* non-fatal */ }
}

export async function getCachedList(key) {
  try {
    const rec = await tx(STORES.lists, 'readonly', (s) => reqToPromise(s.get(key)));
    return rec?.rows || null;
  } catch { return null; }
}
