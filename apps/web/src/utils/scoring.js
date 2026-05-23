/**
 * Inspection scoring engine — PropChk severity model (VBA parity).
 *
 * Each room is rated against a fixed N-item checklist. Per severity:
 *   satisfaction = max(0, (items - count) / items) * 100
 * Room score = w_major*sat_major + w_minor*sat_minor + w_cosmetic*sat_cosmetic
 * Property score = average of room scores (matches the dashboard's AVERAGE row).
 *
 * Inspector & admin can override any room's score OR the final overall;
 * overrides win and are flagged with `source: 'override'`.
 */

// ─── Local area-math (kept here to avoid coupling with ReportGenerator) ──
const UNIT_FACTOR_TO_FEET = { ft: 1, in: 1 / 12, m: 3.28084, cm: 0.0328084 };
const computeAreaSft = (length, width, lengthUnit = 'ft', widthUnit = 'ft') => {
  const L = parseFloat(length) || 0;
  const W = parseFloat(width) || 0;
  const lf = L * (UNIT_FACTOR_TO_FEET[lengthUnit] || 1);
  const wf = W * (UNIT_FACTOR_TO_FEET[widthUnit] || 1);
  return Math.round(lf * wf * 100) / 100;
};

// Legacy exports retained so historical imports (`FACTOR_KEYS`, `FACTOR_META`,
// `DEFAULT_WEIGHTS`) keep compiling. The active engine below is PropChk.
export const FACTOR_KEYS = [];
export const FACTOR_META = {};
export const DEFAULT_WEIGHTS = {};

// Priority badge colors used across the dashboard, score card, and PDF.
export const PROPCHK_PRIORITY_META = {
  Clean:  { color: '#10b981', label: 'Clean'  },
  Watch:  { color: '#f59e0b', label: 'Watch'  },
  Urgent: { color: '#dc2626', label: 'Urgent' },
};

// ─── PropChk-style per-room scoring (VBA parity) ───────────────────
// Each room is rated against an N-item checklist (default 20), with
// severity weights Major=0.70, Minor=0.25, Cosmetic=0.05.
// Per-severity satisfaction = max(0, (items - count) / items) × 100,
// blended via the weights into a 0–100 room score. Priority follows
// the same Major-count thresholds (Urgent ≥3, Watch ≥1, else Clean).
export const PROPCHK_WEIGHTS = { Major: 0.70, Minor: 0.25, Cosmetic: 0.05 };
export const PROPCHK_ITEMS_PER_ROOM = 20;

// Default formulas exposed to the admin formula editor. Admins can rewrite
// these as plain JS expressions; the engine evaluates them in a sandboxed
// `new Function` (no globals, no `this`, no closure variables) and falls
// back to the built-in PropChk calculation if the expression throws or
// returns a non-finite number.
export const DEFAULT_ROOM_SCORE_EXPR =
  '0.70 * satMajor + 0.25 * satMinor + 0.05 * satCosmetic';
export const DEFAULT_PRIORITY_EXPR =
  "major >= 3 ? 'Urgent' : major >= 1 ? 'Watch' : 'Clean'";

export const DEFAULT_PROPCHK_CONFIG = {
  weights: { ...PROPCHK_WEIGHTS },
  itemsPerRoom: PROPCHK_ITEMS_PER_ROOM,
  roomScoreExpr: DEFAULT_ROOM_SCORE_EXPR,
  priorityExpr:  DEFAULT_PRIORITY_EXPR,
};

// Variables exposed to admin formulas. Order matters — `new Function`
// uses positional parameters, not destructuring.
// `counts` and `sats` are dictionaries keyed by severity name so admins
// who add custom severities in settings can write expressions like
// `0.5*sats.Critical + 0.3*sats.Major + 0.2*sats.Minor` and the engine
// will resolve them. Legacy `major/minor/cosmetic/satMajor/...` are kept
// for backward compat with existing saved formulas.
const FORMULA_VAR_NAMES = [
  'major', 'minor', 'cosmetic', 'items',
  'satMajor', 'satMinor', 'satCosmetic',
  'roomName', 'propertyType', 'Math',
  'counts', 'sats', 'weights',
];

