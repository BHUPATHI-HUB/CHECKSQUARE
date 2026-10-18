// dataService — the single Supabase data boundary for the React app.
import { supabase, requireSupabase } from '@/lib/supabaseClient.js';
import { isDemoMode } from '@/lib/previewMode.js';
import { rowToAppointment } from './appointmentRecord.js';
import { persistChatMessage, chatAttachmentBucket } from './chatAttachments.js';

// Supabase is deliberately selected unconditionally. A missing configuration
// must surface as a clear runtime error instead of silently writing to a
// different backend or pretending that local-only data is synced.
export const dataBackend = 'supabase';

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
  'id', 'version', 'inspector_id', 'inspector_name', 'customer_id', 'status',
  'property_type', 'metadata', 'score', 'score_breakdown', 'include_score',
  'property_metrics', 'approved_by', 'approved_at', 'rejected_by',
  'rejected_at', 'rejection_reason', 'deleted_at', 'deleted_by',
  'deletion_reason', 'created_at', 'updated_at',
].join(',');

async function invokeAdminUserFunction(action, payload) {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke('admin-user-management', {
    body: { action, ...payload },
  });
  if (error) throw error;
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
    const { data, error } = await requireSupabase().rpc('persist_inspection', {
      p_id: payload.id,
      p_payload: inspectionToRow(payload),
      p_expected_version: payload.version ?? null,
    });
    if (error) throw error;
    return rowToInspection(data);
  },
  async updateInspection(id, payload) {
    const current = payload.version == null ? await this.getInspection(id) : payload;
    const { data, error } = await requireSupabase().rpc('persist_inspection', {
      p_id: id,
      p_payload: inspectionToRow(payload),
      p_expected_version: current.version,
    });
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
    return (data || []).map(rowToAppointment);
  },
  async createAppointment(payload) {
    const { data, error } = await supabase.from('appointments').insert(snake(payload)).select().single();
    if (error) throw error;
    return rowToAppointment(data);
  },
  async updateAppointment(id, payload) {
    const { data, error } = await supabase.from('appointments').update(snake(payload)).eq('id', id).select().single();
    if (error) throw error;
    return rowToAppointment(data);
  },

  // ─── users (mapped to public.profiles) ──────────────────────────────
  async listUsers({ filter = '', sort = 'name' } = {}) {
    let q = supabase.from('profiles').select('*');
    q = applyPbFilter(q, filter);
    q = applyPbSort(q, sort, 'name');
    const { data, error } = await q;
    if (error) throw error;
    return Promise.all((data || []).map(resolveProfile));
  },
  async listUsersByRole(role) {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', role).order('name');
    if (error) throw error;
    return Promise.all((data || []).map(resolveProfile));
  },
  async getUser(id) {
    const { data, error } = await supabase.from('profiles').select('*').eq('id', id).single();
    if (error) throw error;
    return resolveProfile(data);
  },
  async createUser(payload) {
    return invokeAdminUserFunction('create', payload);
  },
  async updateUser(id, payload) {
    if (payload.password) return invokeAdminUserFunction('reset_password', { id, password: payload.password });
    if (payload instanceof FormData) {
      const file = payload.get('avatar');
      if (!(file instanceof Blob) || file.size > 5 * 1024 * 1024 || !/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error('Choose an image under 5 MB.');
      const key = `${id}/avatar-${crypto.randomUUID()}`;
      const { error } = await requireSupabase().storage.from('avatars').upload(key, file);
      if (error) throw error;
      payload = { avatar_url: `storage:${key}` };
    }
    const { data, error } = await supabase.from('profiles').update(snake(payload)).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },
  async deleteUser(id) {
    return invokeAdminUserFunction('delete', { id });
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
  async findChat(filter = '') {
    const match = /(?:inspectionId|inspection)\s*=\s*"([^"]+)"/.exec(filter);
    if (!match) throw new Error(`Unsupported chat filter: ${filter || '(empty)'}`);
    const { data, error } = await supabase.from('chats').select('*')
      .eq('inspection_id', match[1]).maybeSingle();
    if (error) throw error;
    return data ? rowToChat(data) : null;
  },
  async ensureSupportChat() {
    const { data, error } = await requireSupabase().rpc('ensure_support_chat');
    if (error) throw error;
    return rowToChat(data);
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
  async sendMessage(payload, files = []) {
    const record = await persistChatMessage(requireSupabase(), messageToRow(payload), files);
    return rowToMessage(record);
  },
  async getChatAttachmentUrl(path) {
    const { data, error } = await requireSupabase().storage.from(chatAttachmentBucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return data?.signedUrl;
  },
  async updateMessage(id, payload) {
    if (!payload.readBy || Object.keys(payload).some((key) => key !== 'readBy')) {
      throw new Error('Only read receipts can be updated.');
    }
    const { error } = await requireSupabase().rpc('mark_message_read', { p_id: id });
    if (error) throw error;
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

async function resolveProfile(profile) {
  if (!profile?.avatar_url?.startsWith('storage:')) return profile;
  const { data, error } = await requireSupabase().storage.from('avatars').createSignedUrl(profile.avatar_url.slice(8), 3600);
  return { ...profile, avatar_url: error ? null : data.signedUrl };
}

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
    else if ((m = /^(\w+)\s*=\s*null$/i.exec(part)))          query = query.is(snakeKey(m[1]), null);
    else if ((m = /^(\w+)\s*!=\s*null$/i.exec(part)))         query = query.not(snakeKey(m[1]), 'is', null);
    else if ((m = /^(\w+)\s*~\s*"([^"]*)"$/.exec(part)))  query = query.ilike(snakeKey(m[1]), `%${m[2]}%`);
    else throw new Error(`Unsupported Supabase filter expression: ${part}`);
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
  if (Array.isArray(r)) r = r[0];
  if (!r) return r;
  return {
    id:                r.id,
    version:           r.version,
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
  if (Array.isArray(r)) r = r[0];
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

const adapter = isDemoMode ? (await import('./demoAdapter.js')).default : supaAdapter;

export default adapter;
