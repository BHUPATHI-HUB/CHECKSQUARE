// Comment Library: canonical shape is a flat array of
//   { id, classify, text, severity }
// We accept the legacy object shape { [roomKey]: [string|{text,severity}] }
// and the new array shape, and always return the array form.

export const SEVERITY_NORMALIZE = {
  major: 'Major',
  minor: 'Minor',
  cosmetic: 'Cosmetic',
};

export const normalizeSeverity = (raw) => {
  if (!raw) return '';
  const key = String(raw).trim().toLowerCase();
  return SEVERITY_NORMALIZE[key] || (raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase());
};

let _idSeq = 0;
const nextId = () => `cl_${Date.now().toString(36)}_${(_idSeq++).toString(36)}`;

export const normalizeCommentLibrary = (lib) => {
  if (!lib) return [];
  if (Array.isArray(lib)) {
    return lib
      .filter((e) => e && (e.text || e.comment))
      .map((e) => ({
        id: e.id || nextId(),
        classify: (e.classify || e.category || 'General').trim(),
        text: (e.text || e.comment || '').trim(),
        severity: normalizeSeverity(e.severity || e.type || ''),
      }));
  }
  if (typeof lib === 'object') {
    const out = [];
    for (const [classify, items] of Object.entries(lib)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (typeof item === 'string') {
          out.push({ id: nextId(), classify, text: item, severity: '' });
        } else if (item && (item.text || item.comment)) {
          out.push({
            id: item.id || nextId(),
            classify,
            text: (item.text || item.comment).trim(),
            severity: normalizeSeverity(item.severity || item.type || ''),
          });
        }
      }
    }
    return out;
  }
  return [];
};

export const groupByClassify = (entries) => {
  const map = new Map();
  for (const e of entries) {
    if (!map.has(e.classify)) map.set(e.classify, []);
    map.get(e.classify).push(e);
  }
  return map;
};

export const getClassifications = (entries) =>
  Array.from(new Set(entries.map((e) => e.classify).filter(Boolean))).sort();

// ─── CSV helpers ──────────────────────────────────────────────────────────
// Tolerant CSV parser: handles quoted fields with commas/newlines and doubled quotes.
export const parseCSV = (text) => {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  const src = String(text || '').replace(/\r\n?/g, '\n');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c && c.trim() !== ''));
};

// Convert parsed rows (with header) to comment library entries.
// Expected headers (case/space insensitive): S.no, Classify, Comment, Type
// Missing Classify cells inherit the most recent non-empty Classify (matches
// the merged-cell layout in the user's spreadsheet).
export const csvRowsToLibrary = (rows) => {
  if (!rows || rows.length === 0) return [];
  const header = rows[0].map((h) => String(h || '').trim().toLowerCase());
  const idxClassify = header.findIndex((h) => h.includes('classif') || h === 'category');
  const idxComment  = header.findIndex((h) => h.includes('comment') || h.includes('defect'));
  const idxType     = header.findIndex((h) => h.includes('type') || h.includes('sever'));
  if (idxComment === -1) return [];

  let lastClassify = 'General';
  const out = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const classifyRaw = idxClassify >= 0 ? String(row[idxClassify] || '').trim() : '';
    const comment = String(row[idxComment] || '').trim();
    const type    = idxType >= 0 ? String(row[idxType] || '').trim() : '';
    if (classifyRaw) lastClassify = classifyRaw;
    if (!comment) continue;
    out.push({
      id: nextId(),
      classify: lastClassify,
      text: comment,
      severity: normalizeSeverity(type),
    });
  }
  return out;
};

export const libraryToCSV = (entries) => {
  const escape = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const head = 'S.no,Classify,Comment,Type';
  const body = entries.map((e, i) =>
    [i + 1, e.classify, e.text, e.severity].map(escape).join(',')
  ).join('\n');
  return `${head}\n${body}\n`;
};