/**
 * Compile an admin-authored expression into a callable function.
 * Returns `{ fn, error }`. The function returns either a number or string
 * (depending on what the expression evaluates to); callers must validate.
 * The function is created with strict mode and no closure access — admin
 * is a trusted role, but this still blocks accidental `this`/`window` use.
 */
export const compileScoreExpression = (expr) => {
  if (!expr || typeof expr !== 'string' || !expr.trim()) {
    return { fn: null, error: 'Empty expression' };
  }
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(
      ...FORMULA_VAR_NAMES,
      `"use strict"; return (${expr});`,
    );
    return { fn, error: null };
  } catch (err) {
    return { fn: null, error: err?.message || String(err) };
  }
};

/**
 * Evaluate a compiled expression with PropChk variables. Returns the raw
 * value (number/string) or `null` if evaluation threw. Never throws.
 */
const _evalExpr = (compiled, vars) => {
  if (!compiled?.fn) return null;
  try {
    return compiled.fn(
      vars.major, vars.minor, vars.cosmetic, vars.items,
      vars.satMajor, vars.satMinor, vars.satCosmetic,
      vars.roomName, vars.propertyType, Math,
      vars.counts, vars.sats, vars.weights,
    );
  } catch {
    return null;
  }
};

const _countRoomSev = (room, severity) =>
  (room?.defects || []).filter((d) => d.severity === severity).length;

/** PropChk per-severity satisfaction (0–100). */
const _satisfaction = (count, items) =>
  Math.max(0, ((items - count) / items) * 100);

const _resolvePropChkConfig = (settings) => {
  const s = settings?.scoring || {};
  const w = s.weights || {};
  // ── Build the active severity list ─────────────────────────────
  // 1. From settings.severityLevels (admin-editable). 2. Fallback to
  // the legacy Major/Minor/Cosmetic. We dedupe names (case-sensitive)
  // and preserve admin-defined order so the report columns match what
  // the admin sees in the Severity Taxonomy editor.
  const adminSevs = Array.isArray(settings?.severityLevels)
    ? settings.severityLevels.filter((x) => x && typeof x.name === 'string' && x.name.trim())
    : [];
  const names = [];
  const colors = {};
  const definitions = {};
  adminSevs.forEach((sv) => {
    const nm = sv.name.trim();
    if (!names.includes(nm)) names.push(nm);
    if (sv.color)      colors[nm] = sv.color;
    if (sv.definition) definitions[nm] = sv.definition;
  });
  if (!names.length) {
    names.push('Major', 'Minor', 'Cosmetic');
  }
  // ── Resolve weights per severity ───────────────────────────────
  // Honour admin-supplied weight if it's a finite number; otherwise
  // fall back to the legacy PropChk default for that name (or 0 for
  // a brand-new severity the admin hasn't weighted yet).
  const weights = {};
  names.forEach((nm) => {
    const raw = Number(w[nm]);
    weights[nm] = Number.isFinite(raw)
      ? raw
      : (PROPCHK_WEIGHTS[nm] != null ? PROPCHK_WEIGHTS[nm] : 0);
  });
  return {
    weights,
    severityNames: names,
    severityColors: colors,
    severityDefinitions: definitions,
    itemsPerRoom: Number(s.itemsPerRoom) > 0 ? Number(s.itemsPerRoom) : PROPCHK_ITEMS_PER_ROOM,
    roomScoreExpr: (typeof s.roomScoreExpr === 'string' && s.roomScoreExpr.trim())
      ? s.roomScoreExpr.trim() : DEFAULT_ROOM_SCORE_EXPR,
    priorityExpr: (typeof s.priorityExpr === 'string' && s.priorityExpr.trim())
      ? s.priorityExpr.trim() : DEFAULT_PRIORITY_EXPR,
  };
};

