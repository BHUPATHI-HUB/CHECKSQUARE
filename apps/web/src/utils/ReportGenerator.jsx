import html2pdf from 'html2pdf.js';
import {
  Document, Packer, Paragraph, HeadingLevel, TextRun, AlignmentType,
  Table, TableRow, TableCell, WidthType, BorderStyle, PageBreak, ShadingType,
  ImageRun,
} from 'docx';
import { saveFile } from './saveFile';
import { computeInspectionScore, DEFAULT_SCORE_EXPLANATION_HTML, explainScore } from './scoring';
import { materializeInspectionPhotos } from '@/lib/supabasePhotoStorage.js';

// ─── Inline editorial SVG art (no network deps; render-safe in html2pdf) ──
const HOUSE_SVG = (gold = '#c19a4b', ink = '#1f2937') => `
  <svg viewBox="0 0 220 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%;">
    <rect width="220" height="160" fill="#faf8f3"/>
    <g fill="none" stroke="${ink}" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round">
      <polyline points="30,90 110,30 190,90"/>
      <rect x="45" y="90" width="130" height="55"/>
      <rect x="95" y="108" width="30" height="37"/>
      <rect x="60" y="102" width="22" height="22"/>
      <rect x="138" y="102" width="22" height="22"/>
      <line x1="71" y1="102" x2="71" y2="124"/>
      <line x1="60" y1="113" x2="82" y2="113"/>
      <line x1="149" y1="102" x2="149" y2="124"/>
      <line x1="138" y1="113" x2="160" y2="113"/>
      <polyline points="150,75 150,55 165,55 165,86"/>
    </g>
    <g stroke="${gold}" stroke-width="1.2" fill="none">
      <line x1="22" y1="145" x2="198" y2="145"/>
      <circle cx="110" cy="30" r="3" fill="${gold}"/>
    </g>
  </svg>
`;

const WATER_SVG = (gold = '#c19a4b', ink = '#1f2937', blue = '#0ea5e9') => `
  <svg viewBox="0 0 480 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:120px;">
    <rect width="480" height="120" fill="#fafaf7"/>
    <g transform="translate(40,16)">
      <path d="M40 0 C 20 30 0 50 0 70 a 40 40 0 0 0 80 0 C 80 50 60 30 40 0 Z" fill="none" stroke="${blue}" stroke-width="1.5"/>
      <path d="M30 60 a 20 20 0 0 0 20 14" fill="none" stroke="${blue}" stroke-width="1.2" opacity="0.6"/>
      <text x="40" y="95" text-anchor="middle" font-family="Helvetica" font-size="8" letter-spacing="2" fill="${ink}">TDS · PPM</text>
    </g>
    <g transform="translate(170,20)">
      <line x1="0" y1="40" x2="260" y2="40" stroke="${ink}" stroke-width="1"/>
      <g font-family="Helvetica" font-size="7" fill="${ink}" text-anchor="middle">
        <line x1="0" y1="34" x2="0" y2="46" stroke="${ink}"/><text x="0" y="58">0</text>
        <line x1="43" y1="34" x2="43" y2="46" stroke="${ink}"/><text x="43" y="58">5</text>
        <line x1="86" y1="34" x2="86" y2="46" stroke="${ink}"/><text x="86" y="58">6.5</text>
        <line x1="130" y1="34" x2="130" y2="46" stroke="${ink}"/><text x="130" y="58">7</text>
        <line x1="173" y1="34" x2="173" y2="46" stroke="${ink}"/><text x="173" y="58">8.5</text>
        <line x1="217" y1="34" x2="217" y2="46" stroke="${ink}"/><text x="217" y="58">10</text>
        <line x1="260" y1="34" x2="260" y2="46" stroke="${ink}"/><text x="260" y="58">14</text>
      </g>
      <rect x="86" y="32" width="87" height="16" fill="${gold}" opacity="0.18"/>
      <text x="130" y="22" text-anchor="middle" font-family="Helvetica" font-size="7" letter-spacing="2" fill="${gold}">SAFE pH RANGE</text>
      <text x="130" y="82" text-anchor="middle" font-family="Helvetica" font-size="8" letter-spacing="2" fill="${ink}">pH SCALE</text>
    </g>
  </svg>
`;

const BRAND_SVG = (gold = '#c19a4b', ink = '#1f2937') => `
  <svg viewBox="0 0 480 100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet" style="width:100%;height:100px;">
    <rect width="480" height="100" fill="#fafaf7"/>
    <g stroke="${ink}" stroke-width="1" fill="none">
      <rect x="20" y="18" width="104" height="64"/>
      <rect x="138" y="18" width="104" height="64"/>
      <rect x="256" y="18" width="104" height="64"/>
      <rect x="374" y="18" width="86" height="64"/>
    </g>
    <g font-family="Helvetica" font-size="7" letter-spacing="2" fill="${ink}" text-anchor="middle">
      <text x="72" y="55">SWITCHES</text>
      <text x="190" y="55">PLUMBING</text>
      <text x="308" y="55">APPLIANCES</text>
      <text x="417" y="55">TILES</text>
    </g>
    <g stroke="${gold}" stroke-width="1.5" fill="none">
      <line x1="20" y1="90" x2="460" y2="90"/>
    </g>
  </svg>
`;

