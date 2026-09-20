// PhotoImg — single source of truth for rendering an inspection photo.
//
// Accepts photos in any of three shapes:
//   • legacy base64    →  { url: "data:image/..." }
//   • Supabase Storage →  { storageKey: "<insp>/<room>/<id>.<ext>" }
//   • external URL     →  { url: "https://..." }
//
// For storageKey-only photos it asynchronously resolves a 1-hour signed URL
// via `getInspectionPhotoUrl` from the Supabase storage helper.
//
// Default `fit="contain"` shows the FULL captured image (no cropping) and
// fills the leftover space with a subtle background so defects, room
// corners, switchboards etc. stay readable in any aspect ratio.  Pass
// `fit="cover"` for decorative banners where cropping is wanted.

import React, { useEffect, useState } from 'react';
import { getInspectionPhotoUrl } from '@/lib/supabasePhotoStorage.js';

const PhotoImg = ({
  photo,
  alt = 'photo',
  className = '',
  fit = 'contain',
  loading = 'lazy',
  ...rest
}) => {
  const [src, setSrc] = useState(photo?.url || '');
  const [failed, setFailed] = useState(false);
  // Re-fetch the signed URL once if the browser returns 404 — Supabase
  // signed URLs expire after 1 h, and a long inspector session can outlive
  // the original mint.  The retry flag short-circuits infinite loops.
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setRetried(false);
    setFailed(false);
    setSrc(photo?.url || '');
    if (photo?.url) { setSrc(photo.url); return undefined; }
    // Offline-admin build: photos live on the device filesystem and are
    // stored as { filePath }. Resolve to a WebView-safe URI.
    if (photo?.filePath) {
      getInspectionPhotoUrl(photo).then((u) => { if (!cancelled) { setSrc(u); setFailed(!u); } }).catch(() => { if (!cancelled) setFailed(true); });
      return () => { cancelled = true; };
    }
    if (photo?.storageKey) {
      getInspectionPhotoUrl(photo).then((u) => { if (!cancelled) { setSrc(u); setFailed(!u); } }).catch(() => { if (!cancelled) setFailed(true); });
    } else {
      setFailed(true);
    }
    return () => { cancelled = true; };
  }, [photo?.url, photo?.storageKey, photo?.filePath]);

  const handleError = async () => {
    if (retried || !(photo?.storageKey || photo?.filePath)) { setFailed(true); return; }
    setRetried(true);
    try {
      const fresh = await getInspectionPhotoUrl(photo);
      if (fresh) setSrc(`${fresh}#r=${Date.now()}`);
      else setFailed(true);
    } catch { setFailed(true); }
  };

  // Default container shading helps `object-contain` letterboxing look
  // intentional instead of broken.  Callers can override by passing their
  // own background class in `className`.
  const fitClass = fit === 'cover' ? 'object-cover' : 'object-contain bg-muted/30';

  if (failed) {
    return <div className={`flex items-center justify-center border border-dashed bg-muted/30 p-3 text-center text-xs text-muted-foreground ${className}`} role="img" aria-label={`${alt}: unavailable`} {...rest}>Photo unavailable</div>;
  }
  if (!src) {
    return (
      <div
        className={`bg-muted animate-pulse ${className}`}
        aria-label={alt}
        role="img"
        {...rest}
      />
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      className={`${fitClass} ${className}`}
      loading={loading}
      decoding="async"
      onError={handleError}
      {...rest}
    />
  );
};

export default PhotoImg;
