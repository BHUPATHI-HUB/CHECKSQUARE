// dataService — single entry point for every CRUD / realtime operation in
// the React app.  Encapsulates the "PocketBase OR Supabase" decision so
// individual pages do NOT import either client directly.
//
// Toggle: set VITE_USE_SUPABASE_DB=true to route reads/writes through
// Supabase Postgres.  Default (false) keeps PocketBase.  This lets us cut
// over one collection at a time during Phase 3 without touching the UI.
//
// Each adapter exposes the SAME function signatures.  The PocketBase
// adapter is the production default; the Supabase adapter exists so a
// single env-var flip switches the whole app over after the data
// migration has been run.

import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';
import { IS_OFFLINE_ADMIN, IS_HYBRID_APK, OFFLINE_ADMIN_USER } from '@/lib/appTarget.js';
import localDb from '@/lib/localDb.js';

const USE_SUPABASE = isSupabaseConfigured
  && (import.meta.env?.VITE_USE_SUPABASE_DB === 'true');

let pbClientPromise = null;
const getPB = async () => {
  if (!pbClientPromise) {
    pbClientPromise = import('@/lib/pocketbaseClient.js').then((m) => m.default);
  }
  return pbClientPromise;
};

// ─── Adapter: PocketBase ─────────────────────────────────────────────────
const pbAdapter = {
  // ─── inspections ─────────────────────────────────────────────────────
  async listInspections({ filter = '', sort = '-created', expand } = {}) {
    const pb = await getPB();
    return pb.collection('inspections').getFullList({
      filter, sort, expand, $autoCancel: false,
    });
  },
  async getInspection(id) {
    const pb = await getPB();
    return pb.collection('inspections').getOne(id, { $autoCancel: false });
  },
  async createInspection(payload) {
    const pb = await getPB();
    return pb.collection('inspections').create(payload, { $autoCancel: false });
  },
  async upsertInspection(payload) {
    const pb = await getPB();
    if (payload.id) {
      try {
        return await pb.collection('inspections').update(payload.id, payload, { $autoCancel: false });
      } catch (_) { /* not found → create below */ }
    }
    return pb.collection('inspections').create(payload, { $autoCancel: false });
  },
  async updateInspection(id, payload) {
    const pb = await getPB();
    return pb.collection('inspections').update(id, payload, { $autoCancel: false });
  },
  async deleteInspection(id) {
    const pb = await getPB();
    return pb.collection('inspections').delete(id, { $autoCancel: false });
  },

  // ─── appointments ────────────────────────────────────────────────────
  async listAppointments({ filter = '', sort = '-scheduledAt' } = {}) {
    const pb = await getPB();
    return pb.collection('appointments').getFullList({ filter, sort, $autoCancel: false });
  },
  async createAppointment(payload) {
    const pb = await getPB();
    return pb.collection('appointments').create(payload, { $autoCancel: false });
  },
  async updateAppointment(id, payload) {
    const pb = await getPB();
    return pb.collection('appointments').update(id, payload, { $autoCancel: false });
  },

  // ─── users ───────────────────────────────────────────────────────────
  async listUsers({ filter = '', sort = 'name', fields } = {}) {
    const pb = await getPB();
    return pb.collection('users').getFullList({ filter, sort, fields, $autoCancel: false });
  },
  async listUsersByRole(role) {
    const pb = await getPB();
    return pb.collection('users').getFullList({
      filter: `role = "${role}"`, sort: 'name', $autoCancel: false,
    });
  },
  async getUser(id) {
    const pb = await getPB();
    return pb.collection('users').getOne(id, { $autoCancel: false });
  },
  async createUser(payload) {
    const pb = await getPB();
    return pb.collection('users').create(payload, { $autoCancel: false });
  },
  async updateUser(id, payload) {
    const pb = await getPB();
    return pb.collection('users').update(id, payload, { $autoCancel: false });
  },
  async deleteUser(id) {
    const pb = await getPB();
    return pb.collection('users').delete(id);
  },
  async findUserByEmail(email) {
    const pb = await getPB();
    return pb.collection('users').getFirstListItem(`email = "${email}"`, { $autoCancel: false });
  },

  // ─── chats / messages ────────────────────────────────────────────────
  async listChats(userId) {
    const pb = await getPB();
    return pb.collection('chats').getFullList({
      filter: `participants ~ "${userId}"`,
      expand: 'participants',
      sort: '-updated',
      $autoCancel: false,
    });
  },
  async findChat(filter) {
    const pb = await getPB();
    return pb.collection('chats').getFirstListItem(filter, { $autoCancel: false });
  },
  async createChat(payload) {
    const pb = await getPB();
    return pb.collection('chats').create(payload, { $autoCancel: false });
  },
  async deleteChat(id) {
    const pb = await getPB();
    return pb.collection('chats').delete(id, { $autoCancel: false });
  },
  async listMessages(chatId) {
    const pb = await getPB();
    return pb.collection('messages').getFullList({
      filter: `chatId = "${chatId}"`, sort: 'created', $autoCancel: false,
    });
  },
  async sendMessage(payload) {
    const pb = await getPB();
    return pb.collection('messages').create(payload, { $autoCancel: false });
  },
  async updateMessage(id, payload) {
    const pb = await getPB();
    return pb.collection('messages').update(id, payload, { $autoCancel: false });
  },
  async deleteMessage(id) {
    const pb = await getPB();
    return pb.collection('messages').delete(id, { $autoCancel: false });
  },

  // ─── report_downloads ────────────────────────────────────────────────
  async listReportDownloads(userId) {
    const pb = await getPB();
    return pb.collection('report_downloads').getFullList({
      filter: `user = "${userId}"`, sort: '-created', $autoCancel: false,
    });
  },
  getReportDownloadFileUrl: async (rec) => {
    const pb = await getPB();
    const token = await pb.files.getToken();
    return pb.files.getUrl(rec, rec.file, { token });
  },
  async deleteReportDownload(id) {
    const pb = await getPB();
    return pb.collection('report_downloads').delete(id);
  },

  // ─── app_settings ────────────────────────────────────────────────────
  async getAppSettings() {
    try {
      const pb = await getPB();
      const row = await pb.collection('app_settings').getOne('single', { $autoCancel: false });
      return row?.payload || {};
    } catch (e) {
      if (String(e?.status) === '404') return {};
      throw e;
    }
  },
  async upsertAppSettings(payload) {
    try {
      const pb = await getPB();
      await pb.collection('app_settings').update('single', { payload }, { $autoCancel: false });
    } catch (e) {
      if (String(e?.status) === '404') {
        const pb = await getPB();
        await pb.collection('app_settings').create({ id: 'single', payload }, { $autoCancel: false });
      } else throw e;
    }
  },

  // ─── realtime ────────────────────────────────────────────────────────
  // Returns an unsubscribe function.
  subscribe(collection, callback, topic = '*') {
    let active = true;
    let unsub = () => {};
    getPB()
      .then((pb) => pb.collection(collection).subscribe(topic, callback))
      .then((u) => {
        if (!active) {
          try { u(); } catch (_) {}
          return;
        }
        unsub = u;
      })
      .catch((err) => console.error(`[dataService] subscribe failed for ${collection}:`, err));
    return () => {
      active = false;
      try { unsub(); } catch (_) {}
    };
  },
};

