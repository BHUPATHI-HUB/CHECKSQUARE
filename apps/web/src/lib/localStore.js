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
const DB_VERSION = 1;
const STORES = { photos: 'photos', outbox: 'outbox', inspections: 'inspections' };

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