/**
 * Per-room PropChk score on a 0–100 scale.
 * Returns counts, satisfactions, both 0–10 and 0–100 forms, and priority.
 * When admin has supplied a custom `roomScoreExpr` / `priorityExpr`, those
 * take precedence — falling back to the built-in formula on any error.
 */
export const computeRoomScore = (room, config = DEFAULT_PROPCHK_CONFIG, options = {}) => {
  const items = Number(config?.itemsPerRoom) > 0 ? Number(config.itemsPerRoom) : PROPCHK_ITEMS_PER_ROOM;
  const w = config?.weights || PROPCHK_WEIGHTS;
  // Severity list — admin-editable. Falls back to the classic three
  // when no severityLevels are configured (or when the function is
  // called with the bare DEFAULT_PROPCHK_CONFIG from a legacy caller).
  const severityNames = Array.isArray(config?.severityNames) && config.severityNames.length
    ? config.severityNames
    : ['Major', 'Minor', 'Cosmetic'];

  // Count defects per severity + compute satisfaction.
  const counts = {};
  const sats   = {};
  severityNames.forEach((nm) => {
    const c = _countRoomSev(room, nm);
    counts[nm] = c;
    sats[nm]   = _satisfaction(c, items);
  });
  // Legacy convenience aliases — always populated so existing UI/
  // report code reading `r.major` / `r.satMajor` keeps working even
  // when the admin has removed those severity names from settings.
  const major    = counts.Major    || 0;
  const minor    = counts.Minor    || 0;
  const cosmetic = counts.Cosmetic || 0;
  const satMajor    = sats.Major    || 0;
  const satMinor    = sats.Minor    || 0;
  const satCosmetic = sats.Cosmetic || 0;

  // Default room-score = Σ weight[name] × satisfaction[name] over
  // every configured severity. With the canonical three severities at
  // PropChk weights this reduces exactly to the legacy formula.
  const fallbackPct = severityNames.reduce(
    (s, nm) => s + (Number(w[nm]) || 0) * (sats[nm] || 0),
    0,
  );

  const vars = {
    major, minor, cosmetic, items,
    satMajor, satMinor, satCosmetic,
    roomName: room?.name || 'Room',
    propertyType: options.propertyType || '',
    counts, sats, weights: w,
  };

  // Custom score expression (admin-editable). Result must be a finite number.
  let pct = fallbackPct;
  if (config?.roomScoreExpr && config.roomScoreExpr !== DEFAULT_ROOM_SCORE_EXPR) {
    const compiled = options.compiledScoreFn || compileScoreExpression(config.roomScoreExpr);
    const raw = _evalExpr(compiled, vars);
    if (typeof raw === 'number' && Number.isFinite(raw)) pct = raw;
  }
  // Clamp to a 0–100 band so a bad formula can't break the chart axes.
  pct = Math.max(0, Math.min(100, pct));

  // Custom priority expression. Must return one of the three strings;
  // anything else falls back to the built-in rule.
  let priority = major >= 3 ? 'Urgent' : major >= 1 ? 'Watch' : 'Clean';
  if (config?.priorityExpr && config.priorityExpr !== DEFAULT_PRIORITY_EXPR) {
    const compiled = options.compiledPriorityFn || compileScoreExpression(config.priorityExpr);
    const raw = _evalExpr(compiled, vars);
    if (raw === 'Urgent' || raw === 'Watch' || raw === 'Clean') priority = raw;
  }

  const score10  = Math.round((pct / 10) * 10) / 10;
  const scorePct = Math.round(pct * 10) / 10;
  return {
    name: room?.name || 'Room',
    // Per-severity dictionaries — the source of truth for downstream UI/report.
    counts, sats,
    // Legacy aliases (always populated, even when those severities are not configured).
    major, minor, cosmetic,
    satMajor, satMinor, satCosmetic,
    total: severityNames.reduce((s, nm) => s + (counts[nm] || 0), 0),
    score10, scorePct, priority,
  };
};

