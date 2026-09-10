// ExcelReportGenerator — builds a rich, multi-sheet .xlsx inspection report
// that mirrors the PDF/DOCX: an executive Summary (with a score donut + a
// defect-severity bar chart), a per-room Score breakdown (+ bar chart), Area
// calculations & property metrics, Water quality, the full photo log, and a
// Severity taxonomy reference.
//
// Why a separate lib: the project's `xlsx` (SheetJS community) cannot embed
// images. `exceljs` can, so the Excel export uses it. exceljs is imported
// dynamically so it never bloats the main bundle.
//
// exceljs cannot author native Excel charts, so every "graph" here is rendered
// to a <canvas> and embedded as a crisp PNG image — visually identical to a
// chart, and works in Excel / Google Sheets / LibreOffice with no dependencies.
//
// Sizing: Excel renders images at 96 DPI, so 1 cm = 96/2.54 ≈ 37.795 px.

import { materializeInspectionPhotos } from '@/lib/supabasePhotoStorage.js';
import saveFile from '@/utils/saveFile.js';
import {
  computeInspectionScore,
  PROPCHK_PRIORITY_META,
} from '@/utils/scoring.js';

const CM_TO_PX = 96 / 2.54; // ≈ 37.7953

// ─── Area math (kept local to avoid coupling) ────────────────────────────
const UNIT_FACTOR_TO_FEET = { ft: 1, in: 1 / 12, m: 3.28084, cm: 0.0328084 };
const computeAreaSft = (length, width, lengthUnit = 'ft', widthUnit = 'ft') => {
  const L = parseFloat(length) || 0;
  const W = parseFloat(width) || 0;
  const lf = L * (UNIT_FACTOR_TO_FEET[lengthUnit] || 1);
  const wf = W * (UNIT_FACTOR_TO_FEET[widthUnit] || 1);
  return Math.round(lf * wf * 100) / 100;
};

const buildAreaGroups = (areas = []) => {
  const groups = [];
  let i = 0;
  while (i < areas.length) {
    const first = areas[i] || {};
    const room = String(first.room || first.name || '').trim();
    let j = i + 1;
    while (j < areas.length) {
      const nextRoom = String(areas[j]?.room || areas[j]?.name || '').trim();
      if (nextRoom !== room) break;
      j += 1;
    }
    groups.push({ room, rows: areas.slice(i, j) });
    i = j;
  }
  return groups;
};

const loadImage = (dataUrl) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = dataUrl;
});

const hexToArgb = (hex, fallback = 'FF2DB4C6') => {
  if (!hex || typeof hex !== 'string') return fallback;
  const h = hex.replace('#', '').trim();
  if (h.length === 6) return `FF${h.toUpperCase()}`;
  if (h.length === 3) return `FF${h.split('').map((c) => c + c).join('').toUpperCase()}`;
  return fallback;
};

