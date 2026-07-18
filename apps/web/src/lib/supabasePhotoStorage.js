// Photo storage helper — uploads inspection photos to Supabase Storage and
// returns a stable object key.  The caller stores `{ id, storageKey, capturedAt }`
// inside `roomInspections` JSON instead of the old base64 data-URL.
//
// Behaviour:
//   • If Supabase is configured  → upload to bucket `inspection-photos`, return key.
//   • If Supabase is NOT configured → fall back to legacy base64 dataURL so the
//     existing PocketBase-only flow keeps working.  This lets developers ship
//     the migration in stages and lets the offline PWA degrade gracefully.
//
// Signed-read URLs are generated on demand via getInspectionPhotoUrl() — the
// bucket is PRIVATE; only the signed URL grants short-lived access.
//
// All photo paths follow the convention:
//     <inspectionId>/<roomKey>/<photoId>.<ext>
// so that PocketBase row-level rules can authorise reads (`inspectionId` is
// validated against the inspector's ownership before a signed URL is minted
// by the `supabase-storage.pb.js` PB hook).

import { supabase, isSupabaseConfigured, SUPABASE_PHOTO_BUCKET } from '@/lib/supabaseClient.js';

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 h
const PB_BASE_URL = (import.meta.env?.VITE_PB_URL || 'http://127.0.0.1:8090').replace(/\/$/, '');

// Legacy fallback: read entire file as base64 data-URL (drop-in for the old
// fileToDataUrl() helper inside RoomPhotoManager.jsx).
const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const guessExtension = (file) => {
  const fromName = (file.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 4) return fromName;
  const fromType = (file.type || '').split('/').pop()?.toLowerCase();
  return fromType || 'jpg';
};

const makePhotoId = () =>
  `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * Upload an inspection photo.
 *
 * @param {File|Blob} file       — what the camera/file-input produced
 * @param {Object}    ctx
 * @param {string}    ctx.inspectionId — id of the parent inspection (empty for drafts is OK)
 * @param {string}    ctx.roomKey      — slug of the room (e.g. "kitchen", "bathroom_01")
 * @returns {Promise<{id, storageKey?, url?, capturedAt}>}
 *           — storageKey when Supabase succeeded; url when falling back to base64.
 */
export async function uploadInspectionPhoto(file, { inspectionId = 'draft', roomKey = 'misc' } = {}) {
  const id = makePhotoId();
  const capturedAt = new Date().toISOString();

  // Fallback path keeps the old behaviour alive when Supabase isn't set up yet.
  if (!isSupabaseConfigured) {
    const url = await fileToDataUrl(file);
    return { id, url, capturedAt, _legacy: true };
  }

  const ext = guessExtension(file);
  // Sanitise — Supabase Storage rejects spaces / unicode in keys.
  const safeRoom = String(roomKey).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const safeInsp = String(inspectionId || 'draft').replace(/[^a-z0-9_-]+/gi, '-');
  const path = `${safeInsp}/${safeRoom}/${id}.${ext}`;

  // Ask the PocketBase hook to validate the upload (the inspector must own the
  // inspection) and mint a signed-upload URL.  The hook returns:
  //   { token: string, path: string }
  // which the official SDK consumes via uploadToSignedUrl().
  let signed;
  try {
    const res = await fetch(`${PB_BASE_URL}/api/supabase/signed-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, inspectionId, contentType: file.type || 'image/jpeg' }),
    });
    if (!res.ok) {
      throw new Error(`signed-upload failed (${res.status})`);
    }
    signed = await res.json();
  } catch (e) {
    // PB hook missing or refused — fall back to base64 so the form still works.
    // (Logged but non-fatal — Phase 1 is additive.)
    console.warn('[supabase] signed-upload mint failed, falling back to base64:', e?.message || e);
    const url = await fileToDataUrl(file);
    return { id, url, capturedAt, _legacy: true };
  }

  const { error: upErr } = await supabase
    .storage
    .from(SUPABASE_PHOTO_BUCKET)
    .uploadToSignedUrl(signed.path, signed.token, file, {
      contentType: file.type || 'image/jpeg',
      upsert: false,
    });

  if (upErr) {
    console.error('[supabase] upload failed:', upErr);
    // Final fallback so the inspector never loses the photo.
    const url = await fileToDataUrl(file);
    return { id, url, capturedAt, _legacy: true };
  }

  return { id, storageKey: signed.path, capturedAt };
}

/**
 * Resolve a stored photo into a renderable URL.
 *
 * `photo` may be either:
 *   - { url }          — legacy base64 / external URL  → returned as-is
 *   - { storageKey }   — Supabase-managed              → short-lived signed URL
 */
export async function getInspectionPhotoUrl(photo) {
  if (!photo) return '';
  if (photo.url) return photo.url;
  if (!photo.storageKey || !isSupabaseConfigured) return '';
  const { data, error } = await supabase
    .storage
    .from(SUPABASE_PHOTO_BUCKET)
    .createSignedUrl(photo.storageKey, SIGNED_URL_TTL_SECONDS);
  if (error) {
    console.error('[supabase] signed read URL failed:', error);
    return '';
  }
  return data?.signedUrl || '';
}

/** Permanently delete a photo (called from RoomPhotoManager onRemove). */
export async function deleteInspectionPhoto(photo) {
  if (!photo?.storageKey || !isSupabaseConfigured) return;
  await supabase.storage.from(SUPABASE_PHOTO_BUCKET).remove([photo.storageKey]);
}

/**
 * Fetch the bytes of a Supabase-stored photo and return a base64 data-URL.
 * Used by the PDF/DOCX generator (signed URLs expire in 1 h — embedding the
 * bytes guarantees the report stays self-contained).
 */
export async function getInspectionPhotoDataUrl(photo) {
  if (!photo) return '';
  if (photo.url) return photo.url;            // already a dataURL or external URL
  const signed = await getInspectionPhotoUrl(photo);
  if (!signed) return '';
  const res = await fetch(signed);
  if (!res.ok) return '';
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Walks an inspection JSON tree and, for any photo with a `storageKey` but no
 * `url`, sets `photo.url` to a freshly fetched base64 dataURL.  Call this
 * ONCE at the start of report generation so the rest of the generator can
 * continue to use `photo.url` exactly as it did before Supabase.
 *
 * Returns a DEEP CLONE — mutating the live inspection object while the PDF
 * is still rendering would cause flicker and racy re-renders.  The caller
 * should treat the returned object as a snapshot.
 */
export async function materializeInspectionPhotos(inspection) {
  if (!inspection) return inspection;

  // Defensive deep-clone — caller's React state stays pristine.
  const clone = JSON.parse(JSON.stringify(inspection));

  const queue = [];
  const visit = (val) => {
    if (!val || typeof val !== 'object') return;
    if (val.storageKey && !val.url) queue.push(val);
    if (Array.isArray(val)) val.forEach(visit);
    else Object.values(val).forEach(visit);
  };
  visit(clone);

  // Fetch in parallel but cap concurrency to 8 so we don't hammer Supabase.
  const CONCURRENCY = 8;
  for (let i = 0; i < queue.length; i += CONCURRENCY) {
    const slice = queue.slice(i, i + CONCURRENCY);
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(slice.map(async (photo) => {
      const dataUrl = await getInspectionPhotoDataUrl(photo);
      if (dataUrl) photo.url = dataUrl;
    }));
  }
  return clone;
}
