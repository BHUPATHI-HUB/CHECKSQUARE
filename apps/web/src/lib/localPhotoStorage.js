// localPhotoStorage — photo persistence for the offline-admin Android build.
//
// Saves each inspection photo to the device filesystem via the Capacitor
// Filesystem plugin and returns a record that stores only a FILE PATH — never
// base64 inside the inspection JSON (that anti-pattern bloats the SQLite row
// and is explicitly avoided here). The bytes live on disk; the JSON keeps a
// pointer.
//
// Record shape stored in SQLite (inside roomInspections / cornerPhotos etc.):
//     { id, filePath, capturedAt }
//
// Rendering resolves filePath → a WebView-safe URL via Capacitor.convertFileSrc.
// PDF/DOCX export reads the file back as a base64 data-URL on demand.
//
// Web fallback (desktop `npm run dev`, no native plugin): stores a base64
// data-URL on the record so the UI still works while developing. Production
// APK always takes the filesystem path.

const PHOTO_DIR = 'checksquare-photos';

const makePhotoId = () => `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const guessExtension = (file) => {
  const fromName = (file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 4) return fromName;
  const fromType = (file?.type || '').split('/').pop()?.toLowerCase();
  return fromType || 'jpg';
};

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => {
    const r = String(reader.result || '');
    const comma = r.indexOf(',');
    resolve(comma >= 0 ? r.slice(comma + 1) : r);
  };
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const fileToDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

async function nativeParts() {
  const { Capacitor } = await import('@capacitor/core');
  if (!Capacitor?.isNativePlatform?.()) return null;
  const { Filesystem, Directory } = await import('@capacitor/filesystem');
  return { Capacitor, Filesystem, Directory };
}

export async function uploadInspectionPhoto(file, { inspectionId = 'draft', roomKey = 'misc' } = {}) {
  const id = makePhotoId();
  const capturedAt = new Date().toISOString();
  const parts = await nativeParts();

  // Web / dev fallback — no native filesystem available.
  if (!parts) {
    const url = await fileToDataUrl(file);
    return { id, url, capturedAt, _legacy: true };
  }

  const { Filesystem, Directory } = parts;
  const ext = guessExtension(file);
  const safeRoom = String(roomKey).replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const safeInsp = String(inspectionId || 'draft').replace(/[^a-z0-9_-]+/gi, '-');
  const filePath = `${PHOTO_DIR}/${safeInsp}/${safeRoom}/${id}.${ext}`;
  const base64 = await blobToBase64(file);

  await Filesystem.writeFile({
    path: filePath,
    data: base64,
    directory: Directory.Data,
    recursive: true,
  });

  return { id, filePath, capturedAt };
}

// Resolve a stored photo into a URL the WebView can render.
export async function getInspectionPhotoUrl(photo) {
  if (!photo) return '';
  if (photo.url) return photo.url;
  if (!photo.filePath) return '';
  const parts = await nativeParts();
  if (!parts) return '';
  const { Capacitor, Filesystem, Directory } = parts;
  try {
    const { uri } = await Filesystem.getUri({ path: photo.filePath, directory: Directory.Data });
    return Capacitor.convertFileSrc(uri);
  } catch {
    return '';
  }
}

// Read the file back as a base64 data-URL for self-contained PDF/DOCX export.
export async function getInspectionPhotoDataUrl(photo) {
  if (!photo) return '';
  if (photo.url) return photo.url;
  if (!photo.filePath) return '';
  const parts = await nativeParts();
  if (!parts) return '';
  const { Filesystem, Directory } = parts;
  try {
    const { data } = await Filesystem.readFile({ path: photo.filePath, directory: Directory.Data });
    return `data:image/jpeg;base64,${data}`;
  } catch {
    return '';
  }
}

// Permanently delete a photo file from disk.
export async function deleteInspectionPhoto(photo) {
  if (!photo?.filePath) return;
  const parts = await nativeParts();
  if (!parts) return;
  const { Filesystem, Directory } = parts;
  try {
    await Filesystem.deleteFile({ path: photo.filePath, directory: Directory.Data });
  } catch { /* already gone — ignore */ }
}

// Walk an inspection tree and inline every filePath photo as a base64 dataURL
// so the report generator can keep using `photo.url` unchanged.
export async function materializeInspectionPhotos(inspection) {
  if (!inspection) return inspection;
  const clone = JSON.parse(JSON.stringify(inspection));
  const queue = [];
  const visit = (val) => {
    if (!val || typeof val !== 'object') return;
    if (val.filePath && !val.url) queue.push(val);
    if (Array.isArray(val)) val.forEach(visit);
    else Object.values(val).forEach(visit);
  };
  visit(clone);
  for (const p of queue) {
    // eslint-disable-next-line no-await-in-loop
    p.url = await getInspectionPhotoDataUrl(p);
  }
  return clone;
}

export default {
  uploadInspectionPhoto,
  getInspectionPhotoUrl,
  getInspectionPhotoDataUrl,
  deleteInspectionPhoto,
  materializeInspectionPhotos,
};