// ─── Chart renderers (canvas → base64 PNG), supersampled 2× for print ────
function renderDonut(percent, { size = 240, color = '#2DB4C6', subtitle = '' } = {}) {
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = size * scale;
  canvas.height = size * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 22;
  const lw = 26;
  const pct = Math.max(0, Math.min(100, Number(percent) || 0));
  const start = -Math.PI / 2;

  ctx.lineWidth = lw;
  ctx.strokeStyle = '#eef2f4';
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + Math.PI * 2 * (pct / 100));
  ctx.stroke();

  ctx.fillStyle = '#111827';
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.round(size * 0.24)}px Arial`;
  ctx.fillText(String(Math.round(pct)), cx, cy + (subtitle ? size * 0.02 : size * 0.09));
  if (subtitle) {
    ctx.fillStyle = '#6b7280';
    ctx.font = `${Math.round(size * 0.06)}px Arial`;
    ctx.fillText(subtitle, cx, cy + size * 0.22);
  }

  const out = canvas.toDataURL('image/png');
  const m = /^data:[^;]+;base64,(.+)$/.exec(out);
  return m ? { base64: m[1], wPx: size, hPx: size } : null;
}

function renderBarChart(items, { width = 720, height = 320, title = '', max } = {}) {
  const list = (items || []).filter(Boolean);
  if (list.length === 0) return null;
  const scale = 2;
  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  const pad = { l: 44, r: 16, t: title ? 34 : 16, b: 78 };
  const chartW = width - pad.l - pad.r;
  const chartH = height - pad.t - pad.b;
  const maxV = max || Math.max(1, ...list.map((i) => Number(i.value) || 0));

  const steps = 5;
  ctx.font = '11px Arial';
  ctx.strokeStyle = '#e5e7eb';
  ctx.lineWidth = 1;
  ctx.textAlign = 'right';
  for (let s = 0; s <= steps; s += 1) {
    const y = pad.t + chartH - (chartH * s) / steps;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + chartW, y);
    ctx.stroke();
    ctx.fillStyle = '#9ca3af';
    ctx.fillText(String(Math.round((maxV * s) / steps)), pad.l - 6, y + 4);
  }

  const n = list.length;
  const gap = n > 12 ? 6 : 14;
  const bw = Math.max(5, (chartW - gap * n) / n);
  list.forEach((it, i) => {
    const x = pad.l + gap / 2 + i * (bw + gap);
    const h = Math.max(0, ((Number(it.value) || 0) / maxV) * chartH);
    const y = pad.t + chartH - h;
    ctx.fillStyle = it.color || '#2DB4C6';
    ctx.fillRect(x, y, bw, h);

    ctx.fillStyle = '#111827';
    ctx.textAlign = 'center';
    ctx.font = 'bold 10px Arial';
    ctx.fillText(String(Math.round(Number(it.value) || 0)), x + bw / 2, y - 4);

    ctx.save();
    ctx.translate(x + bw / 2, pad.t + chartH + 8);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#374151';
    ctx.font = '10px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(String(it.label || '').slice(0, 20), 0, 0);
    ctx.restore();
  });

  if (title) {
    ctx.fillStyle = '#111827';
    ctx.textAlign = 'left';
    ctx.font = 'bold 13px Arial';
    ctx.fillText(title, pad.l, 20);
  }

  const out = canvas.toDataURL('image/png');
  const m = /^data:[^;]+;base64,(.+)$/.exec(out);
  return m ? { base64: m[1], wPx: width, hPx: height } : null;
}

// Place a chart image with an absolute anchor (does not resize cells); returns
// how many spreadsheet rows to skip to clear it (~18px per default row).
function placeImage(ws, wb, processed, { col = 0, row }) {
  if (!processed) return 0;
  const imgId = wb.addImage({ base64: processed.base64, extension: 'png' });
  ws.addImage(imgId, {
    tl: { col, row },
    ext: { width: processed.wPx, height: processed.hPx },
    editAs: 'absolute',
  });
  return Math.ceil(processed.hPx / 18) + 1;
}

const titleCell = (ws, r, text, argb) => {
  ws.mergeCells(r, 1, r, 6);
  const c = ws.getCell(r, 1);
  c.value = text;
  c.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
  c.alignment = { vertical: 'middle' };
  ws.getRow(r).height = 22;
};

// Render a photo to its final Excel size WITHOUT distortion.
//   cover   → crop to fill the box (uniform grid, some edges cropped)
//   contain → fit inside the box, ext = the fitted size (no crop, no stretch)
// Supersamples 2× for print sharpness and re-encodes JPEG at `quality`.
// Returns { base64, wPx, hPx } (display pixels) or null.
async function processForExcel(dataUrl, boxWpx, boxHpx, fit, quality) {
  let img;
  try { img = await loadImage(dataUrl); } catch { return null; }
  const sw = img.naturalWidth, sh = img.naturalHeight;
  if (!sw || !sh) return null;
  const scale = 2;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  let outW, outH;
  if (fit === 'cover') {
    outW = boxWpx; outH = boxHpx;
    canvas.width = boxWpx * scale;
    canvas.height = boxHpx * scale;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const cs = Math.max(canvas.width / sw, canvas.height / sh);
    const dw = sw * cs, dh = sh * cs;
    ctx.drawImage(img, 0, 0, sw, sh, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  } else {
    const cs = Math.min(boxWpx / sw, boxHpx / sh);
    outW = Math.max(1, Math.round(sw * cs));
    outH = Math.max(1, Math.round(sh * cs));
    canvas.width = outW * scale;
    canvas.height = outH * scale;
    ctx.drawImage(img, 0, 0, sw, sh, 0, 0, canvas.width, canvas.height);
  }
  const q = Math.min(1, Math.max(0.4, Number(quality) || 0.86));
  const out = canvas.toDataURL('image/jpeg', q);
  const m = /^data:[^;]+;base64,(.+)$/.exec(out);
  return m ? { base64: m[1], wPx: outW, hPx: outH } : null;
}

/**
 * Build the inspection workbook as a Blob (does not trigger a download).
 * @param {object} inspection  full inspection (roomInspections must be present)
 * @param {object} settings    app settings (reads reportImages.box{Width,Height}Cm)
 * @returns {Promise<Blob>}
 */
export async function buildXLSXBlob(inspection, settings) {
  const ExcelJS = (await import('exceljs')).default;

  // Resolve storageKey/filePath-only photos to inline base64 first —
  // exceljs needs the actual bytes, and signed URLs can expire mid-build.
  await materializeInspectionPhotos(inspection);

  const ri = settings?.reportImages || {};
  const boxW = Number(ri.boxWidthCm) || 8.45;
  const boxH = Number(ri.boxHeightCm) || 6.4;
  const fit = ri.fit === 'cover' ? 'cover' : 'contain';
  const quality = Math.min(1, Math.max(0.4, Number(ri.quality) || 0.86));
  const imgWpx = Math.round(boxW * CM_TO_PX);
  const imgHpx = Math.round(boxH * CM_TO_PX);
  const photoColWidthChars = Math.max(20, (imgWpx - 5) / 7);

  const primaryHex = settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6';
  const primary = hexToArgb(primaryHex);

  const meta = inspection.metadata || {};
  const rooms = Array.isArray(inspection.roomInspections) ? inspection.roomInspections : [];

  // Severity metadata (name → color / definition) from settings.
  const severityLevels = Array.isArray(settings?.severityLevels) ? settings.severityLevels : [];
  const sevColor = (name) => {
    const s = severityLevels.find((x) => x && x.name === name);
    if (s?.color) return s.color;
    if (name === 'Major') return '#dc2626';
    if (name === 'Minor') return '#f59e0b';
    if (name === 'Cosmetic') return '#a3a3a3';
    return '#9ca3af';
  };

  // Score model (safe even if scoring disabled → we simply skip score sheets).
  let score = null;
  try { score = computeInspectionScore(inspection, settings); } catch { score = null; }
  const scoringOn = !!score && inspection.includeScore !== false && rooms.length > 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = settings?.companyName || settings?.appName || 'CheckSquare';
  wb.created = new Date();

  // ─────────────────────────── 1) SUMMARY ────────────────────────────────
  {
    const ws = wb.addWorksheet('Summary');
    ws.columns = [
      { key: 'a', width: 24 }, { key: 'b', width: 24 }, { key: 'c', width: 20 },
      { key: 'd', width: 20 }, { key: 'e', width: 18 }, { key: 'f', width: 18 },
    ];
    let r = 1;

    ws.mergeCells(r, 1, r, 6);
    const brand = ws.getCell(r, 1);
    brand.value = settings?.companyName || settings?.appName || 'CheckSquare';
    brand.font = { bold: true, size: 18, color: { argb: primary } };
    ws.getRow(r).height = 26;
    r += 1;
    if (settings?.companyTagline) {
      ws.mergeCells(r, 1, r, 6);
      ws.getCell(r, 1).value = settings.companyTagline;
      ws.getCell(r, 1).font = { italic: true, color: { argb: 'FF6B7280' } };
      r += 1;
    }
    r += 1;

    titleCell(ws, r, 'Inspection summary', primary); r += 1;
    const infoRows = [
      ['Property', meta.propertyAddress || '—'],
      ['Prepared for', meta.preparedFor || '—'],
      ['Inspection date', meta.inspectionDate || '—'],
      ['Property type', inspection.propertyType || '—'],
      ['Inspector', inspection.inspectorName || '—'],
      ['Status', inspection.status || '—'],
    ];
    infoRows.forEach(([k, v]) => {
      const row = ws.getRow(r);
      row.getCell(1).value = k;
      row.getCell(1).font = { bold: true };
      ws.mergeCells(r, 2, r, 6);
      row.getCell(2).value = v;
      r += 1;
    });
    r += 1;

    if (scoringOn) {
      titleCell(ws, r, 'Property score', primary); r += 1;
      const donut = renderDonut(score.overall, {
        size: 220,
        color: score.grade?.color || primaryHex,
        subtitle: `${score.grade?.letter || ''} · ${score.grade?.label || ''}`,
      });
      const consumed = placeImage(ws, wb, donut, { col: 0, row: r - 1 });

      const figs = [
        ['Overall score', `${score.overall}/100`],
        ['Grade', `${score.grade?.letter || ''} — ${score.grade?.label || ''}`],
        ['Priority', score.priority],
        ['Rooms assessed', String(score.factors?.length || 0)],
        ['Total observations', String(score.totals?.total || 0)],
        ['Major / Minor / Cosmetic',
          `${score.totals?.major || 0} / ${score.totals?.minor || 0} / ${score.totals?.cosmetic || 0}`],
      ];
      let fr = r;
      figs.forEach(([k, v]) => {
        const row = ws.getRow(fr);
        row.getCell(4).value = k;
        row.getCell(4).font = { bold: true };
        ws.mergeCells(fr, 5, fr, 6);
        row.getCell(5).value = v;
        fr += 1;
      });
      r += consumed;

      const sevNames = (score.severityNames && score.severityNames.length)
        ? score.severityNames : ['Major', 'Minor', 'Cosmetic'];
      const sevItems = sevNames.map((nm) => ({
        label: nm,
        value: (score.totals?.byName?.[nm] ?? (
          nm === 'Major' ? score.totals?.major
            : nm === 'Minor' ? score.totals?.minor
              : nm === 'Cosmetic' ? score.totals?.cosmetic : 0)) || 0,
        color: sevColor(nm),
      }));
      const bar = renderBarChart(sevItems, { width: 420, height: 240, title: 'Observations by severity' });
      r += 1;
      const barConsumed = placeImage(ws, wb, bar, { col: 0, row: r - 1 });
      r += barConsumed + 1;
    }
  }

  // ─────────────────────── 2) SCORE BREAKDOWN ─────────────────────────────
  if (scoringOn) {
    const ws = wb.addWorksheet('Score breakdown');
    ws.columns = [
      { header: 'Room', key: 'room', width: 26 },
      { header: 'Score', key: 'score', width: 10 },
      { header: 'Priority', key: 'prio', width: 12 },
      { header: 'Major', key: 'maj', width: 9 },
      { header: 'Minor', key: 'min', width: 9 },
      { header: 'Cosmetic', key: 'cos', width: 11 },
    ];
    const hr = ws.getRow(1);
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.alignment = { horizontal: 'center' };
    hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } }; });

    let r = 2;
    (score.factors || []).forEach((f) => {
      const row = ws.getRow(r);
      row.getCell('room').value = f.name;
      row.getCell('score').value = Math.round(f.value);
      row.getCell('prio').value = f.priority;
      row.getCell('maj').value = f.major || 0;
      row.getCell('min').value = f.minor || 0;
      row.getCell('cos').value = f.cosmetic || 0;
      const pc = f.priority === 'Urgent' ? PROPCHK_PRIORITY_META.Urgent.color
        : f.priority === 'Watch' ? PROPCHK_PRIORITY_META.Watch.color
          : PROPCHK_PRIORITY_META.Clean.color;
      row.getCell('prio').font = { bold: true, color: { argb: hexToArgb(pc) } };
      r += 1;
    });
    const avgRow = ws.getRow(r);
    avgRow.getCell('room').value = 'AVERAGE';
    avgRow.getCell('room').font = { bold: true };
    avgRow.getCell('score').value = score.overall;
    avgRow.getCell('score').font = { bold: true };
    r += 2;

    const roomItems = (score.factors || []).map((f) => ({
      label: f.name,
      value: Math.round(f.value),
      color: f.color || primaryHex,
    }));
    const bar = renderBarChart(roomItems, {
      width: Math.min(1000, Math.max(480, roomItems.length * 70)),
      height: 320,
      title: 'Room scores (0–100)',
      max: 100,
    });
    placeImage(ws, wb, bar, { col: 0, row: r - 1 });
  }

  // ─────────────────────── 3) AREA CALCULATIONS ───────────────────────────
  {
    const areas = Array.isArray(inspection.areaCalculations) ? inspection.areaCalculations : [];
    const metrics = Array.isArray(inspection.propertyMetrics) ? inspection.propertyMetrics : [];
    if (areas.length || metrics.length) {
      const ws = wb.addWorksheet('Area & metrics');
      ws.columns = [
        { key: 'a', width: 26 }, { key: 'b', width: 14 }, { key: 'c', width: 14 },
        { key: 'd', width: 16 }, { key: 'e', width: 14 }, { key: 'f', width: 14 },
      ];
      let r = 1;
      if (areas.length) {
        titleCell(ws, r, 'Area calculations', primary); r += 1;
        const head = ws.getRow(r);
        ['Room / Section', 'Length', 'Width', 'Area (sft)'].forEach((h, i) => {
          head.getCell(i + 1).value = h;
          head.getCell(i + 1).font = { bold: true };
        });
        r += 1;
        let totalSft = 0;
        buildAreaGroups(areas).forEach((group) => {
          const startRow = r;
          group.rows.forEach((a, idx) => {
            const sft = computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit);
            totalSft += sft;
            const row = ws.getRow(r);
            row.getCell(1).value = group.room || '';
            row.getCell(2).value = `${a.length || 0} ${a.lengthUnit || 'ft'}`;
            row.getCell(3).value = `${a.width || 0} ${a.widthUnit || 'ft'}`;
            row.getCell(4).value = sft;
            if (idx > 0) row.getCell(1).value = null;
            r += 1;
          });
          if (group.rows.length > 1) {
            ws.mergeCells(startRow, 1, r - 1, 1);
          }
        });
        const tr = ws.getRow(r);
        tr.getCell(1).value = 'TOTAL';
        tr.getCell(1).font = { bold: true };
        tr.getCell(4).value = Math.round(totalSft * 100) / 100;
        tr.getCell(4).font = { bold: true };
        r += 2;
      }
      if (metrics.length) {
        titleCell(ws, r, 'Property metrics', primary); r += 1;
        const head = ws.getRow(r);
        ['Metric', 'Value', 'Unit'].forEach((h, i) => {
          head.getCell(i + 1).value = h;
          head.getCell(i + 1).font = { bold: true };
        });
        r += 1;
        metrics.forEach((m) => {
          const row = ws.getRow(r);
          row.getCell(1).value = m.label || '';
          row.getCell(2).value = m.value ?? '';
          row.getCell(3).value = m.unit || '';
          r += 1;
        });
      }
    }
  }

  // ─────────────────────── 4) WATER QUALITY ───────────────────────────────
  {
    const wq = inspection.waterQuality || {};
    const brands = Array.isArray(wq.brandSelections)
      ? wq.brandSelections.map((b) => b?.name).filter(Boolean)
      : (Array.isArray(wq.brands) ? wq.brands : []);
    if (wq.tds || wq.ph || brands.length) {
      const ws = wb.addWorksheet('Water & brands');
      ws.columns = [{ key: 'a', width: 26 }, { key: 'b', width: 40 }];
      let r = 1;
      titleCell(ws, r, 'Water quality', primary); r += 1;
      [['TDS (ppm)', wq.tds || '—'], ['pH', wq.ph || '—']].forEach(([k, v]) => {
        const row = ws.getRow(r);
        row.getCell(1).value = k;
        row.getCell(1).font = { bold: true };
        row.getCell(2).value = String(v);
        r += 1;
      });
      r += 1;
      if (brands.length) {
        titleCell(ws, r, 'Hardware brands observed', primary); r += 1;
        brands.forEach((b) => {
          ws.getCell(r, 1).value = b;
          r += 1;
        });
      }
    }
  }

  // ─────────────────────── 5) PHOTO LOG (rooms) ───────────────────────────
  {
    const ws = wb.addWorksheet('Inspection', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = [
      { header: '#', key: 'n', width: 5 },
      { header: 'Room', key: 'room', width: 22 },
      { header: 'Location', key: 'loc', width: 22 },
      { header: 'Description', key: 'desc', width: 46 },
      { header: 'Severity', key: 'sev', width: 14 },
      { header: 'Photo', key: 'photo', width: photoColWidthChars },
    ];
    const headerRow = ws.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
    headerRow.eachCell((c) => {
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
    });

    let r = 2;
    const addPhotoRow = async ({ n, room, loc, desc, sev, url }) => {
      const row = ws.getRow(r);
      row.getCell('n').value = n ?? '';
      row.getCell('room').value = room || '';
      row.getCell('loc').value = loc || '';
      row.getCell('desc').value = desc || '';
      row.getCell('sev').value = sev || '';
      row.alignment = { vertical: 'middle', wrapText: true };
      if (sev) row.getCell('sev').font = { bold: true, color: { argb: hexToArgb(sevColor(sev)) } };

      if (url) {
        const processed = await processForExcel(url, imgWpx, imgHpx, fit, quality);
        if (processed) {
          const imgId = wb.addImage({ base64: processed.base64, extension: 'jpeg' });
          row.height = Math.round((processed.hPx * 72) / 96) + 6;
          ws.addImage(imgId, {
            tl: { col: 5, row: r - 1 },
            ext: { width: processed.wPx, height: processed.hPx },
            editAs: 'oneCell',
          });
        }
      }
      r += 1;
    };

    for (const room of rooms) {
      const roomName = room?.name || 'Room';
      const corners = Array.isArray(room?.cornerPhotos) ? room.cornerPhotos : [];
      const defects = Array.isArray(room?.defects) ? room.defects : [];

      const hr = ws.getRow(r);
      ws.mergeCells(r, 1, r, 6);
      hr.getCell(1).value = roomName;
      hr.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      hr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } };
      hr.getCell(1).alignment = { vertical: 'middle' };
      r += 1;

      for (let i = 0; i < corners.length; i += 1) {
        const p = corners[i];
        // eslint-disable-next-line no-await-in-loop
        await addPhotoRow({
          n: '', room: roomName, loc: p.corner || `Corner ${i + 1}`,
          desc: 'Ambient photo', sev: '', url: p.url,
        });
      }

      for (let di = 0; di < defects.length; di += 1) {
        const d = defects[di];
        const photos = Array.isArray(d.photos) ? d.photos.filter((p) => p && p.url) : [];
        if (photos.length === 0) {
          if (d.beforePhoto?.url) photos.push({ url: d.beforePhoto.url });
          if (d.afterPhoto?.url) photos.push({ url: d.afterPhoto.url });
        }
        const desc = d.description || d.title || 'Observation';
        const loc = d.location || d.area || '';
        if (photos.length === 0) {
          // eslint-disable-next-line no-await-in-loop
          await addPhotoRow({ n: di + 1, room: roomName, loc, desc, sev: d.severity || '', url: null });
        } else {
          for (let pi = 0; pi < photos.length; pi += 1) {
            const p = photos[pi];
            // eslint-disable-next-line no-await-in-loop
            await addPhotoRow({
              n: pi === 0 ? di + 1 : '',
              room: roomName,
              loc,
              desc: pi === 0 ? desc : (p.caption || ''),
              sev: pi === 0 ? (d.severity || '') : '',
              url: p.url,
            });
          }
        }
      }
    }
  }

  // ─────────────────────── 6) SEVERITY TAXONOMY ───────────────────────────
  if (severityLevels.length) {
    const ws = wb.addWorksheet('Severity guide');
    ws.columns = [
      { header: 'Severity', key: 'name', width: 18 },
      { header: 'Color', key: 'color', width: 12 },
      { header: 'Definition', key: 'def', width: 70 },
    ];
    const hr = ws.getRow(1);
    hr.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primary } }; });
    let r = 2;
    severityLevels.forEach((s) => {
      const row = ws.getRow(r);
      row.getCell('name').value = s.name || '';
      row.getCell('name').font = { bold: true };
      row.getCell('color').fill = {
        type: 'pattern', pattern: 'solid', fgColor: { argb: hexToArgb(s.color) },
      };
      row.getCell('def').value = s.definition || '';
      row.getCell('def').alignment = { wrapText: true, vertical: 'top' };
      r += 1;
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/**
 * Build + download the Excel report via the cross-platform saveFile helper.
 */
export async function generateXLSX(inspection, settings) {
  const blob = await buildXLSXBlob(inspection, settings);
  const refId = String(inspection.id || '').substring(0, 8).toUpperCase();
  const filename = `Inspection_${(inspection.metadata?.propertyAddress || 'Report').replace(/[^a-z0-9]/gi, '_')}_${refId}.xlsx`;
  await saveFile(blob, filename, { inspectionId: inspection?.id });
}
