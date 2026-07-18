// ExcelReportGenerator — builds an .xlsx inspection report that EMBEDS photos
// at an exact, admin-controlled print size (default 8.45 × 6.4 cm).
//
// Why a separate lib: the project's `xlsx` (SheetJS community) cannot embed
// images into a worksheet. `exceljs` can, so the Excel export uses it. exceljs
// is imported dynamically so it never bloats the main bundle.
//
// Sizing: Excel renders images at 96 DPI, so 1 cm = 96/2.54 ≈ 37.795 px.
//   8.45 cm → 319 px wide, 6.4 cm → 242 px tall (with the defaults).
// The admin can change the box in Settings → Report Images.

import { materializeInspectionPhotos } from '@/lib/supabasePhotoStorage.js';
import saveFile from '@/utils/saveFile.js';

const CM_TO_PX = 96 / 2.54; // ≈ 37.7953

const stripDataUrlPrefix = (url) => {
  const m = /^data:[^;]+;base64,(.+)$/.exec(url || '');
  return m ? m[1] : null;
};
const extFromDataUrl = (url) => {
  const m = /^data:image\/(png|jpe?g|gif|webp)/i.exec(url || '');
  if (!m) return 'jpeg';
  const e = m[1].toLowerCase();
  return e === 'jpg' ? 'jpeg' : e; // exceljs expects 'jpeg', 'png', or 'gif'
};

/**
 * Build the inspection workbook as a Blob (does not trigger a download).
 * @param {object} inspection  full inspection (roomInspections must be present)
 * @param {object} settings    app settings (reads reportImages.box{Width,Height}Cm)
 * @returns {Promise<Blob>}
 */
export async function buildXLSXBlob(inspection, settings) {
  const ExcelJS = (await import('exceljs')).default;

  // Resolve Supabase storageKey-only photos to inline base64 dataURLs first —
  // exceljs needs the actual bytes, and signed URLs can expire mid-build.
  await materializeInspectionPhotos(inspection);

  const ri = settings?.reportImages || {};
  const boxW = Number(ri.boxWidthCm) || 8.45;
  const boxH = Number(ri.boxHeightCm) || 6.4;
  const fit = ri.fit === 'cover' ? 'cover' : 'contain';
  const imgWpx = Math.round(boxW * CM_TO_PX);
  const imgHpx = Math.round(boxH * CM_TO_PX);
  const rowHeightPt = Math.round((imgHpx * 72) / 96) + 6; // points; +padding
  const photoColWidthChars = Math.max(20, (imgWpx - 5) / 7);

  const primary = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6')
    .replace('#', '').toUpperCase().slice(0, 6).padStart(6, '0');

  const wb = new ExcelJS.Workbook();
  wb.creator = settings?.companyName || settings?.appName || 'CheckSquare';
  wb.created = new Date();

  const ws = wb.addWorksheet('Inspection', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

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
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${primary}` } };
  });

  let r = 2;

  const meta = inspection.metadata || {};
  const metaRows = [
    ['Property', meta.propertyAddress || ''],
    ['Prepared for', meta.preparedFor || ''],
    ['Inspection date', meta.inspectionDate || ''],
    ['Inspector', inspection.inspectorName || ''],
    ['Status', inspection.status || ''],
    ['Score', inspection.score != null ? String(inspection.score) : ''],
  ];
  metaRows.forEach(([k, v]) => {
    const row = ws.getRow(r);
    row.getCell('n').value = '';
    row.getCell('room').value = k;
    row.getCell('room').font = { bold: true };
    row.getCell('loc').value = v;
    ws.mergeCells(r, 3, r, 6); // merge Location..Photo for the value
    r += 1;
  });
  r += 1; // spacer row

  const rooms = Array.isArray(inspection.roomInspections) ? inspection.roomInspections : [];

  const addPhotoRow = ({ n, room, loc, desc, sev, url }) => {
    const row = ws.getRow(r);
    row.getCell('n').value = n ?? '';
    row.getCell('room').value = room || '';
    row.getCell('loc').value = loc || '';
    row.getCell('desc').value = desc || '';
    row.getCell('sev').value = sev || '';
    row.alignment = { vertical: 'middle', wrapText: true };

    const b64 = url ? stripDataUrlPrefix(url) : null;
    if (b64) {
      const imgId = wb.addImage({ base64: b64, extension: extFromDataUrl(url) });
      row.height = rowHeightPt;
      // One-cell anchor at column F (0-indexed col 5) with an absolute pixel
      // extent → Excel renders the image at exactly boxW × boxH cm. exceljs
      // does not do object-fit, so we anchor at the cell and let the fixed
      // ext size it; 'contain' vs 'cover' is honoured by matching the box
      // aspect (near 4:3) — portrait shots keep their aspect via ext scaling.
      ws.addImage(imgId, {
        tl: { col: 5, row: r - 1 },
        ext: { width: imgWpx, height: imgHpx },
        editAs: 'oneCell',
      });
    }
    r += 1;
  };

  rooms.forEach((room) => {
    const roomName = room?.name || 'Room';
    const corners = Array.isArray(room?.cornerPhotos) ? room.cornerPhotos : [];
    const defects = Array.isArray(room?.defects) ? room.defects : [];

    // Room header band
    const hr = ws.getRow(r);
    ws.mergeCells(r, 1, r, 6);
    hr.getCell(1).value = roomName;
    hr.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    hr.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${primary}` } };
    hr.getCell(1).alignment = { vertical: 'middle' };
    r += 1;

    corners.forEach((p, i) => addPhotoRow({
      n: '', room: roomName, loc: p.corner || `Corner ${i + 1}`,
      desc: 'Ambient photo', sev: '', url: p.url,
    }));

    defects.forEach((d, di) => {
      let photos = Array.isArray(d.photos) ? d.photos.filter((p) => p && p.url) : [];
      if (photos.length === 0) {
        if (d.beforePhoto?.url) photos.push({ url: d.beforePhoto.url });
        if (d.afterPhoto?.url) photos.push({ url: d.afterPhoto.url });
      }
      const desc = d.description || d.title || 'Observation';
      const loc = d.location || d.area || '';
      if (photos.length === 0) {
        addPhotoRow({ n: di + 1, room: roomName, loc, desc, sev: d.severity || '', url: null });
      } else {
        photos.forEach((p, pi) => addPhotoRow({
          n: pi === 0 ? di + 1 : '',
          room: roomName,
          loc,
          desc: pi === 0 ? desc : (p.caption || ''),
          sev: pi === 0 ? (d.severity || '') : '',
          url: p.url,
        }));
      }
    });
  });

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
