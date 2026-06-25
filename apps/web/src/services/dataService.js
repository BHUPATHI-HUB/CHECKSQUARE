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

import pb from '@/lib/pocketbaseClient.js';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';

const USE_SUPABASE = isSupabaseConfigured
  && (import.meta.env?.VITE_USE_SUPABASE_DB === 'true');

export const dataBackend = USE_SUPABASE ? 'supabase' : 'pocketbase';

// ─── Adapter: PocketBase ─────────────────────────────────────────────────
const pbAdapter = {
  // ─── inspections ─────────────────────────────────────────────────────
  listInspections({ filter = '', sort = '-created', expand } = {}) {
    return pb.collection('inspections').getFullList({
      filter, sort, expand, $autoCancel: false,
    });
  },
  getInspection(id) {
    return pb.collection('inspections').getOne(id, { $autoCancel: false });
  },
  createInspection(payload) {
    return pb.collection('inspections').create(payload, { $autoCancel: false });
  },
  updateInspection(id, payload) {
    return pb.collection('inspections').update(id, payload, { $autoCancel: false });
  },

  // ─── appointments ────────────────────────────────────────────────────
  listAppointments({ filter = '', sort = '-scheduledAt' } = {}) {
    return pb.collection('appointments').getFullList({ filter, sort, $autoCancel: false });
  },
  createAppointment(payload) {
    return pb.collection('appointments').create(payload, { $autoCancel: false });
  },
  updateAppointment(id, payload) {
    return pb.collection('appointments').update(id, payload, { $autoCancel: false });
  },

  // ─── users ───────────────────────────────────────────────────────────
  listUsers({ filter = '', sort = 'name', fields } = {}) {
    return pb.collection('users').getFullList({ filter, sort, fields, $autoCancel: false });
  },
  listUsersByRole(role) {
    return pb.collection('users').getFullList({
      filter: `role = "${role}"`, sort: 'name', $autoCancel: false,
    });
  },
  getUser(id) {
    return pb.collection('users').getOne(id, { $autoCancel: false });
  },
  createUser(payload) {
    return pb.collection('users').create(payload, { $autoCancel: false });
  },
  updateUser(id, payload) {
    return pb.collection('users').update(id, payload, { $autoCancel: false });
  },
  deleteUser(id) {
    return pb.collection('users').delete(id);
  },
  findUserByEmail(email) {
    return pb.collection('users').getFirstListItem(`email = "${email}"`, { $autoCancel: false });
  },

  // ─── chats / messages ────────────────────────────────────────────────
  listChats(userId) {
    return pb.collection('chats').getFullList({
      filter: `participants ~ "${userId}"`,
      expand: 'participants',
      sort: '-updated',
      $autoCancel: false,
    });
  },
  findChat(filter) {
    return pb.collection('chats').getFirstListItem(filter, { $autoCancel: false });
  },
  createChat(payload) {
    return pb.collection('chats').create(payload, { $autoCancel: false });
  },
  listMessages(chatId) {
    return pb.collection('messages').getFullList({
      filter: `chatId = "${chatId}"`, sort: 'created', $autoCancel: false,
    });
  },
  sendMessage(payload) {
    return pb.collection('messages').create(payload, { $autoCancel: false });
  },

  // ─── report_downloads ────────────────────────────────────────────────
  listReportDownloads(userId) {
    return pb.collection('report_downloads').getFullList({
      filter: `user = "${userId}"`, sort: '-created', $autoCancel: false,
    });
  },
  getReportDownloadFileUrl: async (rec) => {
    const token = await pb.files.getToken();
    return pb.files.getUrl(rec, rec.file, { token });
  },
  deleteReportDownload(id) {
    return pb.collection('report_downloads').delete(id);
  },

  // ─── realtime ────────────────────────────────────────────────────────
  // Returns an unsubscribe function.
  subscribe(collection, callback, topic = '*') {
    pb.collection(collection).subscribe(topic, callback);
    return () => pb.collection(collection).unsubscribe(topic);
  },
};

// ─── Adapter: Supabase ───────────────────────────────────────────────────
// The Supabase adapter mirrors the PB API.  Translates PB-style filter
// strings into PostgREST query-builder calls in the common cases used by
// the React app.  More complex filters can be added on demand.
const supaAdapter = {
  // ─── inspections ─────────────────────────────────────────────────────
  async listInspections({ filter = '', sort = '-created' } = {}) {
    let q = supabase.from('inspections').select('*');
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
  async updateInspection(id, payload) {
    const { data, error } = await supabase.from('inspections').update(inspectionToRow(payload)).eq('id', id).select().single();
    if (error) throw error;
    return rowToInspection(data);
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
    // Supabase Auth must mint the auth.users row first; the profiles trigger
    // fills the rest.  Direct profile inserts will fail FK against auth.users.
    throw new Error('createUser is admin-only and must go through supabase.auth.admin.createUser; route via a server function.');
  },
  async updateUser(id, payload) {
    const { data, error } = await supabase.from('profiles').update(snake(payload)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteUser(id) {
    // Cascades from auth.users → profiles.  Must be called via the admin client
    // on the server.  Frontend cannot delete users directly.
    throw new Error('deleteUser must be called from a server function with the service-role key.');
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
    return data || [];
  },
  async findChat() {
    throw new Error('findChat with arbitrary filter is not yet implemented for Supabase.');
  },
  async createChat(payload) {
    const { data, error } = await supabase.from('chats').insert(snake(payload)).select().single();
    if (error) throw error;
    return data;
  },
  async listMessages(chatId) {
    const { data, error } = await supabase.from('messages').select('*')
      .eq('chat_id', chatId).order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async sendMessage(payload) {
    const { data, error } = await supabase.from('messages').insert(snake(payload)).select().single();
    if (error) throw error;
    return data;
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

  // ─── realtime ────────────────────────────────────────────────────────
  subscribe(collection, callback) {
    const channel = supabase
      .channel(`public:${collection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: collection }, (payload) => {
        const action = payload.eventType === 'INSERT' ? 'create'
                     : payload.eventType === 'UPDATE' ? 'update'
                     : payload.eventType === 'DELETE' ? 'delete'
                     : 'unknown';
        callback({ action, record: payload.new || payload.old });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  },
};

// ─── Helpers: PB filter / sort → Supabase ────────────────────────────────
// Covers the limited PB filter dialect actually used in this codebase:
//   • field = "value"       → .eq(field, value)
//   • field != "value"      → .neq(field, value)
//   • field ~ "value"       → .ilike(field, %value%)
//   • A && B                → chain both
function applyPbFilter(query, filter) {
  if (!filter) return query;
  const parts = filter.split('&&').map((s) => s.trim()).filter(Boolean);
  for (const part of parts) {
    let m;
    if ((m = /^(\w+)\s*=\s*"([^"]*)"$/.exec(part)))      query = query.eq(snakeKey(m[1]), m[2]);
    else if ((m = /^(\w+)\s*!=\s*"([^"]*)"$/.exec(part))) query = query.neq(snakeKey(m[1]), m[2]);
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

const adapter = USE_SUPABASE ? supaAdapter : pbAdapter;

export default adapter;
