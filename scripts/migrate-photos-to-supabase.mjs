#!/usr/bin/env node
/**
 * scripts/migrate-photos-to-supabase.mjs
 *
 * Extracts legacy base64 images embedded in PocketBase inspections.roomInspections,
 * uploads them to Supabase Storage, and inserts rows into public.inspection_photos.
 *
 * Usage:
 *   PB_URL=http://127.0.0.1:8090 \
 *   PB_SUPERUSER_EMAIL=admin@example.com \
 *   PB_SUPERUSER_PASSWORD='SuperPass!23' \
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   SUPABASE_PHOTO_BUCKET=inspection-photos \
 *   node scripts/migrate-photos-to-supabase.mjs [--dry-run]
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
  SUPABASE_PHOTO_BUCKET = 'inspection-photos',
} = process.env;

if (!PB_SUPERUSER_EMAIL || !PB_SUPERUSER_PASSWORD) {
  console.error('ERROR: PB_SUPERUSER_EMAIL / PB_SUPERUSER_PASSWORD missing');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('ERROR: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
const supa = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await pb.collection('_superusers').authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
console.log(`Authed to PocketBase at ${PB_URL}`);
console.log(`Supabase admin client ready${DRY ? ' (DRY RUN)' : ''}`);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const toDeterministicUuid = (scope, id) => {
  if (!id) return null;
  if (UUID_RE.test(id)) return id;
  const hex = createHash('sha1').update(`${scope}:${id}`).digest('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

const slug = (value) => String(value || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'room';

const parseDataUrl = (url) => {
  if (typeof url !== 'string') return null;
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(url);
  if (!m) return null;
  const mime = m[1].toLowerCase();
  const base64 = m[2].replace(/\s+/g, '');
  const ext = mime.includes('png') ? 'png'
    : mime.includes('webp') ? 'webp'
    : mime.includes('gif') ? 'gif'
    : (mime.includes('jpg') || mime.includes('jpeg')) ? 'jpg'
    : 'bin';
  return { mime, base64, ext };
};

const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/');

const collectPhotos = (node, ctx, out) => {
  if (!node) return;

  if (Array.isArray(node)) {
    for (const item of node) collectPhotos(item, ctx, out);
    return;
  }

  if (typeof node !== 'object') return;

  const nextCtx = { ...ctx };
  if (node.id && String(node.id).startsWith('r')) nextCtx.roomKey = slug(node.id);
  if (!nextCtx.roomKey && node.name) nextCtx.roomKey = slug(node.name);

  if (node.url && isDataUrl(node.url)) {
    out.push({
      roomKey: nextCtx.roomKey || 'room',
      photoId: slug(node.id || createHash('sha1').update(node.url).digest('hex').slice(0, 12)),
      capturedAt: node.capturedAt || null,
      caption: node.caption || node.corner || null,
      severity: node.severity || null,
      dataUrl: node.url,
    });
  }

  for (const [k, v] of Object.entries(node)) {
    if (k === 'url') continue;
    collectPhotos(v, nextCtx, out);
  }
};

const inspections = await pb.collection('inspections').getFullList({ $autoCancel: false });
let seen = 0;
let uploaded = 0;
let rowsUpserted = 0;
let skipped = 0;

for (const inspection of inspections) {
  const supaInspectionId = toDeterministicUuid('inspections', inspection.id);
  const photos = [];
  collectPhotos(inspection.roomInspections, { roomKey: null }, photos);

  if (!photos.length) continue;

  // Use inspector id from migrated inspection row where possible.
  let createdBy = null;
  try {
    const { data } = await supa
      .from('inspections')
      .select('inspector_id')
      .eq('id', supaInspectionId)
      .maybeSingle();
    createdBy = data?.inspector_id || null;
  } catch {
    // keep null if lookup fails
  }

  for (const p of photos) {
    seen++;
    const parsed = parseDataUrl(p.dataUrl);
    if (!parsed) {
      skipped++;
      continue;
    }

    const bytes = Buffer.from(parsed.base64, 'base64');
    const storageKey = `${supaInspectionId}/${p.roomKey}/${p.photoId}.${parsed.ext}`;
    const rowId = toDeterministicUuid('inspection_photos', `${inspection.id}:${p.roomKey}:${p.photoId}`);

    if (!DRY) {
      const up = await supa.storage
        .from(SUPABASE_PHOTO_BUCKET)
        .upload(storageKey, bytes, {
          contentType: parsed.mime,
          upsert: true,
        });
      if (up.error) {
        console.error(`upload failed: ${storageKey} :: ${up.error.message}`);
        skipped++;
        continue;
      }
      uploaded++;

      const { error: rowErr } = await supa
        .from('inspection_photos')
        .upsert({
          id: rowId,
          inspection_id: supaInspectionId,
          room_key: p.roomKey,
          storage_key: storageKey,
          caption: p.caption,
          captured_at: p.capturedAt || new Date().toISOString(),
          severity: p.severity,
          created_by: createdBy,
        }, { onConflict: 'id' });
      if (rowErr) {
        console.error(`row upsert failed: ${storageKey} :: ${rowErr.message}`);
        skipped++;
        continue;
      }
      rowsUpserted++;
    } else {
      uploaded++;
      rowsUpserted++;
    }
  }
}

console.log('');
console.log(`Photos discovered: ${seen}`);
console.log(`Uploads ${DRY ? '(simulated)' : ''}: ${uploaded}`);
console.log(`Rows upserted ${DRY ? '(simulated)' : ''}: ${rowsUpserted}`);
console.log(`Skipped: ${skipped}`);
console.log('Done.');
