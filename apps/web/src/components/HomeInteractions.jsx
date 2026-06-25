/* Tiny interactive primitives used by the immersive HomePage.
 *
 *  • <Spotlight>  — sets --mx/--my CSS vars on the parent based on cursor
 *                   position (~14 LoC, throttled via rAF).
 *  • <TiltCard>   — gyroscope-style 3D tilt for desktop hover.
 *  • <SplitText>  — splits its children into per-letter spans for the
 *                   stagger reveal animation defined in home.css.
 *  • <Particles>  — emits N drifting ambient dots upward.
 *
 *  All four guard themselves against touch / reduced-motion users so
 *  mobile and accessibility-conscious visitors get a calm experience.
 */
import React, { useEffect, useRef } from 'react';
const isTouchOnly = () =>
  typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches;
const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ─── <Spotlight> ─────────────────────────────────────────────────── */
export const Spotlight = ({ children, className = '', ...rest }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || isTouchOnly() || prefersReducedMotion()) return undefined;
    const el = ref.current;
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      });
    };
    el.addEventListener('mousemove', onMove);
    return () => { cancelAnimationFrame(raf); el.removeEventListener('mousemove', onMove); };
  }, []);
  return <div ref={ref} className={className} {...rest}>{children}</div>;
};

/* ─── <TiltCard> ─────────────────────────────────────────────────── */
export const TiltCard = ({ children, className = '', max = 8, ...rest }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current || isTouchOnly() || prefersReducedMotion()) return undefined;
    const el = ref.current;
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        const cx = (e.clientX - r.left) / r.width  - 0.5;   // -0.5..0.5
        const cy = (e.clientY - r.top)  / r.height - 0.5;
        el.style.setProperty('--ry', `${cx * max}deg`);
        el.style.setProperty('--rx', `${-cy * max}deg`);
      });
    };
    const onLeave = () => {
      cancelAnimationFrame(raf);
      el.style.setProperty('--rx', '0deg');
      el.style.setProperty('--ry', '0deg');
    };
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
    };
  }, [max]);
  return <div ref={ref} className={`home-tilt ${className}`} {...rest}>{children}</div>;
};

/* ─── <SplitText> ─────────────────────────────────────────────────── */
/* Splits its text content into <span class="home-letter"> so the
   per-letter rise-up animation in home.css can target each glyph.  */
export const SplitText = ({ text, className = '', delayBase = 0, step = 0.02, as: As = 'span' }) => {
  if (typeof text !== 'string') return null;
  return (
    <As className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden="true"
          data-space={ch === ' ' ? 'true' : 'false'}
          className="home-letter"
          style={{ '--d': `${delayBase + i * step}s` }}
        >
          {ch === ' ' ? '\u00A0' : ch}
        </span>
      ))}
    </As>
  );
};

/* ─── <RotatingWord> ──────────────────────────────────────────────────
 *
 *  Cycles through `words` with a JS interval.  Replaces a pure-CSS
 *  @keyframes implementation that kept getting stuck in 'pending' state
 *  in some Chromium builds (animation reports playState='running' but
 *  startTime=null, currentTime=0 forever).  Driving the active index
 *  from React state is bulletproof and only ~30 LoC.
 *
 *  Honors prefers-reduced-motion by jumping rather than animating.
 */
export const RotatingWord = ({ words = [], interval = 3000, className = '' }) => {
  const [idx, setIdx] = React.useState(0);
  React.useEffect(() => {
    if (prefersReducedMotion()) return undefined;
    const id = setInterval(() => setIdx((v) => (v + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [interval, words.length]);
  return (
    <span className={`home-word-mask ${className}`}>
      {words.map((w, i) => (
        <span
          key={w}
          className="home-word"
          data-state={
            i === idx ? 'active'
            : i === (idx - 1 + words.length) % words.length ? 'leaving'
            : 'hidden'
          }
          aria-hidden={i !== idx}
        >
          {w}
        </span>
      ))}
    </span>
  );
};

/* ─── <Particles> ─────────────────────────────────────────────────── */
export const Particles = ({ count = 18 }) => {
  if (prefersReducedMotion()) return null;
  // Deterministic-ish positions so the layout stays calm across re-renders.
  const dots = Array.from({ length: count }, (_, i) => ({
    x:     `${(i * 53)        % 100}%`,
    dur:   `${12 + (i * 7)    % 14}s`,
    delay: `${(i * 1.7)       % 14}s`,
    size:  i % 5 === 0 ? 6 : 3,
  }));
  return (
    <div className="home-particles" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          style={{
            '--x':     d.x,
            '--dur':   d.dur,
            '--delay': d.delay,
            width:     `${d.size}px`,
            height:    `${d.size}px`,
          }}
        />
      ))}
    </div>
  );
};