// Donut-style SVG pie of weighted score contributions
const scoreDonutSVG = (factors, overall, grade) => {
  const cx = 110, cy = 110, r = 80, sw = 28;
  const C = 2 * Math.PI * r;
  let acc = 0;
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const slices = factors.map((f) => {
    const frac = f.weight / totalWeight;
    const dash = (frac * C);
    const offset = -acc;
    acc += dash;
    // Performance-tinted color: fade weakly when factor score is low
    const op = Math.max(0.35, f.value / 100);
    return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="${f.color}" stroke-opacity="${op}" stroke-width="${sw}" stroke-dasharray="${dash} ${C}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})" />`;
  }).join('');
  return `
    <svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" style="width:220px;height:220px;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#f3f4f6" stroke-width="${sw}"/>
      ${slices}
      <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-family="Georgia" font-size="44" font-weight="300" fill="#1f2937">${overall}</text>
      <text x="${cx}" y="${cy + 18}" text-anchor="middle" font-family="Helvetica" font-size="8" letter-spacing="3" fill="#6b7280">SCORE / 100</text>
      <text x="${cx}" y="${cy + 42}" text-anchor="middle" font-family="Georgia" font-size="18" font-style="italic" fill="${grade.color}">${grade.letter} · ${grade.label}</text>
    </svg>
  `;
};

/**
 * miniDonutSVG — single-factor compact ring used on the score summary page.
 * Renders a clean progress arc (score/100) with the factor's color, the
 * numeric score centered, and a tiny grade letter underneath.
 */
const miniDonutSVG = (value, color, size = 96) => {
  const cx = size / 2, cy = size / 2;
  const r  = size / 2 - 10;
  const sw = 9;
  const C  = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const dash = pct * C;
  return `
    <svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" style="width:${size}px;height:${size}px;display:block;">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#f3f4f6" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="${color}" stroke-width="${sw}"
              stroke-dasharray="${dash} ${C}" stroke-linecap="round"
              transform="rotate(-90 ${cx} ${cy})" />
      <text x="${cx}" y="${cy + 2}" text-anchor="middle" font-family="Georgia" font-size="22" font-weight="300" fill="#1f2937">${value}</text>
      <text x="${cx}" y="${cy + 16}" text-anchor="middle" font-family="Helvetica" font-size="6" letter-spacing="1.5" fill="#9ca3af">/ 100</text>
    </svg>
  `;
};

// ─── Helpers ────────────────────────────────────────────────────────────
const UNIT_FACTOR_TO_FEET = { ft: 1, in: 1 / 12, m: 3.28084, cm: 0.0328084 };
const computeAreaSft = (length, width, lengthUnit = 'ft', widthUnit = 'ft') => {
  const L = parseFloat(length) || 0;
  const W = parseFloat(width) || 0;
  const lf = L * (UNIT_FACTOR_TO_FEET[lengthUnit] || 1);
  const wf = W * (UNIT_FACTOR_TO_FEET[widthUnit] || 1);
  return Math.round(lf * wf * 100) / 100;
};

const esc = (v) => {
  if (v == null) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
};

const fmtDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch { return iso; }
};

/* ============================================================
   PROFESSIONAL EDITORIAL PDF
   ============================================================ */
/**
 * Build the full report HTML (stylesheet + every page) for a given inspection.
 * Used by both `generatePDF` (which feeds it into html2pdf) and the
 * in-browser preview modal so the two can never drift apart.
 */
export const buildReportHTML = (inspection, settings) => {
  const PRIMARY  = '#1f2937';   // ink (slate-800)
  const ACCENT   = '#c19a4b';   // muted gold
  const MUTED    = '#6b7280';
  const RULE     = '#e5e7eb';
  const PAPER    = '#ffffff';
  // Admin-controlled photo fit for report images (contain = letterbox, no
  // distortion; cover = crop to fill). Drives the CSS background-size below.
  const imgFit   = settings?.reportImages?.fit === 'cover' ? 'cover' : 'contain';

  const cName  = settings?.companyName || settings?.appName || 'CheckSquare';
  const logo   = settings?.customLogo || settings?.logo || '/logo.svg';
  const email  = settings?.companyEmail || '';
  const phone  = [settings?.companyPhone1, settings?.companyPhone2].filter(Boolean).join(' · ');
  const issue  = `Issue · ${new Date().getFullYear()}`;
  const refId  = String(inspection.id || '').substring(0, 8).toUpperCase();

  const severities = settings?.severityLevels || [];
  const sevColor = (name) => severities.find((s) => s.name === name)?.color || MUTED;

  // Compute scoring up-front so the cover can carry a grade badge and the
  // sign-off / score pages share the same numbers.
  const scoringEnabledGlobally = settings?.scoring?.enabled !== false;
  // If the per-inspection toggle was never set (legacy records or admin
  // never disabled it), fall back to the admin global flag so the page
  // appears by default.
  const scoringEnabledForReport = inspection.includeScore !== false;
  const showScore = scoringEnabledGlobally && scoringEnabledForReport;
  const scoreSummary = showScore ? computeInspectionScore(inspection, settings) : null;

  // ─── Shared CSS embedded once at the top ──────────────────────────
  const stylesheet = `
    <style>
      @page { margin: 0; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin: 0; }
      .pg {
        width: 100%; height: 1050px; padding: 70px 64px;
        font-family: Georgia, 'Times New Roman', serif;
        color: ${PRIMARY}; background: ${PAPER};
        page-break-after: always; position: relative;
        border: 1px solid ${PRIMARY};
        overflow: hidden;
      }
      .pg.cover, .pg.ty-pg { border: none; }
      .pg.cover { padding: 0; }
      .pg-footer {
        position: absolute; left: 64px; right: 64px; bottom: 36px;
        display: flex; justify-content: space-between; align-items: baseline;
        font-family: Helvetica, Arial, sans-serif; font-size: 9px;
        letter-spacing: 0.18em; text-transform: uppercase; color: ${MUTED};
        border-top: 1px solid ${RULE}; padding-top: 14px;
      }
      .pg-footer .brand strong { color: ${PRIMARY}; font-weight: 700; letter-spacing: 0.22em; }

      .eyebrow {
        font-family: Helvetica, Arial, sans-serif;
        font-size: 10px; letter-spacing: 0.28em; text-transform: uppercase;
        color: ${MUTED}; margin: 0 0 22px;
      }
      .eyebrow::before {
        content: ''; display: inline-block; width: 28px; height: 1px;
        background: ${ACCENT}; vertical-align: middle; margin-right: 14px;
      }
      .headline {
        font-family: Georgia, 'Times New Roman', serif; font-weight: 300;
        font-size: 48px; line-height: 1.05; letter-spacing: -0.5px;
        margin: 0; color: ${PRIMARY};
      }
      .headline em { color: ${ACCENT}; font-style: italic; }
      .deck {
        font-family: Georgia, serif; font-size: 16px; line-height: 1.55;
        color: ${MUTED}; margin: 22px 0 0; max-width: 540px; font-style: italic;
      }
      .meta-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
      .meta-table td {
        padding: 14px 18px;
        border: 1px solid ${PRIMARY};
        font-family: Helvetica, Arial, sans-serif; vertical-align: top;
      }
      .meta-table td.label {
        width: 35%;
        font-size: 9px; letter-spacing: 0.22em;
        text-transform: uppercase; color: ${MUTED};
        background: #fafafa;
      }
      .meta-table td.value {
        font-family: Georgia, serif; font-size: 14px; color: ${PRIMARY};
        background: #fff;
      }

      /* 2-column metadata grid for cover bottom — pairs render side-by-side */
      .meta-grid { display: flex; flex-wrap: wrap; gap: 0; margin-top: 12px; border: 1px solid ${PRIMARY}; }
      .meta-grid .cell { width: 50%; box-sizing: border-box; display: flex; flex-direction: column; border-bottom: 1px solid ${PRIMARY}; border-right: 1px solid ${PRIMARY}; padding: 16px 20px; }
      .meta-grid .cell:nth-child(2n) { border-right: none; }
      .meta-grid .cell:nth-last-child(-n+2) { border-bottom: none; }
      .meta-grid .cell .label {
        font-family: Helvetica, sans-serif; font-size: 9px;
        letter-spacing: 0.24em; text-transform: uppercase; color: ${MUTED};
        margin-bottom: 6px;
      }
      .meta-grid .cell .value {
        font-family: Georgia, serif; font-size: 15px; color: ${PRIMARY};
      }

      /* Property image card on cover */
      .prop-card { display: flex; gap: 24px; align-items: stretch; margin-top: 24px; border: 1px solid ${PRIMARY}; padding: 16px; background: #fff; }
      .prop-card .img-wrap { width: 220px; flex-shrink: 0; height: 160px; border: 1px solid ${RULE}; overflow: hidden; background: #f3f4f6; display: flex; align-items: center; justify-content: center; }
      .prop-card .img-wrap img { width: 100%; height: 100%; object-fit: contain; background: #fff; }
      .prop-card .img-wrap .placeholder { font-family: Helvetica, sans-serif; font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: ${MUTED}; padding: 8px; text-align: center; }
      .prop-card .info { flex: 1; display: flex; flex-direction: column; justify-content: center; }
      .prop-card .info .eyebrow { margin-bottom: 8px; }
      .prop-card .info .addr { font-family: Georgia, serif; font-size: 22px; line-height: 1.3; color: ${PRIMARY}; font-weight: 400; }
      .prop-card .info .date { font-family: Helvetica, sans-serif; font-size: 10px; letter-spacing: 0.22em; text-transform: uppercase; color: ${ACCENT}; margin-top: 12px; }

      .section-title {
        font-family: Georgia, serif; font-weight: 300;
        font-size: 36px; line-height: 1.1; letter-spacing: -0.4px;
        margin: 0 0 6px; color: ${PRIMARY};
      }
      .section-title em { color: ${ACCENT}; font-style: italic; }
      .rule { width: 56px; height: 2px; background: ${ACCENT}; margin: 0 0 36px; }

      .body p, .body li {
        font-family: Georgia, serif; font-size: 13px; line-height: 1.85;
        color: ${PRIMARY}; margin: 0 0 14px;
      }
      /* Disclaimer pages run two sizes smaller than the standard body copy
         so the legal text fits within a single page comfortably. */
      .body.disclaimer-body p, .body.disclaimer-body li {
        font-size: 11px; line-height: 1.65; margin: 0 0 10px;
      }
      .body.disclaimer-body h2 { font-size: 14px; margin: 12px 0 6px; }
      .body.disclaimer-body h3 { font-size: 12px; margin: 10px 0 4px; }

      table.editorial { width: 100%; border-collapse: collapse; margin-top: 16px; font-family: Helvetica, Arial, sans-serif; font-size: 12px; border: 1px solid ${PRIMARY}; }
      /* The 8-column score table needs tighter typography and padding so
         every cell fits inside the page body without overflow. */
      table.editorial.score-table th { padding: 8px 6px; font-size: 8px; letter-spacing: 0.12em; word-break: keep-all; white-space: nowrap; }
      table.editorial.score-table td { padding: 10px 6px; font-size: 12px; word-break: break-word; }
      table.editorial.score-table td span { white-space: nowrap; }
      table.editorial th {
        text-align: left; padding: 10px 12px;
        font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase;
        color: #fff; background: ${PRIMARY};
        border: 1px solid ${PRIMARY};
        font-weight: 600;
      }
      table.editorial td {
        padding: 12px 14px;
        border: 1px solid ${PRIMARY};
        font-family: Georgia, serif; font-size: 13px; color: ${PRIMARY};
        background: #fff;
      }
      table.editorial tr { page-break-inside: avoid; break-inside: avoid; }
      table.editorial thead { display: table-header-group; }
      table.editorial tr:nth-child(even) td { background: #fafafa; }
      /* Default: a small editorial table should never be split. The
         score dashboard's chunked tables explicitly opt in to splitting
         by carrying the .may-split class. */
      table.editorial { page-break-inside: avoid; break-inside: avoid; }
      table.editorial.may-split { page-break-inside: auto; break-inside: auto; }
      table.editorial tr.total td {
        background: ${PRIMARY}; color: #fff;
        font-family: Helvetica, sans-serif; font-weight: 700;
        text-transform: uppercase; font-size: 10px; letter-spacing: 0.2em;
      }
      /* Generic guardrail: keep any block tagged .keep-together on one page. */
      .keep-together, .keep-together * { page-break-inside: avoid; break-inside: avoid; }

      .sev-row { display: flex; align-items: flex-start; gap: 20px; padding: 24px 0; border-bottom: 1px solid ${RULE}; }
      .sev-row:last-child { border-bottom: none; }
      .sev-swatch { width: 16px; height: 16px; border-radius: 50%; margin-top: 6px; flex-shrink: 0; }
      .sev-name {
        font-family: Helvetica, sans-serif; font-size: 11px;
        letter-spacing: 0.22em; text-transform: uppercase; color: ${PRIMARY};
        font-weight: 700; display: block;
      }
      .sev-def { font-family: Georgia, serif; font-size: 13px; color: ${MUTED}; margin-top: 8px; line-height: 1.7; }

      .room-eyebrow {
        font-family: Helvetica, sans-serif; font-size: 9px;
        letter-spacing: 0.28em; text-transform: uppercase; color: ${ACCENT};
      }
      .room-title { font-family: Georgia, serif; font-size: 32px; font-weight: 300; margin: 6px 0 4px; }
      .phase-label {
        font-family: Helvetica, sans-serif; font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase; color: ${MUTED};
        margin: 32px 0 16px; padding-bottom: 8px; border-bottom: 1px solid ${RULE};
      }

      .gallery { display: flex; flex-wrap: wrap; gap: 12px; }
      .gallery .cell { width: calc(50% - 6px); border: 1px solid ${PRIMARY}; background: #fff; page-break-inside: avoid; }
      /* Same cover-crop technique as the defect photos — keeps wide and
         portrait images filling the cell without aspect distortion. */
      .gallery .cell .cell-photo {
        width: 100%; height: 200px;
        background-color: #f3f4f6;
        background-position: center;
        background-repeat: no-repeat;
        background-size: ${imgFit};
        border-bottom: 1px solid ${PRIMARY};
      }
      .gallery .cell .cap {
        font-family: Helvetica, sans-serif; font-size: 9px; letter-spacing: 0.2em;
        text-transform: uppercase; color: #fff; background: ${PRIMARY};
        padding: 8px 12px; margin: 0;
      }

      /* ── Defect block — 3-column row layout ─────────────────────
         Image | Description | Severity badge. Each photo gets its
         own row, the defect description is repeated only on the
         first row to avoid noise. The whole defect stays together
         on a page when possible. */
      .defect-block {
        margin-top: 16px; border: 1px solid ${PRIMARY}; background: #fff;
        page-break-inside: avoid;
      }
      .defect-block + .defect-block { margin-top: 14px; }
      .defect-head {
        display: flex; align-items: center; justify-content: space-between;
        padding: 8px 14px; border-bottom: 1px solid ${PRIMARY};
        background: #fafafa;
      }
      .defect-title {
        font-family: Georgia, serif; font-size: 13px; color: ${PRIMARY};
        margin: 0; flex: 1;
      }
      .defect-tag {
        font-family: Helvetica, sans-serif; font-size: 8.5px;
        letter-spacing: 0.22em; text-transform: uppercase;
        padding: 3px 10px; color: #fff; font-weight: 700;
      }
      .defect-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
      .defect-table td {
        vertical-align: middle; padding: 8px 12px;
        border-top: 1px solid ${RULE};
      }
      .defect-table tr:first-child td { border-top: none; }
      .defect-table .dr-img { width: 38%; padding: 8px; }
      /* Background-image with object-fit:contain so the WHOLE photo is
         visible (no center-crop). Letterbox area shows the muted bg. */
      .defect-table .dr-img .dr-photo {
        display: block; width: 100%; height: 110px;
        background-color: #f3f4f6;
        background-position: center;
        background-repeat: no-repeat;
        background-size: ${imgFit};
        border: 1px solid ${RULE};
      }
      .defect-table .dr-desc {
        width: 44%;
        font-family: Georgia, serif; font-size: 11.5px; line-height: 1.5;
        color: ${PRIMARY};
      }
      .defect-table .dr-desc .dr-caption {
        display: block; font-family: Helvetica, sans-serif; font-size: 8px;
        letter-spacing: 0.22em; text-transform: uppercase; color: ${MUTED};
        margin-top: 6px;
      }
      .defect-table .dr-sev {
        width: 18%; text-align: center;
        font-family: Helvetica, sans-serif; font-size: 10.5px;
        font-weight: 700; letter-spacing: 0.18em;
        text-transform: uppercase;
      }
      .defect-empty {
        padding: 24px; text-align: center;
        border: 1px dashed ${RULE};
        font-family: Helvetica, sans-serif; font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase; color: ${MUTED};
      }

      .pill {
        display: inline-block; padding: 6px 14px; margin: 4px 6px 0 0;
        font-family: Helvetica, sans-serif; font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        border: 1px solid ${PRIMARY}; color: ${PRIMARY};
      }

      .sig-row { display: flex; gap: 60px; margin-top: 80px; }
      .sig { flex: 1; }
      .sig .line { border-bottom: 1.5px solid ${PRIMARY}; height: 60px; }
      .sig .cap {
        font-family: Helvetica, sans-serif; font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: ${MUTED}; margin-top: 8px;
      }

      /* Thank-you closing page */
      .ty-pg {
        padding: 0;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        background: linear-gradient(180deg, #fafaf7 0%, #ffffff 60%);
        text-align: center;
      }
      .ty-pg .ty-eyebrow {
        font-family: Helvetica, sans-serif; font-size: 10px;
        letter-spacing: 0.32em; text-transform: uppercase;
        color: ${ACCENT}; margin: 0 0 32px;
      }
      .ty-pg .ty-headline {
        font-family: Georgia, serif; font-weight: 300;
        font-size: 96px; line-height: 0.95; letter-spacing: -1.5px;
        margin: 0; color: ${PRIMARY};
      }
      .ty-pg .ty-headline em { color: ${ACCENT}; font-style: italic; }
      .ty-pg .ty-rule { width: 96px; height: 3px; background: ${ACCENT}; margin: 40px 0 32px; }
      .ty-pg .ty-deck {
        font-family: Georgia, serif; font-style: italic; font-size: 18px;
        line-height: 1.6; color: ${MUTED}; max-width: 480px; margin: 0;
      }
      .ty-pg .ty-brand {
        margin-top: 80px;
        font-family: Helvetica, sans-serif; font-size: 11px;
        letter-spacing: 0.32em; text-transform: uppercase;
        color: ${PRIMARY}; font-weight: 700;
      }
      .ty-pg .ty-contact {
        margin-top: 6px;
        font-family: Helvetica, sans-serif; font-size: 9px;
        letter-spacing: 0.22em; text-transform: uppercase; color: ${MUTED};
      }
    </style>
  `;

  // ─── 1. COVER ─────────────────────────────────────────────────────
  // CheckSquare-style teal cover with photo collage circle + contact bar.
  const TEAL       = settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6';
  const TEAL_DARK  = settings?.secondaryBrandColor || settings?.secondaryColor || '#1A8A9A';
  const INK_DARK   = '#1F2A35';
  const tagline    = settings?.companyTagline   || 'Check Right. Live Safe.';
  const subtitle   = settings?.companySubtitle  || 'HOME INSPECTION SERVICES';

  // Pick up to 4 collage images: prefer first 4 corner photos across rooms.
  const collagePool = [];
  (inspection.roomInspections || []).forEach((r) => {
    (r.cornerPhotos || []).forEach((p) => {
      if (collagePool.length < 4 && p?.url) collagePool.push(p.url);
    });
  });
  while (collagePool.length < 4) collagePool.push(null);

  // SVG inspection vignettes used when no photos are available.
  const fallbackVignette = (idx) => {
    const tints = ['#9bd9e3', '#bce3eb', '#d9eef2', '#7fc8d5'];
    const c = tints[idx % tints.length];
    return `<div style="width:100%;height:100%;background:${c};display:flex;align-items:center;justify-content:center;">
      <svg viewBox="0 0 60 60" style="width:50%;height:50%;opacity:0.55;" xmlns="http://www.w3.org/2000/svg">
        <circle cx="22" cy="22" r="14" fill="none" stroke="#fff" stroke-width="3"/>
        <line x1="32" y1="32" x2="48" y2="48" stroke="#fff" stroke-width="4" stroke-linecap="round"/>
      </svg>
    </div>`;
  };

  const collageCell = (url, idx, clip) => `
    <div style="position:absolute;${clip};overflow:hidden;background:#eef6f8;">
      ${url
        ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover;" />`
        : fallbackVignette(idx)}
    </div>`;

  // Header company badge — logo on top of "CHECK SQUARE" + subtitle.
  const headerBadge = `
    <div style="display:flex;align-items:flex-start;gap:14px;">
      ${logo
        ? `<img src="${logo}" style="height:64px;width:auto;object-fit:contain;" />`
        : `<div style="width:64px;height:64px;border-radius:50%;background:#fff;display:flex;align-items:center;justify-content:center;">
             <svg viewBox="0 0 40 40" style="width:60%;height:60%;" xmlns="http://www.w3.org/2000/svg">
               <path d="M6 22 L20 8 L34 22 L34 34 L6 34 Z" fill="none" stroke="${INK_DARK}" stroke-width="2" stroke-linejoin="round"/>
               <circle cx="22" cy="22" r="6" fill="none" stroke="${TEAL_DARK}" stroke-width="2"/>
               <line x1="26" y1="26" x2="32" y2="32" stroke="${TEAL_DARK}" stroke-width="2" stroke-linecap="round"/>
             </svg>
           </div>`}
      <div style="line-height:1;padding-top:4px;">
        <div style="font-family:'Arial Black','Helvetica',sans-serif;font-weight:900;font-size:24px;letter-spacing:1px;color:${INK_DARK};">
          ${esc(cName.toUpperCase())}
        </div>
        <div style="margin-top:6px;font-family:Helvetica,sans-serif;font-size:9px;letter-spacing:0.32em;color:${INK_DARK};">
          - ${esc(subtitle)} -
        </div>
      </div>
    </div>
  `;

  const chevrons = (color = '#ffffff') => `
    <span style="display:inline-block;font-family:Arial,sans-serif;font-weight:900;color:${color};font-size:28px;letter-spacing:-4px;">
      &gt;&gt;&gt;&gt;&gt;
    </span>
  `;

  // ─── 1. COVER ────────────────────────────────────────────────────
  // If an admin-uploaded cover image (settings.coverImage) or a static
  // /report-cover.jpg in public/ is available, use it as a full-bleed
  // page. Otherwise fall back to the built-in royal-home illustration
  // so the cover never looks empty.
  const coverImageSrc =
    settings?.coverImage ||
    settings?.reportCoverImage ||
    '/report-cover.jpg';

  // Built-in stately/royal home SVG used as the default cover and as the
  // hero photo placeholder on the Property Details page. Pure inline SVG
  // so it works offline and inside html2pdf without external assets.
  const royalHomeSVG = `
    <svg viewBox="0 0 800 1100" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" style="width:100%;height:100%;display:block;">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#0e6b7a"/>
          <stop offset="0.55" stop-color="#15a0b3"/>
          <stop offset="1" stop-color="#a9dee2"/>
        </linearGradient>
        <linearGradient id="mansion" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fdf6e3"/>
          <stop offset="1" stop-color="#e6d8b0"/>
        </linearGradient>
        <linearGradient id="roof" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#5c3a21"/>
          <stop offset="1" stop-color="#3a230f"/>
        </linearGradient>
        <linearGradient id="lawn" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#2f6b3a"/>
          <stop offset="1" stop-color="#143b1d"/>
        </linearGradient>
        <radialGradient id="sun" cx="0.78" cy="0.22" r="0.18">
          <stop offset="0" stop-color="#fff7d4" stop-opacity="0.95"/>
          <stop offset="1" stop-color="#fff7d4" stop-opacity="0"/>
        </radialGradient>
      </defs>

      <!-- Sky + soft sun glow -->
      <rect width="800" height="1100" fill="url(#sky)"/>
      <rect width="800" height="1100" fill="url(#sun)"/>

      <!-- Distant tree line -->
      <g fill="#0e3a2a" opacity="0.55">
        <ellipse cx="60"  cy="760" rx="95"  ry="60"/>
        <ellipse cx="170" cy="770" rx="110" ry="55"/>
        <ellipse cx="310" cy="760" rx="100" ry="60"/>
        <ellipse cx="480" cy="770" rx="115" ry="55"/>
        <ellipse cx="640" cy="760" rx="100" ry="60"/>
        <ellipse cx="770" cy="770" rx="95"  ry="55"/>
      </g>

      <!-- Lawn -->
      <rect x="0" y="780" width="800" height="320" fill="url(#lawn)"/>

      <!-- Driveway -->
      <polygon points="330,1100 470,1100 440,820 360,820" fill="#d4cfb6" opacity="0.92"/>
      <polygon points="330,1100 470,1100 440,820 360,820" fill="none" stroke="#8a8466" stroke-width="1.5"/>

      <!-- Side wings -->
      <rect x="110" y="560" width="180" height="260" fill="url(#mansion)" stroke="#5a4a25" stroke-width="1.2"/>
      <polygon points="110,560 200,500 290,560" fill="url(#roof)"/>
      <rect x="510" y="560" width="180" height="260" fill="url(#mansion)" stroke="#5a4a25" stroke-width="1.2"/>
      <polygon points="510,560 600,500 690,560" fill="url(#roof)"/>

      <!-- Side-wing windows -->
      <g fill="#7fb2c1" stroke="#3a230f" stroke-width="1.4">
        <rect x="140" y="600" width="40" height="60"/>
        <rect x="220" y="600" width="40" height="60"/>
        <rect x="140" y="700" width="40" height="60"/>
        <rect x="220" y="700" width="40" height="60"/>
        <rect x="540" y="600" width="40" height="60"/>
        <rect x="620" y="600" width="40" height="60"/>
        <rect x="540" y="700" width="40" height="60"/>
        <rect x="620" y="700" width="40" height="60"/>
      </g>
      <g stroke="#3a230f" stroke-width="1">
        <line x1="160" y1="600" x2="160" y2="660"/><line x1="140" y1="630" x2="180" y2="630"/>
        <line x1="240" y1="600" x2="240" y2="660"/><line x1="220" y1="630" x2="260" y2="630"/>
        <line x1="160" y1="700" x2="160" y2="760"/><line x1="140" y1="730" x2="180" y2="730"/>
        <line x1="240" y1="700" x2="240" y2="760"/><line x1="220" y1="730" x2="260" y2="730"/>
        <line x1="560" y1="600" x2="560" y2="660"/><line x1="540" y1="630" x2="580" y2="630"/>
        <line x1="640" y1="600" x2="640" y2="660"/><line x1="620" y1="630" x2="660" y2="630"/>
        <line x1="560" y1="700" x2="560" y2="760"/><line x1="540" y1="730" x2="580" y2="730"/>
        <line x1="640" y1="700" x2="640" y2="760"/><line x1="620" y1="730" x2="660" y2="730"/>
      </g>

      <!-- Main building -->
      <rect x="260" y="500" width="280" height="320" fill="url(#mansion)" stroke="#5a4a25" stroke-width="1.4"/>

      <!-- Pediment / classical roof -->
      <polygon points="260,500 400,400 540,500" fill="url(#roof)"/>
      <polygon points="260,500 400,400 540,500" fill="none" stroke="#2a1a08" stroke-width="1.4"/>
      <circle cx="400" cy="470" r="14" fill="#fdf6e3" stroke="#5a4a25" stroke-width="1.4"/>
      <circle cx="400" cy="470" r="5" fill="#7fb2c1"/>

      <!-- Columns -->
      <g fill="#fdf6e3" stroke="#5a4a25" stroke-width="1.2">
        <rect x="280" y="560" width="22" height="260"/>
        <rect x="330" y="560" width="22" height="260"/>
        <rect x="448" y="560" width="22" height="260"/>
        <rect x="498" y="560" width="22" height="260"/>
      </g>
      <!-- Column capitals/bases -->
      <g fill="#fdf6e3" stroke="#5a4a25" stroke-width="1.2">
        <rect x="275" y="555" width="32" height="10"/>
        <rect x="325" y="555" width="32" height="10"/>
        <rect x="443" y="555" width="32" height="10"/>
        <rect x="493" y="555" width="32" height="10"/>
        <rect x="275" y="815" width="32" height="10"/>
        <rect x="325" y="815" width="32" height="10"/>
        <rect x="443" y="815" width="32" height="10"/>
        <rect x="493" y="815" width="32" height="10"/>
      </g>

      <!-- Grand doorway -->
      <rect x="372" y="680" width="56" height="140" fill="#3a230f" stroke="#1a0e04" stroke-width="1.6"/>
      <line x1="400" y1="680" x2="400" y2="820" stroke="#1a0e04" stroke-width="1.4"/>
      <circle cx="388" cy="752" r="2.5" fill="#d4af37"/>
      <circle cx="412" cy="752" r="2.5" fill="#d4af37"/>
      <!-- Fanlight -->
      <path d="M372 680 Q400 650 428 680 Z" fill="#7fb2c1" stroke="#1a0e04" stroke-width="1.4"/>
      <!-- Steps -->
      <rect x="354" y="820" width="92" height="6" fill="#cfc7a2" stroke="#5a4a25" stroke-width="0.8"/>
      <rect x="344" y="826" width="112" height="8" fill="#c6bd92" stroke="#5a4a25" stroke-width="0.8"/>

      <!-- Upper-floor windows on main building -->
      <g fill="#7fb2c1" stroke="#3a230f" stroke-width="1.4">
        <rect x="290" y="600" width="40" height="60"/>
        <rect x="470" y="600" width="40" height="60"/>
        <rect x="380" y="580" width="40" height="60"/>
      </g>
      <g stroke="#3a230f" stroke-width="1">
        <line x1="310" y1="600" x2="310" y2="660"/><line x1="290" y1="630" x2="330" y2="630"/>
        <line x1="490" y1="600" x2="490" y2="660"/><line x1="470" y1="630" x2="510" y2="630"/>
        <line x1="400" y1="580" x2="400" y2="640"/><line x1="380" y1="610" x2="420" y2="610"/>
      </g>

      <!-- Chimneys -->
      <rect x="305" y="410" width="20" height="50" fill="#5a3925" stroke="#2a1a08" stroke-width="1"/>
      <rect x="475" y="410" width="20" height="50" fill="#5a3925" stroke="#2a1a08" stroke-width="1"/>

      <!-- Hedges / topiaries -->
      <g fill="#1f5a2c" stroke="#0d2e15" stroke-width="1">
        <circle cx="100" cy="840" r="30"/>
        <circle cx="700" cy="840" r="30"/>
        <ellipse cx="330" cy="855" rx="30" ry="18"/>
        <ellipse cx="470" cy="855" rx="30" ry="18"/>
      </g>

      <!-- Flag on roof -->
      <line x1="400" y1="400" x2="400" y2="360" stroke="#3a230f" stroke-width="2"/>
      <polygon points="400,360 432,370 400,380" fill="#d4af37"/>
    </svg>
  `;

  // CHECK SQUARE-branded canvas used as the last-ditch fallback when both
  // an uploaded image AND the static report-cover.jpg are missing. Renders
  // the royal-home illustration in the bottom band and the brand title up
  // top, so the cover always looks intentional.
  const _builtInCheckSquareCover = `
    <div style="position:absolute;inset:0;display:flex;flex-direction:column;background:${TEAL};color:#fff;font-family:Helvetica,sans-serif;text-align:center;">
      <div style="padding:80px 40px 24px;">
        <div style="font-size:42px;font-weight:900;letter-spacing:2px;">CHECK SQUARE</div>
        <div style="font-size:13px;letter-spacing:6px;margin-top:8px;opacity:0.9;">— HOME INSPECTION SERVICES —</div>
        <div style="margin-top:48px;font-size:30px;font-weight:900;">HOME INSPECTION REPORT</div>
        <div style="margin-top:18px;font-size:13px;opacity:0.9;">${esc(tagline)}</div>
      </div>
      <div style="flex:1;position:relative;overflow:hidden;">
        ${royalHomeSVG}
      </div>
    </div>
  `;

  const imageCover = `
    <div class="pg cover" style="position:relative;width:100%;min-height:1050px;background:${TEAL};overflow:hidden;padding:0;margin:0;">
      <img src="${coverImageSrc}"
           alt="CheckSquare Home Inspection Report"
           style="display:block;width:100%;height:1050px;object-fit:cover;object-position:center;"
           onerror="this.style.display='none';this.parentNode.querySelector('[data-cover-fallback]').style.display='flex';" />
      <div data-cover-fallback style="display:none;position:absolute;inset:0;">
        ${_builtInCheckSquareCover}
      </div>
    </div>
  `;

  const cover = imageCover;

  const _htmlCover_unused = `
    <div class="pg cover" style="position:relative;width:100%;min-height:1050px;background:${TEAL};overflow:hidden;padding:0;">

      <!-- Decorative white diagonal swoosh on the upper right -->
      <div style="position:absolute;top:-60px;right:-120px;width:520px;height:340px;background:#ffffff;transform:rotate(-22deg);"></div>
      <!-- Lower left soft fade -->
      <div style="position:absolute;left:0;bottom:120px;width:340px;height:260px;background:rgba(255,255,255,0.08);transform:rotate(8deg);"></div>

      <!-- Header: logo + chevrons -->
      <div style="position:relative;display:flex;justify-content:space-between;align-items:flex-start;padding:44px 56px 0;">
        ${headerBadge}
        <div style="padding-top:18px;">${chevrons('#ffffff')}</div>
      </div>

      <!-- Hero: outer ring with 4 photo wedges + inner white circle title -->
      <div style="position:relative;margin:60px auto 0;width:520px;height:520px;">
        <!-- Outer ring background (white frame) -->
        <div style="position:absolute;inset:0;border-radius:50%;background:#ffffff;"></div>

        <!-- Photo wedges (4 quadrants clipped to outer ring) -->
        <div style="position:absolute;inset:18px;border-radius:50%;overflow:hidden;background:#cfe9ee;">
          ${collageCell(collagePool[0], 0, 'top:0;left:0;width:50%;height:50%;')}
          ${collageCell(collagePool[1], 1, 'top:0;right:0;width:50%;height:50%;')}
          ${collageCell(collagePool[2], 2, 'bottom:0;left:0;width:50%;height:50%;')}
          ${collageCell(collagePool[3], 3, 'bottom:0;right:0;width:50%;height:50%;')}
        </div>

        <!-- Inner white border between photos and title disc -->
        <div style="position:absolute;top:50%;left:50%;width:280px;height:280px;margin:-140px 0 0 -140px;border-radius:50%;background:#ffffff;"></div>

        <!-- Inner title disc (teal) -->
        <div style="position:absolute;top:50%;left:50%;width:248px;height:248px;margin:-124px 0 0 -124px;border-radius:50%;background:${TEAL};display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px;">
          <div style="font-family:'Arial Black','Helvetica',sans-serif;font-weight:900;font-size:30px;line-height:1.05;color:${INK_DARK};letter-spacing:1px;">
            HOME<br/>INSPECTION<br/>REPORT
          </div>
          <div style="margin-top:18px;display:inline-block;padding:8px 18px;border-radius:999px;background:#ffffff;font-family:Helvetica,sans-serif;font-weight:700;font-size:12px;color:${TEAL_DARK};">
            ${esc(tagline)}
          </div>
        </div>
      </div>

      <!-- Lower chevrons row (decorative) -->
      <div style="position:absolute;left:56px;bottom:160px;">
        <span style="display:inline-block;font-family:Arial,sans-serif;font-weight:900;color:#ffffff;font-size:22px;letter-spacing:-3px;">&gt;&gt;&gt;&gt;&gt;</span>
      </div>
      <div style="position:absolute;right:56px;bottom:160px;">
        ${chevrons('#ffffff')}
      </div>
      <div style="position:absolute;left:50%;bottom:130px;transform:translateX(-50%);font-family:Arial,sans-serif;color:#ffffff;font-size:14px;letter-spacing:-2px;">
        &lt;&lt;&lt;&lt;
      </div>

      <!-- Dark contact bar -->
      <div style="position:absolute;left:0;right:0;bottom:0;background:#1B1B1B;color:#ffffff;padding:18px 36px;display:flex;align-items:center;gap:28px;">
        <div style="display:inline-block;padding:10px 22px;border-radius:999px;background:${TEAL};color:#ffffff;font-family:Helvetica,sans-serif;font-weight:700;font-size:13px;letter-spacing:0.04em;">
          Contact Us
        </div>
        <div style="display:flex;align-items:center;gap:10px;font-family:Helvetica,sans-serif;font-size:12px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${TEAL};">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2"><path d="M4 6h16v12H4z"/><polyline points="4,6 12,13 20,6"/></svg>
          </span>
          <span>${esc(email) || 'contact@example.com'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:10px;font-family:Helvetica,sans-serif;font-size:12px;">
          <span style="display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:50%;background:${TEAL};">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.86 19.86 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.86 19.86 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z"/></svg>
          </span>
          <span>${esc(settings?.companyPhone1 || phone) || '+91 0000000000'}</span>
        </div>
      </div>
    </div>
  `;

  // ─── 2. PROPERTY DETAILS ──────────────────────────────────────────
  // Split layout: left dark photo column + right white info column with
  // three icon rows (prepared for, address, date).
  //
  // The hero photo deliberately falls back to the built-in royal-home
  // illustration (or an admin-uploaded `settings.propertyHeroImage`)
  // instead of the marketing cover image or the first room's first
  // corner photo. Keeping the imagery constant across the property
  // details page and any later dividers preserves the editorial feel
  // of the report and avoids the document looking different every time
  // depending on which room was photographed first.
  const heroPhoto =
    settings?.propertyHeroImage ||
    inspection.metadata?.propertyImage?.url ||
    inspection.metadata?.propertyImage ||
    '/property-hero.jpg';

  const detailRow = (icon, label, value) => `
    <div style="display:flex;align-items:flex-start;gap:18px;margin-bottom:26px;">
      <div style="flex-shrink:0;width:46px;height:46px;border-radius:50%;background:${TEAL};display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.12);">
        ${icon}
      </div>
      <div style="flex:1;min-width:0;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase;margin-bottom:4px;">${esc(label)}</div>
        <div style="padding:6px 0;font-family:'Helvetica','Arial',sans-serif;font-weight:700;font-size:14px;line-height:1.35;color:${INK_DARK};border-bottom:1.5px solid ${TEAL};word-wrap:break-word;overflow-wrap:anywhere;min-height:28px;">
          ${esc(value) || '<span style="color:#9ca3af;font-weight:400;font-style:italic;">Not provided</span>'}
        </div>
      </div>
    </div>
  `;

  const iconUser     = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 21c1-4 4-6 7-6s6 2 7 6"/></svg>`;
  const iconLocation = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>`;
  const iconCalendar = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="1.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/></svg>`;
  const iconHome     = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>`;
  const iconRef      = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 12h6"/><path d="M9 16h6"/><path d="M14 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8z"/><path d="M14 4v4h4"/></svg>`;

  const propertyDetailsPg = `
    <div class="pg cover" style="position:relative;width:100%;min-height:1050px;background:#ffffff;overflow:hidden;padding:0;">
      <!-- Top accent band -->
      <div style="position:absolute;left:0;right:0;top:0;height:8px;background:linear-gradient(90deg,${TEAL} 0%,#1F3F8E 100%);"></div>

      <!-- Left photo column (true half page, background-image so html2canvas always covers) -->
      <div style="position:absolute;left:0;top:8px;bottom:0;width:50%;background:#1f2937 ${heroPhoto ? `url('${heroPhoto}') center/cover no-repeat` : ''};overflow:hidden;">
        ${heroPhoto ? '' : `<div style="width:100%;height:100%;background:linear-gradient(160deg,#0e6b7a 0%,#1f2937 100%);display:flex;align-items:stretch;justify-content:center;">${royalHomeSVG}</div>`}
        <!-- Photo gradient overlay for caption -->
        <div style="position:absolute;left:0;right:0;bottom:0;padding:18px 22px;background:linear-gradient(transparent,rgba(0,0,0,0.7));color:#fff;font-family:Helvetica,Arial,sans-serif;">
          <div style="font-size:9px;letter-spacing:0.28em;text-transform:uppercase;opacity:0.85;">Inspected Property</div>
          <div style="font-size:13px;font-weight:700;margin-top:4px;">${esc(inspection.metadata?.propertyAddress || cName)}</div>
        </div>
      </div>

      <!-- Right info column -->
      <div style="position:absolute;left:50%;right:0;top:8px;bottom:0;padding:60px 48px 40px 48px;display:flex;flex-direction:column;">
        <div style="font-family:Helvetica,Arial,sans-serif;font-size:10px;letter-spacing:0.32em;color:${TEAL};text-transform:uppercase;font-weight:700;margin-bottom:10px;">Section 01</div>
        <h1 style="margin:0;font-family:'Arial Black','Helvetica',sans-serif;font-weight:900;font-size:46px;line-height:1.05;letter-spacing:-1px;color:${INK_DARK};">
          PROPERTY<br/>DETAILS
        </h1>
        <div style="height:4px;width:60px;background:${TEAL};margin-top:14px;margin-bottom:36px;"></div>

        <div>
          ${detailRow(iconUser,     'Prepared For',     inspection.metadata?.preparedFor)}
          ${detailRow(iconLocation, 'Property Address', inspection.metadata?.propertyAddress)}
          ${detailRow(iconHome,     'Property Type',    inspection.metadata?.propertyType)}
          ${detailRow(iconCalendar, 'Inspection Date',  fmtDate(inspection.metadata?.inspectionDate))}
          ${detailRow(iconRef,      'Reference ID',     refId)}
        </div>
      </div>
    </div>
  `;

  // ─── helper: standard interior page ───────────────────────────────
  const page = (eyebrow, title, html, pageNum, bodyClass = '') => `
    <div class="pg">
      <p class="eyebrow">${esc(eyebrow)}</p>
      <h2 class="section-title">${title}</h2>
      <div class="rule"></div>
      <div class="body${bodyClass ? ' ' + bodyClass : ''}">${html}</div>
      <div class="pg-footer">
        <span class="brand"><strong>${esc(cName)}</strong></span>
        <span>Inspection #${esc(refId)}</span>
        <span>${esc(eyebrow)} · ${pageNum}</span>
      </div>
    </div>
  `;

  // ─── 2 & 3. DISCLAIMERS ───────────────────────────────────────────
  const disclaimer1 = page(
    'Notice 01 · Disclaimer',
    `The <em>terms</em> of inspection`,
    settings?.disclaimerPage1 || '<p>No disclaimer configured.</p>',
    '02',
    'disclaimer-body',
  );
  const disclaimer2 = page(
    'Notice 02 · Scope',
    `The <em>limits</em> of inspection`,
    settings?.disclaimerPage2 || '<p>No disclaimer configured.</p>',
    '03',
    'disclaimer-body',
  );

  // ─── 4. SEVERITY TAXONOMY ─────────────────────────────────────────
  const sevHtml = severities.length > 0
    ? severities.map((s) => `
        <div class="sev-row">
          <span class="sev-swatch" style="background: ${s.color};"></span>
          <div>
            <span class="sev-name">${esc(s.name)}</span>
            <div class="sev-def">${esc(s.definition)}</div>
          </div>
        </div>
      `).join('')
    : '<p>No severity taxonomy configured.</p>';
  const severityPg = page('Reference · Taxonomy', `Severity, <em>defined.</em>`, sevHtml, '04');

  // ─── 5. AREA CALCULATIONS ─────────────────────────────────────────
  const areas = inspection.areaCalculations || [];
  const metrics = (inspection.propertyMetrics || []).filter(
    (m) => m && (m.label || m.value)
  );
  const totalSft = areas.reduce(
    (sum, a) => sum + computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit), 0,
  );
  const areaTable = areas.length > 0 ? `
    <table class="editorial">
      <thead>
        <tr>
          <th style="width: 50%;">Room / section</th>
          <th>Length</th>
          <th>Width</th>
          <th style="text-align: right;">Area (sft)</th>
        </tr>
      </thead>
      <tbody>
        ${areas.map((a) => `
          <tr>
            <td>${esc(a.room || a.name) || '—'}</td>
            <td>${esc(a.length)} ${esc(a.lengthUnit || 'ft')}</td>
            <td>${esc(a.width)} ${esc(a.widthUnit || 'ft')}</td>
            <td style="text-align: right;">${computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit).toLocaleString()}</td>
          </tr>
        `).join('')}
        <tr class="total">
          <td colspan="3">TOTAL AREA (sft)</td>
          <td style="text-align: right;">${totalSft.toLocaleString()}</td>
        </tr>
        ${metrics.map((m) => `
          <tr class="total">
            <td colspan="3" style="text-transform:uppercase;letter-spacing:0.04em;">${esc(m.label) || '—'}</td>
            <td style="text-align: right;">${esc(m.value)}${esc(m.unit || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : (metrics.length > 0 ? `
    <table class="editorial">
      <thead>
        <tr>
          <th style="width: 70%;">Property metric</th>
          <th style="text-align: right;">Value</th>
        </tr>
      </thead>
      <tbody>
        ${metrics.map((m) => `
          <tr class="total">
            <td style="text-transform:uppercase;letter-spacing:0.04em;">${esc(m.label) || '—'}</td>
            <td style="text-align: right;">${esc(m.value)}${esc(m.unit || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  ` : '<p>No area calculations recorded for this property.</p>');
  const areaHtml = areaTable;
  const areaPg = page('Measurements · Spatial', `The footprint, <em>tallied.</em>`, areaHtml, '05');

  // ─── 6. ENVIRONMENTAL ─────────────────────────────────────────────
  const w = inspection.waterQuality || {};
  const waterImages = Array.isArray(w.images) ? w.images.filter((i) => i && i.url) : [];
  const envHtml = `
    ${waterImages.length === 0
      ? `<div style="border: 1px solid ${RULE}; padding: 12px; margin-bottom: 18px; background: #fafaf7;">${WATER_SVG(ACCENT, PRIMARY)}</div>`
      : `<div style="display: grid; grid-template-columns: repeat(${waterImages.length === 1 ? 1 : (waterImages.length === 2 ? 2 : 3)}, 1fr); gap: 10px; margin-bottom: 18px;">
          ${waterImages.map((img, i) => `
            <div style="border: 1px solid ${RULE}; background: #fafaf7; overflow: hidden;">
              <div style="display: block; width: 100%; height: 180px; background-color:#f3f4f6; background-image:url('${img.url}'); background-position:center; background-repeat:no-repeat; background-size:contain;"></div>
              <p style="font-family: Helvetica, sans-serif; font-size: 8px; letter-spacing: 0.22em; text-transform: uppercase; color: ${MUTED}; padding: 6px 10px; margin: 0; border-top: 1px solid ${RULE};">Water test · photo ${String(i + 1).padStart(2, '0')}</p>
            </div>
          `).join('')}
        </div>`
    }
    <table class="editorial">
      <thead><tr><th style="width: 60%;">Indicator</th><th>Reading</th></tr></thead>
      <tbody>
        <tr><td>Total dissolved solids (TDS)</td><td>${esc(w.tds) || '—'} ${w.tds ? 'ppm' : ''}</td></tr>
        <tr><td>pH</td><td>${esc(w.ph) || '—'}</td></tr>
      </tbody>
    </table>
    <p class="eyebrow" style="margin-top: 40px;">Hardware · brands observed</p>
    <div style="border: 1px solid ${RULE}; padding: 12px; margin-bottom: 14px; background: #fafaf7;">${BRAND_SVG(ACCENT, PRIMARY)}</div>
    <div style="margin-top: 8px;">
      ${(w.brands || []).length > 0
        ? (w.brands || []).map((b) => `<span class="pill">${esc(b)}</span>`).join('')
        : '<p style="font-style: italic; color: ' + MUTED + ';">No brands recorded.</p>'}
    </div>
  `;
  const envPg = page('Readings · Environment', `Water, air, <em>and ware.</em>`, envHtml, '06');

  // ─── 7+. ROOMS ─────────────────────────────────────────────────────
  const renderDefect = (defect, idx) => {
    const color = sevColor(defect.severity);
    const sev = (esc(defect.severity) || '—').toUpperCase();
    const desc = esc(defect.description) || esc(defect.title) || 'Observation';
    // Normalize photos: new schema = photos[{url, caption}]; legacy = beforePhoto/afterPhoto.
    let photos = Array.isArray(defect.photos) ? defect.photos : [];
    if (photos.length === 0) {
      const migrated = [];
      if (defect.beforePhoto) migrated.push({ url: defect.beforePhoto.url, caption: '' });
      if (defect.afterPhoto)  migrated.push({ url: defect.afterPhoto.url,  caption: '' });
      photos = migrated;
    }

    // 3-column rows (image | description | severity). Description
    // appears only on the first photo's row; subsequent rows leave
    // it blank but keep a per-photo caption (if any) so the page
    // stays scannable. When there are no photos, render a single
    // "no photo" row that still shows the description + severity.
    const rows = photos.length > 0
      ? photos.map((p, i) => `
          <tr>
            <td class="dr-img"><div class="dr-photo" style="background-image:url('${p.url}');" role="img" aria-label="${esc(defect.description || 'Defect')}${sev ? ` — ${sev}` : ''}"></div></td>
            <td class="dr-desc">
              ${i === 0 ? desc : (esc(p.caption) || '')}
              ${(i === 0 && p.caption) ? `<span class="dr-caption">${esc(p.caption)}</span>` : ''}
            </td>
            <td class="dr-sev" style="color:${color};">${i === 0 ? sev : ''}</td>
          </tr>
        `).join('')
      : `
          <tr>
            <td class="dr-img">
              <div style="width:100%;height:110px;border:1px dashed ${RULE};display:flex;align-items:center;justify-content:center;font-family:Helvetica,sans-serif;font-size:9px;letter-spacing:0.22em;text-transform:uppercase;color:${MUTED};">No photo</div>
            </td>
            <td class="dr-desc">${desc}</td>
            <td class="dr-sev" style="color:${color};">${sev}</td>
          </tr>
        `;

    return `
      <div class="defect-block">
        <div class="defect-head">
          <h4 class="defect-title">${String(idx + 1).padStart(2, '0')} · ${esc(defect.title) || 'Defect'}</h4>
          <span class="defect-tag" style="background:${color};">${sev}</span>
        </div>
        <table class="defect-table">
          <colgroup>
            <col style="width:38%" />
            <col style="width:44%" />
            <col style="width:18%" />
          </colgroup>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  };

  const rooms = inspection.roomInspections || [];
  let roomPageCounter = 7; // continues from page 06 (env)

  const roomsHtml = rooms.map((room, ri) => {
    const corners = room.cornerPhotos || [];
    const defects = room.defects || [];
    const roomNo = String(ri + 1).padStart(2, '0');
    const totalRoomsNo = String(rooms.length).padStart(2, '0');

    // ── Phase A page : Spaces / Corners ──────────────────────────
    const phaseAPageNo = String(roomPageCounter++).padStart(2, '0');
    const phaseAPage = `
      <div class="pg">
        <p class="room-eyebrow">Room ${roomNo} of ${totalRoomsNo} · Phase A</p>
        <h2 class="room-title">${esc(room.name)}</h2>
        <div class="rule"></div>

        <p class="phase-label">Phase A · The spaces, observed</p>
        ${corners.length > 0 ? `
          <div class="gallery">
            ${corners.map((p) => `
              <div class="cell">
              <div class="cell-photo" style="background-image:url('${p.url}');" role="img" aria-label="${esc(p.corner) || ''}"></div>
                <p class="cap">${esc(p.corner) || ''}</p>
              </div>
            `).join('')}
          </div>
        ` : `<p style="font-style: italic; color: ${MUTED};">No ambient photographs recorded for this room.</p>`}

        <div class="pg-footer">
          <span class="brand"><strong>${esc(cName)}</strong></span>
          <span>Inspection #${esc(refId)}</span>
          <span>${esc(room.name)} · Phase A · ${phaseAPageNo}</span>
        </div>
      </div>
    `;

    // ── Phase B page(s) : Defects ────────────────────────────────
    // We paginate defects across as many .pg containers as needed so a
    // room with many defects never spills into the footer area. The .pg
    // shell is clipped at 1050px tall (see the .pg rule earlier in this
    // stylesheet), so before this pagination logic the last defect on a
    // long Phase B page was rendered behind the absolute-positioned
    // footer. Now we measure each defect, chunk them by an estimated
    // available content height, and emit one .pg per chunk.

    // Usable vertical space inside a .pg for defect blocks =
    //   1050 (pg height) − 140 (top/bottom padding) − ~110 (room title +
    //   rule + phase label) − ~70 (footer + its top border + breathing
    //   room) ≈ 730px on the first Phase B page. Continuation pages
    //   reuse the same header/footer chrome so the capacity is the same.
    const PHASE_B_CAPACITY = 720;
    // Per-defect height estimate. Each block has:
    //  • defect-head:        ~34px
    //  • container border:   2px
    //  • block margin-top:   16px (first) / 14px (subsequent)
    //  • per photo row:      110px photo + 16px td padding = ~126px
    //  • when no photo:      one row at ~126px (the dashed placeholder
    //                        is also 110px tall)
    const estimateDefectHeight = (defect) => {
      const photoCount = Array.isArray(defect.photos) ? defect.photos.length : 0;
      const rowCount = Math.max(1, photoCount);
      return 34 + 2 + 14 + (rowCount * 126);
    };

    // Greedy bin-pack: keep filling the current bucket until adding the
    // next defect would exceed PHASE_B_CAPACITY, then start a new one.
    // A single oversized defect always lands on its own page so it
    // still gets clipped by overflow:hidden rather than colliding with
    // the next defect's header.
    const defectChunks = [];
    {
      let current = [];
      let used = 0;
      for (const d of defects) {
        const h = estimateDefectHeight(d);
        if (current.length > 0 && used + h > PHASE_B_CAPACITY) {
          defectChunks.push(current);
          current = [];
          used = 0;
        }
        current.push(d);
        used += h;
      }
      if (current.length > 0) defectChunks.push(current);
      if (defectChunks.length === 0) defectChunks.push([]); // empty room still emits one page
    }

    // Render one Phase B page per chunk. The first page keeps the
    // "Phase B · Defects (N)" label; continuations append "(cont.)" so
    // the reader knows the list is still going.
    const totalChunks = defectChunks.length;
    let runningDefectIdx = 0;
    const phaseBPage = defectChunks.map((chunk, ci) => {
      const phaseBPageNo = String(roomPageCounter++).padStart(2, '0');
      const label = totalChunks > 1
        ? `Phase B · Defects (${defects.length}) · Page ${ci + 1} of ${totalChunks}`
        : `Phase B · Defects (${defects.length})`;
      const body = defects.length > 0
        ? chunk.map((d) => {
            const html = renderDefect(d, runningDefectIdx);
            runningDefectIdx += 1;
            return html;
          }).join('')
        : `<p style="font-style: italic; color: ${MUTED};">No defects recorded for this room.</p>`;
      return `
        <div class="pg">
          <p class="room-eyebrow">Room ${roomNo} of ${totalRoomsNo} · Phase B</p>
          <h2 class="room-title">${esc(room.name)}</h2>
          <div class="rule"></div>

          <p class="phase-label">${label}</p>
          ${body}

          <div class="pg-footer">
            <span class="brand"><strong>${esc(cName)}</strong></span>
            <span>Inspection #${esc(refId)}</span>
            <span>${esc(room.name)} · Phase B · ${phaseBPageNo}</span>
          </div>
        </div>
      `;
    }).join('');

    return phaseAPage + phaseBPage;
  }).join('');

  // ─── FINAL. SIGN-OFF ──────────────────────────────────────────────
  const signoffHtml = `
    <table class="meta-table">
      <tr><td class="label">Inspector of record</td><td class="value">${esc(inspection.inspectorName) || '—'}</td></tr>
      <tr><td class="label">Document reference</td><td class="value" style="font-family: 'Courier New', monospace;">#${esc(refId)}</td></tr>
      <tr><td class="label">Generated</td><td class="value">${fmtDate(new Date().toISOString())}</td></tr>
      <tr><td class="label">Status</td><td class="value" style="text-transform: capitalize;">${esc(inspection.status) || '—'}</td></tr>
      ${inspection.approvedBy ? `<tr><td class="label">Approved by</td><td class="value">${esc(inspection.approvedBy)} · ${fmtDate(inspection.approvedAt)}</td></tr>` : ''}
    </table>
    <div class="sig-row">
      <div class="sig"><div class="line"></div><p class="cap">Inspector signature</p></div>
      <div class="sig"><div class="line"></div><p class="cap">Client signature</p></div>
    </div>
  `;
  const signoffPg = page('Closing · Sign-off', `The record, <em>bound.</em>`, signoffHtml, String(roomPageCounter++).padStart(2, '0'));

  // ─── SCORE PAGE (VBA-dashboard style) ────────────────────────────
  // Mirrors the PropChk Excel macro: bar-chart-per-room, donut-of-average,
  // and a colour-coded table with the same columns the inspector sees in
  // the source workbook (Room, Major, Minor, Cosmetic, Total, Score 0-10,
  // Score %, Priority). Replaces the older 7-factor explanation page.
  let scorePg = '';
  let scoreTablePg = '';
  let scoreExplanationPg = '';

  if (showScore && scoreSummary) {
    const rooms = scoreSummary.factors || [];
    const avgPct = scoreSummary.overall || 0;

    const priColor = (p) => p === 'Urgent' ? '#dc2626' : p === 'Watch' ? '#f59e0b' : '#16a34a';
    const sevCell = (n, bg) => `<td style="text-align:center; background:${bg}; font-variant-numeric: tabular-nums;">${n}</td>`;
    // Exact pastels lifted from the VBA macro RGB() calls so the dashboard
    // visually matches the Excel reference (used as fallback colours).
    const COL_MAJOR_BG   = '#fcebeb'; // RGB(252,235,235)
    const COL_MINOR_BG   = '#faeeda'; // RGB(250,238,218)
    const COL_COSMETIC_BG= '#f1efe8'; // RGB(241,239,232)
    const COL_SCORE_BG   = '#e1f5ee'; // RGB(225,245,238)
    const COL_AVG_BG     = '#dce6f1'; // RGB(220,230,241)
    const BAR_FILL       = '#2c3e50'; // RGB(44,62,80) navy

    // ── Dynamic severity columns ────────────────────────────────────
    // Source the column list straight from the scoring engine so admins
    // can add/remove severities in Settings and the dashboard adapts
    // automatically. Falls back to the historical 3-column layout when
    // no taxonomy is configured.
    const sevNames = (scoreSummary.severityNames && scoreSummary.severityNames.length)
      ? scoreSummary.severityNames
      : ['Major', 'Minor', 'Cosmetic'];
    const sevColorsMap = scoreSummary.severityColors || {};
    // Convert a saturated severity color into a soft pastel by mixing it
    // with white (≈85% white) so the column background stays readable.
    const lightenHex = (hex) => {
      if (!hex || typeof hex !== 'string') return '#f3f4f6';
      const h = hex.replace('#', '').trim();
      if (h.length !== 6) return '#f3f4f6';
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].some(Number.isNaN)) return '#f3f4f6';
      const mix = (c) => Math.round(c + (255 - c) * 0.85);
      const toHex = (c) => c.toString(16).padStart(2, '0');
      return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
    };
    const legacyBg = { Major: COL_MAJOR_BG, Minor: COL_MINOR_BG, Cosmetic: COL_COSMETIC_BG };
    const sevBg = (name) => legacyBg[name] || lightenHex(sevColorsMap[name]);

    // Property-wide totals used in the AVERAGE row (VBA SUM cols 2-5).
    const totByName = {};
    sevNames.forEach((nm) => {
      totByName[nm] = rooms.reduce((s, r) => s + (r.counts?.[nm] ?? 0), 0);
    });
    const totMajor    = totByName.Major    ?? rooms.reduce((s, r) => s + (r.major    || 0), 0);
    const totMinor    = totByName.Minor    ?? rooms.reduce((s, r) => s + (r.minor    || 0), 0);
    const totCosmetic = totByName.Cosmetic ?? rooms.reduce((s, r) => s + (r.cosmetic || 0), 0);
    const totAll      = sevNames.length
      ? sevNames.reduce((s, nm) => s + (totByName[nm] || 0), 0)
      : (totMajor + totMinor + totCosmetic);

    // ── Bar chart — switches layout when there are many rooms ───────
    // Up to 10 rooms: vertical bars with rotated room labels (matches
    // the VBA macro look). 11+ rooms: horizontal bars so every label
    // stays readable no matter how tall the property is.
    const HORIZONTAL_THRESHOLD = 10;
    const useHorizontal = rooms.length > HORIZONTAL_THRESHOLD;
    let barChartSVG = '';
    if (!useHorizontal) {
      const barWidth   = 38;
      const barGap     = 14;
      const chartH     = 220;
      const chartPadL  = 36;
      const chartPadB  = 70;
      const chartPadT  = 16;
      const chartW     = chartPadL + Math.max(1, rooms.length) * (barWidth + barGap) + 20;
      const bars = rooms.map((r, i) => {
        const x = chartPadL + i * (barWidth + barGap);
        const h = Math.max(2, (r.value / 100) * (chartH - chartPadT - chartPadB));
        const y = chartH - chartPadB - h;
        const labelText = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
        return `
          <rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${BAR_FILL}" />
          <text x="${x + barWidth / 2}" y="${y - 4}" text-anchor="middle"
                font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${PRIMARY}">
            ${(r.value / 10).toFixed(1)}
          </text>
          <text x="${x + barWidth / 2}" y="${chartH - chartPadB + 14}"
                text-anchor="end" transform="rotate(-40 ${x + barWidth / 2} ${chartH - chartPadB + 14})"
                font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${MUTED}">${esc(labelText)}</text>
        `;
      }).join('');
      const axisTicks = [0, 2, 4, 6, 8, 10].map((t) => {
        const y = chartH - chartPadB - (t / 10) * (chartH - chartPadT - chartPadB);
        return `
          <line x1="${chartPadL - 4}" x2="${chartW - 8}" y1="${y}" y2="${y}" stroke="${RULE}" stroke-width="0.5" />
          <text x="${chartPadL - 8}" y="${y + 3}" text-anchor="end"
                font-family="Helvetica, Arial, sans-serif" font-size="8" fill="${MUTED}">${t.toFixed(1)}</text>
        `;
      }).join('');
      barChartSVG = `
        <svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="${chartH}"
             preserveAspectRatio="xMidYMid meet"
             style="max-width:520px; max-height:${chartH}px; display:block;">
          ${axisTicks}
          ${bars}
        </svg>
      `;
    } else {
      // Horizontal layout — rooms on Y axis, score 0-100 on X.
      // For very large properties we cap the chart to the N lowest-
      // scoring rooms (the ones that need attention) so the bar block
      // never exceeds the A4 frame. The full table below still lists
      // every room.
      const MAX_BARS = 14;
      const sortedByScore = [...rooms].sort((a, b) => (a.value || 0) - (b.value || 0));
      const capped = rooms.length > MAX_BARS;
      const chartRooms = capped ? sortedByScore.slice(0, MAX_BARS) : rooms;
      const rowH    = 18;
      const rowGap  = 5;
      const padL    = 120;
      const padR    = 36;
      const padT    = 10;
      const padB    = 24;
      const innerW  = 360;
      const chartW  = padL + innerW + padR;
      const chartH  = padT + chartRooms.length * (rowH + rowGap) + padB;
      const xTicks  = [0, 25, 50, 75, 100];
      const ticks = xTicks.map((t) => {
        const x = padL + (t / 100) * innerW;
        return `
          <line x1="${x}" x2="${x}" y1="${padT}" y2="${chartH - padB}" stroke="${RULE}" stroke-width="0.5" />
          <text x="${x}" y="${chartH - padB + 12}" text-anchor="middle"
                font-family="Helvetica, Arial, sans-serif" font-size="8" fill="${MUTED}">${t}</text>
        `;
      }).join('');
      const bars = chartRooms.map((r, i) => {
        const y = padT + i * (rowH + rowGap);
        const w = Math.max(2, (r.value / 100) * innerW);
        const labelText = r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name;
        return `
          <text x="${padL - 8}" y="${y + rowH * 0.7}" text-anchor="end"
                font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${PRIMARY}">${esc(labelText)}</text>
          <rect x="${padL}" y="${y}" width="${w}" height="${rowH}" fill="${priColor(r.priority)}" opacity="0.85" />
          <text x="${padL + w + 4}" y="${y + rowH * 0.7}"
                font-family="Helvetica, Arial, sans-serif" font-size="9" fill="${PRIMARY}">${Math.round(r.value)}%</text>
        `;
      }).join('');
      const cappedNote = capped ? `
        <p style="margin:6px 0 0; font-family:Georgia, serif; font-size:10px; color:${MUTED}; font-style:italic;">
          Showing ${MAX_BARS} lowest-scoring rooms of ${rooms.length}. Full breakdown in the table below.
        </p>
      ` : '';
      barChartSVG = `
        <svg viewBox="0 0 ${chartW} ${chartH}" width="100%" height="${chartH}"
             preserveAspectRatio="xMidYMid meet"
             style="max-height:${chartH}px; display:block;">
          ${ticks}
          ${bars}
        </svg>
        ${cappedNote}
      `;
    }

    // Donut — average score in centre.
    const donutRadius = 78;
    const donutStroke = 22;
    const donutCirc = 2 * Math.PI * donutRadius;
    const donutOffset = donutCirc * (1 - avgPct / 100);
    const donutColor = avgPct >= 80 ? '#16a34a' : avgPct >= 60 ? '#f59e0b' : '#dc2626';
    const donutSVG = `
      <svg viewBox="-100 -100 200 200" width="200" height="200">
        <circle r="${donutRadius}" fill="none" stroke="${RULE}" stroke-width="${donutStroke}" />
        <circle r="${donutRadius}" fill="none" stroke="${donutColor}" stroke-width="${donutStroke}"
                stroke-dasharray="${donutCirc}" stroke-dashoffset="${donutOffset}"
                transform="rotate(-90)" stroke-linecap="butt" />
        <text text-anchor="middle" font-family="Georgia, serif" font-size="34" font-weight="600"
              fill="${donutColor}" y="6">${Math.round(avgPct)}%</text>
        <text text-anchor="middle" font-family="Helvetica, Arial, sans-serif" font-size="7"
              letter-spacing="2.5" fill="${MUTED}" y="28">AVERAGE SCORE</text>
      </svg>
    `;

    // ── Table pagination ────────────────────────────────────────────
    // Each rendered page holds at most ROWS_PER_PAGE rows so very large
    // properties spill onto extra pages instead of overflowing the
    // signature/footer area. The AVERAGE row sits on the final page.
    const buildRow = (r) => `
      <tr style="page-break-inside: avoid;">
        <td style="font-weight:600;">${esc(r.name)}</td>
        ${sevNames.map((nm) => sevCell(r.counts?.[nm] ?? 0, sevBg(nm))).join('')}
        <td style="text-align:center;">${r.total}</td>
        <td style="text-align:center; background:${COL_SCORE_BG}; font-weight:600;">${(r.value/10).toFixed(1)}</td>
        <td style="text-align:center; background:${COL_SCORE_BG}; font-weight:600;">${Math.round(r.value)}%</td>
        <td style="text-align:center;">
          <span style="display:inline-block; padding:2px 8px; border-radius:999px;
                       background:${priColor(r.priority)}; color:#fff; font-size:9px;
                       letter-spacing:0.14em; text-transform:uppercase;">
            ${esc(r.priority)}
          </span>
        </td>
      </tr>
    `;
    // Column widths: room + (severities share 36%) + total/score/score%/priority.
    // Severity columns split 36% equally so a 3-column dashboard keeps the
    // familiar 12% / 12% / 12% layout, and adding "Critical" automatically
    // rebalances to 9% / 9% / 9% / 9% without breaking the page width.
    const SEV_SHARE = 36;
    const sevColWidth = sevNames.length ? (SEV_SHARE / sevNames.length) : SEV_SHARE;
    const tableHeader = `
      <colgroup>
        <col style="width:22%" />
        ${sevNames.map(() => `<col style="width:${sevColWidth.toFixed(2)}%" />`).join('')}
        <col style="width:6%" />
        <col style="width:9%" />
        <col style="width:9%" />
        <col style="width:18%" />
      </colgroup>
      <thead>
        <tr>
          <th style="text-align:left;">Room</th>
          ${sevNames.map((nm) => `<th style="text-align:center; background:${sevBg(nm)};">${esc(nm)}</th>`).join('')}
          <th style="text-align:center;">Total</th>
          <th style="text-align:center;">Score /10</th>
          <th style="text-align:center;">Score %</th>
          <th style="text-align:center;">Priority</th>
        </tr>
      </thead>
    `;
    // AVERAGE row matches the VBA dashboard: column-wise SUMs for the
    // count columns and AVERAGEs for the score columns.
    const averageRow = `
      <tr class="total" style="page-break-inside: avoid; background:${COL_AVG_BG};">
        <td><strong>AVERAGE</strong></td>
        ${sevNames.map((nm) => `<td style="text-align:center;"><strong>${totByName[nm] || 0}</strong></td>`).join('')}
        <td style="text-align:center;"><strong>${totAll}</strong></td>
        <td style="text-align:center;"><strong>${(avgPct / 10).toFixed(1)}</strong></td>
        <td style="text-align:center;"><strong>${Math.round(avgPct)}%</strong></td>
        <td></td>
      </tr>
    `;
    // First score page reserves vertical room for the chart + donut, so
    // it holds fewer rows than the continuation pages. Continuation
    // pages are tuned to keep the entire page under the A4 frame
    // (≈790px of usable body height once headers/footers are removed).
    const ROWS_PER_TABLE_PAGE = 14;

    const remarks = scoreSummary.remarks;

    // ── Page 1: Dashboard only (chart + donut + remarks) ───────────
    const dashboardInner = `
      <div class="keep-together" style="display:flex; gap:24px; align-items:flex-start; margin-bottom:18px;">
        <div style="flex:1; border:1px solid ${RULE}; background:#fff; padding:14px 16px;">
          <p class="eyebrow" style="margin:0 0 8px;">Health score by room</p>
          ${barChartSVG}
        </div>
        <div style="width:220px; border:1px solid ${RULE}; background:#fff; padding:14px;
                    display:flex; flex-direction:column; align-items:center;">
          <p class="eyebrow" style="margin:0 0 4px;">Average score</p>
          ${donutSVG}
          <p style="margin:8px 0 0; font-family:Georgia, serif; font-size:11px; color:${MUTED};">
            Across ${rooms.length} room${rooms.length === 1 ? '' : 's'}
          </p>
        </div>
      </div>
      ${remarks ? `
        <div class="keep-together" style="border-left:3px solid ${ACCENT}; padding:12px 18px; background:#fafaf7; margin-top:24px;">
          <p class="eyebrow" style="margin:0 0 6px;">Inspector remarks</p>
          <p style="font-family:Georgia, serif; font-size:12px; line-height:1.6; color:${PRIMARY}; margin:0;">
            ${esc(remarks)}
          </p>
        </div>
      ` : ''}
    `;
    scorePg = page('Property Score · Dashboard', `Health, <em>at a glance.</em>`, dashboardInner, '03');

    // ── Page 2+: Room-by-room table (paginated) ────────────────────
    const tableChunks = [];
    for (let j = 0; j < rooms.length; j += ROWS_PER_TABLE_PAGE) {
      tableChunks.push(rooms.slice(j, j + ROWS_PER_TABLE_PAGE));
    }
    if (tableChunks.length === 0) tableChunks.push([]);

    const tablePages = tableChunks.map((chunk, pageIdx) => {
      const isLast = pageIdx === tableChunks.length - 1;
      const inner = `
        <table class="editorial${tableChunks.length > 1 ? ' may-split' : ''} score-table" style="margin-bottom:18px; font-variant-numeric: tabular-nums; table-layout: fixed;">
          ${tableHeader}
          <tbody>
            ${chunk.map(buildRow).join('')}
            ${isLast ? averageRow : ''}
          </tbody>
        </table>
        ${!isLast ? `
          <p style="font-family:Helvetica, Arial, sans-serif; font-size:9px; letter-spacing:0.2em;
                    text-transform:uppercase; color:${MUTED}; text-align:right; margin:6px 0 0;">
            continued on next page →
          </p>
        ` : ''}
      `;
      const eyebrow = pageIdx === 0 ? 'Property Score · Room Scores' : 'Property Score · Detail';
      const titleH  = pageIdx === 0 ? `Room scores, <em>by area.</em>` : `Room scores, <em>continued.</em>`;
      const pageNum = pageIdx === 0 ? '04' : `04.${pageIdx + 1}`;
      return page(eyebrow, titleH, inner, pageNum);
    });
    scoreTablePg = tablePages.join('');

    // Methodology page is now optional — admin can re-enable it via the
    // section ordering UI. Kept for backwards-compat.
    //
    // The page is composed of two layers:
    //   1. A dynamic auto-summary block built from the live scoring
    //      config + this inspection's numbers (always accurate).
    //   2. The admin-editable HTML below it, which can include {{tokens}}
    //      that get substituted with live values — so editing the
    //      scoring formula or weights automatically updates the prose.
    const sc       = settings?.scoring || {};
    const weights  = sc.weights || { Major: 0.70, Minor: 0.25, Cosmetic: 0.05 };
    const itemsPerRoom = sc.itemsPerRoom || 20;
    const roomFormula  = sc.roomScoreExpr || '0.70 * satMajor + 0.25 * satMinor + 0.05 * satCosmetic';
    const priFormula   = sc.priorityExpr  || "major >= 3 ? 'Urgent' : major >= 1 ? 'Watch' : 'Clean'";
    // totMajor / totMinor / totCosmetic / totAll already computed above
    // for the score-dashboard page — reuse them here.
    const tokenMap = {
      averageScore:     String(Math.round(avgPct)),
      averageScoreOf10: (avgPct / 10).toFixed(1),
      grade:            `${scoreSummary.grade.letter} · ${scoreSummary.grade.label}`,
      gradeLetter:      scoreSummary.grade.letter,
      gradeLabel:       scoreSummary.grade.label,
      totalRooms:       String(rooms.length),
      totalDefects:     String(totAll),
      totalMajor:       String(totMajor),
      totalMinor:       String(totMinor),
      totalCosmetic:    String(totCosmetic),
      weightMajor:      Number(weights.Major).toFixed(2),
      weightMinor:      Number(weights.Minor).toFixed(2),
      weightCosmetic:   Number(weights.Cosmetic).toFixed(2),
      weightMajorPct:   Math.round((weights.Major    || 0) * 100) + '%',
      weightMinorPct:   Math.round((weights.Minor    || 0) * 100) + '%',
      weightCosmeticPct:Math.round((weights.Cosmetic || 0) * 100) + '%',
      itemsPerRoom:     String(itemsPerRoom),
      roomScoreFormula: roomFormula,
      priorityFormula:  priFormula,
      overallPriority:  scoreSummary.priority || '—',
    };
    const fillTokens = (html) => String(html || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, k) => {
      return Object.prototype.hasOwnProperty.call(tokenMap, k) ? tokenMap[k] : `{{${k}}}`;
    });
    const tone = avgPct >= 80 ? '#16a34a' : avgPct >= 60 ? '#f59e0b' : '#dc2626';
    const dynamicSummary = `
      <div style="display:grid;grid-template-columns:1.1fr 1fr;gap:24px;margin-bottom:22px;">
        <div style="border:1px solid ${RULE};padding:18px 20px;background:#fafaf7;">
          <p class="eyebrow" style="margin:0 0 8px;">Live property summary</p>
          <div style="font-family:Georgia,serif;font-size:34px;line-height:1;color:${tone};font-weight:600;">
            ${Math.round(avgPct)}<span style="font-size:18px;color:${MUTED};font-weight:400;"> / 100</span>
          </div>
          <div style="margin-top:4px;font-family:Helvetica,sans-serif;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${MUTED};">
            ${esc(scoreSummary.grade.letter)} · ${esc(scoreSummary.grade.label)} · ${esc(scoreSummary.priority || '—')}
          </div>
          <div style="margin-top:12px;font-family:Georgia,serif;font-size:12px;line-height:1.6;color:${PRIMARY};">
            Computed across <strong>${rooms.length}</strong> room${rooms.length === 1 ? '' : 's'} and
            <strong>${totAll}</strong> total observation${totAll === 1 ? '' : 's'}
            (<strong>${totMajor}</strong> major, <strong>${totMinor}</strong> minor, <strong>${totCosmetic}</strong> cosmetic).
          </div>
        </div>
        <div style="border:1px solid ${RULE};padding:18px 20px;background:#fff;">
          <p class="eyebrow" style="margin:0 0 8px;">Active scoring configuration</p>
          <table style="width:100%;border-collapse:collapse;font-family:Helvetica,sans-serif;font-size:11px;">
            <tbody>
              <tr><td style="padding:3px 0;color:${MUTED};">Items per room</td><td style="padding:3px 0;text-align:right;color:${PRIMARY};font-weight:600;">${itemsPerRoom}</td></tr>
              <tr><td style="padding:3px 0;color:${MUTED};">Weight · Major</td><td style="padding:3px 0;text-align:right;color:${PRIMARY};font-weight:600;">${Number(weights.Major).toFixed(2)} (${Math.round((weights.Major||0)*100)}%)</td></tr>
              <tr><td style="padding:3px 0;color:${MUTED};">Weight · Minor</td><td style="padding:3px 0;text-align:right;color:${PRIMARY};font-weight:600;">${Number(weights.Minor).toFixed(2)} (${Math.round((weights.Minor||0)*100)}%)</td></tr>
              <tr><td style="padding:3px 0;color:${MUTED};">Weight · Cosmetic</td><td style="padding:3px 0;text-align:right;color:${PRIMARY};font-weight:600;">${Number(weights.Cosmetic).toFixed(2)} (${Math.round((weights.Cosmetic||0)*100)}%)</td></tr>
            </tbody>
          </table>
          <div style="margin-top:10px;border-top:1px solid ${RULE};padding-top:10px;">
            <div style="font-family:Helvetica,sans-serif;font-size:8.5px;letter-spacing:0.22em;text-transform:uppercase;color:${MUTED};margin-bottom:3px;">Room-score formula</div>
            <code style="display:block;font-family:'Courier New',monospace;font-size:10.5px;color:${PRIMARY};word-break:break-word;">${esc(roomFormula)}</code>
            <div style="font-family:Helvetica,sans-serif;font-size:8.5px;letter-spacing:0.22em;text-transform:uppercase;color:${MUTED};margin:8px 0 3px;">Priority rule</div>
            <code style="display:block;font-family:'Courier New',monospace;font-size:10.5px;color:${PRIMARY};word-break:break-word;">${esc(priFormula)}</code>
          </div>
        </div>
      </div>
    `;
    const explanationHtml = fillTokens(settings?.scoring?.explanation || DEFAULT_SCORE_EXPLANATION_HTML);
    scoreExplanationPg = page('Property Score · Methodology', `How the score <em>is built.</em>`, dynamicSummary + explanationHtml, 'SX');
  }

  // ─── THANK YOU (final page) ───────────────────────────────────────
  // Doubles as the formal sign-off: the welcoming message at the top,
  // then the document details + signature block at the bottom so the
  // record is bound in a single closing spread.
  //
  // The signature/document-of-record block is gated by the `signoff`
  // entry in `settings.reportSections` — admins can flip it off in the
  // settings UI to hide the closing details from the customer PDF/DOCX.
  const signoffEnabled = (() => {
    const sections = settings?.reportSections;
    if (Array.isArray(sections)) {
      const entry = sections.find((s) => s && s.key === 'signoff');
      // Default to enabled when the entry is missing entirely.
      return entry ? entry.enabled !== false : true;
    }
    if (sections && typeof sections === 'object') {
      return sections.signoff !== false;
    }
    return true;
  })();

  const sigDetailRows = [
    { label: 'Inspector of record', value: esc(inspection.inspectorName) || '—' },
    { label: 'Document reference', value: `<span style="font-family:'Courier New', monospace;">#${esc(refId)}</span>` },
    { label: 'Generated', value: fmtDate(new Date().toISOString()) },
    { label: 'Status', value: `<span style="text-transform:capitalize;">${esc(inspection.status) || '—'}</span>` },
    ...(inspection.approvedBy ? [{ label: 'Approved by', value: `${esc(inspection.approvedBy)} · ${fmtDate(inspection.approvedAt)}` }] : []),
  ];

  const signoffBlockHtml = signoffEnabled ? `
        <!-- Document details + signatures -->
        <div style="border-top:1px solid ${RULE};padding-top:32px;">
          <p class="eyebrow" style="margin:0 0 14px;text-align:center;">Document of record</p>

          <table style="width:100%;border-collapse:collapse;font-family:Helvetica,Arial,sans-serif;font-size:11px;margin:0 auto 32px;max-width:640px;">
            <tbody>
              ${sigDetailRows.map((r) => `
                <tr>
                  <td style="padding:8px 12px;border-bottom:1px solid ${RULE};color:${MUTED};letter-spacing:0.18em;text-transform:uppercase;font-size:9px;width:42%;">${esc(r.label)}</td>
                  <td style="padding:8px 12px;border-bottom:1px solid ${RULE};color:${INK_DARK};font-weight:600;">${r.value}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="sig-row" style="display:flex;gap:48px;max-width:640px;margin:0 auto 36px;">
            <div class="sig" style="flex:1;">
              <div class="line" style="border-bottom:1.5px solid ${INK_DARK};height:42px;"></div>
              <p class="cap" style="margin:8px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase;text-align:center;">Inspector signature</p>
            </div>
            <div class="sig" style="flex:1;">
              <div class="line" style="border-bottom:1.5px solid ${INK_DARK};height:42px;"></div>
              <p class="cap" style="margin:8px 0 0;font-family:Helvetica,Arial,sans-serif;font-size:9px;letter-spacing:0.22em;color:${MUTED};text-transform:uppercase;text-align:center;">Client signature</p>
            </div>
          </div>

          <div style="text-align:center;">
            <p class="ty-brand" style="margin:0 0 6px;">${esc(cName)}</p>
            <p class="ty-contact" style="margin:0;">
              ${esc(email)}${email && phone ? ' · ' : ''}${esc(phone)}
            </p>
            <p class="ty-contact" style="margin:18px 0 0;color:${ACCENT};">
              Bound on ${fmtDate(new Date().toISOString())} · Ref #${esc(refId)}
            </p>
          </div>
        </div>
  ` : `
        <!-- Signoff hidden — keep the welcome footer minimal and centered -->
        <div style="text-align:center;padding-top:24px;">
          <p class="ty-brand" style="margin:0 0 6px;">${esc(cName)}</p>
          <p class="ty-contact" style="margin:0;">
            ${esc(email)}${email && phone ? ' · ' : ''}${esc(phone)}
          </p>
        </div>
  `;

  const thankYouPg = `
    <div class="pg ty-pg" style="page-break-after: auto;">
      <div style="position:relative;min-height:1050px;padding:88px 72px 64px;display:flex;flex-direction:column;">

        <!-- Top welcome / thank-you block -->
        <div style="text-align:center;">
          <p class="ty-eyebrow">— A note in closing —</p>
          <h1 class="ty-headline" style="margin:18px 0 0;">
            Thank<br/><em>you.</em>
          </h1>
          <div class="ty-rule" style="margin:36px auto 28px;"></div>
          <p class="ty-deck" style="max-width:560px;margin:0 auto;">
            It has been our privilege to walk through your home with care
            and attention. We hope this record gives you clarity, confidence,
            and a warm sense of what makes the space yours.
          </p>
          <p class="ty-deck" style="max-width:560px;margin:14px auto 0;font-style:italic;">
            May the days within it be quiet, warm, and well-kept.
          </p>
        </div>

        <!-- Spacer pushes the closing block to the lower half -->
        <div style="flex:1;min-height:36px;"></div>

        ${signoffBlockHtml}
      </div>
    </div>
  `;

  // ─── Assemble & render (ordered, configurable) ───────────────────
  // `settings.reportSections` is an ordered array of
  //   { key, enabled, title?, html? }
  // — built-in keys map to the pages built above; `custom:*` keys carry
  // their own title + HTML. Missing/legacy settings fall back to the
  // default order so existing reports keep working.
  const builtIn = {
    cover:            cover,
    propertyDetails:  propertyDetailsPg,
    disclaimers:      disclaimer1 + disclaimer2,
    severityTaxonomy: severityPg,
    areaCalculations: areaPg,
    environmental:    envPg,
    rooms:            roomsHtml,
    score:            scorePg,
    scoreTable:       scoreTablePg,
    scoreExplanation: scoreExplanationPg,
    thankYou:         thankYouPg,
  };

  const DEFAULT_ORDER = [
    { key: 'cover',            enabled: true },
    { key: 'propertyDetails',  enabled: true },
    { key: 'score',            enabled: true },
    { key: 'scoreTable',       enabled: true },
    { key: 'disclaimers',      enabled: true },
    { key: 'severityTaxonomy', enabled: true },
    { key: 'areaCalculations', enabled: true },
    { key: 'environmental',    enabled: true },
    { key: 'rooms',            enabled: true },
    { key: 'thankYou',         enabled: true },
  ];

  let order = settings?.reportSections;
  if (!Array.isArray(order)) {
    // Legacy object shape `{ cover:true, ... }` — promote to array using
    // the default order so flips made under the old UI still apply.
    const legacy = (settings?.reportSections && typeof settings.reportSections === 'object') ? settings.reportSections : {};
    order = DEFAULT_ORDER.map(({ key }) => ({ key, enabled: legacy[key] !== false }));
  }
  // Merge in any newly-added built-in keys missing from a stale saved
  // order (e.g. `scoreTable` introduced after the DB record was saved).
  // We append them in their DEFAULT_ORDER position so reports stay sane.
  {
    const present = new Set(order.map((o) => o && o.key));
    const merged = [];
    let cursor = 0;
    for (const def of DEFAULT_ORDER) {
      if (!present.has(def.key)) {
        // Splice missing defaults at their canonical index.
        merged.push({ key: def.key, enabled: true });
      }
      // Copy any user-ordered entries whose key matches this point or earlier.
      while (cursor < order.length && order[cursor] && (order[cursor].key === def.key || !DEFAULT_ORDER.some((d) => d.key === order[cursor].key))) {
        merged.push(order[cursor]);
        cursor += 1;
      }
    }
    while (cursor < order.length) {
      merged.push(order[cursor]);
      cursor += 1;
    }
    order = merged;
  }

  const parts = [stylesheet];
  for (const item of order) {
    if (!item || item.enabled === false) continue;
    const key = item.key;
    if (key && key.startsWith('custom:')) {
      const title = item.title || 'Custom section';
      const body = item.html || '';
      parts.push(page(item.eyebrow || 'Additional · Section', title, body, 'C'));
      continue;
    }
    if (key === 'score' && !showScore) continue;
    if (key === 'scoreTable' && !showScore) continue;
    if (key === 'scoreExplanation' && !showScore) continue;
    const block = builtIn[key];
    if (block) parts.push(block);
  }
  return parts.join('');
};

export const generatePDF = async (inspection, settings) => {
  // Resolve any Supabase storageKey-only photos to inline base64 dataURLs
  // BEFORE html2pdf runs.  Signed URLs would expire mid-render in long reports.
  await materializeInspectionPhotos(inspection);
  const refId = String(inspection.id || '').substring(0, 8).toUpperCase();
  const html = buildReportHTML(inspection, settings);
  const element = document.createElement('div');
  element.innerHTML = html;

  const filename = `Inspection_${(inspection.metadata?.propertyAddress || 'Report').replace(/[^a-z0-9]/gi, '_')}_${refId}.pdf`;

  // Render to a Blob first (works on Android WebView where the default
  // anchor-based download fails silently), then hand to the cross-platform
  // saveFile() helper which uses Capacitor Filesystem on native.
  const pdfBlob = await html2pdf().set({
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: '#ffffff' },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] },
  }).from(element).outputPdf('blob');
  await saveFile(pdfBlob, filename, { inspectionId: inspection?.id });
};

/* ============================================================
   PROFESSIONAL EDITORIAL DOCX
   ============================================================ */
const INK = '1F2937';
const GOLD = 'C19A4B';
const MUTED_HEX = '6B7280';
const RULE_HEX = 'E5E7EB';

// ─── HTML → DOCX paragraphs ────────────────────────────────────
// The Disclaimer rich-text editor (DisclaimerEditor.jsx) emits HTML
// with <p>, <h2>, <h3>, <ul>, <ol>, <li>, <strong>/<b>, <em>/<i>,
// <u>, and inline `style="text-align:..."` (from execCommand
// justifyLeft/Center/Right/Full). Stripping it all to plain text
// throws away the admin's formatting. This walker translates the
// HTML into a flat array of docx Paragraph instances that preserve:
//   • alignment (left / center / right / justify)
//   • bold / italic / underline
//   • heading sizes (h1-h6 → 32/28/24/22/20/18 half-points)
//   • bullet (•) and numbered (1.) list markers
//   • <br> line breaks within a paragraph
// We avoid docx's built-in numbering reference because that requires
// registering an AbstractNumbering on the Document up-front, which
// would couple this helper to the document factory. A literal "1." /
// "2." prefix is simpler and renders identically in Word.
const htmlToDocxParagraphs = (html, opts = {}) => {
  const {
    defaultSize = 22,      // half-points → 11pt
    defaultColor = INK,
    defaultFont = 'Georgia',
    paragraphSpacingAfter = 120,
    lineSpacing = 320,
    // Per-tag heading sizes (half-points). Callers can pass a partial
    // override (e.g. disclaimer pages render h2/h3 a couple of points
    // smaller than standard body copy to match the PDF).
    headingSizes = null,
  } = opts;

  if (!html || !String(html).trim()) return [];

  // DOMParser turns the HTML into a real tree we can walk depth-first.
  // We wrap in a body so loose text nodes are still reachable.
  let root;
  try {
    const doc = new DOMParser().parseFromString(
      `<!doctype html><html><body>${html}</body></html>`, 'text/html');
    root = doc.body;
  } catch { return []; }

  const ALIGN_MAP = {
    left:    AlignmentType.LEFT,
    center:  AlignmentType.CENTER,
    right:   AlignmentType.RIGHT,
    justify: AlignmentType.JUSTIFIED,
    start:   AlignmentType.LEFT,
    end:     AlignmentType.RIGHT,
  };
  const HEADING_SIZE = {
    h1: 36, h2: 30, h3: 26, h4: 24, h5: 22, h6: 20,
    ...(headingSizes || {}),
  };

  const getAlign = (el) => {
    const inline = (el.style && el.style.textAlign) || '';
    const attr = el.getAttribute && el.getAttribute('align');
    const key = (inline || attr || '').toLowerCase();
    return ALIGN_MAP[key] || undefined;
  };

  // Walk inline content of a block element and produce TextRun[].
  // `style` carries inherited bold/italic/underline/size/color so a
  // nested <strong><em>foo</em></strong> combines correctly.
  const inlineRuns = (node, style) => {
    const runs = [];
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.nodeValue;
        if (!text) return;
        runs.push(new TextRun({
          text,
          font: defaultFont,
          size: style.size,
          color: style.color,
          bold: style.bold || undefined,
          italics: style.italic || undefined,
          underline: style.underline ? { type: 'single' } : undefined,
        }));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName.toLowerCase();
      if (tag === 'br') {
        runs.push(new TextRun({ text: '', break: 1 }));
        return;
      }
      const next = { ...style };
      if (tag === 'strong' || tag === 'b')  next.bold = true;
      if (tag === 'em'     || tag === 'i')  next.italic = true;
      if (tag === 'u')                       next.underline = true;
      // Carry inline color/size if the editor ever emits them.
      const cs = child.style;
      if (cs) {
        if (cs.color)      next.color = cs.color.replace(/^#/, '').toUpperCase().slice(0, 6) || next.color;
        if (cs.fontWeight && /bold|[6-9]00/i.test(cs.fontWeight)) next.bold = true;
        if (cs.fontStyle === 'italic')   next.italic = true;
        if (cs.textDecoration && /underline/i.test(cs.textDecoration)) next.underline = true;
      }
      runs.push(...inlineRuns(child, next));
    });
    return runs;
  };

  const paragraphs = [];

  // Walk block-level nodes. Anything that isn't a recognised block
  // gets wrapped in an implicit paragraph so stray text doesn't vanish.
  // `parentAlign` is inherited from any wrapping <div style="text-align:…">
  // because that's how browsers' execCommand('justifyCenter|Right|Full')
  // typically emits alignment — by wrapping the affected block(s) in a
  // new aligned <div>. Inheritance ensures inner <p>/<li> still align.
  const walkBlocks = (parent, listCtx = null, parentAlign = undefined) => {
    parent.childNodes.forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const txt = node.nodeValue;
        if (!txt || !txt.trim()) return;
        paragraphs.push(new Paragraph({
          alignment: parentAlign,
          spacing: { after: paragraphSpacingAfter, line: lineSpacing },
          children: [new TextRun({ text: txt, font: defaultFont, size: defaultSize, color: defaultColor })],
        }));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const tag = node.tagName.toLowerCase();

      if (tag === 'p' || tag === 'div') {
        // A <div> that contains its own block children (often produced
        // by execCommand wrapping selected paragraphs) shouldn't be
        // flattened — recurse so each inner block keeps its identity
        // while inheriting the wrapper's alignment.
        const hasBlockChildren = Array.from(node.childNodes).some((c) =>
          c.nodeType === Node.ELEMENT_NODE
          && /^(p|div|h[1-6]|ul|ol|li|blockquote|hr|table)$/i.test(c.tagName));
        const ownAlign = getAlign(node);
        if (tag === 'div' && hasBlockChildren) {
          walkBlocks(node, listCtx, ownAlign || parentAlign);
          return;
        }
        const runs = inlineRuns(node, { size: defaultSize, color: defaultColor });
        // Skip truly empty paragraphs (editor likes to leave <p><br></p>
        // placeholders behind) unless they carry an explicit alignment.
        const hasText = runs.some(r => r && (r.options ? r.options.text : true));
        if (!hasText && !ownAlign && !parentAlign) return;
        paragraphs.push(new Paragraph({
          alignment: ownAlign || parentAlign,
          spacing: { after: paragraphSpacingAfter, line: lineSpacing },
          children: runs.length ? runs : [new TextRun({ text: '' })],
        }));
        return;
      }

      if (HEADING_SIZE[tag]) {
        const runs = inlineRuns(node, {
          size: HEADING_SIZE[tag],
          color: defaultColor,
          bold: true,
        });
        paragraphs.push(new Paragraph({
          alignment: getAlign(node) || parentAlign,
          spacing: { before: 200, after: 100, line: lineSpacing },
          children: runs,
        }));
        return;
      }

      if (tag === 'ul' || tag === 'ol') {
        walkBlocks(node, { ordered: tag === 'ol', index: 0, level: (listCtx?.level || 0) }, parentAlign);
        return;
      }

      if (tag === 'li') {
        if (listCtx) listCtx.index += 1;
        const bullet = listCtx?.ordered ? `${listCtx.index}.  ` : '•  ';
        const runs = inlineRuns(node, { size: defaultSize, color: defaultColor });
        paragraphs.push(new Paragraph({
          alignment: getAlign(node) || parentAlign,
          spacing: { after: 80, line: lineSpacing },
          indent: { left: 360 + (listCtx?.level || 0) * 360, hanging: 280 },
          children: [
            new TextRun({ text: bullet, font: defaultFont, size: defaultSize, color: defaultColor }),
            ...runs,
          ],
        }));
        return;
      }

      if (tag === 'blockquote') {
        const runs = inlineRuns(node, { size: defaultSize, color: MUTED_HEX, italic: true });
        paragraphs.push(new Paragraph({
          alignment: getAlign(node) || parentAlign,
          spacing: { before: 120, after: 120, line: lineSpacing },
          indent: { left: 360 },
          children: runs,
        }));
        return;
      }

      if (tag === 'hr') {
        paragraphs.push(new Paragraph({
          spacing: { before: 120, after: 120 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: RULE_HEX, space: 4 } },
          children: [new TextRun({ text: '' })],
        }));
        return;
      }

      // Generic container — recurse so nested <p>/<h*> inside <section>
      // or <article> still get picked up. Carry any inline text-align
      // forward so wrapper-based alignment continues to inherit.
      walkBlocks(node, listCtx, getAlign(node) || parentAlign);
    });
  };

  walkBlocks(root);
  return paragraphs;
};


// Editorial page header helpers — these must visually match the PDF
// (.eyebrow / .section-title / .rule classes in the PDF stylesheet).
//   • Eyebrow: Helvetica 8pt MUTED uppercase, letter-spaced, prefixed
//     by a short GOLD horizontal stroke that mimics the PDF's leading
//     28-px gold dash (`.eyebrow::before { width: 28px; height: 1px;
//     background: GOLD }`).  We use three "heavy horizontal" glyphs
//     because Word can't render a CSS pseudo-element.
//   • Section title: Cambria 27pt INK with an optional italic GOLD
//     tail — matches PDF `.section-title em { color: GOLD; italic }`.
//   • Rule: a narrow 56-px-equivalent gold underline (PDF `.rule`)
//     achieved by a single-cell 800-twip table with a thick gold
//     bottom border so the line is short and editorial, not full-width.
const eyebrowPara = (text) => new Paragraph({
  spacing: { before: 0, after: 240 },
  children: [
    new TextRun({
      text: '\u2501\u2501\u2501',           // 3 × U+2501 "Box Drawings Heavy Horizontal" → ~24px gold dash
      font: 'Helvetica', size: 16, color: GOLD, characterSpacing: 0,
    }),
    new TextRun({
      text: '   ' + text.toUpperCase(),
      font: 'Helvetica',
      size: 16, // half-points → 8pt (PDF eyebrow is 10px Helvetica)
      color: MUTED_HEX,
      characterSpacing: 60,             // ≈ letter-spacing 0.28em
    }),
  ],
});

const headlinePara = (text, italic = '') => new Paragraph({
  spacing: { before: 0, after: 80 },
  children: [
    new TextRun({ text, font: 'Cambria', size: 64, color: INK }),
    italic ? new TextRun({ text: ' ' + italic, font: 'Cambria', size: 64, color: GOLD, italics: true }) : new TextRun(''),
  ],
});

// PDF .section-title — Georgia 36px font-weight 300, PRIMARY/INK,
// with italic GOLD tail.  36px ≈ 27pt ≈ 54 half-points.
const sectionTitlePara = (text, italic = '') => new Paragraph({
  spacing: { before: 240, after: 80, line: 320 },
  children: [
    new TextRun({ text, font: 'Cambria', size: 54, color: INK, characterSpacing: -8 }),
    italic ? new TextRun({ text: ' ' + italic, font: 'Cambria', size: 54, color: GOLD, italics: true, characterSpacing: -8 }) : new TextRun(''),
  ],
});

// PDF .rule — 56-px × 2-px gold bar with a 36-px bottom margin.
// We recreate it as a single paragraph with a thick gold bottom
// border, then right-indent the paragraph so the border stops short
// of the page edge.  The usable text width on a 720-twip-margin A4
// is ~10466 twips, so a right-indent of 9666 twips leaves an 800-twip
// (~56 px) editorial underline — identical proportion to the PDF.
const goldRulePara = () => new Paragraph({
  spacing: { before: 0, after: 360 },
  indent: { left: 0, right: 9666 },
  border: { bottom: { style: BorderStyle.SINGLE, size: 16, color: GOLD, space: 4 } },
  children: [new TextRun({ text: '' })],
});

const bodyPara = (text) => new Paragraph({
  spacing: { after: 160, line: 360 },
  children: [new TextRun({ text, font: 'Georgia', size: 22, color: INK })],
});

const labelValueRow = (label, value) => new TableRow({
  children: [
    new TableCell({
      width: { size: 30, type: WidthType.PERCENTAGE },
      borders: rowBorders(),
      children: [new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [new TextRun({
          text: label.toUpperCase(), font: 'Helvetica',
          size: 16, color: MUTED_HEX, characterSpacing: 60,
        })],
      })],
    }),
    new TableCell({
      width: { size: 70, type: WidthType.PERCENTAGE },
      borders: rowBorders(),
      children: [new Paragraph({
        spacing: { before: 120, after: 120 },
        children: [new TextRun({ text: value || '—', font: 'Cambria', size: 24, color: INK })],
      })],
    }),
  ],
});

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const ruleBorder = { style: BorderStyle.SINGLE, size: 6, color: RULE_HEX };
const fourSideBorder = { style: BorderStyle.SINGLE, size: 8, color: INK };
const rowBorders = () => ({
  top: fourSideBorder,
  left: fourSideBorder,
  right: fourSideBorder,
  bottom: fourSideBorder,
});

const fullPageBreak = () => new Paragraph({ children: [new PageBreak()] });

// ─── Image helpers for DOCX ──────────────────────────────────────
// Convert a data URL or remote URL into the bytes + type that ImageRun
// needs. Returns null on any failure so the caller can degrade gracefully
// to a text placeholder instead of crashing the whole export.
const detectImgType = (url) => {
  const m = /^data:image\/(jpe?g|png|gif|bmp);base64,/i.exec(url || '');
  if (m) return m[1].toLowerCase().replace('jpeg', 'jpg');
  const m2 = /\.(jpe?g|png|gif|bmp)(\?|$)/i.exec(url || '');
  if (m2) return m2[1].toLowerCase().replace('jpeg', 'jpg');
  return 'jpg';
};

const loadDocxImage = async (url) => {
  if (!url || typeof url !== 'string') return null;
  try {
    if (url.startsWith('data:')) {
      const m = /^data:[^;]+;base64,(.+)$/.exec(url);
      if (!m) return null;
      const bin = atob(m[1]);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return { data: arr, type: detectImgType(url) };
    }
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return { data: new Uint8Array(buf), type: detectImgType(url) };
  } catch {
    return null;
  }
};

// Scale-to-fit (NEVER crop) any image to the requested target box and return
// both the JPEG bytes (for DOCX ImageRun) and a data URL (for HTML/PDF
// background images).  Word's ImageRun stretches its source bytes to the
// supplied width/height — there is no "object-fit" — so we render onto a
// canvas of the target size, fit the WHOLE image inside (letterboxing with
// a white background where necessary), and re-export.  This means a
// portrait photo placed in a landscape slot keeps its full content visible
// instead of having half its top/bottom cropped off.
//
// Renamed from the old center-cropping helper.  All call-sites that used
// the cropping behaviour now get fit behaviour automatically.
const cropImage = (url, targetW, targetH, opts = {}) => new Promise((resolve) => {
  const { fit = 'contain', quality = 0.86 } = opts;
  if (!url || typeof url !== 'string') { resolve(null); return; }
  const img = new window.Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    try {
      const sw = img.naturalWidth, sh = img.naturalHeight;
      if (!sw || !sh) { resolve(null); return; }
      // Compute the draw size for the chosen fit mode while preserving aspect.
      //   • contain → largest WxH that fits INSIDE the box (letterbox).
      //   • cover   → smallest WxH that COVERS the box (crop overflow).
      const srcAspect = sw / sh;
      const targetAspect = targetW / targetH;
      let drawW, drawH;
      if (fit === 'cover') {
        if (srcAspect > targetAspect) { drawH = targetH; drawW = targetH * srcAspect; }
        else                          { drawW = targetW; drawH = targetW / srcAspect; }
      } else {
        if (srcAspect > targetAspect) { drawW = targetW; drawH = targetW / srcAspect; }
        else                          { drawH = targetH; drawW = targetH * srcAspect; }
      }
      const scale = 2; // Retina / print-sharpness
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(targetW * scale);
      canvas.height = Math.round(targetH * scale);
      const ctx = canvas.getContext('2d');
      // White background so `contain` letterboxing stays print-friendly.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const dx = (targetW - drawW) / 2 * scale;
      const dy = (targetH - drawH) / 2 * scale;
      ctx.drawImage(img, 0, 0, sw, sh, dx, dy, drawW * scale, drawH * scale);
      const q = Math.min(1, Math.max(0.4, Number(quality) || 0.86));
      const dataUrl = canvas.toDataURL('image/jpeg', q);
      const m = /^data:[^;]+;base64,(.+)$/.exec(dataUrl);
      if (!m) { resolve({ dataUrl, data: null, type: 'jpg' }); return; }
      const bin = atob(m[1]);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      resolve({ dataUrl, data: bytes, type: 'jpg' });
    } catch {
      resolve(null);
    }
  };
  img.onerror = () => resolve(null);
  img.src = url;
});

// Wrap an ImageRun in a centred paragraph at a given pixel width/height.
const imagePara = (img, width, height) => new Paragraph({
  alignment: AlignmentType.CENTER,
  spacing: { before: 80, after: 80 },
  children: [
    new ImageRun({
      data: img.data,
      type: img.type,
      transformation: { width, height },
    }),
  ],
});

// Rasterise an arbitrary SVG string to a PNG byte array we can drop into
// an ImageRun. The PDF dashboard renders bar charts and donut gauges as
// inline SVG; docx-js can't embed vectors directly, so we paint each SVG
// onto a 2× canvas and capture the PNG bytes for embedding.
const svgToPng = (svgString, widthPx, heightPx) => new Promise((resolve) => {
  if (!svgString) { resolve(null); return; }
  try {
    const SCALE = 2;
    const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const img  = new window.Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = Math.round(widthPx  * SCALE);
        canvas.height = Math.round(heightPx * SCALE);
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        URL.revokeObjectURL(url);
        canvas.toBlob(async (b) => {
          if (!b) return resolve(null);
          const buf = await b.arrayBuffer();
          resolve({ data: new Uint8Array(buf), type: 'png' });
        }, 'image/png');
      } catch { URL.revokeObjectURL(url); resolve(null); }
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  } catch { resolve(null); }
});

export const generateDOCX = async (inspection, settings, opts) => {
  // Same dance as PDF — inline every Supabase storageKey photo as base64.
  await materializeInspectionPhotos(inspection);
  const cName = settings?.companyName || settings?.appName || 'CheckSquare';
  const refId = String(inspection.id || '').substring(0, 8).toUpperCase();
  const severities = settings?.severityLevels || [];
  const sevColor = (name) => (severities.find((s) => s.name === name)?.color || '#6b7280').replace('#', '').toUpperCase();
  const stripHtml = (s) => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const docScoringOn =
    settings?.scoring?.enabled !== false && inspection.includeScore !== false;

  // ── Each section returns an array of paragraphs/tables. The final
  // assembly step orders them per `settings.reportSections`, matching
  // the HTML/PDF section ordering exactly so the two exports stay
  // in sync when the admin re-orders the report layout.

  // ─── 1. COVER ──────────────────────────────────────────────────
  // Match the PDF cover exactly: a single full-bleed image with no
  // surrounding chrome. The PDF cover is just the marketing JPG edge
  // to edge (no top "ISSUE" bar, no company name underneath, no
  // gold "HOME INSPECTION REPORT" line) because all of that art is
  // already baked into the cover image itself. Adding overlays in
  // the DOCX made the two formats look noticeably different, so we
  // strip them out here.
  //
  // The cover is rendered inside its own section (see assembly below)
  // with zero margins so the image truly fills the printable area
  // the same way html2pdf renders the .pg.cover container. When no
  // cover image can be loaded we keep the historical text-only
  // fallback so the document never opens to a blank first page.
  const buildCover = async () => {
    const out = [];
    const coverSrc = settings?.coverImage || settings?.reportCoverImage || '/report-cover.jpg';
    let coverImg = null;
    if (coverSrc) coverImg = await cropImage(coverSrc, 794, 1123);

    if (coverImg) {
      // A4 at 96dpi ≈ 794×1123 px. With the cover section running at
      // zero margins, this fills the entire page edge to edge. The
      // paragraph itself has no spacing so nothing pushes the image
      // off the first page.
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 0 },
        children: [
          new ImageRun({
            data: coverImg.data,
            type: coverImg.type,
            transformation: { width: 794, height: 1123 },
          }),
        ],
      }));
    } else {
      // Text-only fallback hero (kept as-is for when no cover image
      // is configured and the static /report-cover.jpg is missing).
      const nameLen = cName.length;
      const brandHalfPt =
        nameLen <= 10 ? 240 : nameLen <= 16 ? 192 : nameLen <= 22 ? 144 : nameLen <= 30 ? 112 : 88;
      const words = cName.trim().split(/\s+/);
      out.push(eyebrowPara('Property inspection · Report'));
      words.forEach((wd, i) => {
        const isLast = i === words.length - 1;
        out.push(new Paragraph({
          spacing: { after: isLast ? 280 : 60 },
          children: [new TextRun({
            text: isLast ? `${wd}.` : wd,
            font: 'Cambria', size: brandHalfPt,
            color: isLast ? GOLD : INK, italics: isLast,
          })],
        }));
      });
      out.push(new Paragraph({
        spacing: { after: 320 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 4 } },
        children: [new TextRun({ text: '' })],
      }));
      out.push(new Paragraph({
        spacing: { after: 720 },
        children: [new TextRun({
          text: 'A complete documentation of the property as found on the day of inspection — defects, dimensions, environmental readings, and the photographic record.',
          font: 'Cambria', size: 28, color: MUTED_HEX, italics: true,
        })],
      }));
    }

    // No trailing page break here. The cover lives in its own section,
    // so the next section automatically starts on a fresh page.
    return out;
  };

  // ─── 2. PROPERTY DETAILS ──────────────────────────────────────
  // Mirrors the PDF Property Details page (propertyDetailsPg): a true
  // two-column layout with a full-height cropped photograph on the
  // LEFT and the typographic details stack on the RIGHT. We use a
  // borderless 2-column Table because Word/docx-js doesn't support
  // CSS-style float/flex columns — a table cell is the only reliable
  // way to put an image and text side-by-side that won't reflow.
  const buildPropertyDetails = async () => {
    const out = [];
    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    const TEAL_CSS = '#' + TEAL_HEX;
    const tealBottomBorder = {
      bottom: { style: BorderStyle.SINGLE, size: 12, color: TEAL_HEX, space: 4 },
    };
    const noCellBorder = {
      top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };

    // ── Icon rendering helper ────────────────────────────────────
    // The PDF page paints circular teal icons next to each detail row.
    // docx-js can't embed SVG vectors directly, so we rasterise each
    // icon onto a 92×92 PNG (rendered at 2× for crispness, displayed at
    // 46×46) and embed it as an ImageRun. The inner svgPath string is
    // the same set of paths the PDF uses.
    const renderIconPng = (svgInner) => new Promise((resolve) => {
      try {
        const SIZE = 46;
        const SCALE = 2;
        const fullSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE * SCALE}" height="${SIZE * SCALE}" viewBox="0 0 ${SIZE} ${SIZE}">`
          + `<circle cx="${SIZE / 2}" cy="${SIZE / 2}" r="${SIZE / 2}" fill="${TEAL_CSS}"/>`
          + `<g transform="translate(${(SIZE - 24) / 2},${(SIZE - 24) / 2})" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${svgInner}</g>`
          + `</svg>`;
        const blob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = SIZE * SCALE;
          canvas.height = SIZE * SCALE;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, SIZE * SCALE, SIZE * SCALE);
          URL.revokeObjectURL(url);
          canvas.toBlob(async (b) => {
            if (!b) return resolve(null);
            const buf = await b.arrayBuffer();
            resolve({ data: new Uint8Array(buf), type: 'png' });
          }, 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      } catch { resolve(null); }
    });

    // Same paths as the PDF's iconUser/iconLocation/iconHome/iconCalendar/iconRef.
    const ICONS = {
      user:     '<circle cx="12" cy="8" r="3.5"/><path d="M5 21c1-4 4-6 7-6s6 2 7 6"/>',
      location: '<path d="M12 2C8 2 5 5 5 9c0 5 7 13 7 13s7-8 7-13c0-4-3-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
      home:     '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="1.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/>',
      ref:      '<path d="M9 12h6"/><path d="M9 16h6"/><path d="M14 4H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8z"/><path d="M14 4v4h4"/>',
    };
    const [iconUser, iconLoc, iconHome, iconCal, iconRef] = await Promise.all([
      renderIconPng(ICONS.user),
      renderIconPng(ICONS.location),
      renderIconPng(ICONS.home),
      renderIconPng(ICONS.calendar),
      renderIconPng(ICONS.ref),
    ]);

    // ── LEFT COLUMN: full-height cropped photo ───────────────────
    const heroSrc = settings?.propertyHeroImage
      || inspection.metadata?.propertyImage?.url
      || inspection.metadata?.propertyImage
      || '/property-hero.jpg';
    // Usable area with 720-twip page margins ≈ 698px wide × 1027px tall.
    // Fixed-twips column widths (DXA) are more reliable than % when the
    // cell contains a sized image. Total = 10466 twips ≈ 698px:
    //   left  = 4800 twips ≈ 320 px (photo)
    //   gutter = 466 twips ≈  31 px
    //   right = 5200 twips ≈ 347 px (details)
    const LEFT_CELL_TW   = 4800;
    const GUTTER_TW      = 466;
    const RIGHT_CELL_TW  = 5200;
    // Photo is sized to the LEFT cell width and to roughly the right
    // column's natural text height so the row doesn't overflow the page.
    const PHOTO_W = 310; // a bit under 320 so it never spills into the gutter
    const PHOTO_H = 720; // ~ matches the height of the right-column stack
    const heroImg = heroSrc ? await cropImage(heroSrc, PHOTO_W, PHOTO_H, { fit: settings?.reportImages?.fit || 'contain', quality: settings?.reportImages?.quality ?? 0.86 }) : null;

    const leftCellChildren = heroImg
      ? [new Paragraph({
          spacing: { before: 0, after: 0 },
          children: [
            new ImageRun({
              data: heroImg.data,
              type: heroImg.type,
              transformation: { width: PHOTO_W, height: PHOTO_H },
            }),
          ],
        })]
      : [new Paragraph({
          shading: { type: 'clear', color: 'auto', fill: TEAL_HEX },
          spacing: { before: 240, after: 240 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: 'PROPERTY', color: 'FFFFFF', bold: true, font: 'Helvetica', size: 32 })],
        })];

    // ── RIGHT COLUMN: eyebrow, headline, rule, detail rows ───────
    const rightCellChildren = [];
    rightCellChildren.push(new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({
          text: 'SECTION 01',
          font: 'Helvetica', size: 18, color: TEAL_HEX,
          bold: true, characterSpacing: 100,
        }),
      ],
    }));
    rightCellChildren.push(new Paragraph({
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: 'PROPERTY',
          font: 'Helvetica', size: 56, color: INK, bold: true, characterSpacing: -10,
        }),
      ],
    }));
    rightCellChildren.push(new Paragraph({
      spacing: { after: 120 },
      children: [
        new TextRun({
          text: 'DETAILS',
          font: 'Helvetica', size: 56, color: INK, bold: true, characterSpacing: -10,
        }),
      ],
    }));
    // Short teal accent bar — confined to the right cell so it's already
    // the right width without needing indent hacks.
    rightCellChildren.push(new Paragraph({
      spacing: { after: 360 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: TEAL_HEX, space: 4 } },
      indent: { left: 0, right: 3600 },
      children: [new TextRun({ text: '' })],
    }));

    const pushDetailBlock = (label, value, iconImg) => {
      const hasValue = value && String(value).trim();
      // Build the right-side text stack (label + value with teal underline).
      const textChildren = [
        new Paragraph({
          spacing: { before: 0, after: 40 },
          children: [
            new TextRun({
              text: label.toUpperCase(),
              font: 'Helvetica', size: 16, color: MUTED_HEX, characterSpacing: 80,
            }),
          ],
        }),
        new Paragraph({
          spacing: { after: 0 },
          border: tealBottomBorder,
          children: [
            new TextRun({
              text: hasValue ? String(value) : 'Not provided',
              font: 'Helvetica', size: 22, color: hasValue ? INK : '9CA3AF',
              bold: !!hasValue,
              italics: !hasValue,
            }),
          ],
        }),
      ];
      // Icon cell: 46px ≈ 690 twips circle; small right padding (gap).
      const iconCellChildren = iconImg
        ? [new Paragraph({
            spacing: { before: 0, after: 0 },
            children: [new ImageRun({
              data: iconImg.data,
              type: iconImg.type,
              transformation: { width: 46, height: 46 },
            })],
          })]
        : [new Paragraph({ children: [new TextRun({ text: '' })] })];

      // Nested 2-col table inside the right column (5200 twips):
      //   icon = 800 twips (~53px, fits the 46px circle + breathing room)
      //   text = 4400 twips
      rightCellChildren.push(new Table({
        width: { size: RIGHT_CELL_TW, type: WidthType.DXA },
        columnWidths: [800, 4400],
        borders: {
          top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 800, type: WidthType.DXA },
                borders: noCellBorder,
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
                children: iconCellChildren,
              }),
              new TableCell({
                width: { size: 4400, type: WidthType.DXA },
                borders: noCellBorder,
                margins: { top: 60, bottom: 0, left: 0, right: 0 },
                children: textChildren,
              }),
            ],
          }),
        ],
      }));
      // Spacer paragraph between detail blocks (≈ 26px in the PDF).
      rightCellChildren.push(new Paragraph({
        spacing: { before: 0, after: 240 },
        children: [new TextRun({ text: '' })],
      }));
    };

    pushDetailBlock('Prepared for',     inspection.metadata?.preparedFor,     iconUser);
    pushDetailBlock('Property address', inspection.metadata?.propertyAddress, iconLoc);
    pushDetailBlock('Property type',    inspection.metadata?.propertyType,    iconHome);
    pushDetailBlock('Inspection date',  fmtDate(inspection.metadata?.inspectionDate), iconCal);
    pushDetailBlock('Reference ID',     `#${refId}`,                          iconRef);

    // ── Assemble the 2-column table ──────────────────────────────
    // Fixed twips widths (DXA) so Word lays cells out exactly and the
    // image can never push past its column into the text.
    out.push(new Table({
      width: { size: LEFT_CELL_TW + GUTTER_TW + RIGHT_CELL_TW, type: WidthType.DXA },
      columnWidths: [LEFT_CELL_TW, GUTTER_TW, RIGHT_CELL_TW],
      borders: {
        top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: LEFT_CELL_TW, type: WidthType.DXA },
              borders: noCellBorder,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: leftCellChildren,
            }),
            new TableCell({
              width: { size: GUTTER_TW, type: WidthType.DXA },
              borders: noCellBorder,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
            }),
            new TableCell({
              width: { size: RIGHT_CELL_TW, type: WidthType.DXA },
              borders: noCellBorder,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: rightCellChildren,
            }),
          ],
        }),
      ],
    }));

    out.push(fullPageBreak());
    return out;
  };

  // ─── 3. SCORE DASHBOARD (optional) ────────────────────────────
  // Mirrors the PDF "Health, at a glance" page: a bar chart of room
  // scores on the left, a donut showing the overall property score on
  // the right, then the inspector remarks block and the per-room "Why
  // this score" sentences. Charts are rendered as SVG (so the layout
  // logic stays one-and-the-same with the PDF version) and then
  // rasterised to PNG via svgToPng for embedding in Word.
  const buildScore = async () => {
    if (!docScoringOn) return [];
    const out = [];
    const summary = computeInspectionScore(inspection, settings);
    const rooms   = summary.factors || [];
    const avgPct  = summary.overall || 0;

    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    const noCellBorder = {
      top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };
    const RULE_CSS  = '#E5E7EB';
    const MUTED_CSS = '#6B7280';
    const INK_CSS   = '#1F2A35';
    const priColor  = (p) => p === 'Urgent' ? '#dc2626' : p === 'Watch' ? '#f59e0b' : '#16a34a';
    const escSvg    = (s) => String(s ?? '').replace(/[<>&"']/g, (c) => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' }[c]));

    // ── Build the bar chart SVG (mirrors PDF logic) ─────────────────
    const HORIZONTAL_THRESHOLD = 10;
    const useHorizontal = rooms.length > HORIZONTAL_THRESHOLD;
    let barSvg = '';
    let barW   = 440;
    let barH   = 220;
    if (!rooms.length) {
      barSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${barW}" height="${barH}" viewBox="0 0 ${barW} ${barH}">
        <rect x="0" y="0" width="${barW}" height="${barH}" fill="#ffffff"/>
        <text x="${barW/2}" y="${barH/2}" text-anchor="middle" font-family="Helvetica,Arial,sans-serif"
              font-size="12" fill="${MUTED_CSS}" font-style="italic">No room data</text>
      </svg>`;
    } else if (!useHorizontal) {
      const barWidth = 28, barGap = 12, chartPadL = 36, chartPadB = 64, chartPadT = 16;
      const innerW = Math.max(1, rooms.length) * (barWidth + barGap) + 24;
      barW = chartPadL + innerW;
      barH = 220;
      const bars = rooms.map((r, i) => {
        const x = chartPadL + i * (barWidth + barGap);
        const h = Math.max(2, (r.value / 100) * (barH - chartPadT - chartPadB));
        const y = barH - chartPadB - h;
        const labelText = r.name.length > 12 ? r.name.slice(0, 11) + '…' : r.name;
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${h}" fill="${priColor(r.priority)}" opacity="0.9"/>
          <text x="${x + barWidth/2}" y="${y - 4}" text-anchor="middle"
                font-family="Helvetica,Arial,sans-serif" font-size="9" fill="${INK_CSS}">${(r.value/10).toFixed(1)}</text>
          <text x="${x + barWidth/2}" y="${barH - chartPadB + 12}"
                text-anchor="end" transform="rotate(-40 ${x + barWidth/2} ${barH - chartPadB + 12})"
                font-family="Helvetica,Arial,sans-serif" font-size="8" fill="${MUTED_CSS}">${escSvg(labelText)}</text>`;
      }).join('');
      const ticks = [0, 2, 4, 6, 8, 10].map((t) => {
        const y = barH - chartPadB - (t / 10) * (barH - chartPadT - chartPadB);
        return `<line x1="${chartPadL - 4}" x2="${barW - 8}" y1="${y}" y2="${y}" stroke="${RULE_CSS}" stroke-width="0.5"/>
          <text x="${chartPadL - 8}" y="${y + 3}" text-anchor="end"
                font-family="Helvetica,Arial,sans-serif" font-size="8" fill="${MUTED_CSS}">${t.toFixed(1)}</text>`;
      }).join('');
      barSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${barW}" height="${barH}" viewBox="0 0 ${barW} ${barH}">
        <rect x="0" y="0" width="${barW}" height="${barH}" fill="#ffffff"/>${ticks}${bars}</svg>`;
    } else {
      const MAX_BARS = 14;
      const sorted = [...rooms].sort((a, b) => (a.value || 0) - (b.value || 0));
      const capped = rooms.length > MAX_BARS;
      const chartRooms = capped ? sorted.slice(0, MAX_BARS) : rooms;
      const rowH = 16, rowGap = 5, padL = 120, padR = 36, padT = 10, padB = 24, innerW = 300;
      barW = padL + innerW + padR;
      barH = padT + chartRooms.length * (rowH + rowGap) + padB;
      const xTicks = [0, 25, 50, 75, 100].map((t) => {
        const x = padL + (t / 100) * innerW;
        return `<line x1="${x}" x2="${x}" y1="${padT}" y2="${barH - padB}" stroke="${RULE_CSS}" stroke-width="0.5"/>
          <text x="${x}" y="${barH - padB + 12}" text-anchor="middle"
                font-family="Helvetica,Arial,sans-serif" font-size="8" fill="${MUTED_CSS}">${t}</text>`;
      }).join('');
      const bars = chartRooms.map((r, i) => {
        const y = padT + i * (rowH + rowGap);
        const w = Math.max(2, (r.value / 100) * innerW);
        const labelText = r.name.length > 18 ? r.name.slice(0, 17) + '…' : r.name;
        return `<text x="${padL - 8}" y="${y + rowH * 0.7}" text-anchor="end"
                font-family="Helvetica,Arial,sans-serif" font-size="9" fill="${INK_CSS}">${escSvg(labelText)}</text>
          <rect x="${padL}" y="${y}" width="${w}" height="${rowH}" fill="${priColor(r.priority)}" opacity="0.85"/>
          <text x="${padL + w + 4}" y="${y + rowH * 0.7}"
                font-family="Helvetica,Arial,sans-serif" font-size="9" fill="${INK_CSS}">${Math.round(r.value)}%</text>`;
      }).join('');
      barSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${barW}" height="${barH}" viewBox="0 0 ${barW} ${barH}">
        <rect x="0" y="0" width="${barW}" height="${barH}" fill="#ffffff"/>${xTicks}${bars}</svg>`;
    }

    // ── Build the donut SVG (overall score) ─────────────────────────
    const donutRadius = 78;
    const donutStroke = 22;
    const donutCirc   = 2 * Math.PI * donutRadius;
    const donutOffset = donutCirc * (1 - avgPct / 100);
    const donutColor  = avgPct >= 80 ? '#16a34a' : avgPct >= 60 ? '#f59e0b' : '#dc2626';
    const donutSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="-100 -100 200 200">
      <rect x="-100" y="-100" width="200" height="200" fill="#ffffff"/>
      <circle r="${donutRadius}" fill="none" stroke="${RULE_CSS}" stroke-width="${donutStroke}"/>
      <circle r="${donutRadius}" fill="none" stroke="${donutColor}" stroke-width="${donutStroke}"
              stroke-dasharray="${donutCirc}" stroke-dashoffset="${donutOffset}"
              transform="rotate(-90)" stroke-linecap="butt"/>
      <text text-anchor="middle" font-family="Georgia,serif" font-size="34" font-weight="600"
            fill="${donutColor}" y="6">${Math.round(avgPct)}%</text>
      <text text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="7"
            letter-spacing="2.5" fill="${MUTED_CSS}" y="28">AVERAGE SCORE</text>
    </svg>`;

    // Rasterise both charts in parallel.
    const [barImg, donutImg] = await Promise.all([
      svgToPng(barSvg, barW, barH),
      svgToPng(donutSvg, 200, 200),
    ]);

    // ── Page header ────────────────────────────────────────────────
    out.push(new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({
        text: 'SECTION 03 · PROPERTY SCORE',
        font: 'Helvetica', size: 18, color: TEAL_HEX, bold: true, characterSpacing: 100,
      })],
    }));
    out.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({
        text: 'HEALTH, AT A GLANCE.', font: 'Helvetica', size: 56,
        color: INK, bold: true, characterSpacing: -10,
      })],
    }));
    out.push(new Paragraph({
      spacing: { after: 360 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: TEAL_HEX, space: 4 } },
      indent: { left: 0, right: 9200 },
      children: [new TextRun({ text: '' })],
    }));

    // ── Chart + donut row (borderless 2-col table) ─────────────────
    // Usable page width ≈ 10466 twips. Allocate:
    //   chart  = 6800 twips ≈ 453 px
    //   gutter =  466 twips ≈  31 px
    //   donut  = 3200 twips ≈ 213 px
    const CHART_TW = 6800, GUTTER_TW = 466, DONUT_TW = 3200;
    // Scale the rasterised bar chart down if it overshoots its cell.
    const CHART_MAX_PX = 450;
    const chartScale = barImg && barW > CHART_MAX_PX ? CHART_MAX_PX / barW : 1;
    const chartDrawW = Math.round(barW * chartScale);
    const chartDrawH = Math.round(barH * chartScale);

    const chartCellChildren = [
      new Paragraph({
        spacing: { before: 0, after: 80 },
        children: [new TextRun({
          text: 'HEALTH SCORE BY ROOM', font: 'Helvetica', size: 14,
          color: MUTED_HEX, characterSpacing: 80,
        })],
      }),
      barImg
        ? new Paragraph({
            spacing: { after: 0 },
            children: [new ImageRun({
              data: barImg.data, type: barImg.type,
              transformation: { width: chartDrawW, height: chartDrawH },
            })],
          })
        : new Paragraph({
            children: [new TextRun({ text: 'Chart unavailable.', font: 'Cambria', size: 22, color: MUTED_HEX, italics: true })],
          }),
    ];

    const donutCellChildren = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 80 },
        children: [new TextRun({
          text: 'AVERAGE SCORE', font: 'Helvetica', size: 14,
          color: MUTED_HEX, characterSpacing: 80,
        })],
      }),
      donutImg
        ? new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 60 },
            children: [new ImageRun({
              data: donutImg.data, type: donutImg.type,
              transformation: { width: 180, height: 180 },
            })],
          })
        : new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: `${Math.round(avgPct)}%`, font: 'Cambria', size: 60, color: INK, bold: true })],
          }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 60 },
        children: [new TextRun({
          text: `${summary.grade.letter} · ${summary.grade.label}`,
          font: 'Cambria', size: 24, color: GOLD, italics: true,
        })],
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 0 },
        children: [new TextRun({
          text: `Across ${rooms.length} room${rooms.length === 1 ? '' : 's'}`,
          font: 'Cambria', size: 20, color: MUTED_HEX,
        })],
      }),
    ];

    out.push(new Table({
      width: { size: CHART_TW + GUTTER_TW + DONUT_TW, type: WidthType.DXA },
      columnWidths: [CHART_TW, GUTTER_TW, DONUT_TW],
      borders: {
        top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: CHART_TW, type: WidthType.DXA },
              borders: { ...noCellBorder,
                top:    { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
                left:   { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
                right:  { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
              },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              children: chartCellChildren,
            }),
            new TableCell({
              width: { size: GUTTER_TW, type: WidthType.DXA },
              borders: noCellBorder,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
            }),
            new TableCell({
              width: { size: DONUT_TW, type: WidthType.DXA },
              borders: { ...noCellBorder,
                top:    { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
                left:   { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
                right:  { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
              },
              margins: { top: 160, bottom: 160, left: 120, right: 120 },
              children: donutCellChildren,
            }),
          ],
        }),
      ],
    }));

    // ── Inspector remarks block ────────────────────────────────────
    if (summary.remarks) {
      out.push(new Paragraph({ spacing: { before: 320, after: 0 }, children: [new TextRun({ text: '' })] }));
      // Left gold border (PDF uses border-left:3px solid accent). We
      // simulate it with a single-cell table that has a left border.
      out.push(new Table({
        width: { size: 10466, type: WidthType.DXA },
        borders: {
          top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: 10466, type: WidthType.DXA },
                shading: { type: ShadingType.SOLID, color: 'FAFAF7', fill: 'FAFAF7' },
                borders: {
                  top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                  left:   { style: BorderStyle.SINGLE, size: 24, color: GOLD },
                },
                margins: { top: 200, bottom: 200, left: 260, right: 260 },
                children: [
                  new Paragraph({
                    spacing: { after: 80 },
                    children: [new TextRun({
                      text: 'INSPECTOR REMARKS', font: 'Helvetica', size: 14,
                      color: MUTED_HEX, characterSpacing: 80,
                    })],
                  }),
                  new Paragraph({
                    spacing: { after: 0, line: 320 },
                    children: [new TextRun({
                      text: summary.remarks, font: 'Cambria', size: 22, color: INK,
                    })],
                  }),
                ],
              }),
            ],
          }),
        ],
      }));
    }

    out.push(fullPageBreak());
    return out;
  };

  // ─── 3b. SCORE TABLE (room-by-room breakdown) ─────────────────
  // Mirrors the PDF "Room scores, by area." page exactly:
  //   • Dark INK header row with white SECTION-style caps.
  //   • Dynamic severity columns (Major/Minor/Cosmetic by default,
  //     more if admins extended the taxonomy) each tinted with the
  //     pastel of its own severity colour.
  //   • Score /10 and Score % columns on a soft pastel-green band.
  //   • Priority column rendered as a coloured pill (red/amber/green).
  //   • Light-blue AVERAGE roll-up row matching the VBA dashboard
  //     reference (RGB 220,230,241).
  //   • Pagination — 14 rooms per page with a "continued on next
  //     page →" caption, so even 50-room properties stay inside A4.
  const buildScoreTable = () => {
    if (!docScoringOn) return [];
    const out = [];
    const summary = computeInspectionScore(inspection, settings);
    const scoreRooms = Array.isArray(summary.factors) ? summary.factors : [];
    if (scoreRooms.length === 0) return [];

    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    const sevNames = (summary.severityNames && summary.severityNames.length)
      ? summary.severityNames
      : ['Major', 'Minor', 'Cosmetic'];
    const sevColorsMap = summary.severityColors || {};

    // Exact pastel hexes from the VBA dashboard / PDF scorePg so the
    // DOCX renders identically when the admin keeps the default taxonomy.
    const COL_MAJOR_BG    = 'FCEBEB';
    const COL_MINOR_BG    = 'FAEEDA';
    const COL_COSMETIC_BG = 'F1EFE8';
    const COL_SCORE_BG    = 'E1F5EE';
    const COL_AVG_BG      = 'DCE6F1';
    const PILL_URGENT     = 'DC2626';
    const PILL_WATCH      = 'F59E0B';
    const PILL_CLEAN      = '16A34A';

    // Soften a saturated severity colour into a pastel (mix 85% white).
    const lightenHex = (hex) => {
      if (!hex || typeof hex !== 'string') return 'F3F4F6';
      const h = hex.replace('#', '').trim();
      if (h.length !== 6) return 'F3F4F6';
      const r = parseInt(h.slice(0, 2), 16);
      const g = parseInt(h.slice(2, 4), 16);
      const b = parseInt(h.slice(4, 6), 16);
      if ([r, g, b].some(Number.isNaN)) return 'F3F4F6';
      const mix = (c) => Math.round(c + (255 - c) * 0.85);
      const toHex = (c) => c.toString(16).padStart(2, '0').toUpperCase();
      return `${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
    };
    const legacyBg = { Major: COL_MAJOR_BG, Minor: COL_MINOR_BG, Cosmetic: COL_COSMETIC_BG };
    const sevBg   = (name) => legacyBg[name] || lightenHex(sevColorsMap[name]);
    const priBg   = (p) => p === 'Urgent' ? PILL_URGENT : p === 'Watch' ? PILL_WATCH : PILL_CLEAN;

    // Column widths in % — same proportions as the PDF colgroup so the
    // two renderers stay visually identical. Severity columns share a
    // fixed 36% band that's split equally regardless of taxonomy size.
    const SEV_SHARE = 36;
    const sevColPct = sevNames.length ? (SEV_SHARE / sevNames.length) : SEV_SHARE;
    const colPcts = [22, ...sevNames.map(() => sevColPct), 6, 9, 9, 18];

    // ── Page heading (matches Section 03 banner on the dashboard) ─
    out.push(new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({
        text: 'SECTION 04 · ROOM SCORES',
        font: 'Helvetica', size: 18, color: TEAL_HEX, bold: true, characterSpacing: 100,
      })],
    }));
    out.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({
        text: 'ROOM SCORES, BY AREA.', font: 'Helvetica', size: 56,
        color: INK, bold: true, characterSpacing: -10,
      })],
    }));
    out.push(new Paragraph({
      spacing: { after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: TEAL_HEX, space: 4 } },
      indent: { left: 0, right: 9200 },
      children: [new TextRun({ text: '' })],
    }));

    // ── Cell helpers ───────────────────────────────────────────────
    const headCell = (text, idx) => new TableCell({
      width: { size: colPcts[idx], type: WidthType.PERCENTAGE },
      borders: rowBorders(),
      shading: { type: ShadingType.SOLID, color: INK, fill: INK },
      children: [new Paragraph({
        alignment: idx === 0 ? AlignmentType.LEFT : AlignmentType.CENTER,
        spacing: { before: 100, after: 100 },
        children: [new TextRun({
          text: text.toUpperCase(), font: 'Helvetica',
          size: 14, color: 'FFFFFF', bold: true, characterSpacing: 60,
        })],
      })],
    });
    const headerRow = new TableRow({
      tableHeader: true,
      children: [
        headCell('Room', 0),
        ...sevNames.map((nm, i) => new TableCell({
          width: { size: colPcts[1 + i], type: WidthType.PERCENTAGE },
          borders: rowBorders(),
          shading: { type: ShadingType.SOLID, color: INK, fill: INK },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 100, after: 100 },
            children: [new TextRun({
              text: nm.toUpperCase(), font: 'Helvetica',
              size: 14, color: 'FFFFFF', bold: true, characterSpacing: 60,
            })],
          })],
        })),
        headCell('Total',     1 + sevNames.length),
        headCell('Score /10', 2 + sevNames.length),
        headCell('Score %',   3 + sevNames.length),
        headCell('Priority',  4 + sevNames.length),
      ],
    });

    const cell = (text, opts = {}) => new TableCell({
      width: opts.widthPct ? { size: opts.widthPct, type: WidthType.PERCENTAGE } : undefined,
      borders: rowBorders(),
      ...(opts.bg ? { shading: { type: ShadingType.SOLID, color: opts.bg, fill: opts.bg } } : {}),
      children: [new Paragraph({
        alignment: opts.align || AlignmentType.CENTER,
        spacing: { before: 100, after: 100 },
        children: [new TextRun({
          text: String(text),
          font: opts.font || 'Cambria',
          size: opts.size || 20,
          color: opts.color || INK,
          bold: opts.bold || false,
        })],
      })],
    });

    // Priority pill — single-row mini-table inside the cell with the
    // priority colour as background and white uppercase text. This is
    // the closest Word can get to the PDF's rounded badge.
    const priorityCell = (priority) => new TableCell({
      width: { size: colPcts[4 + sevNames.length], type: WidthType.PERCENTAGE },
      borders: rowBorders(),
      margins: { top: 80, bottom: 80, left: 80, right: 80 },
      children: [new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          bottom:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [new TableRow({
          children: [new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: priBg(priority), fill: priBg(priority) },
            borders: {
              top:    { style: BorderStyle.SINGLE, size: 2, color: priBg(priority) },
              bottom: { style: BorderStyle.SINGLE, size: 2, color: priBg(priority) },
              left:   { style: BorderStyle.SINGLE, size: 2, color: priBg(priority) },
              right:  { style: BorderStyle.SINGLE, size: 2, color: priBg(priority) },
            },
            margins: { top: 40, bottom: 40, left: 60, right: 60 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { before: 0, after: 0 },
              children: [new TextRun({
                text: (priority || '—').toUpperCase(),
                font: 'Helvetica', size: 13, color: 'FFFFFF', bold: true, characterSpacing: 80,
              })],
            })],
          })],
        })],
      })],
    });

    // ── Per-room data rows ────────────────────────────────────────
    const dataRows = scoreRooms.map((r) => new TableRow({
      children: [
        cell(r.name || '—', { widthPct: colPcts[0], align: AlignmentType.LEFT, bold: true }),
        ...sevNames.map((nm, i) => cell(r.counts?.[nm] ?? 0, {
          widthPct: colPcts[1 + i],
          bg: sevBg(nm),
        })),
        cell(r.total || 0,              { widthPct: colPcts[1 + sevNames.length] }),
        cell((r.value / 10).toFixed(1), { widthPct: colPcts[2 + sevNames.length], bg: COL_SCORE_BG, bold: true }),
        cell(`${Math.round(r.value)}%`, { widthPct: colPcts[3 + sevNames.length], bg: COL_SCORE_BG, bold: true }),
        priorityCell(r.priority),
      ],
    }));

    // ── AVERAGE roll-up (matches VBA dashboard's blue total row) ──
    const totByName = {};
    sevNames.forEach((nm) => {
      totByName[nm] = scoreRooms.reduce((s, r) => s + (r.counts?.[nm] || 0), 0);
    });
    const totAll = sevNames.reduce((s, nm) => s + (totByName[nm] || 0), 0);
    const avgPct = scoreRooms.length
      ? scoreRooms.reduce((s, r) => s + (r.value || 0), 0) / scoreRooms.length
      : 0;
    const averageRow = new TableRow({
      children: [
        cell('AVERAGE', {
          widthPct: colPcts[0], align: AlignmentType.LEFT,
          font: 'Helvetica', size: 16, color: INK, bold: true, bg: COL_AVG_BG,
        }),
        ...sevNames.map((nm, i) => cell(totByName[nm] || 0, {
          widthPct: colPcts[1 + i], bg: COL_AVG_BG, bold: true, color: INK,
        })),
        cell(totAll,                      { widthPct: colPcts[1 + sevNames.length], bg: COL_AVG_BG, bold: true, color: INK }),
        cell((avgPct / 10).toFixed(1),    { widthPct: colPcts[2 + sevNames.length], bg: COL_AVG_BG, bold: true, color: INK }),
        cell(`${Math.round(avgPct)}%`,    { widthPct: colPcts[3 + sevNames.length], bg: COL_AVG_BG, bold: true, color: INK }),
        cell('—',                         { widthPct: colPcts[4 + sevNames.length], bg: COL_AVG_BG, bold: true, color: INK }),
      ],
    });

    // ── Paginate (14 rooms/page) and emit one Table per chunk ─────
    const ROWS_PER_TABLE_PAGE = 14;
    const chunks = [];
    for (let j = 0; j < dataRows.length; j += ROWS_PER_TABLE_PAGE) {
      chunks.push(dataRows.slice(j, j + ROWS_PER_TABLE_PAGE));
    }
    if (chunks.length === 0) chunks.push([]);

    chunks.forEach((chunkRows, idx) => {
      const isLast = idx === chunks.length - 1;
      // Continuation pages get a smaller "Room scores, continued." banner
      // so each table page is self-identifying.
      if (idx > 0) {
        out.push(new Paragraph({
          spacing: { before: 0, after: 60 },
          children: [new TextRun({
            text: `SECTION 04 · ROOM SCORES · PAGE ${idx + 1}`,
            font: 'Helvetica', size: 16, color: TEAL_HEX, bold: true, characterSpacing: 100,
          })],
        }));
        out.push(new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({
            text: 'ROOM SCORES, CONTINUED.', font: 'Helvetica',
            size: 44, color: INK, bold: true, characterSpacing: -8,
          })],
        }));
        out.push(new Paragraph({
          spacing: { after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: TEAL_HEX, space: 4 } },
          indent: { left: 0, right: 9200 },
          children: [new TextRun({ text: '' })],
        }));
      }

      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          headerRow,
          ...chunkRows,
          ...(isLast ? [averageRow] : []),
        ],
      }));

      if (!isLast) {
        out.push(new Paragraph({
          alignment: AlignmentType.RIGHT,
          spacing: { before: 120, after: 0 },
          children: [new TextRun({
            text: 'CONTINUED ON NEXT PAGE  →',
            font: 'Helvetica', size: 13, color: MUTED_HEX, characterSpacing: 100,
          })],
        }));
      }
      out.push(fullPageBreak());
    });

    return out;
  };

  // ─── 4. DISCLAIMERS ───────────────────────────────────────────
  // The rich-text editor (DisclaimerEditor) saves real HTML with
  // headings, bold/italic/underline, lists and per-paragraph
  // text-alignment. We pipe that HTML through htmlToDocxParagraphs so
  // every formatting choice the admin made in the editor survives into
  // the Word export — instead of being flattened to plain sentences.
  const buildDisclaimers = () => {
    const out = [];
    // Disclaimer typography mirrors the PDF .body.disclaimer-body CSS:
    //   p/li  → 11px ≈ 8.25pt   (size 17 half-points)
    //   h2    → 14px ≈ 10.5pt   (size 21 half-points)
    //   h3    → 12px ≈  9pt     (size 18 half-points)
    //   line-height 1.65        (lineSpacing 280)
    // so legal copy stays compact and the heading weight matches PDF.
    const discOpts = {
      defaultSize: 17,
      lineSpacing: 280,
      paragraphSpacingAfter: 100,
      headingSizes: { h1: 24, h2: 21, h3: 18, h4: 18, h5: 17, h6: 17 },
    };

    // PDF headline reads: "The <em>terms</em> of inspection" — only the
    // middle word is italic gold.  Build that as three TextRuns instead
    // of using the generic two-part sectionTitlePara helper so the
    // typography matches the PDF exactly.
    const discHeadline = (before, italicWord, after) => new Paragraph({
      spacing: { before: 240, after: 80, line: 320 },
      children: [
        new TextRun({ text: before, font: 'Cambria', size: 54, color: INK, characterSpacing: -8 }),
        new TextRun({ text: italicWord, font: 'Cambria', size: 54, color: GOLD, italics: true, characterSpacing: -8 }),
        new TextRun({ text: after, font: 'Cambria', size: 54, color: INK, characterSpacing: -8 }),
      ],
    });

    out.push(eyebrowPara('Notice 01 · Disclaimer'));
    out.push(discHeadline('The ', 'terms', ' of inspection'));
    out.push(goldRulePara());
    const p1 = htmlToDocxParagraphs(settings?.disclaimerPage1 || '', discOpts);
    if (p1.length) out.push(...p1);
    else out.push(bodyPara('No disclaimer configured.'));
    out.push(fullPageBreak());

    out.push(eyebrowPara('Notice 02 · Scope'));
    out.push(discHeadline('The ', 'limits', ' of inspection'));
    out.push(goldRulePara());
    const p2 = htmlToDocxParagraphs(settings?.disclaimerPage2 || '', discOpts);
    if (p2.length) out.push(...p2);
    else out.push(bodyPara('No disclaimer configured.'));
    out.push(fullPageBreak());
    return out;
  };

  // ─── 5. SEVERITY TAXONOMY ─────────────────────────────────────
  // Mirrors the PDF "Severity, defined." page (see severityPg /
  // .sev-row CSS): a vertical list where each severity sits on its
  // own row with a small circular colour swatch on the left, the
  // small-caps letter-spaced name top-right, and a muted Georgia
  // definition beneath it. Rows are separated by a thin grey rule —
  // the same layout the PDF uses, just expressed through docx tables.
  const buildSeverityTaxonomy = async () => {
    const out = [];
    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    const noCellBorder = {
      top:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      left:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      right:  { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
    };

    // ── Page header (Section 05 banner) ───────────────────────────
    out.push(new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({
        text: 'SECTION 05 · TAXONOMY',
        font: 'Helvetica', size: 18, color: TEAL_HEX, bold: true, characterSpacing: 100,
      })],
    }));
    out.push(new Paragraph({
      spacing: { after: 40 },
      children: [new TextRun({
        text: 'SEVERITY, DEFINED.', font: 'Helvetica', size: 56,
        color: INK, bold: true, characterSpacing: -10,
      })],
    }));
    out.push(new Paragraph({
      spacing: { after: 320 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 24, color: TEAL_HEX, space: 4 } },
      indent: { left: 0, right: 9200 },
      children: [new TextRun({ text: '' })],
    }));

    if (!severities.length) {
      out.push(bodyPara('No severity taxonomy configured.'));
      out.push(fullPageBreak());
      return out;
    }

    // ── Circular colour swatch renderer ───────────────────────────
    // Word can't draw a CSS border-radius on a coloured cell, so we
    // rasterise a 16-px filled circle per severity using the same
    // svgToPng helper we use for the dashboard charts.
    const swatchPngFor = (hex) => {
      const colour = (hex || '#6B7280').trim();
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">`
        + `<circle cx="8" cy="8" r="8" fill="${colour}"/></svg>`;
      return svgToPng(svg, 16, 16);
    };
    const swatchImgs = await Promise.all(severities.map((s) => swatchPngFor(s.color)));

    // ── One row per severity ──────────────────────────────────────
    // Usable width ≈ 10466 twips.  Swatch column 700 twips (~47 px,
    // gives the 16-px circle breathing room) + content column 9766.
    const SWATCH_TW  = 700;
    const CONTENT_TW = 9766;

    severities.forEach((s, idx) => {
      const swatchImg = swatchImgs[idx];
      const isLast = idx === severities.length - 1;

      const swatchCellChildren = swatchImg
        ? [new Paragraph({
            spacing: { before: 80, after: 0 },
            children: [new ImageRun({
              data: swatchImg.data,
              type: swatchImg.type,
              transformation: { width: 16, height: 16 },
            })],
          })]
        : [new Paragraph({ children: [new TextRun({ text: '●', color: (s.color || '#6B7280').replace('#', '').toUpperCase(), size: 28 })] })];

      const contentCellChildren = [
        new Paragraph({
          spacing: { before: 0, after: 80 },
          children: [new TextRun({
            text: (s.name || '').toUpperCase(),
            font: 'Helvetica', size: 22, color: INK,
            bold: true, characterSpacing: 100,
          })],
        }),
        new Paragraph({
          spacing: { after: 0, line: 340 },
          children: [new TextRun({
            text: s.definition || '',
            font: 'Cambria', size: 24, color: MUTED_HEX,
          })],
        }),
      ];

      out.push(new Table({
        width: { size: SWATCH_TW + CONTENT_TW, type: WidthType.DXA },
        columnWidths: [SWATCH_TW, CONTENT_TW],
        borders: {
          top:     { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          // Thin rule under every row except the last one, matching
          // the PDF's .sev-row:last-child { border-bottom: none }.
          bottom:  isLast
            ? { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
            : { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX },
          left:    { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          right:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
          insideVertical:   { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                width: { size: SWATCH_TW, type: WidthType.DXA },
                borders: noCellBorder,
                margins: { top: 320, bottom: 320, left: 0, right: 200 },
                children: swatchCellChildren,
              }),
              new TableCell({
                width: { size: CONTENT_TW, type: WidthType.DXA },
                borders: noCellBorder,
                margins: { top: 320, bottom: 320, left: 80, right: 0 },
                children: contentCellChildren,
              }),
            ],
          }),
        ],
      }));
    });

    out.push(fullPageBreak());
    return out;
  };

  // ─── 6. AREA CALCULATIONS ─────────────────────────────────────
  const buildAreaCalculations = () => {
    const out = [];
    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    // PDF .editorial table uses TEAL borders + TEAL header/total bars,
    // body cells Georgia 13px in TEAL ink, alternating zebra rows in
    // #fafafa. We mirror that here so the DOCX visually reads as the
    // same table — no more black/INK header bars.
    const teal4 = { style: BorderStyle.SINGLE, size: 4, color: TEAL_HEX };
    const tealCellBorders = { top: teal4, left: teal4, right: teal4, bottom: teal4 };
    const headerCell = (text, align = AlignmentType.LEFT, width) => new TableCell({
      ...(width ? { width: { size: width, type: WidthType.PERCENTAGE } } : {}),
      borders: tealCellBorders,
      shading: { type: ShadingType.SOLID, color: TEAL_HEX, fill: TEAL_HEX },
      children: [new Paragraph({
        alignment: align,
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text: text.toUpperCase(), font: 'Helvetica', size: 14, color: 'FFFFFF', bold: true, characterSpacing: 60 })],
      })],
    });
    const bodyCell = (text, opts = {}) => new TableCell({
      borders: tealCellBorders,
      ...(opts.zebra ? { shading: { type: ShadingType.SOLID, color: 'FAFAFA', fill: 'FAFAFA' } } : {}),
      children: [new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: 100, after: 100 },
        children: [new TextRun({ text: String(text), font: 'Georgia', size: 22, color: INK })],
      })],
    });
    const totalCell = (text, opts = {}) => new TableCell({
      ...(opts.columnSpan ? { columnSpan: opts.columnSpan } : {}),
      borders: tealCellBorders,
      shading: { type: ShadingType.SOLID, color: TEAL_HEX, fill: TEAL_HEX },
      children: [new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: 100, after: 100 },
        children: [new TextRun({ text: String(text).toUpperCase(), font: 'Helvetica', size: 16, color: 'FFFFFF', bold: true, characterSpacing: 60 })],
      })],
    });

    out.push(eyebrowPara('Measurements · Spatial'));
    out.push(sectionTitlePara('The footprint,', 'tallied.'));
    out.push(goldRulePara());

    const areas = inspection.areaCalculations || [];
    const metrics = (inspection.propertyMetrics || []).filter((m) => m && (m.label || m.value));
    const totalSft = areas.reduce(
      (sum, a) => sum + computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit), 0,
    );

    if (areas.length > 0) {
      const dataRows = areas.map((a, idx) => new TableRow({
        children: [
          bodyCell(a.room || a.name || '—',                                                                 { zebra: idx % 2 === 1 }),
          bodyCell(`${a.length || ''} ${a.lengthUnit || 'ft'}`,                                              { zebra: idx % 2 === 1 }),
          bodyCell(`${a.width || ''} ${a.widthUnit || 'ft'}`,                                                { zebra: idx % 2 === 1 }),
          bodyCell(computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit).toLocaleString(),            { zebra: idx % 2 === 1, align: AlignmentType.RIGHT }),
        ],
      }));
      const totalRow = new TableRow({
        children: [
          totalCell('Total area (sft)', { columnSpan: 3 }),
          totalCell(totalSft.toLocaleString(), { align: AlignmentType.RIGHT }),
        ],
      });
      const metricRows = metrics.map((m) => new TableRow({
        children: [
          totalCell(m.label || '—', { columnSpan: 3 }),
          totalCell(`${m.value}${m.unit || ''}`, { align: AlignmentType.RIGHT }),
        ],
      }));
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            headerCell('Room / section', AlignmentType.LEFT, 50),
            headerCell('Length'),
            headerCell('Width'),
            headerCell('Area (sft)', AlignmentType.RIGHT),
          ] }),
          ...dataRows,
          totalRow,
          ...metricRows,
        ],
      }));
    } else if (metrics.length > 0) {
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({ children: [
            headerCell('Property metric', AlignmentType.LEFT, 70),
            headerCell('Value', AlignmentType.RIGHT),
          ] }),
          ...metrics.map((m) => new TableRow({
            children: [
              totalCell(m.label || '—'),
              totalCell(`${m.value}${m.unit || ''}`, { align: AlignmentType.RIGHT }),
            ],
          })),
        ],
      }));
    } else {
      out.push(bodyPara('No area calculations recorded for this property.'));
    }
    out.push(fullPageBreak());
    return out;
  };

  // ─── 7. ENVIRONMENTAL ─────────────────────────────────────────
  // Mirrors PDF env page: optional water-test photo strip → indicator
  // table with TEAL header → "Hardware · brands observed" eyebrow →
  // bordered TEAL pills for each brand.
  const buildEnvironmental = async () => {
    const out = [];
    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    const teal4 = { style: BorderStyle.SINGLE, size: 4, color: TEAL_HEX };
    const tealCellBorders = { top: teal4, left: teal4, right: teal4, bottom: teal4 };

    out.push(eyebrowPara('Readings · Environment'));
    out.push(sectionTitlePara('Water, air,', 'and ware.'));
    out.push(goldRulePara());

    const w = inspection.waterQuality || {};
    const waterImages = Array.isArray(w.images) ? w.images.filter((i) => i && i.url) : [];

    // Water-test photo strip — up to 3 across, identical to the PDF
    // grid (auto-cropped to fit a uniform tile so portrait shots
    // don't squash).
    if (waterImages.length > 0) {
      const slice = waterImages.slice(0, 3);
      const cellTargetW = slice.length === 1 ? 460 : slice.length === 2 ? 224 : 148;
      const imgOpts = { fit: settings?.reportImages?.fit || 'contain', quality: settings?.reportImages?.quality ?? 0.86 };
      // eslint-disable-next-line no-await-in-loop
      const imgs = await Promise.all(slice.map((p) => cropImage(p.url, cellTargetW, 130, imgOpts)));
      const cells = slice.map((p, k) => {
        const children = [];
        if (imgs[k]) {
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 40, after: 40 },
            children: [new ImageRun({
              data: imgs[k].data,
              type: imgs[k].type,
              transformation: { width: cellTargetW, height: 130 },
            })],
          }));
        }
        children.push(new Paragraph({
          alignment: AlignmentType.LEFT,
          spacing: { before: 40, after: 60 },
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX, space: 4 } },
          children: [new TextRun({
            text: `Water test · photo ${String(k + 1).padStart(2, '0')}`.toUpperCase(),
            font: 'Helvetica', size: 12, color: MUTED_HEX, characterSpacing: 60, bold: true,
          })],
        }));
        return new TableCell({
          width: { size: Math.floor(100 / slice.length), type: WidthType.PERCENTAGE },
          borders: { ...tealCellBorders, top: teal4, bottom: teal4, left: teal4, right: teal4 },
          children,
        });
      });
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [new TableRow({ children: cells })],
      }));
      out.push(new Paragraph({ spacing: { after: 120 }, children: [new TextRun({ text: '' })] }));
    }

    // Indicator table — TEAL header + Georgia body rows (matches PDF
    // .editorial table styling).
    const indicatorHeader = (text) => new TableCell({
      borders: tealCellBorders,
      shading: { type: ShadingType.SOLID, color: TEAL_HEX, fill: TEAL_HEX },
      children: [new Paragraph({
        spacing: { before: 80, after: 80 },
        children: [new TextRun({ text: text.toUpperCase(), font: 'Helvetica', size: 14, color: 'FFFFFF', bold: true, characterSpacing: 60 })],
      })],
    });
    const indicatorCell = (text, opts = {}) => new TableCell({
      borders: tealCellBorders,
      ...(opts.zebra ? { shading: { type: ShadingType.SOLID, color: 'FAFAFA', fill: 'FAFAFA' } } : {}),
      children: [new Paragraph({
        spacing: { before: 100, after: 100 },
        children: [new TextRun({ text: String(text), font: 'Georgia', size: 22, color: INK })],
      })],
    });
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({ children: [
          new TableCell({ width: { size: 60, type: WidthType.PERCENTAGE }, borders: tealCellBorders, shading: { type: ShadingType.SOLID, color: TEAL_HEX, fill: TEAL_HEX }, children: [new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: 'INDICATOR', font: 'Helvetica', size: 14, color: 'FFFFFF', bold: true, characterSpacing: 60 })] })] }),
          indicatorHeader('Reading'),
        ] }),
        new TableRow({ children: [indicatorCell('Total dissolved solids (TDS)'), indicatorCell(w.tds ? `${w.tds} ppm` : '—', { zebra: false })] }),
        new TableRow({ children: [indicatorCell('pH', { zebra: true }), indicatorCell(w.ph || '—', { zebra: true })] }),
      ],
    }));

    // Hardware / brands eyebrow + pills row.
    out.push(new Paragraph({ spacing: { before: 360 }, children: [new TextRun({ text: '' })] }));
    out.push(eyebrowPara('Hardware · brands observed'));
    const brands = w.brands || [];
    if (brands.length > 0) {
      // Render each brand as its own bordered "pill" cell in a single
      // table row so they wrap naturally across the page. PDF uses
      // `.pill` (1px TEAL border + uppercase letter-spaced label).
      const pillBorders = { top: teal4, left: teal4, right: teal4, bottom: teal4 };
      // Distribute pills across 4 columns per row so wide brand lists
      // stay editorial instead of overflowing a single row.
      const PER_ROW = 4;
      const rows = [];
      for (let i = 0; i < brands.length; i += PER_ROW) {
        const chunk = brands.slice(i, i + PER_ROW);
        const cells = chunk.map((b) => new TableCell({
          width: { size: Math.floor(100 / PER_ROW), type: WidthType.PERCENTAGE },
          borders: pillBorders,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 80, after: 80 },
            children: [new TextRun({ text: String(b).toUpperCase(), font: 'Helvetica', size: 14, color: TEAL_HEX, bold: true, characterSpacing: 60 })],
          })],
        }));
        while (cells.length < PER_ROW) {
          cells.push(new TableCell({
            width: { size: Math.floor(100 / PER_ROW), type: WidthType.PERCENTAGE },
            borders: { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder },
            children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
          }));
        }
        rows.push(new TableRow({ children: cells }));
      }
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows,
      }));
    } else {
      out.push(new Paragraph({
        spacing: { after: 200 },
        children: [new TextRun({ text: 'No brands recorded.', font: 'Georgia', size: 22, color: MUTED_HEX, italics: true })],
      }));
    }

    out.push(fullPageBreak());
    return out;
  };

  // ─── 8. ROOMS ─────────────────────────────────────────────────
  const buildRooms = async () => {
    const TEAL_HEX = (settings?.primaryBrandColor || settings?.primaryColor || '#2DB4C6').replace('#', '').toUpperCase();
    const teal4 = { style: BorderStyle.SINGLE, size: 4, color: TEAL_HEX };
    const tealCellBorders = { top: teal4, left: teal4, right: teal4, bottom: teal4 };
    const out = [];
    const rooms = inspection.roomInspections || [];
    for (let ri = 0; ri < rooms.length; ri++) {
      const room = rooms[ri];
      const roomNo = String(ri + 1).padStart(2, '0');
      const totalNo = String(rooms.length).padStart(2, '0');
      const corners = room.cornerPhotos || [];
      const defects = room.defects || [];

      // Phase A
      out.push(eyebrowPara(`Room ${roomNo} of ${totalNo} · Phase A`));
      out.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: room.name || 'Room', font: 'Cambria', size: 52, color: INK })],
      }));
      out.push(goldRulePara());
      out.push(new Paragraph({
        spacing: { before: 240, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX, space: 4 } },
        children: [new TextRun({ text: 'PHASE A · THE SPACES, OBSERVED', font: 'Helvetica', size: 18, color: MUTED_HEX, bold: true, characterSpacing: 60 })],
      }));
      if (corners.length > 0) {
        // 2-up grid — matches the PDF gallery layout instead of one giant
        // image per row. Each cell holds a photo + a white-on-TEAL
        // caption bar (PDF `.gallery .cell .cap`).
        const cornerRows = [];
        for (let ci = 0; ci < corners.length; ci += 2) {
          const pair = corners.slice(ci, ci + 2);
          // eslint-disable-next-line no-await-in-loop
          const imgs = await Promise.all(pair.map((p) => cropImage(p.url, 220, 160)));
          const cells = pair.map((p, k) => {
            const cellChildren = [];
            if (imgs[k]) {
              cellChildren.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 0, after: 0 },
                children: [new ImageRun({
                  data: imgs[k].data,
                  type: imgs[k].type,
                  transformation: { width: 220, height: 160 },
                })],
              }));
            } else {
              cellChildren.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 60, after: 60 },
                children: [new TextRun({ text: 'Photograph unavailable.', font: 'Georgia', size: 20, color: MUTED_HEX, italics: true })],
              }));
            }
            // Caption bar — white text on TEAL, mirroring PDF .cap.
            cellChildren.push(new Paragraph({
              spacing: { before: 0, after: 0 },
              shading: { type: ShadingType.SOLID, color: TEAL_HEX, fill: TEAL_HEX },
              children: [new TextRun({
                text: '  ' + (p.corner || `Corner ${ci + k + 1}`).toUpperCase(),
                font: 'Helvetica', size: 14, color: 'FFFFFF', characterSpacing: 60, bold: true,
              })],
            }));
            return new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: tealCellBorders,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: cellChildren,
            });
          });
          // Pad the row to two cells if the last pair is short.
          while (cells.length < 2) {
            cells.push(new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder },
              children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
            }));
          }
          cornerRows.push(new TableRow({ children: cells }));
        }
        out.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: cornerRows,
        }));
      } else {
        out.push(new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: 'No ambient photographs recorded for this room.', font: 'Cambria', size: 22, color: MUTED_HEX, italics: true })],
        }));
      }
      out.push(fullPageBreak());

      // Phase B
      out.push(eyebrowPara(`Room ${roomNo} of ${totalNo} · Phase B`));
      out.push(new Paragraph({
        spacing: { after: 80 },
        children: [new TextRun({ text: room.name || 'Room', font: 'Cambria', size: 52, color: INK })],
      }));
      out.push(goldRulePara());
      out.push(new Paragraph({
        spacing: { before: 240, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: RULE_HEX, space: 4 } },
        children: [new TextRun({ text: `PHASE B · DEFECTS (${defects.length})`, font: 'Helvetica', size: 18, color: MUTED_HEX, bold: true, characterSpacing: 60 })],
      }));
      if (defects.length === 0) {
        out.push(new Paragraph({
          spacing: { after: 160 },
          children: [new TextRun({ text: 'No defects recorded for this room.', font: 'Cambria', size: 22, color: MUTED_HEX, italics: true })],
        }));
      } else {
        for (let di = 0; di < defects.length; di++) {
          const d = defects[di];
          const sevHex = sevColor(d.severity);
          const sevLabel = (d.severity || '—').toUpperCase();

          // Defect head bar — mirrors PDF `.defect-head`: gray background
          // bordered in TEAL, Georgia teal title on the left, severity
          // colour pill on the right. Two-cell borderless inner table
          // gives Word the proper left/right alignment.
          out.push(new Paragraph({ spacing: { before: 320 }, children: [new TextRun({ text: '' })] }));
          out.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [new TableRow({
              children: [
                new TableCell({
                  width: { size: 78, type: WidthType.PERCENTAGE },
                  borders: tealCellBorders,
                  shading: { type: ShadingType.SOLID, color: 'FAFAFA', fill: 'FAFAFA' },
                  margins: { top: 80, bottom: 80, left: 160, right: 80 },
                  children: [new Paragraph({
                    children: [new TextRun({
                      text: `${String(di + 1).padStart(2, '0')} · ${d.title || d.classify || 'Defect'}`,
                      font: 'Georgia', size: 26, color: TEAL_HEX,
                    })],
                  })],
                }),
                new TableCell({
                  width: { size: 22, type: WidthType.PERCENTAGE },
                  borders: tealCellBorders,
                  shading: { type: ShadingType.SOLID, color: sevHex, fill: sevHex },
                  margins: { top: 80, bottom: 80, left: 60, right: 60 },
                  children: [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    children: [new TextRun({
                      text: sevLabel, font: 'Helvetica', size: 14, color: 'FFFFFF',
                      bold: true, characterSpacing: 60,
                    })],
                  })],
                }),
              ],
            })],
          }));

          // Photos for this defect (normalised: photos[] | beforePhoto | afterPhoto).
          const dPhotos = Array.isArray(d.photos) ? [...d.photos] : [];
          if (dPhotos.length === 0 && d.beforePhoto) dPhotos.push({ url: d.beforePhoto.url, caption: '' });
          if (dPhotos.length === 0 && d.afterPhoto)  dPhotos.push({ url: d.afterPhoto.url,  caption: '' });

          // Build a 3-column card-table per defect: image | description | severity.
          // Mirrors the PDF defect-table layout exactly — TEAL borders,
          // Georgia teal description, severity caption in defect colour.
          const rows = [];
          if (dPhotos.length === 0) {
            // No-photo row.
            rows.push(new TableRow({ children: [
              new TableCell({
                width: { size: 38, type: WidthType.PERCENTAGE },
                borders: tealCellBorders,
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 100, after: 100 },
                  children: [new TextRun({ text: 'NO PHOTO', font: 'Helvetica', size: 14, color: MUTED_HEX, characterSpacing: 60, bold: true })],
                })],
              }),
              new TableCell({
                width: { size: 44, type: WidthType.PERCENTAGE },
                borders: tealCellBorders,
                children: [new Paragraph({
                  spacing: { before: 100, after: 100, line: 300 },
                  children: [new TextRun({ text: d.description || d.title || 'Observation', font: 'Georgia', size: 22, color: TEAL_HEX })],
                })],
              }),
              new TableCell({
                width: { size: 18, type: WidthType.PERCENTAGE },
                borders: tealCellBorders,
                children: [new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { before: 100, after: 100 },
                  children: [new TextRun({ text: sevLabel, font: 'Helvetica', size: 16, color: sevHex, bold: true, characterSpacing: 60 })],
                })],
              }),
            ] }));
          } else {
            for (let pi = 0; pi < dPhotos.length; pi++) {
              const p = dPhotos[pi];
              // eslint-disable-next-line no-await-in-loop
              const img = await cropImage(p.url, 160, 110);
              const imgChildren = img
                ? [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 40, after: 40 },
                    children: [new ImageRun({
                      data: img.data,
                      type: img.type,
                      transformation: { width: 160, height: 110 },
                    })],
                  })]
                : [new Paragraph({
                    alignment: AlignmentType.CENTER,
                    spacing: { before: 60, after: 60 },
                    children: [new TextRun({ text: 'Photograph unavailable.', font: 'Georgia', size: 18, color: MUTED_HEX, italics: true })],
                  })];
              const descChildren = [];
              if (pi === 0) {
                descChildren.push(new Paragraph({
                  spacing: { before: 80, after: p.caption ? 60 : 80, line: 300 },
                  children: [new TextRun({ text: d.description || d.title || 'Observation', font: 'Georgia', size: 22, color: TEAL_HEX })],
                }));
                if (p.caption) {
                  descChildren.push(new Paragraph({
                    spacing: { after: 80 },
                    children: [new TextRun({ text: p.caption.toUpperCase(), font: 'Helvetica', size: 14, color: MUTED_HEX, characterSpacing: 60, bold: true })],
                  }));
                }
              } else {
                descChildren.push(new Paragraph({
                  spacing: { before: 80, after: 80, line: 300 },
                  children: [new TextRun({ text: p.caption || '', font: 'Georgia', size: 18, color: MUTED_HEX, italics: !p.caption })],
                }));
              }
              const sevChildren = pi === 0 ? [new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { before: 80, after: 80 },
                children: [new TextRun({ text: sevLabel, font: 'Helvetica', size: 16, color: sevHex, bold: true, characterSpacing: 60 })],
              })] : [new Paragraph({ children: [new TextRun({ text: '' })] })];

              rows.push(new TableRow({ children: [
                new TableCell({ width: { size: 38, type: WidthType.PERCENTAGE }, borders: tealCellBorders, children: imgChildren }),
                new TableCell({ width: { size: 44, type: WidthType.PERCENTAGE }, borders: tealCellBorders, children: descChildren }),
                new TableCell({ width: { size: 18, type: WidthType.PERCENTAGE }, borders: tealCellBorders, children: sevChildren }),
              ] }));
            }
          }
          out.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          }));
        }
      }
      out.push(fullPageBreak());
    }
    return out;
  };

  // ─── 9. SIGN-OFF ──────────────────────────────────────────────
  const buildSignoff = () => {
    const out = [];
    out.push(eyebrowPara('Closing · Sign-off'));
    out.push(sectionTitlePara('The record,', 'bound.'));
    out.push(goldRulePara());
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        labelValueRow('Inspector of record', inspection.inspectorName),
        labelValueRow('Document reference', `#${refId}`),
        labelValueRow('Generated', fmtDate(new Date().toISOString())),
        labelValueRow('Status', inspection.status ? String(inspection.status).replace(/^./, c => c.toUpperCase()) : '—'),
        ...(inspection.approvedBy ? [labelValueRow('Approved by', `${inspection.approvedBy} · ${fmtDate(inspection.approvedAt)}`)] : []),
      ],
    }));
    // PDF `.sig-row` is two columns side-by-side; recreate it as a
    // borderless 2-cell table so the signature lines sit next to each
    // other instead of stacked.
    out.push(new Paragraph({ spacing: { before: 720 }, children: [new TextRun({ text: '' })] }));
    const sigCell = (label) => new TableCell({
      width: { size: 50, type: WidthType.PERCENTAGE },
      borders: { top: noBorder, left: noBorder, right: noBorder, bottom: noBorder },
      margins: { top: 0, bottom: 0, left: 120, right: 120 },
      children: [
        new Paragraph({
          spacing: { after: 80 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 16 } },
          children: [new TextRun({ text: '' })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({
            text: label, font: 'Helvetica', size: 14, color: MUTED_HEX, characterSpacing: 60,
          })],
        }),
      ],
    });
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: noBorder, bottom: noBorder, left: noBorder, right: noBorder,
        insideHorizontal: noBorder, insideVertical: noBorder,
      },
      rows: [new TableRow({ children: [sigCell('INSPECTOR SIGNATURE'), sigCell('CLIENT SIGNATURE')] })],
    }));
    out.push(fullPageBreak());
    return out;
  };

  // ─── 10. THANK YOU (now also doubles as the formal sign-off) ─────
  const buildThankYou = () => {
    // The closing/sign-off block (document of record + signatures) is
    // gated by the `signoff` entry in `settings.reportSections`. Admins
    // can toggle it off to hide the closing details from the DOCX.
    const signoffEnabled = (() => {
      const sections = settings?.reportSections;
      if (Array.isArray(sections)) {
        const entry = sections.find((s) => s && s.key === 'signoff');
        return entry ? entry.enabled !== false : true;
      }
      if (sections && typeof sections === 'object') {
        return sections.signoff !== false;
      }
      return true;
    })();

    const out = [];
    // Welcome / thank-you headline
    out.push(new Paragraph({ spacing: { before: 800 }, children: [new TextRun({ text: '' })] }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({
        text: '— A NOTE IN CLOSING —',
        font: 'Helvetica', size: 18, color: GOLD, bold: true, characterSpacing: 80,
      })],
    }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [new TextRun({ text: 'Thank', font: 'Cambria', size: 120, color: INK })],
    }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 },
      children: [new TextRun({ text: 'you.', font: 'Cambria', size: 120, color: GOLD, italics: true })],
    }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 280 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 18, color: GOLD, space: 8 } },
      children: [new TextRun({ text: '' })],
    }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [new TextRun({
        text: 'It has been our privilege to walk through your home with care and attention.',
        font: 'Cambria', size: 24, color: MUTED_HEX, italics: true,
      })],
    }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 180 },
      children: [new TextRun({
        text: 'We hope this record gives you clarity, confidence, and a warm sense of what makes the space yours.',
        font: 'Cambria', size: 24, color: MUTED_HEX, italics: true,
      })],
    }));
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 600 },
      children: [new TextRun({
        text: 'May the days within it be quiet, warm, and well-kept.',
        font: 'Cambria', size: 24, color: MUTED_HEX, italics: true,
      })],
    }));

    // Document-of-record block (folded in from the old sign-off page)
    if (signoffEnabled) {
      out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 240, after: 200 },
      border: { top: { style: BorderStyle.SINGLE, size: 6, color: RULE_HEX, space: 16 } },
      children: [new TextRun({
        text: 'DOCUMENT OF RECORD',
        font: 'Helvetica', size: 16, color: MUTED_HEX, bold: true, characterSpacing: 80,
      })],
    }));
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        labelValueRow('Inspector of record', inspection.inspectorName),
        labelValueRow('Document reference', `#${refId}`),
        labelValueRow('Generated', fmtDate(new Date().toISOString())),
        labelValueRow('Status', inspection.status ? String(inspection.status).replace(/^./, c => c.toUpperCase()) : '—'),
        ...(inspection.approvedBy ? [labelValueRow('Approved by', `${inspection.approvedBy} · ${fmtDate(inspection.approvedAt)}`)] : []),
      ],
    }));

    // Side-by-side signature lines
    out.push(new Paragraph({ spacing: { before: 480 }, children: [new TextRun({ text: '' })] }));
    out.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  spacing: { after: 80 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 16 } },
                  children: [new TextRun({ text: '' })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({
                    text: 'INSPECTOR SIGNATURE',
                    font: 'Helvetica', size: 14, color: MUTED_HEX, characterSpacing: 60,
                  })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  spacing: { after: 80 },
                  border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: INK, space: 16 } },
                  children: [new TextRun({ text: '' })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({
                    text: 'CLIENT SIGNATURE',
                    font: 'Helvetica', size: 14, color: MUTED_HEX, characterSpacing: 60,
                  })],
                }),
              ],
            }),
          ],
        }),
      ],
    }));
    }

    // Footer brand block
    out.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 120 },
      children: [new TextRun({
        text: cName.toUpperCase(), font: 'Helvetica', size: 22, color: INK,
        bold: true, characterSpacing: 80,
      })],
    }));
    const contactLine = `${settings?.companyEmail || ''}${(settings?.companyEmail && (settings?.companyPhone1 || settings?.companyPhone2)) ? ' · ' : ''}${[settings?.companyPhone1, settings?.companyPhone2].filter(Boolean).join(' · ')}`;
    if (contactLine.trim()) {
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 240 },
        children: [new TextRun({
          text: contactLine, font: 'Helvetica', size: 16, color: MUTED_HEX, characterSpacing: 40,
        })],
      }));
    }
    if (signoffEnabled) {
      out.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({
          text: `Bound on ${fmtDate(new Date().toISOString())} · Ref #${refId}`,
          font: 'Helvetica', size: 14, color: GOLD, characterSpacing: 60, bold: true,
        })],
      }));
    }
    return out;
  };

  // Optional methodology page (only present when explicitly added to order)
  const buildScoreExplanation = () => {
    if (!docScoringOn) return [];
    const out = [];
    out.push(eyebrowPara('Property Score · Methodology'));
    out.push(sectionTitlePara('How the score', 'is built.'));
    out.push(goldRulePara());
    const explanationText = stripHtml(settings?.scoring?.explanation || DEFAULT_SCORE_EXPLANATION_HTML);
    explanationText.split(/\.\s+/).filter(Boolean).forEach((s) =>
      out.push(bodyPara(s.endsWith('.') ? s : s + '.')),
    );
    out.push(fullPageBreak());
    return out;
  };

  // ── Assemble in the same order the HTML/PDF uses ────────────────
  const builders = {
    cover:            buildCover,
    propertyDetails:  buildPropertyDetails,
    score:            buildScore,
    scoreTable:       buildScoreTable,
    scoreExplanation: buildScoreExplanation,
    disclaimers:      buildDisclaimers,
    severityTaxonomy: buildSeverityTaxonomy,
    areaCalculations: buildAreaCalculations,
    environmental:    buildEnvironmental,
    rooms:            buildRooms,
    thankYou:         buildThankYou,
  };

  const DEFAULT_ORDER = [
    { key: 'cover',            enabled: true },
    { key: 'propertyDetails',  enabled: true },
    { key: 'score',            enabled: true },
    { key: 'scoreTable',       enabled: true },
    { key: 'disclaimers',      enabled: true },
    { key: 'severityTaxonomy', enabled: true },
    { key: 'areaCalculations', enabled: true },
    { key: 'environmental',    enabled: true },
    { key: 'rooms',            enabled: true },
    { key: 'thankYou',         enabled: true },
  ];

  let order = settings?.reportSections;
  if (!Array.isArray(order)) {
    const legacy = (settings?.reportSections && typeof settings.reportSections === 'object') ? settings.reportSections : {};
    order = DEFAULT_ORDER.map(({ key }) => ({ key, enabled: legacy[key] !== false }));
  }
  // Merge in any newly-added built-in keys missing from a stale saved order.
  {
    const present = new Set(order.map((o) => o && o.key));
    const merged = [];
    let cursor = 0;
    for (const def of DEFAULT_ORDER) {
      if (!present.has(def.key)) {
        merged.push({ key: def.key, enabled: true });
      }
      while (cursor < order.length && order[cursor] && (order[cursor].key === def.key || !DEFAULT_ORDER.some((d) => d.key === order[cursor].key))) {
        merged.push(order[cursor]);
        cursor += 1;
      }
    }
    while (cursor < order.length) {
      merged.push(order[cursor]);
      cursor += 1;
    }
    order = merged;
  }

  // Build sections in order. The cover gets its own DOCX section with
  // zero margins so the cover image truly bleeds to the page edges
  // (matching the PDF, which uses `padding:0` on .pg.cover). All other
  // sections share the standard half-inch margin section so the body
  // pages keep their breathing room.
  const coverChildren = [];
  const mainChildren = [];
  for (const item of order) {
    if (!item || item.enabled === false) continue;
    const fn = builders[item.key];
    if (!fn) continue;
    // eslint-disable-next-line no-await-in-loop
    const block = await fn();
    if (!block || !block.length) continue;
    if (item.key === 'cover') {
      coverChildren.push(...block);
    } else {
      mainChildren.push(...block);
    }
  }

  const sections = [];
  if (coverChildren.length) {
    sections.push({
      properties: { page: { margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: coverChildren,
    });
  }
  if (mainChildren.length) {
    // PDF `.pg` has `border: 1px solid PRIMARY` on every editorial page.
    // Word offers the same effect via the section `borders` property —
    // a thin INK frame inset 24 twips from each page edge matches the
    // PDF visually without reflowing any of the existing content tables
    // (margins stay at 720 twips so DXA widths still fit).
    sections.push({
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
          borders: {
            pageBorderTop:    { style: BorderStyle.SINGLE, size: 6, color: INK, space: 24 },
            pageBorderBottom: { style: BorderStyle.SINGLE, size: 6, color: INK, space: 24 },
            pageBorderLeft:   { style: BorderStyle.SINGLE, size: 6, color: INK, space: 24 },
            pageBorderRight:  { style: BorderStyle.SINGLE, size: 6, color: INK, space: 24 },
          },
        },
      },
      children: mainChildren,
    });
  }
  // Safety net: if both lists somehow end up empty (no enabled sections),
  // emit a single blank section so the docx Packer doesn't choke.
  if (sections.length === 0) {
    sections.push({
      properties: { page: { margin: { top: 720, bottom: 720, left: 720, right: 720 } } },
      children: [new Paragraph({ children: [new TextRun({ text: '' })] })],
    });
  }

  const doc = new Document({
    creator: cName,
    title: `Inspection ${refId}`,
    description: `Inspection report for ${inspection.metadata?.propertyAddress || ''}`,
    styles: {
      default: {
        // PDF body copy uses Georgia, so the DOCX default run font
        // mirrors that for legal/disclaimer pages and any other body
        // text we leave at the section default.
        document: { run: { font: 'Georgia', size: 22, color: INK } },
      },
    },
    sections,
  });

  const blob = await Packer.toBlob(doc);
  const filename = `Inspection_${(inspection.metadata?.propertyAddress || 'Report').replace(/[^a-z0-9]/gi, '_')}_${refId}.docx`;
  if (opts && opts.preview) return { blob, filename };
  await saveFile(blob, filename, { inspectionId: inspection?.id });
  return { blob, filename };
};

// Build only — used by the in-app DOCX preview so it can render the same
// blob without triggering a download. Calls generateDOCX with the preview
// flag so the bytes are returned instead of being saved to disk.
export const buildDOCXBlob = (inspection, settings) =>
  generateDOCX(inspection, settings, { preview: true });
