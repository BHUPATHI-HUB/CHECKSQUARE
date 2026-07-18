#!/usr/bin/env node
/**
 * scripts/shrink-existing-photos.mjs
 *
 * One-time cleanup for the CURRENT (Supabase-only) database.
 *
 * Finds base64 photos still embedded in public.inspections.room_inspections,
 * resizes them (longest edge <= MAX_EDGE, JPEG QUALITY), uploads them to the
 * `inspection-photos` bucket, and rewrites the JSON so each photo becomes a
 * lightweight { storageKey } reference instead of a multi-MB data URL.
 *
 * Runs as the ADMIN user over RLS (no service-role key needed):
 *   - admin can read/update every inspection
 *   - admin can write to the inspection-photos bucket
 *
 * Usage (from repo root):
 *   node scripts/shrink-existing-photos.mjs             # DRY RUN (no writes)
 *   node scripts/shrink-existing-photos.mjs --commit    # apply changes
 *
 * Optional env overrides:
 *   ADMIN_EMAIL, ADMIN_PASSWORD, MAX_EDGE (1600), QUALITY (85)
 */

import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createHash } from 'node:crypto';

const SUPABASE_URL  = 'https://jcnvcyocatcovtdedokf.supabase.co';
const ANON_KEY      = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpjbnZjeW9jYXRjb3Z0ZGVkb2tmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNjA3MDQsImV4cCI6MjA5ODczNjcwNH0.sDQgR5LfABkaXHkjdNKm42T3gDqHRnb_WPRXjy0PyIo';

const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin.test@checksquare.dev';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'CheckAdmin@2026';
const MAX_EDGE = Number(process.env.MAX_EDGE || 1600);
const QUALITY  = Number(process.env.QUALITY  || 85);
const BUCKET   = 'inspection-photos';
const COMMIT   = process.argv.includes('--commit');

const sb = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const slug = (v) => String(v || 'room').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'room';
const makePhotoId = (seed) => `photo_${createHash('sha1').update(String(seed)).digest('hex').slice(0, 12)}`;
const isDataUrl = (v) => typeof v === 'string' && v.startsWith('data:image/');
const parseDataUrl = (url) => {
  const m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(url);
  if (!m) return null;
  return { buffer: Buffer.from(m[2].replace(/\s+/g, ''), 'base64') };
};

// Recursively find photo nodes ({ url: 'data:image...' }) and resize+upload
// them, mutating each node in place to { storageKey }. Returns [{ bytesIn, bytesOut }].
async function processNode(node, ctx, inspectionId, results) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) await processNode(item, ctx, inspectionId, results);
    return;
  }
  if (typeof node !== 'object') return;

  const nextCtx = { ...ctx };
  if (node.id && String(node.id).startsWith('r')) nextCtx.roomKey = slug(node.id);
  if (!nextCtx.roomKey && node.name) nextCtx.roomKey = slug(node.name);
  if (node.corner) nextCtx.roomKey = nextCtx.roomKey || slug(node.corner);

  if (isDataUrl(node.url)) {
    const parsed = parseDataUrl(node.url);
    if (parsed) {
      const bytesIn = parsed.buffer.length;
      const out = await sharp(parsed.buffer)
        .rotate()
        .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: QUALITY })
        .toBuffer();
      const roomKey = nextCtx.roomKey || 'room';
      const photoId = slug(node.id) !== 'room' ? slug(node.id) : makePhotoId(node.url.slice(0, 200));
      const path = `${inspectionId}/${roomKey}/${photoId}.jpg`;
      if (COMMIT) {
        const { error } = await sb.storage.from(BUCKET).upload(path, out, {
          contentType: 'image/jpeg', upsert: true,
        });
        if (error) throw new Error(`upload ${path}: ${error.message}`);
        delete node.url;
        node.storageKey = path;
      }
      results.push({ bytesIn, bytesOut: out.length, path });
    }
  }

  for (const [k, v] of Object.entries(node)) {
    if (k === 'url') continue;
    await processNode(v, nextCtx, inspectionId, results);
  }
}

// ── main ────────────────────────────────────────────────────────────────
const { error: authErr } = await sb.auth.signInWithPassword({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
if (authErr) { console.error('Admin login failed:', authErr.message); process.exit(1); }
console.log(`Signed in as ${ADMIN_EMAIL}`);
console.log(COMMIT ? '*** COMMIT MODE — writing changes ***' : '--- DRY RUN (no writes) — pass --commit to apply ---');
console.log(`Resize: longest edge <= ${MAX_EDGE}px, JPEG q${QUALITY}\n`);

const { data: rows, error } = await sb.from('inspections').select('id, room_inspections');
if (error) { console.error('Fetch inspections failed:', error.message); process.exit(1); }

let totalPhotos = 0, totalIn = 0, totalOut = 0, changedRows = 0;

for (const row of rows) {
  if (!row.room_inspections) continue;
  const before = JSON.stringify(row.room_inspections);
  if (!before.includes('data:image')) continue;

  const clone = JSON.parse(before);
  const results = [];
  try {
    await processNode(clone, { roomKey: null }, row.id, results);
  } catch (e) {
    console.error(`  ✗ ${row.id.slice(0, 8)}: ${e.message}`);
    continue;
  }
  if (results.length === 0) continue;

  const inSum = results.reduce((a, r) => a + r.bytesIn, 0);
  const outSum = results.reduce((a, r) => a + r.bytesOut, 0);
  totalPhotos += results.length; totalIn += inSum; totalOut += outSum;

  if (COMMIT) {
    const { error: upErr } = await sb.from('inspections').update({ room_inspections: clone }).eq('id', row.id);
    if (upErr) { console.error(`  ✗ update ${row.id.slice(0, 8)}: ${upErr.message}`); continue; }
    changedRows += 1;
  }
  console.log(`  ${COMMIT ? '✓' : '·'} ${row.id.slice(0, 8)}  ${results.length} photo(s)  ${(inSum/1024).toFixed(0)}kB → ${(outSum/1024).toFixed(0)}kB`);
}

console.log(`\nTotals: ${totalPhotos} photos across ${rows.length} inspections`);
console.log(`  ${(totalIn/1024/1024).toFixed(2)} MB → ${(totalOut/1024/1024).toFixed(2)} MB embedded (saved ${((totalIn-totalOut)/1024/1024).toFixed(2)} MB)`);
if (COMMIT) console.log(`  Updated ${changedRows} inspection rows; base64 removed from DB, photos now in bucket.`);
else console.log('  DRY RUN — re-run with --commit to apply.');

await sb.auth.signOut();
