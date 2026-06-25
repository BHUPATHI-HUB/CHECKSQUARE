/* Floorplan hero — a self-drawing top-down view of a residential apartment.
 *
 * Replaces the previous 100 KB Unsplash photo with ~3 KB of inline SVG that
 * animates itself on first paint (no JS, no requests).  An inspector's
 * walking path traces through the rooms; coloured dots mark logged
 * defects, pulsing to draw the eye to the inspection metaphor.
 *
 * Numbers (room dims, defect labels) are intentionally hand-tuned so the
 * floorplan reads like a real survey sketch — that's the whole point.
 */
import React from 'react';

const FloorplanHero = () => (
  <svg
    viewBox="0 0 600 720"
    role="img"
    aria-label="Animated architectural floorplan with an inspection path"
    className="home-floorplan w-full h-auto"
    xmlns="http://www.w3.org/2000/svg"
  >
    {/* ── grid backdrop ── */}
    <defs>
      <pattern id="fp-grid" width="20" height="20" patternUnits="userSpaceOnUse">
        <path d="M20 0H0V20" fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="0.5"/>
      </pattern>
      <linearGradient id="fp-fade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%"  stopColor="currentColor" stopOpacity="0.0"/>
        <stop offset="40%" stopColor="currentColor" stopOpacity="1.0"/>
        <stop offset="100%" stopColor="currentColor" stopOpacity="0.4"/>
      </linearGradient>
    </defs>
    <rect width="600" height="720" fill="url(#fp-grid)"/>

    {/* ── outer envelope ── */}
    <g stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="square">
      <rect x="50" y="60" width="500" height="600" style={{ '--len': 2200, '--delay': '0.05s' }} />
    </g>

    {/* ── interior walls (5 rooms) ── */}
    <g stroke="currentColor" strokeWidth="1.6" fill="none">
      {/* Top horizontal divider */}
      <line x1="50" y1="290" x2="320" y2="290" style={{ '--len': 270, '--delay': '0.7s' }} />
      <line x1="380" y1="290" x2="550" y2="290" style={{ '--len': 170, '--delay': '0.85s' }} />
      {/* Right vertical divider */}
      <line x1="380" y1="60" x2="380" y2="290" style={{ '--len': 230, '--delay': '0.9s' }} />
      {/* Bottom-half partition */}
      <line x1="280" y1="290" x2="280" y2="500" style={{ '--len': 210, '--delay': '1.05s' }} />
      <line x1="280" y1="540" x2="280" y2="660" style={{ '--len': 120, '--delay': '1.15s' }} />
      {/* Bathroom box */}
      <line x1="280" y1="500" x2="550" y2="500" style={{ '--len': 270, '--delay': '1.25s' }} />
      {/* Closet stripe */}
      <line x1="430" y1="500" x2="430" y2="660" style={{ '--len': 160, '--delay': '1.35s' }} />
    </g>

    {/* ── room labels (drawn instantly after walls) ── */}
    <g
      fill="currentColor"
      fillOpacity="0.6"
      fontFamily="ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto"
      fontSize="11"
      letterSpacing="0.18em"
      style={{ animation: 'draw-on 1ms forwards', animationDelay: '1.6s', opacity: 0 }}
      // Inline keyframe to fade-in once walls finish.
    >
      <text x="195" y="180" textAnchor="middle">LIVING</text>
      <text x="195" y="195" textAnchor="middle" fontSize="9" fillOpacity="0.5">14′ × 18′</text>
      <text x="465" y="180" textAnchor="middle">KITCHEN</text>
      <text x="465" y="195" textAnchor="middle" fontSize="9" fillOpacity="0.5">11′ × 12′</text>
      <text x="165" y="455" textAnchor="middle">BEDROOM</text>
      <text x="165" y="470" textAnchor="middle" fontSize="9" fillOpacity="0.5">13′ × 14′</text>
      <text x="415" y="395" textAnchor="middle">DINING</text>
      <text x="415" y="410" textAnchor="middle" fontSize="9" fillOpacity="0.5">11′ × 11′</text>
      <text x="355" y="585" textAnchor="middle">BATH</text>
      <text x="490" y="585" textAnchor="middle">CLOSET</text>
    </g>

    {/* ── inspector walking path (dashed stroke) ── */}
    <g stroke="hsl(var(--secondary))" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <polyline
        className="inspector-path"
        points="
          110 660
          110 590
          195 590
          195 460
          195 320
          110 320
          110 180
          195 180
          330 180
          465 180
          465 320
          465 420
          415 420
          355 540
          355 585
          490 585
        "
      />
    </g>

    {/* ── defect markers (pulsing) ── */}
    <g>
      {[
        // x, y, label
        { x: 235, y: 320, l: 'Hairline crack — load wall', d: '2.2s' },
        { x: 110, y: 230, l: 'Outlet — open ground',       d: '2.6s' },
        { x: 465, y: 245, l: 'Cabinet — water staining',   d: '3.0s' },
        { x: 195, y: 540, l: 'Caulking — failing bead',    d: '3.4s' },
        { x: 355, y: 555, l: 'Vent fan — non-functional',  d: '3.8s' },
      ].map(({ x, y, l, d }, i) => (
        <g key={i} className="defect" style={{ '--delay': d }} transform={`translate(${x} ${y})`}>
          <circle r="11" fill="hsl(var(--secondary) / 0.18)"/>
          <circle r="5"  fill="hsl(var(--secondary))"/>
          {i === 0 && (
            <g
              style={{ animation: 'draw-on 1ms forwards', animationDelay: '4.2s', opacity: 0 }}
              fill="currentColor" fontFamily="ui-sans-serif" fontSize="10"
            >
              <line x1="14" y1="0" x2="34" y2="-22" stroke="currentColor" strokeOpacity="0.4" strokeWidth="0.8"/>
              <text x="38" y="-22">{l}</text>
            </g>
          )}
        </g>
      ))}
    </g>

    {/* ── compass rose (bottom-left) ── */}
    <g transform="translate(72 692)" stroke="currentColor" strokeOpacity="0.5" fill="none" strokeWidth="0.8">
      <circle r="11" style={{ '--len': 70, '--delay': '2s' }} />
      <line x1="0" y1="-15" x2="0" y2="15" style={{ '--len': 30, '--delay': '2.1s' }} />
      <line x1="-15" y1="0" x2="15" y2="0" style={{ '--len': 30, '--delay': '2.1s' }} />
      <text
        x="0" y="-18" textAnchor="middle"
        fontSize="9" letterSpacing="0.15em"
        fill="currentColor" fillOpacity="0.7" stroke="none"
        style={{ animation: 'draw-on 1ms forwards', animationDelay: '2.3s', opacity: 0 }}
      >N</text>
    </g>

    {/* ── inline keyframe used by text fade-in (the global animation in
        home.css drives stroked geometry; this overrides for text) ── */}
    <style>{`
      .home-floorplan text { opacity: 1; }
    `}</style>
  </svg>
);

export default FloorplanHero;
