import React from 'react';

/**
 * A lightweight inspection instrument graphic. It is deliberately inline SVG
 * so the first paint stays fast and the same visual language works offline in
 * the Capacitor build as well as in the browser.
 */
const InspectionSignal = ({ className = '', tone = 'light', label = 'Inspection signal' }) => {
  const dark = tone === 'dark';
  const ink = dark ? 'rgba(255,255,255,.82)' : 'hsl(var(--primary))';
  const mutedInk = dark ? 'rgba(255,255,255,.28)' : 'hsl(var(--foreground) / .2)';
  const accent = dark ? 'hsl(var(--secondary))' : 'hsl(var(--secondary))';

  return (
    <svg
      viewBox="0 0 520 320"
      role="img"
      aria-label={label}
      className={`inspection-signal ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="signal-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <path d="M24 0H0V24" fill="none" stroke={mutedInk} strokeWidth=".7" />
        </pattern>
        <linearGradient id="signal-wash" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={accent} stopOpacity=".18" />
          <stop offset="1" stopColor={accent} stopOpacity="0" />
        </linearGradient>
      </defs>

      <rect width="520" height="320" rx="22" fill="url(#signal-grid)" />
      <rect width="520" height="320" rx="22" fill="url(#signal-wash)" />

      <g className="inspection-signal-frame" fill="none" stroke={ink} strokeLinecap="round" strokeLinejoin="round">
        <path d="M56 246V116l114-62 114 62v130" strokeWidth="2.4" />
        <path d="M56 246h228M112 246v-84h116v84M170 54v108" strokeWidth="1.5" opacity=".65" />
        <path d="M284 246h106M326 246v-58h64v58M284 188h106" strokeWidth="1.5" opacity=".65" />
        <path d="M82 138h58M214 138h28M306 138h58" strokeWidth="1" opacity=".42" />
      </g>

      <g className="inspection-signal-axis" fill="none" stroke={accent} strokeWidth="1.4" opacity=".75">
        <path d="M44 270h256" strokeDasharray="3 7" />
        <path d="M316 270h116" strokeDasharray="3 7" />
        <path d="M44 270v-8M300 270v-8M316 270v-8M432 270v-8" />
      </g>

      <g className="inspection-signal-pulse" transform="translate(170 116)">
        <circle r="18" fill={accent} opacity=".13" />
        <circle r="7" fill={accent} />
        <circle r="3" fill={dark ? '#14212b' : 'hsl(var(--background))'} />
      </g>
      <g className="inspection-signal-pulse" transform="translate(342 188)" style={{ animationDelay: '1.1s' }}>
        <circle r="15" fill={accent} opacity=".13" />
        <circle r="6" fill={accent} />
      </g>

      <g fill={ink} fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing=".16em">
        <text x="332" y="74" fontSize="10" opacity=".66">FIELD / SIGNAL</text>
        <text x="332" y="94" fontSize="20" letterSpacing=".04em">READY TO REVIEW</text>
        <text x="332" y="116" fontSize="10" opacity=".52">PHOTO · DEFECT · REPORT</text>
      </g>
      <text x="56" y="294" fill={ink} fontSize="9" fontFamily="ui-sans-serif,system-ui,sans-serif" letterSpacing=".22em" opacity=".55">
        CHECKSQUARE / INSPECTION WORKSPACE
      </text>
    </svg>
  );
};

export default InspectionSignal;