// ─── Adapter: Supabase ───────────────────────────────────────────────────
// The Supabase adapter mirrors the PB API.  Translates PB-style filter
// strings into PostgREST query-builder calls in the common cases used by
// the React app.  More complex filters can be added on demand.

// Lightweight column set for LIST views. Deliberately excludes the heavy
// JSON columns — `room_inspections` alone averages ~900 kB (and can exceed
// 7 MB) per row because it embeds photo data, so `select('*')` made every
// dashboard load pull megabytes it never renders. The full record is fetched
// on demand by getInspection() when a row is opened / downloaded.
const INSPECTION_LIST_COLUMNS = [
  'id', 'inspector_id', 'inspector_name', 'customer_id', 'status',
  'property_type', 'metadata', 'score', 'score_breakdown', 'include_score',
  'property_metrics', 'approved_by', 'approved_at', 'rejected_by',
  'rejected_at', 'rejection_reason', 'deleted_at', 'deleted_by',
  'deletion_reason', 'created_at', 'updated_at',
].join(',');

async function invokeAdminUsersFunction(payload) {
  const { data, error } = await supabase.functions.invoke('admin-users', {
    body: payload,
  });
  if (error) throw new Error(error.message || 'Admin user function call failed.');
  if (!data?.success) throw new Error(data?.error || 'Admin user operation failed.');
  return data;
}

