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
// Use this in place of every `<img src={photo.url}>` in the codebase so the
// rest of the app stays oblivious to whether Supabase is wired up or not.

import React, { useEffect, useState } from 'react';
import { getInspectionPhotoUrl } from '@/lib/supabasePhotoStorage.js';

const PhotoImg = ({ photo, alt = 'photo', className = '', loading = 'lazy', ...rest }) => {
  const [src, setSrc] = useState(photo?.url || '');

  useEffect(() => {
    let cancelled = false;
    if (photo?.url) { setSrc(photo.url); return undefined; }
    if (photo?.storageKey) {
      getInspectionPhotoUrl(photo).then((u) => { if (!cancelled) setSrc(u); });
    }
    return () => { cancelled = true; };
  }, [photo?.url, photo?.storageKey]);

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
  return <img src={src} alt={alt} className={className} loading={loading} {...rest} />;
};

export default PhotoImg;
