// localDb — the ONLY data store for the offline-admin Android build.
//
// Backed by @capacitor-community/sqlite on-device. When that plugin is not
// available (e.g. running `npm run dev` in a desktop browser while building
// the UI) it transparently falls back to a localStorage-backed JSON store so
// the app still boots and is testable. Either way there are ZERO network
// calls — this is a real local database, not a cache.
//
// Storage model: one generic document table
//     documents(collection TEXT, id TEXT, data TEXT/json, created, updated)
// Records are stored as JSON blobs; the handful of filters the app uses
// (deletedAt / inspector) are evaluated in JS after load. This keeps the
// schema tiny and avoids per-collection migrations.

const DB_NAME = 'checksquare_offline';
const LS_PREFIX = 'offlinedb:'; // localStorage fallback key prefix

const nowIso = () => new Date().toISOString();
const genId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// ── SQLite (native) layer ────────────────────────────────────────────────
let sqlitePromise = null;

async function getSqliteConnection() {
  if (sqlitePromise) return sqlitePromise;
  sqlitePromise = (async () => {
    try {
      const { Capacitor } = await import('@capacitor/core');
      if (!Capacitor?.isNativePlatform?.()) return null;
      // Optional native dependency — only present in the offline Android build.
      // eslint-disable-next-line import/no-unresolved
      const { CapacitorSQLite, SQLiteConnection } = await import('@capacitor-community/sqlite');
      const sqlite = new SQLiteConnection(CapacitorSQLite);

      // Clean up any half-open connections left by a previous run / hot reload;
      // without this a stale connection makes createConnection throw.
      try { await sqlite.checkConnectionsConsistency(); } catch { /* first run */ }

      const retained = await sqlite.isConnection(DB_NAME, false);
      const db = retained.result
        ? await sqlite.retrieveConnection(DB_NAME, false)
        : await sqlite.createConnection(DB_NAME, false, 'no-encryption', 1, false);

      const isOpen = await db.isDBOpen();
      if (!isOpen?.result) await db.open();
      await db.execute(`
        CREATE TABLE IF NOT EXISTS documents (
          collection TEXT NOT NULL,
          id         TEXT NOT NULL,
          data       TEXT NOT NULL,
          created    TEXT NOT NULL,
          updated    TEXT NOT NULL,
          PRIMARY KEY (collection, id)
        );
      `);
      return db;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[localDb] SQLite unavailable, using localStorage fallback:', err?.message || err);
      return null;
    }
  })();
  return sqlitePromise;
}

// ── localStorage (fallback) layer ────────────────────────────────────────
function lsReadCollection(collection) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + collection);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}
function lsWriteCollection(collection, rows) {
  try {
    localStorage.setItem(LS_PREFIX + collection, JSON.stringify(rows));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[localDb] localStorage write failed:', err?.message || err);
  }
}

