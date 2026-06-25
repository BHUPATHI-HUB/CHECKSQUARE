// dataService — single entry point for every CRUD / realtime operation in
// the React app.  Encapsulates the "PocketBase OR Supabase" decision so
// individual pages do NOT import either client directly.
//
// Toggle: set VITE_USE_SUPABASE_DB=true to route reads/writes through
// Supabase Postgres.  Default (false) keeps PocketBase.  This lets us cut
// over one collection at a time during Phase 3 without touching the UI.
//
// CURRENT STATE (Phase 3 plumbing):
//   • PocketBase implementation is the production default.
//   • Supabase implementation maps 1-to-1 onto the tables defined in
//     supabase/migrations/001_schema.sql.  Each method has the same
//     signature as the PB version so pages can migrate one-by-one.
//
// The methods exposed here intentionally hide PB/Supabase quirks (id casing,
// camelCase ↔ snake_case, the difference between PB filter strings and PG
// query builders).  Adding a new collection method is a 4-line addition to
// each adapter.

import pb from '@/lib/pocketbaseClient.js';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient.js';

const USE_SUPABASE = isSupabaseConfigured
  && (import.meta.env?.VITE_USE_SUPABASE_DB === 'true');

export const dataBackend = USE_SUPABASE ? 'supabase' : 'pocketbase';

// ─── Adapter: PocketBase ─────────────────────────────────────────────────
const pbAdapter = {
  async listInspections(filter = '') {
    return pb.collection('inspections').getFullList({ filter, sort: '-created', $autoCancel: false });
  },
  async getInspection(id) {
    return pb.collection('inspections').getOne(id, { $autoCancel: false });
  },
  async createInspection(payload) {
    return pb.collection('inspections').create(payload, { $autoCancel: false });
  },
  async updateInspection(id, payload) {
    return pb.collection('inspections').update(id, payload, { $autoCancel: false });
  },

  async listAppointments(filter = '') {
    return pb.collection('appointments').getFullList({ filter, sort: '-scheduledAt', $autoCancel: false });
  },
  async createAppointment(payload) {
    return pb.collection('appointments').create(payload, { $autoCancel: false });
  },
  async updateAppointment(id, payload) {
    return pb.collection('appointments').update(id, payload, { $autoCancel: false });
  },

  async listUsersByRole(role) {
    return pb.collection('users').getFullList({ filter: `role = "${role}"`, sort: 'name', $autoCancel: false });
  },

  async listChats(userId) {
    return pb.collection('chats').getFullList({
      filter: `participants ~ "${userId}"`,
      expand: 'participants',
      sort: '-updated',
      $autoCancel: false,
    });
  },
  async listMessages(chatId) {
    return pb.collection('messages').getFullList({
      filter: `chatId = "${chatId}"`,
      sort: 'created',
      $autoCancel: false,
    });
  },
  async sendMessage(form) {
    return pb.collection('messages').create(form, { $autoCancel: false });
  },

  // Realtime subscription — returns an unsubscribe function.
  subscribe(collection, callback) {
    pb.collection(collection).subscribe('*', callback);
    return () => pb.collection(collection).unsubscribe('*');
  },
};

// ─── Adapter: Supabase ───────────────────────────────────────────────────
const supaAdapter = {
  async listInspections() {
    const { data, error } = await supabase
      .from('inspections')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async getInspection(id) {
    const { data, error } = await supabase.from('inspections').select('*').eq('id', id).single();
    if (error) throw error;
    return data;
  },
  async createInspection(payload) {
    const { data, error } = await supabase.from('inspections').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async updateInspection(id, payload) {
    const { data, error } = await supabase.from('inspections').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async listAppointments() {
    const { data, error } = await supabase.from('appointments').select('*').order('scheduled_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async createAppointment(payload) {
    const { data, error } = await supabase.from('appointments').insert(payload).select().single();
    if (error) throw error;
    return data;
  },
  async updateAppointment(id, payload) {
    const { data, error } = await supabase.from('appointments').update(payload).eq('id', id).select().single();
    if (error) throw error;
    return data;
  },

  async listUsersByRole(role) {
    const { data, error } = await supabase.from('profiles').select('*').eq('role', role).order('name');
    if (error) throw error;
    return data || [];
  },

  async listChats(userId) {
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .contains('participants', [userId])
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
  async listMessages(chatId) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  },
  async sendMessage(payload) {
    const { data, error } = await supabase.from('messages').insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  subscribe(collection, callback) {
    const channel = supabase
      .channel(`public:${collection}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: collection }, (payload) => {
        // Re-shape Supabase realtime payload into the PB-style { action, record }
        // so existing consumers don't need to change.
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

const adapter = USE_SUPABASE ? supaAdapter : pbAdapter;

export default adapter;