export const downloadCSV = (filename, content) => {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// A starter library matching the CHECK SQUARE checklist layout in the spec.
export const STARTER_COMMENT_LIBRARY = [
  // Flooring
  { classify: 'Flooring', text: 'Hallow observed on floor tiles', severity: 'Major' },
  { classify: 'Flooring', text: 'Crack observed on floor tiles', severity: 'Major' },
  { classify: 'Flooring', text: 'Shade variations observed on floor tile', severity: 'Major' },
  { classify: 'Flooring', text: 'Damage observed on floor tiles', severity: 'Major' },
  { classify: 'Flooring', text: 'Offset observed in floor tiles', severity: 'Minor' },
  { classify: 'Flooring', text: 'Chip off observed on floor tiles', severity: 'Minor' },
  { classify: 'Flooring', text: 'Gap observed between floor tiles', severity: 'Minor' },
  // Skirting
  { classify: 'Skirting', text: 'Gap observed in between skirtings', severity: 'Minor' },
  { classify: 'Skirting', text: 'Chip off observed on skirting', severity: 'Minor' },
  { classify: 'Skirting', text: 'Gap observed between frame and skirting', severity: 'Minor' },
  { classify: 'Skirting', text: 'Scratches observed on floor tiles', severity: 'Cosmetic' },
  { classify: 'Skirting', text: 'Stains observed on floor tiles', severity: 'Cosmetic' },
  { classify: 'Skirting', text: 'Crack observed observed on skirting tile', severity: 'Major' },
  // Dado Tiles
  { classify: 'Dado Tiles', text: 'Hallow observed on dado tiles', severity: 'Major' },
  { classify: 'Dado Tiles', text: 'Crack observed on dado tiles', severity: 'Major' },
  { classify: 'Dado Tiles', text: 'Gap observed between dado tiles', severity: 'Minor' },
  { classify: 'Dado Tiles', text: 'Offset observed on dado tile', severity: 'Minor' },
  { classify: 'Dado Tiles', text: 'Chip off observed on dado tiles', severity: 'Minor' },
  { classify: 'Dado Tiles', text: 'Gap observed between Frame and wall', severity: 'Major' },
  { classify: 'Dado Tiles', text: 'Cut out finish need to be done for tile', severity: 'Minor' },
  // Frame and Shutter
  { classify: 'Frame and Shutter', text: 'Crack observed on frame', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Nails observed on frame', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Frame edge finish not satisfactory', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Frame polishing need to be done', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Screw cap missing', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Scratches observed on frame', severity: 'Cosmetic' },
  { classify: 'Frame and Shutter', text: 'Damage observed on shutter', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Crack observed on shutter', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Tower bolt not working properly', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Lock set not functioning properly', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Stains observed on hard ware', severity: 'Cosmetic' },
  { classify: 'Frame and Shutter', text: 'Shutter touched frame while closing it', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Scratches observed on shutter', severity: 'Cosmetic' },
  { classify: 'Frame and Shutter', text: 'Shutter edge finish not satisfactory', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Shutter side polishing need to be done', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Handle not fixed in level', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Low magnetic ether', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Hardware loosely fixed', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Bend observed on shutter', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Gasket not fixed properly', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Hinges screw missing', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Gap observed between frame joints', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Bedding not fixed properly', severity: 'Major' },
  { classify: 'Frame and Shutter', text: 'Noise observed while operating shutter', severity: 'Minor' },
  { classify: 'Frame and Shutter', text: 'Gap observed between frame and bedding', severity: 'Minor' },
  // Windows
  { classify: 'Windows', text: 'Scratches observed on glass', severity: 'Cosmetic' },
  { classify: 'Windows', text: 'Stains observed on glass', severity: 'Cosmetic' },
  { classify: 'Windows', text: 'Noise observed while operating window', severity: 'Major' },
  { classify: 'Windows', text: 'Sealant application not done properly', severity: 'Minor' },
  { classify: 'Windows', text: 'Stains observed on frame', severity: 'Cosmetic' },
  { classify: 'Windows', text: 'Screw cap missing', severity: 'Minor' },
  { classify: 'Windows', text: 'Dents observed on frame', severity: 'Minor' },
  { classify: 'Windows', text: 'Damage observed on frame', severity: 'Major' },
  { classify: 'Windows', text: 'Gasket not fixed properly', severity: 'Minor' },
  { classify: 'Windows', text: 'Fly mesh not fixed tightly', severity: 'Minor' },
  { classify: 'Windows', text: 'Damage observed on mesh', severity: 'Minor' },
  { classify: 'Windows', text: 'Lock set not functioning properly', severity: 'Major' },
  // Wall and Ceiling
  { classify: 'Wall and Ceiling', text: 'Surface finish not uniform', severity: 'Minor' },
  { classify: 'Wall and Ceiling', text: 'Shade variation observed on wall surface', severity: 'Minor' },
  { classify: 'Wall and Ceiling', text: 'Crack observed on wall surface', severity: 'Major' },
  { classify: 'Wall and Ceiling', text: 'Undulations observed on wall surface', severity: 'Minor' },
  { classify: 'Wall and Ceiling', text: 'Paint peel off observed on wall surface', severity: 'Major' },
  { classify: 'Wall and Ceiling', text: 'Edge finish not staisfactory', severity: 'Minor' },
  { classify: 'Wall and Ceiling', text: 'Dampness observed on wall surafce', severity: 'Major' },
  { classify: 'Wall and Ceiling', text: 'Stains observed on wall surafce', severity: 'Cosmetic' },
  { classify: 'Wall and Ceiling', text: 'Undulations observed on ceiling', severity: 'Major' },
  { classify: 'Wall and Ceiling', text: 'Dampness observed on ceiling', severity: 'Major' },
  // Electricity
  { classify: 'Electricity', text: 'Switch board not fixed in level', severity: 'Minor' },
  { classify: 'Electricity', text: 'Gap observed between wall and switch baord', severity: 'Minor' },
  { classify: 'Electricity', text: 'Noise observed while operating switches', severity: 'Minor' },
  { classify: 'Electricity', text: 'Switch not fixed properly', severity: 'Minor' },
  { classify: 'Electricity', text: 'Damage observed on fan regulator', severity: 'Major' },
  { classify: 'Electricity', text: 'Earthing issue observed in socket', severity: 'Major' },
  { classify: 'Electricity', text: 'Open ground issue observed in socket', severity: 'Major' },
  { classify: 'Electricity', text: 'Stains observed on switch baord', severity: 'Cosmetic' },
];