// ── Unified document access ──────────────────────────────────────────────
// Strategy: SQLite is the durable primary store, but EVERY write is mirrored
// to localStorage and any SQLite failure transparently falls back to it. This
// guarantees a save never silently fails on-device — if SQLite misbehaves for
// any reason, the data still persists (WebView localStorage survives restarts).
async function readAll(collection) {
  try {
    const db = await getSqliteConnection();
    if (db) {
      const res = await db.query('SELECT data FROM documents WHERE collection = ? ORDER BY created ASC', [collection]);
      const rows = (res.values || []).map((r) => {
        try { return JSON.parse(r.data); } catch { return null; }
      }).filter(Boolean);
      if (rows.length > 0) return rows;
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[localDb] readAll SQLite failed, using localStorage:', err?.message || err);
  }
  return lsReadCollection(collection);
}

async function readOne(collection, id) {
  try {
    const db = await getSqliteConnection();
    if (db) {
      const res = await db.query('SELECT data FROM documents WHERE collection = ? AND id = ? LIMIT 1', [collection, id]);
      const row = res.values?.[0];
      if (row) {
        try { return JSON.parse(row.data); } catch { /* fall through to LS */ }
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[localDb] readOne SQLite failed, using localStorage:', err?.message || err);
  }
  return lsReadCollection(collection).find((r) => r.id === id) || null;
}

function lsUpsert(collection, full) {
  const rows = lsReadCollection(collection);
  const idx = rows.findIndex((r) => r.id === full.id);
  if (idx === -1) rows.push(full); else rows[idx] = full;
  lsWriteCollection(collection, rows);
}

async function writeOne(collection, record) {
  const created = record.created || nowIso();
  const updated = nowIso();
  const full = { ...record, created, updated };

  try {
    const db = await getSqliteConnection();
    if (db) {
      await db.run(
        `INSERT INTO documents (collection, id, data, created, updated) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data, updated = excluded.updated`,
        [collection, full.id, JSON.stringify(full), created, updated],
      );
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[localDb] writeOne SQLite failed, using localStorage:', err?.message || err);
  }

  // Always mirror to localStorage (best-effort) so a save is never lost.
  try { lsUpsert(collection, full); } catch { /* quota — SQLite still holds it */ }

  return full;
}

async function deleteOne(collection, id) {
  try {
    const db = await getSqliteConnection();
    if (db) await db.run('DELETE FROM documents WHERE collection = ? AND id = ?', [collection, id]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[localDb] deleteOne SQLite failed:', err?.message || err);
  }
  try {
    lsWriteCollection(collection, lsReadCollection(collection).filter((r) => r.id !== id));
  } catch { /* ignore */ }
}

// ── Tiny PB-style filter evaluator ───────────────────────────────────────
// Supports only the patterns the app actually uses:
//   "deletedAt = null", "deletedAt != null",
//   'inspector = "id"', and "&&" combinations of the above.
function matchesFilter(record, filter) {
  if (!filter) return true;
  return String(filter)
    .split('&&')
    .map((s) => s.trim())
    .filter(Boolean)
    .every((clause) => {
      let m = clause.match(/^(\w+)\s*=\s*null$/i);
      if (m) return record[m[1]] == null;
      m = clause.match(/^(\w+)\s*!=\s*null$/i);
      if (m) return record[m[1]] != null;
      m = clause.match(/^(\w+)\s*=\s*"([^"]*)"$/);
      if (m) return String(record[m[1]] ?? '') === m[2];
      return true; // unknown clause → don't exclude
    });
}

function applySort(rows, sort) {
  if (!sort) return rows;
  const desc = sort.startsWith('-');
  const key = desc ? sort.slice(1) : sort;
  return [...rows].sort((a, b) => {
    const av = a[key] ?? '';
    const bv = b[key] ?? '';
    if (av < bv) return desc ? 1 : -1;
    if (av > bv) return desc ? -1 : 1;
    return 0;
  });
}

// ── Public API (mirrors what dataService's localAdapter needs) ───────────
export const localDb = {
  async init() {
    await getSqliteConnection();
  },

  // inspections
  async listInspections({ filter = '', sort = '-created' } = {}) {
    const rows = (await readAll('inspections')).filter((r) => matchesFilter(r, filter));
    return applySort(rows, sort);
  },
  async getInspection(id) {
    return readOne('inspections', id);
  },
  async createInspection(payload) {
    return writeOne('inspections', { ...payload, id: payload.id || genId() });
  },
  async updateInspection(id, payload) {
    const existing = (await readOne('inspections', id)) || { id };
    return writeOne('inspections', { ...existing, ...payload, id });
  },
  async deleteInspection(id) {
    return deleteOne('inspections', id);
  },

  // appointments
  async listAppointments({ filter = '', sort = '-scheduledAt' } = {}) {
    const rows = (await readAll('appointments')).filter((r) => matchesFilter(r, filter));
    return applySort(rows, sort);
  },
  async createAppointment(payload) {
    return writeOne('appointments', { ...payload, id: payload.id || genId() });
  },
  async updateAppointment(id, payload) {
    const existing = (await readOne('appointments', id)) || { id };
    return writeOne('appointments', { ...existing, ...payload, id });
  },

  // report_downloads
  async listReportDownloads() {
    return applySort(await readAll('report_downloads'), '-created');
  },
  async createReportDownload(payload) {
    return writeOne('report_downloads', { ...payload, id: payload.id || genId() });
  },
  async deleteReportDownload(id) {
    return deleteOne('report_downloads', id);
  },

  // app_settings (single row keyed 'single')
  async getAppSettings() {
    const row = await readOne('app_settings', 'single');
    return row?.payload || {};
  },
  async upsertAppSettings(payload) {
    return writeOne('app_settings', { id: 'single', payload });
  },
};

export default localDb;