/**
 * Property-level PropChk roll-up — array of per-room rows plus the
 * average score (matches the VBA dashboard's AVERAGE row).
 */
export const computePropChkSummary = (inspection, config = DEFAULT_PROPCHK_CONFIG) => {
  // Compile expressions once per call instead of per room.
  const compiledScoreFn    = compileScoreExpression(config?.roomScoreExpr || DEFAULT_ROOM_SCORE_EXPR);
  const compiledPriorityFn = compileScoreExpression(config?.priorityExpr  || DEFAULT_PRIORITY_EXPR);
  const severityNames = Array.isArray(config?.severityNames) && config.severityNames.length
    ? config.severityNames
    : ['Major', 'Minor', 'Cosmetic'];
  const rooms = (inspection?.roomInspections || []).map((r) => ({
    id: r?.id || r?.name,
    ...computeRoomScore(r, config, {
      propertyType: inspection?.propertyType,
      compiledScoreFn,
      compiledPriorityFn,
    }),
  }));
  const avg = rooms.length
    ? Math.round((rooms.reduce((s, r) => s + r.scorePct, 0) / rooms.length) * 10) / 10
    : 0;
  // Property-wide totals, per severity + legacy aliases.
  const totalsByName = {};
  severityNames.forEach((nm) => {
    totalsByName[nm] = rooms.reduce((s, r) => s + (r.counts?.[nm] || 0), 0);
  });
  const totals = {
    byName:   totalsByName,
    major:    totalsByName.Major    || 0,
    minor:    totalsByName.Minor    || 0,
    cosmetic: totalsByName.Cosmetic || 0,
    total:    Object.values(totalsByName).reduce((s, n) => s + n, 0),
  };
  const priority = totals.major >= 3 ? 'Urgent' : totals.major >= 1 ? 'Watch' : 'Clean';
  return {
    rooms,
    avg,
    avg10: Math.round((avg / 10) * 10) / 10,
    totals,
    priority,
    itemsPerRoom: Number(config?.itemsPerRoom) > 0 ? Number(config.itemsPerRoom) : PROPCHK_ITEMS_PER_ROOM,
    weights: config?.weights || PROPCHK_WEIGHTS,
    severityNames,
    severityColors:      config?.severityColors      || {},
    severityDefinitions: config?.severityDefinitions || {},
  };
};

