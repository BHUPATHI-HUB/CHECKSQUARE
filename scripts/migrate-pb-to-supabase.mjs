#!/usr/bin/env node
/**
 * scripts/migrate-pb-to-supabase.mjs
 *
 * One-shot migration of every PocketBase collection into Supabase Postgres.
 * Idempotent — re-running upserts rather than duplicates.
 *
 * Phase order (mirrors the FK graph):
 *   1. users          → auth.users + public.profiles
 *   2. inspections
 *   3. inspection_photos   (extracted from inspections.roomInspections base64)
 *   4. appointments
 *   5. chats + messages
 *   6. notifications
 *   7. report_downloads
 *   8. app_settings (single row)
 *
 * USAGE
 *   PB_URL=http://127.0.0.1:8090 \
 *   PB_SUPERUSER_EMAIL=admin@example.com \
 *   PB_SUPERUSER_PASSWORD='SuperPass!23' \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/migrate-pb-to-supabase.mjs
 *
 * Add --dry-run to print counts without writing.
 */

import PocketBase from 'pocketbase';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

const DRY = process.argv.includes('--dry-run');

const {
  PB_URL = 'http://127.0.0.1:8090',
  PB_SUPERUSER_EMAIL,
  PB_SUPERUSER_PASSWORD,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!PB_SUPERUSER_EMAIL || !PB_SUPERUSER_PASSWORD) {
  console.error('❌  PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD missing');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const pb   = new PocketBase(PB_URL);
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await pb.collection('_superusers').authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
console.log(`✓ Authed to PocketBase at ${PB_URL}`);
console.log(`✓ Supabase admin client ready${DRY ? '  (DRY RUN)' : ''}`);

// ── Helpers ────────────────────────────────────────────────────────────
const idMap = new Map(); // pbId → supabase auth.uid
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toDeterministicUuid = (scope, id) => {
  if (!id) return null;
  if (UUID_RE.test(id)) return id;
  const hex = createHash('sha1').update(`${scope}:${id}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const writeBatch = async (table, rows) => {
  if (DRY || rows.length === 0) return;
  for (let i = 0; i < rows.length; i += 500) {
    const slice = rows.slice(i, i + 500);
    const { error } = await supa.from(table).upsert(slice, { onConflict: 'id' });
    if (error) throw error;
  }
};

const normalizeInspectionStatus = (value) => {
  const v = String(value || '').toLowerCase();
  if (v === 'draft' || v === 'pending' || v === 'approved' || v === 'rejected') return v;
  return 'draft';
};

const normalizePropertyType = (value) => {
  const v = String(value || '').toLowerCase();
  if (!v) return null;
  if (['commercial', 'retail', 'office', 'warehouse', 'shop'].includes(v)) return 'Commercial';
  if (['industrial', 'factory', 'plant'].includes(v)) return 'Industrial';
  // Legacy PB values (villa/apartment/house/townhouse/condo/etc.) map to Residential.
  return 'Residential';
};

// ── 1. Users → auth.users + public.profiles ────────────────────────────
console.log('\n[1/8] users');
const pbUsers = await pb.collection('users').getFullList({ $autoCancel: false });
for (const u of pbUsers) {
  if (DRY) { console.log(`  · ${u.email}`); continue; }
  // Upsert into Supabase Auth (idempotent — re-finds by email).
  const { data: list } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
  let existing = list?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
  if (!existing) {
    const rnd = `migrated-${Math.random().toString(36).slice(2)}-${Date.now()}`;
    const { data, error } = await supa.auth.admin.createUser({
      email: u.email,
      password: rnd,
      email_confirm: true,
      user_metadata: { full_name: u.name, role: u.role, pocketbase_id: u.id },
    });
    if (error) { console.error(`  ✗ create ${u.email}:`, error.message); continue; }
    existing = data.user;
  } else {
    await supa.auth.admin.updateUserById(existing.id, {
      user_metadata: { ...existing.user_metadata, full_name: u.name, role: u.role, pocketbase_id: u.id },
    });
  }
  idMap.set(u.id, existing.id);
  // Ensure profile row exists even for users created before triggers were added.
  const { error: profileErr } = await supa.from('profiles').upsert({
    id: existing.id,
    email: u.email,
    name: u.name,
    role: u.role,
    phone: u.phone || null,
    address: u.address || null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id' });
  if (profileErr) throw profileErr;
}
console.log(`  → ${pbUsers.length} users mapped`);

// ── 2. Inspections ─────────────────────────────────────────────────────
console.log('\n[2/8] inspections');
const pbIns = await pb.collection('inspections').getFullList({ $autoCancel: false });
const insRows = pbIns.map((r) => ({
  id:                 toDeterministicUuid('inspections', r.id),
  inspector_id:       idMap.get(r.inspector),
  inspector_name:     r.inspectorName,
  customer_id:        idMap.get(r.customer) || null,
  status:             normalizeInspectionStatus(r.status),
  property_type:      normalizePropertyType(r.propertyType),
  metadata:           r.metadata || {},
  area_calculations:  r.areaCalculations || {},
  water_quality:      r.waterQuality || {},
  // Photos are migrated separately into inspection_photos — drop them here
  // to keep the JSON small.  Original blob is preserved in pb_data backup.
  room_inspections:   stripPhotosFromRooms(r.roomInspections || {}),
  score:              r.score,
  score_breakdown:    r.scoreBreakdown || null,
  approved_by:        idMap.get(r.approvedBy) || null,
  approved_at:        r.approvedAt || null,
  rejected_by:        idMap.get(r.rejectedBy) || null,
  rejected_at:        r.rejectedAt || null,
  rejection_reason:   r.rejectionReason || null,
  deleted_at:         r.deletedAt || null,
  deleted_by:         idMap.get(r.deletedBy) || null,
  deletion_reason:    r.deletionReason || null,
  created_at:         r.created,
  updated_at:         r.updated,
})).filter((x) => x.inspector_id);
await writeBatch('inspections', insRows);
console.log(`  → ${insRows.length} inspections`);

function stripPhotosFromRooms(rooms) {
  const out = JSON.parse(JSON.stringify(rooms));
  const visit = (val) => {
    if (!val || typeof val !== 'object') return;
    if (Array.isArray(val)) val.forEach(visit);
    else {
      // common photo array names
      ['photos', 'beforePhoto', 'afterPhoto', 'images', 'spaces'].forEach((k) => {
        if (k in val) delete val[k];
      });
      Object.values(val).forEach(visit);
    }
  };
  visit(out);
  return out;
}

// ── 3. inspection_photos — TODO ────────────────────────────────────────
// Extracting the base64-in-JSON photos and uploading them as files to the
// `inspection-photos` Supabase Storage bucket is large enough to deserve
// its own script (it walks the same JSON tree, base64-decodes each photo,
// uploads via supabase.storage.from(...).upload, and inserts a row).
// See SUPABASE_SETUP.md §13 for the recipe.
console.log('\n[3/8] inspection_photos  — skipped (see SUPABASE_SETUP.md §13)');

// ── 4. Appointments ────────────────────────────────────────────────────
console.log('\n[4/8] appointments');
const pbAppts = await pb.collection('appointments').getFullList({ $autoCancel: false });
const apptRows = pbAppts.map((r) => ({
  id:               toDeterministicUuid('appointments', r.id),
  customer_id:      idMap.get(r.customer),
  inspector_id:     idMap.get(r.inspector) || null,
  inspection_id:    toDeterministicUuid('inspections', r.inspection),
  scheduled_at:     r.scheduledAt,
  time_slot:        r.timeSlot,
  property_address: r.propertyAddress,
  notes:            r.notes || null,
  status:           r.status,
  created_at:       r.created,
  updated_at:       r.updated,
})).filter((x) => x.customer_id);
await writeBatch('appointments', apptRows);
console.log(`  → ${apptRows.length} appointments`);

// ── 5. Chats + messages ────────────────────────────────────────────────
console.log('\n[5/8] chats + messages');
const pbChats = await pb.collection('chats').getFullList({ $autoCancel: false });
const chatRows = pbChats.map((r) => ({
  id:              toDeterministicUuid('chats', r.id),
  type:            r.type || 'direct',
  participants:    (Array.isArray(r.participants) ? r.participants : [r.participants])
                     .map((id) => idMap.get(id)).filter(Boolean),
  inspection_id:   toDeterministicUuid('inspections', r.inspectionId),
  last_message:    r.lastMessage || null,
  last_message_at: r.lastMessageAt || null,
  created_at:      r.created,
  updated_at:      r.updated,
}));
await writeBatch('chats', chatRows);

const pbMsgs = await pb.collection('messages').getFullList({ $autoCancel: false });
const msgRows = pbMsgs.map((r) => ({
  id:           toDeterministicUuid('messages', r.id),
  chat_id:      toDeterministicUuid('chats', r.chatId),
  sender_id:    idMap.get(r.senderId),
  sender_name:  r.senderName,
  sender_role:  r.senderRole,
  content:      r.content,
  read_by:      (r.readBy || []).map((id) => idMap.get(id)).filter(Boolean),
  attachments:  r.attachments || [],
  created_at:   r.created,
})).filter((x) => x.sender_id);
await writeBatch('messages', msgRows);
console.log(`  → ${chatRows.length} chats, ${msgRows.length} messages`);

// ── 6. Notifications ──────────────────────────────────────────────────
console.log('\n[6/8] notifications');
const pbNotes = await pb.collection('notifications').getFullList({ $autoCancel: false });
const noteRows = pbNotes.map((r) => ({
  id:         toDeterministicUuid('notifications', r.id),
  user_id:    idMap.get(r.userId),
  type:       r.type,
  title:      r.title,
  body:       r.body || null,
  data:       r.data || null,
  read:       Boolean(r.read),
  created_at: r.created,
})).filter((x) => x.user_id);
await writeBatch('notifications', noteRows);
console.log(`  → ${noteRows.length} notifications`);

// ── 7. report_downloads ────────────────────────────────────────────────
console.log('\n[7/8] report_downloads');
try {
  const pbDls = await pb.collection('report_downloads').getFullList({ $autoCancel: false });
  const dlRows = pbDls.map((r) => ({
    id:            toDeterministicUuid('report_downloads', r.id),
    user_id:       idMap.get(r.user),
    inspection_id: toDeterministicUuid('inspections', r.inspection),
    filename:      r.filename,
    format:        r.format,
    file_size:     r.fileSize || null,
    storage_key:   null, // file blob migration is out of scope; users can re-generate
    created_at:    r.created,
  })).filter((x) => x.user_id);
  await writeBatch('report_downloads', dlRows);
  console.log(`  → ${dlRows.length} report_downloads`);
} catch (e) {
  console.log('  · skipped:', e?.message);
}

// ── 8. app_settings ────────────────────────────────────────────────────
console.log('\n[8/8] app_settings');
try {
  const r = await pb.collection('app_settings').getOne('single');
  await writeBatch('app_settings', [{ id: 1, payload: r.payload || {}, updated_at: r.updated }]);
  console.log('  → app_settings copied');
} catch (e) {
  console.log('  · app_settings row not present — skipping');
}

console.log('\n✅  Migration complete.  Verify in Supabase Dashboard → Table editor.');
if (!DRY) {
  console.log('\nNext: run scripts/migrate-photos-to-supabase.mjs to extract base64 photos.');
}