const supaAdapter = {
  // ─── inspections ─────────────────────────────────────────────────────
  async listInspections({ filter = '', sort = '-created' } = {}) {
    let q = supabase.from('inspections').select(INSPECTION_LIST_COLUMNS);
    q = applyPbFilter(q, filter);
    q = applyPbSort(q, sort, 'created_at');
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map(rowToInspection);
  },
  async getInspection(id) {
    const { data, error } = await supabase.from('inspections').select('*').eq('id', id).single();
    if (error) throw error;
    return rowToInspection(data);
  },
  async createInspection(payload) {
    const { data, error } = await supabase.from('inspections').insert(inspectionToRow(payload)).select().single();
    if (error) throw error;
    return rowToInspection(data);
  },
  async upsertInspection(payload) {
    const row = inspectionToRow(payload);
    if (payload.id) row.id = payload.id;
    const { data, error } = await supabase.from('inspections').upsert(row, { onConflict: 'id' }).select().single();
    if (error) throw error;
    return rowToInspection(data);
  },
  async updateInspection(id, payload) {
    const { data, error } = await supabase.from('inspections').update(inspectionToRow(payload)).eq('id', id).select().single();
    if (error) throw error;
    return rowToInspection(data);
  },
  async deleteInspection(id) {
    const { error } = await supabase.from('inspections').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── appointments ────────────────────────────────────────────────────
  async listAppointments({ filter = '', sort = '-scheduledAt' } = {}) {
    let q = supabase.from('appointments').select('*');
    q = applyPbFilter(q, filter);
    q = applyPbSort(q, sort, 'scheduled_at');
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async createAppointment(payload) {
    const { data, error } = await supabase.from('appointments').insert(snake(payload)).select().single();
    if (error) throw error;
    return data;
  },
  async updateAppointment(id, payload) {
    const { data, error } = await supabase.from('appointments').update(snake(payload)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  // ─── users (mapped to public.profiles) ──────────────────────────────
  async listUsers({ filter = '', sort = 'name' } = {}) {
    let q = supabase.from('profiles').select('*');
    q = applyPbFilter(q, filter);
    q = applyPbSort(q, sort, 'name');
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
  },
  async listUsersByRole(role) {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', role).order('name');
    if (error) throw error;
    return data || [];
  },
  async getUser(id) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async createUser(payload) {
    const res = await invokeAdminUsersFunction({
      action: 'create',
      email: payload?.email,
      password: payload?.password,
      name: payload?.name,
      phone: payload?.phone,
      address: payload?.address,
      role: payload?.role,
    });
    return res.profile || null;
  },
  async updateUser(id, payload) {
    const { data, error } = await supabase.from('profiles').update(snake(payload)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteUser(id) {
    await invokeAdminUsersFunction({ action: 'delete', id });
  },
  async findUserByEmail(email) {
    const { data, error } = await supabase.from('profiles').select('*').eq('email', email).maybeSingle();
    if (error) throw error;
    if (!data) {
      const err = new Error('Not found');
      err.status = 404;
      throw err;
    }
    return data;
  },

  // ─── chats / messages ───────────────────────────────────────────────
  async listChats(userId) {
    const { data, error } = await supabase
      .from('chats').select('*')
      .contains('participants', [userId])
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(rowToChat);
  },
  async findChat() {
    throw new Error('findChat with arbitrary filter is not yet implemented for Supabase.');
  },
  async createChat(payload) {
    const { data, error } = await supabase.from('chats').insert(snake(payload)).select().single();
    if (error) throw error;
    return rowToChat(data);
  },
  async deleteChat(id) {
    const { error } = await supabase.from('chats').delete().eq('id', id);
    if (error) throw error;
  },
  async listMessages(chatId) {
    const { data, error } = await supabase.from('messages').select('*')
      .eq('chat_id', chatId).order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(rowToMessage);
  },
  async sendMessage(payload) {
    const { data, error } = await supabase.from('messages').insert(messageToRow(payload)).select().single();
    if (error) throw error;
    return rowToMessage(data);
  },
  async updateMessage(id, payload) {
    const { data, error } = await supabase.from('messages').update(messageToRow(payload)).eq('id', id).select().single();
    if (error) throw error;
    return rowToMessage(data);
  },
  async deleteMessage(id) {
    const { error } = await supabase.from('messages').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── report_downloads ────────────────────────────────────────────────
  async listReportDownloads(userId) {
    const { data, error } = await supabase.from('report_downloads').select('*')
      .eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getReportDownloadFileUrl(rec) {
    if (!rec?.storage_key) return null;
    const { data, error } = await supabase.storage.from('reports').createSignedUrl(rec.storage_key, 3600);
    if (error) throw error;
    return data?.signedUrl;
  },
  async deleteReportDownload(id) {
    const { error } = await supabase.from('report_downloads').delete().eq('id', id);
    if (error) throw error;
  },

  // ─── app_settings ────────────────────────────────────────────────────
  async getAppSettings() {
    const { data, error } = await supabase.from('app_settings').select('payload').eq('id', 1).maybeSingle();
    if (error) throw error;
    return data?.payload || {};
  },
  async upsertAppSettings(payload) {
    const { error } = await supabase
      .from('app_settings')
      .upsert({ id: 1, payload, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) throw error;
  },

  // ─── realtime ────────────────────────────────────────────────────────
  subscribe(collection, callback) {
    const channel = supabase
      .channel(`public:${collection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: collection }, (payload) => {
        const action = payload.eventType === 'INSERT' ? 'create'
                     : payload.eventType === 'UPDATE' ? 'update'
                     : payload.eventType === 'DELETE' ? 'delete'
                     : 'unknown';
        const raw = payload.new || payload.old;
        const record = collection === 'messages' ? rowToMessage(raw)
                     : collection === 'chats' ? rowToChat(raw)
                     : collection === 'app_settings' ? rowToAppSettings(raw)
                     : raw;
        callback({ action, record });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};

// ─── Helpers: PB filter / sort → Supabase ────────────────────────────────
// Covers the limited PB filter dialect actually used in this codebase:
//   • field = "value"       → .eq(field, value)
//   • field != "value"      → .neq(field, value)
//   • field >= / <= / > / < → .gte / .lte / .gt / .lt (dates & numbers)
//   • field ~ "value"       → .ilike(field, %value%)
//   • A && B                → chain both
function applyPbFilter(query, filter) {
  if (!filter) return query;
  const parts = filter.split('&&').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    let m;
    // Order matters: match the two-char operators (>=, <=, !=) before the
    // single-char ones (=, >, <) so ">=" isn't mis-parsed as "=".
    if ((m = /^(\w+)\s*>=\s*"([^"]*)"$/.exec(part)))      query = query.gte(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*<=\s*"([^"]*)"$/.exec(part))) query = query.lte(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*!=\s*"([^"]*)"$/.exec(part))) query = query.neq(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*>\s*"([^"]*)"$/.exec(part)))  query = query.gt(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*<\s*"([^"]*)"$/.exec(part)))  query = query.lt(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*=\s*"([^"]*)"$/.exec(part)))  query = query.eq(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*~\s*"([^"]*)"$/.exec(part)))  query = query.ilike(snakeKey(m[1]), `%${m[2]}%`);
    // Unsupported tokens: silently skip (caller can fall back to client-side filter).
  }
  return query;
}
function applyPbSort(query, sort, defaultCol) {
  if (!sort) return query.order(defaultCol, { ascending: false });
  const desc = sort.startsWith('-');
  const col  = snakeKey(desc ? sort.slice(1) : sort);
  return query.order(col, { ascending: !desc });
}
function snakeKey(k) {
  // Tiny camelCase → snake_case for the keys this app actually uses.
  const map = {
    created: 'created_at', updated: 'updated_at',
    scheduledAt: 'scheduled_at', timeSlot: 'time_slot',
    propertyAddress: 'property_address', inspectorName: 'inspector_name',
    roomInspections: 'room_inspections', areaCalculations: 'area_calculations',
    waterQuality: 'water_quality', propertyType: 'property_type',
    rejectionReason: 'rejection_reason', deletedAt: 'deleted_at',
    approvedAt: 'approved_at', approvedBy: 'approved_by',
    scoreBreakdown: 'score_breakdown',
    chatId: 'chat_id', senderId: 'sender_id', senderName: 'sender_name',
    senderRole: 'sender_role', readBy: 'read_by',
    userId: 'user_id', user: 'user_id',
    inspector: 'inspector_id', customer: 'customer_id',
    inspection: 'inspection_id', inspectionId: 'inspection_id',
  };
  return map[k] || k;
}
function snake(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) out[snakeKey(k)] = v;
  return out;
}
// Inspections in the React app use camelCase JSON keys; the Postgres table
// uses snake_case columns.  Map both directions so the rest of the UI is
// unaware of the storage layout.
function inspectionToRow(p) {
  if (!p) return p;
  return {
    inspector_id:      p.inspector,
    inspector_name:    p.inspectorName,
    customer_id:       p.customer,
    status:            p.status,
    property_type:     p.propertyType,
    metadata:          p.metadata,
    area_calculations: p.areaCalculations,
    water_quality:     p.waterQuality,
    room_inspections:  p.roomInspections,
    property_metrics:  p.propertyMetrics,
    include_score:     p.includeScore,
    score_overrides:   p.scoreOverrides,
    score:             p.score,
    score_breakdown:   p.scoreBreakdown,
    approved_by:       p.approvedBy,
    approved_at:       p.approvedAt,
    rejected_by:       p.rejectedBy,
    rejected_at:       p.rejectedAt,
    rejection_reason:  p.rejectionReason,
    deleted_at:        p.deletedAt,
    deleted_by:        p.deletedBy,
    deletion_reason:   p.deletionReason,
  };
}
function rowToInspection(r) {
  if (!r) return r;
  return {
    id:                r.id,
    inspector:         r.inspector_id,
    inspectorName:     r.inspector_name,
    customer:          r.customer_id,
    status:            r.status,
    propertyType:      r.property_type,
    metadata:          r.metadata,
    areaCalculations:  r.area_calculations,
    waterQuality:      r.water_quality,
    roomInspections:   r.room_inspections,
    propertyMetrics:   r.property_metrics,
    includeScore:      r.include_score,
    scoreOverrides:    r.score_overrides,
    score:             r.score,
    scoreBreakdown:    r.score_breakdown,
    approvedBy:        r.approved_by,
    approvedAt:        r.approved_at,
    rejectedBy:        r.rejected_by,
    rejectedAt:        r.rejected_at,
    rejectionReason:   r.rejection_reason,
    deletedAt:         r.deleted_at,
    deletedBy:         r.deleted_by,
    deletionReason:    r.deletion_reason,
    created:           r.created_at,
    updated:           r.updated_at,
  };
}

function rowToChat(r) {
  if (!r) return r;
  return {
    ...r,
    inspectionId: r.inspection_id ?? r.inspectionId,
    created: r.created_at ?? r.created,
    updated: r.updated_at ?? r.updated,
  };
}

function messageToRow(m) {
  if (!m) return m;
  return {
    chat_id: m.chat_id ?? m.chatId,
    sender_id: m.sender_id ?? m.senderId,
    sender_name: m.sender_name ?? m.senderName,
    sender_role: m.sender_role ?? m.senderRole,
    content: m.content,
    attachments: m.attachments,
    read_by: m.read_by ?? m.readBy,
  };
}

function rowToMessage(r) {
  if (!r) return r;
  return {
    ...r,
    chatId: r.chat_id ?? r.chatId,
    senderId: r.sender_id ?? r.senderId,
    senderName: r.sender_name ?? r.senderName,
    senderRole: r.sender_role ?? r.senderRole,
    readBy: r.read_by ?? r.readBy,
    created: r.created_at ?? r.created,
    updated: r.updated_at ?? r.updated,
  };
}

function rowToAppSettings(r) {
  if (!r) return r;
  return {
    ...r,
    payload: r.payload || {},
    updated: r.updated_at ?? r.updated,
  };
}

// ─── Adapter: Local (offline-admin Android build) ────────────────────────
// Single-user, zero-network adapter. Inspections / appointments / settings /
// report_downloads persist to on-device SQLite (localDb). Users resolve to
// the one hardcoded admin. Chats / messages / realtime are inert — this build
// has no second party to sync with.
const localAdapter = {
  // inspections
  listInspections: (opts) => localDb.listInspections(opts),
  getInspection: (id) => localDb.getInspection(id),
  createInspection: (payload) => localDb.createInspection(payload),
  upsertInspection: (payload) => (payload.id
    ? localDb.updateInspection(payload.id, payload)
    : localDb.createInspection(payload)),
  updateInspection: (id, payload) => localDb.updateInspection(id, payload),
  deleteInspection: (id) => localDb.deleteInspection(id),

  // appointments
  listAppointments: (opts) => localDb.listAppointments(opts),
  createAppointment: (payload) => localDb.createAppointment(payload),
  updateAppointment: (id, payload) => localDb.updateAppointment(id, payload),

  // users — only ever the hardcoded admin
  listUsers: async () => [OFFLINE_ADMIN_USER],
  listUsersByRole: async (role) => (role === 'admin' ? [OFFLINE_ADMIN_USER] : []),
  getUser: async () => OFFLINE_ADMIN_USER,
  createUser: async (payload) => ({ ...OFFLINE_ADMIN_USER, ...payload }),
  updateUser: async (_id, payload) => ({ ...OFFLINE_ADMIN_USER, ...payload }),
  deleteUser: async () => {},
  findUserByEmail: async () => OFFLINE_ADMIN_USER,

  // chats / messages — disabled in the offline build
  listChats: async () => [],
  findChat: async () => { throw Object.assign(new Error('chat disabled'), { status: 404 }); },
  createChat: async () => { throw new Error('Chat is disabled in the offline build'); },
  deleteChat: async () => {},
  listMessages: async () => [],
  sendMessage: async () => { throw new Error('Chat is disabled in the offline build'); },
  updateMessage: async () => {},
  deleteMessage: async () => {},

  // report_downloads
  listReportDownloads: () => localDb.listReportDownloads(),
  getReportDownloadFileUrl: async (rec) => rec?.url || '',
  createReportDownload: (payload) => localDb.createReportDownload(payload),
  deleteReportDownload: (id) => localDb.deleteReportDownload(id),

  // app_settings
  getAppSettings: () => localDb.getAppSettings(),
  upsertAppSettings: (payload) => localDb.upsertAppSettings(payload),

  // realtime — no-op (single device, single user)
  subscribe: () => () => {},
};

// ─── Adapter: Hybrid APK (local core + cloud collaboration) ───────────────
// Hybrid mode keeps inspection-domain operations local-first for resilience,
// while identity/collaboration domains stay cloud-backed.
const cloudAdapter = USE_SUPABASE ? supaAdapter : pbAdapter;
const hybridAdapter = {
  // Local-first core data
  listInspections: (opts) => localAdapter.listInspections(opts),
  getInspection: (id) => localAdapter.getInspection(id),
  createInspection: (payload) => localAdapter.createInspection(payload),
  upsertInspection: (payload) => localAdapter.upsertInspection(payload),
  updateInspection: (id, payload) => localAdapter.updateInspection(id, payload),
  deleteInspection: (id) => localAdapter.deleteInspection(id),

  listAppointments: (opts) => localAdapter.listAppointments(opts),
  createAppointment: (payload) => localAdapter.createAppointment(payload),
  updateAppointment: (id, payload) => localAdapter.updateAppointment(id, payload),

  listReportDownloads: (...args) => localAdapter.listReportDownloads(...args),
  getReportDownloadFileUrl: (...args) => localAdapter.getReportDownloadFileUrl(...args),
  createReportDownload: (payload) => localAdapter.createReportDownload(payload),
  deleteReportDownload: (id) => localAdapter.deleteReportDownload(id),

  // Cloud-backed settings record (local write-through is handled in SettingsContext)
  getAppSettings: (...args) => cloudAdapter.getAppSettings(...args),
  upsertAppSettings: (...args) => cloudAdapter.upsertAppSettings(...args),

  // Cloud-backed users and collaboration
  listUsers: (...args) => cloudAdapter.listUsers(...args),
  listUsersByRole: (...args) => cloudAdapter.listUsersByRole(...args),
  getUser: (...args) => cloudAdapter.getUser(...args),
  createUser: (...args) => cloudAdapter.createUser(...args),
  updateUser: (...args) => cloudAdapter.updateUser(...args),
  deleteUser: (...args) => cloudAdapter.deleteUser(...args),
  findUserByEmail: (...args) => cloudAdapter.findUserByEmail(...args),

  listChats: (...args) => cloudAdapter.listChats(...args),
  findChat: (...args) => cloudAdapter.findChat(...args),
  createChat: (...args) => cloudAdapter.createChat(...args),
  deleteChat: (...args) => cloudAdapter.deleteChat(...args),
  listMessages: (...args) => cloudAdapter.listMessages(...args),
  sendMessage: (...args) => cloudAdapter.sendMessage(...args),
  updateMessage: (...args) => cloudAdapter.updateMessage(...args),
  deleteMessage: (...args) => cloudAdapter.deleteMessage(...args),

  subscribe: (...args) => cloudAdapter.subscribe(...args),
};

export const dataBackend = IS_OFFLINE_ADMIN
  ? 'local'
  : (IS_HYBRID_APK ? 'hybrid' : (USE_SUPABASE ? 'supabase' : 'pocketbase'));

const adapter = IS_OFFLINE_ADMIN
  ? localAdapter
  : (IS_HYBRID_APK ? hybridAdapter : (USE_SUPABASE ? supaAdapter : pbAdapter));

export default adapter;