const clamp = (n, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

const totalSftFor = (inspection) => {
  const areas = inspection.areaCalculations || [];
  return areas.reduce(
    (s, a) => s + computeAreaSft(a.length, a.width, a.lengthUnit, a.widthUnit),
    0,
  );
};

// ─── Letter grade ────────────────────────────────────────────────────
export const gradeFor = (score) => {
  if (score >= 96) return { letter: 'A+', label: 'Excellent', color: '#10b981' };
  if (score >= 90) return { letter: 'A',  label: 'Very Good', color: '#10b981' };
  if (score >= 80) return { letter: 'B',  label: 'Good',      color: '#0ea5e9' };
  if (score >= 70) return { letter: 'C',  label: 'Acceptable', color: '#f59e0b' };
  if (score >= 60) return { letter: 'D',  label: 'Below Standard', color: '#ef4444' };
  return                  { letter: 'F',  label: 'Significant Concerns', color: '#dc2626' };
};

// ─── Public API ──────────────────────────────────────────────────────
/**
 * Compute the full PropChk score breakdown for an inspection.
 *
 * The return shape is kept compatible with the previous 7-factor API so
 * downstream consumers (report PDF, inspector preview, charts) keep working —
 * but each `factor` now represents a **room** rather than a category, and
 * the per-room "value" is its 0–100 score from the severity model.
 *
 * @returns {{
 *   enabled: boolean,
 *   overall: number,                      // average room score (0–100)
 *   autoOverall: number,
 *   grade: {letter, label, color},
 *   factors: Array<{
 *     key, name, color, weight, auto, value, weighted, source,
 *     major, minor, cosmetic, total, priority,
 *   }>,
 *   totals: { major, minor, cosmetic, total },
 *   priority: 'Clean'|'Watch'|'Urgent',
 *   itemsPerRoom: number,
 *   severityWeights: { Major, Minor, Cosmetic },
 *   finalSource: 'auto'|'override',
 *   overriddenBy: string|null,
 * }}
 */
export const computeInspectionScore = (inspection, settings) => {
  const config = _resolvePropChkConfig(settings);
  const summary = computePropChkSummary(inspection, config);
  const overrides = inspection.scoreOverrides || {};

  // Each room becomes a "factor" entry. Weights are evenly split so the
  // weighted column in legacy charts still sums to 100.
  const evenWeight = summary.rooms.length
    ? Math.round((100 / summary.rooms.length) * 10) / 10
    : 0;

  const factors = summary.rooms.map((r) => {
    const overrideKey = `room:${r.id}`;
    const override = overrides[overrideKey];
    const auto = r.scorePct;
    const value = (typeof override === 'number') ? clamp(override) : auto;
    const color =
      r.priority === 'Urgent' ? PROPCHK_PRIORITY_META.Urgent.color :
      r.priority === 'Watch'  ? PROPCHK_PRIORITY_META.Watch.color  :
                                 PROPCHK_PRIORITY_META.Clean.color;
    return {
      key: overrideKey,
      name: r.name,
      short: r.name,
      color,
      weight: evenWeight,
      auto,
      value,
      weighted: Math.round(value * (evenWeight / 100) * 10) / 10,
      source: (typeof override === 'number') ? 'override' : 'auto',
      // Room-specific extras (used by the new dashboard view).
      // `counts` is the source of truth across all configured severities;
      // `major/minor/cosmetic` remain for legacy consumers.
      counts: r.counts || {},
      major: r.major,
      minor: r.minor,
      cosmetic: r.cosmetic,
      total: r.total,
      priority: r.priority,
    };
  });

  const autoOverall = summary.rooms.length
    ? Math.round(
        factors.reduce((s, f) => s + f.value, 0) / factors.length,
      )
    : 0;
  const finalOverride = (typeof overrides.overall === 'number') ? clamp(overrides.overall) : null;
  const overall = finalOverride != null ? finalOverride : autoOverall;

  return {
    enabled: inspection.includeScore === true,
    overall,
    autoOverall,
    grade: gradeFor(overall),
    factors,
    totals: summary.totals,
    priority: summary.priority,
    itemsPerRoom: summary.itemsPerRoom,
    severityWeights: summary.weights,
    severityNames:       summary.severityNames,
    severityColors:      summary.severityColors,
    severityDefinitions: summary.severityDefinitions,
    finalSource: finalOverride != null ? 'override' : 'auto',
    overriddenBy: overrides.overriddenBy || null,
    overriddenAt: overrides.overriddenAt || null,
    remarks: overrides.remarks || '',
  };
};

/**
 * Plain-language narrative for the score-summary page. PropChk version:
 * one sentence per room explaining its severity counts and priority, plus
 * a property-level verdict driven by the average.
 */
export const explainScore = (inspection, summary) => {
  const lines = summary.factors.map((f) => {
    const sevParts = [];
    if (f.major)    sevParts.push(`${f.major} major`);
    if (f.minor)    sevParts.push(`${f.minor} minor`);
    if (f.cosmetic) sevParts.push(`${f.cosmetic} cosmetic`);
    const sevStr = sevParts.length ? sevParts.join(', ') : 'no recorded defects';
    const verdict = f.value >= 90 ? 'an excellent result'
                  : f.value >= 80 ? 'a strong result'
                  : f.value >= 70 ? 'an acceptable result'
                  : f.value >= 60 ? 'a below-standard result'
                  : 'a result that warrants attention';
    const priorityLine = f.priority === 'Urgent'
      ? ' Marked as Urgent — three or more major defects.'
      : f.priority === 'Watch'
        ? ' Marked as Watch — at least one major defect.'
        : '';
    return {
      key: f.key,
      name: f.name,
      value: f.value,
      weight: f.weight,
      sentence: `${f.name} scored ${f.value}/100 — ${verdict}, with ${sevStr}.${priorityLine}`,
      source: f.source,
    };
  });

  const overallSentence = summary.factors.length
    ? `Across ${summary.factors.length} room(s), the property averaged ${summary.overall}/100 (${summary.grade.letter} · ${summary.grade.label}) — overall priority ${summary.priority}. Totals: ${summary.totals.major} major, ${summary.totals.minor} minor, ${summary.totals.cosmetic} cosmetic.`
    : `No rooms have been recorded yet, so the property score defaults to ${summary.overall}/100.`;

  return { overall: overallSentence, lines };
};

export const DEFAULT_SCORE_EXPLANATION_HTML = `
<p>This property scored <strong>{{averageScore}}/100</strong> ({{averageScoreOf10}} out of 10) — grade <strong>{{grade}}</strong>, overall priority <strong>{{overallPriority}}</strong> — across <strong>{{totalRooms}}</strong> room(s) and <strong>{{totalDefects}}</strong> observation(s) ({{totalMajor}} major, {{totalMinor}} minor, {{totalCosmetic}} cosmetic).</p>

<p>Every inspection is summarised by a <strong>Property Score</strong> on a 0–100 scale and a letter grade from <em>A+</em> through <em>F</em>. The score follows the <strong>PropChk severity model</strong>: each room is rated against a fixed-size checklist and penalised by the number and severity of defects found in it.</p>

<p><strong>How a room is scored.</strong> Defects are classified as <em>Major</em>, <em>Minor</em>, or <em>Cosmetic</em>. For each severity, satisfaction is calculated as <code>(items − count) ÷ items × 100</code>, where <em>items</em> is the per-room checklist size (currently <strong>{{itemsPerRoom}}</strong>). The three satisfactions are blended using the configured weights — <strong>Major {{weightMajorPct}}, Minor {{weightMinorPct}}, Cosmetic {{weightCosmeticPct}}</strong> — into the room's 0–100 score via the formula:</p>
<p style="font-family:'Courier New',monospace;background:#f3f4f6;padding:8px 12px;border-left:3px solid #2c3e50;">{{roomScoreFormula}}</p>

<p><strong>How the property is scored.</strong> The property score is the simple average of all room scores. The bar chart shows each room's score; the donut shows the property average.</p>

<p><strong>Priority labels.</strong> The priority chip on each room is derived from this rule:</p>
<p style="font-family:'Courier New',monospace;background:#f3f4f6;padding:8px 12px;border-left:3px solid #2c3e50;">{{priorityFormula}}</p>
<ul>
  <li><strong>Urgent</strong> — three or more major defects in a single room (or across the property roll-up).</li>
  <li><strong>Watch</strong> — at least one major defect.</li>
  <li><strong>Clean</strong> — no major defects.</li>
</ul>

<p><strong>Letter grade reference.</strong></p>
<ul>
  <li><strong>A+ (96–100)</strong> — Excellent. Move-in ready, exceptional condition.</li>
  <li><strong>A (90–95)</strong> — Very Good. Minor preventive maintenance only.</li>
  <li><strong>B (80–89)</strong> — Good. Some attention recommended within the year.</li>
  <li><strong>C (70–79)</strong> — Acceptable. Several items to address in near term.</li>
  <li><strong>D (60–69)</strong> — Below Standard. Significant remediation advised before move-in.</li>
  <li><strong>F (&lt; 60)</strong> — Significant Concerns. Consider re-negotiation or professional remediation.</li>
</ul>

<p><em>A score is one indicator among many. It does not replace professional engineering, legal, or financial advice, nor does it constitute a warranty of any kind. Use it alongside the detailed findings in this report.</em></p>
`;
