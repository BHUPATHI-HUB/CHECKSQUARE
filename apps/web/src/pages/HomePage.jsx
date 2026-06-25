import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Button } from '@/components/ui/button';
import FloorplanHero from '@/components/FloorplanHero.jsx';
import { Spotlight, TiltCard, SplitText, Particles } from '@/components/HomeInteractions.jsx';
import './home.css';
import {
  ArrowRight, ArrowUpRight, CheckCircle2, ShieldCheck, ClipboardList,
  Camera, FileText, Sparkles, Quote, Plus, Minus,
} from 'lucide-react';

// ─── Motion presets ───────────────────────────────────────────────────
const fadeUp = {
  initial: { opacity: 0, y: 28 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
};

const stagger = {
  whileInView: { transition: { staggerChildren: 0.08 } },
  viewport: { once: true, amount: 0.2 },
};

// ─── Counter — lightweight number ticker (IntersectionObserver + rAF) ─
// 24 LoC, zero deps.  Animates only once when the element scrolls into
// view to keep CPU cost negligible for low-end devices.
const Counter = ({ to, suffix = '', duration = 1400 }) => {
  const ref = useRef(null);
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!ref.current) return undefined;
    const el = ref.current;
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const start = performance.now();
        const ease = (t) => 1 - Math.pow(1 - t, 3);
        const step = (now) => {
          const t = Math.min(1, (now - start) / duration);
          setVal(to * ease(t));
          if (t < 1) requestAnimationFrame(step);
          else setVal(to);
        };
        requestAnimationFrame(step);
        obs.disconnect();
      });
    }, { threshold: 0.4 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [to, duration]);
  const display = Number.isInteger(to) ? Math.round(val).toLocaleString() : val.toFixed(2);
  return <span ref={ref} className="home-counter-value">{display}{suffix}</span>;
};

// ─── Reusable section heading ────────────────────────────────────────
const SectionLead = ({ eyebrow, title, deck, align = 'left' }) => (
  <motion.div {...fadeUp} className={`max-w-3xl ${align === 'center' ? 'mx-auto text-center' : ''}`}>
    <p className="editorial-eyebrow">{eyebrow}</p>
    <h2 className="editorial-headline mt-5 text-3xl sm:text-4xl md:text-5xl lg:text-6xl break-words">{title}</h2>
    {deck && <p className="editorial-deck mt-6 text-lg md:text-xl max-w-2xl">{deck}</p>}
  </motion.div>
);

const HomePage = () => {
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const methods = [
    {
      icon: ClipboardList,
      eyebrow: '01 / Method',
      title: 'A five-phase inspection ritual',
      body:
        'Metadata, area calculations, water quality, room-by-room defects, and final review. Each phase enforces its own discipline so nothing escapes documentation.',
    },
    {
      icon: Camera,
      eyebrow: '02 / Evidence',
      title: 'Photographs as the primary record',
      body:
        'Ambient corner shots establish baseline. Defect photos are tied to position and severity. The report writes itself from what the camera captured.',
    },
    {
      icon: ShieldCheck,
      eyebrow: '03 / Oversight',
      title: 'Admin approval before delivery',
      body:
        'Every report passes through a senior reviewer. Approved reports carry the company seal. Customers never receive raw drafts.',
    },
  ];

  const services = [
    { tag: 'Residential', title: 'Single-family homes', meta: 'Up to 4,500 sq ft' },
    { tag: 'Condominium', title: 'Multi-unit dwellings', meta: 'HOA coordination' },
    { tag: 'New build', title: 'Pre-handover inspections', meta: 'Snag list + builder report' },
    { tag: 'Commercial', title: 'Light commercial spaces', meta: 'Phase I & II PCA' },
  ];

  const voices = [
    {
      quote:
        'I have used three different inspection platforms over the past decade. This is the first that respects how the trade actually works on site.',
      name: 'Maya Chen', role: 'Senior Inspector · 14 years field',
    },
    {
      quote:
        'The reports we deliver now look like they belong in a closing file at a law firm. Customers stop second-guessing the price.',
      name: 'Daniel Park', role: 'Operations · Park & Hale Inspections',
    },
    {
      quote:
        'I scheduled my inspection on a Tuesday and had the bound PDF in my inbox on Friday. Every defect was photographed and ranked.',
      name: 'Renée Okafor', role: 'Homebuyer · Austin TX',
    },
  ];

  const faqs = [
    {
      q: 'How long does a typical inspection take?',
      a:
        'Most residential properties under 3,000 sq ft are completed in 3 to 4 hours on site. The written report is delivered within 24 hours of the inspector leaving the property.',
    },
    {
      q: 'What does the final report look like?',
      a:
        'A multi-page PDF organized by room and by severity. Each defect is illustrated with at least one photograph, captioned with its position and recommended remediation. A DOCX version is available on request.',
    },
    {
      q: 'Can I attend the inspection?',
      a:
        'Yes — we encourage it. The inspector will walk you through findings at the end. If you cannot attend, the report is structured so a stranger to the property could still understand every finding.',
    },
    {
      q: 'Do you handle re-inspections after repairs?',
      a:
        'A complimentary re-inspection of any flagged item is included for 30 days following the original visit. After that, a discounted callback rate applies.',
    },
  ];

  const [openFaq, setOpenFaq] = React.useState(0);

  return (
    <>
      <Helmet>
        <title>{`${brand} — Home Inspection Services`}</title>
        <meta name="description" content={`${brand} — Home Inspection Services. A five-phase home inspection method, photographed in detail, reviewed by senior inspectors, and delivered as a publishable PDF.`} />
      </Helmet>

      <div className="min-h-screen bg-background">
        <Header />

        {/* ─── HERO ─────────────────────────────────────────────────── */}
        <Spotlight className="relative pt-8 sm:pt-12 lg:pt-24 pb-16 sm:pb-20 lg:pb-32 overflow-hidden text-foreground">
          {/* ── Immersive background stack (all CSS / inline-SVG / ~0 KB on wire) ── */}
          <div aria-hidden="true" className="home-aurora absolute inset-0"><i /></div>
          <div aria-hidden="true" className="absolute inset-0 home-dotgrid pointer-events-none" />
          <div aria-hidden="true" className="home-spotlight absolute inset-0" />
          <div aria-hidden="true" className="home-noise" />
          <Particles count={14} />

          <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
            <div className="grid grid-cols-12 gap-y-12 lg:gap-12 items-end">
              <motion.div className="col-span-12 lg:col-span-7" {...fadeUp}>
                <p className="editorial-eyebrow">{brand} &mdash; Home Inspection Services</p>
                <h1 className="editorial-headline mt-8 text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.95]">
                  <SplitText as="span" text={`${brand}.`} className="text-primary block" step={0.035} />
                  <span className="block mt-2">We are</span>
                  <span className="home-rotate-mask text-secondary italic mt-1">
                    <span className="home-rotate-track">
                      <span>inspecting.</span>
                      <span>photographing.</span>
                      <span>documenting.</span>
                      <span>certifying.</span>
                    </span>
                  </span>
                </h1>
                <p className="editorial-deck mt-8 text-lg md:text-xl max-w-xl">
                  A modern inspection studio for the people who take the structural truth of a property
                  seriously. We measure, photograph, and write &mdash; you receive a single bound document
                  worth signing your name against.
                </p>
                <motion.div
                  className="mt-10 flex flex-col sm:flex-row gap-4"
                  initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.8 }}
                >
                  <Button size="lg" className="h-14 px-8 rounded-full text-base group home-cta" asChild>
                    <Link to="/signup" data-testid="hero-book-cta">
                      Book an inspection
                      <ArrowRight className="w-5 h-5 ml-2 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button size="lg" variant="outline" className="h-14 px-8 rounded-full text-base home-underline" asChild>
                    <Link to="/login" data-testid="hero-login-cta">Returning client</Link>
                  </Button>
                </motion.div>
                <div className="mt-10 sm:mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-secondary" /> Insured &amp; bonded
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-secondary" /> 24-hour delivery
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-secondary" /> Money-back guarantee
                  </span>
                </div>
              </motion.div>

              <motion.div
                className="col-span-12 lg:col-span-5"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* TiltCard gives the floorplan a subtle 3D parallax when
                    the cursor moves — desktop only.  On touch devices the
                    transform is bypassed entirely. */}
                <TiltCard className="relative" max={6}>
                  <div className="relative aspect-[5/6] home-glass overflow-hidden">
                    <FloorplanHero />
                    {/* Corner tick marks — pure typography */}
                    <span className="absolute top-3 left-3  text-[10px] tracking-[0.25em] text-muted-foreground">FP / 01</span>
                    <span className="absolute top-3 right-3 text-[10px] tracking-[0.25em] text-muted-foreground">SCALE 1:60</span>
                    <span className="absolute bottom-3 right-3 text-[10px] tracking-[0.25em] text-muted-foreground">REV.04 / 26</span>
                  </div>
                  <div className="absolute -bottom-6 left-2 sm:-bottom-8 sm:-left-8 home-glass shadow-xl px-5 py-4 sm:px-7 sm:py-5 max-w-[240px] sm:max-w-[260px] home-float home-tilt-pop">
                    <p className="editorial-eyebrow text-[10px]">Field note</p>
                    <p className="mt-3 font-display text-lg leading-snug">
                      &ldquo;Trim returns under the south sill suggest a former leak. Documented.&rdquo;
                    </p>
                    <p className="mt-3 text-xs text-muted-foreground">— Inspector M. Chen, 04.12</p>
                  </div>
                </TiltCard>
              </motion.div>
            </div>
          </div>
        </Spotlight>

        {/* ─── CREDENTIALS MARQUEE ──────────────────────────────────── */}
        <section className="border-y bg-muted/10 py-6">
          <div className="home-marquee">
            <div className="home-marquee-track text-xs tracking-[0.3em] uppercase text-muted-foreground">
              {[
                'INTERNACHI Certified', 'ASHI Member', 'RERA Compliant',
                'Lead-Safe EPA', 'Termite Licensed', 'Thermography L1',
                'Mould Assessment', 'INTERNACHI Certified', 'ASHI Member',
                'RERA Compliant', 'Lead-Safe EPA', 'Termite Licensed',
                'Thermography L1', 'Mould Assessment',
              ].map((c, i) => (
                <span key={i} className="inline-flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-secondary" />
                  {c}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ─── METRICS STRIP — animated counters with draw-on underline ─ */}
        <section className="border-y bg-muted/30">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 lg:py-16">
            <motion.div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-10" {...stagger} initial="initial" whileInView="whileInView">
              {[
                { v: 2847, suffix: '',   label: 'Properties inspected' },
                { v: 14,   suffix: 'yr', label: 'Avg inspector tenure' },
                { v: 24,   suffix: 'h',  label: 'Report turnaround' },
                { v: 4.96, suffix: '/5', label: 'Customer rating' },
              ].map((s) => (
                <motion.div key={s.label} variants={fadeUp} className="stat-card group">
                  <span className="stat-value home-statline">
                    <Counter to={s.v} suffix={s.suffix} />
                  </span>
                  <span className="stat-label">{s.label}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── METHOD ───────────────────────────────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-36">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12">
            <SectionLead
              eyebrow="The Method"
              title="Three convictions, repeated on every visit."
              deck="The same hands. The same checklist. The same camera discipline. Consistency is the only honest defense against a property's complexity."
            />
            <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border mt-16 border" {...stagger} initial="initial" whileInView="whileInView">
              {methods.map((m) => (
                <motion.article key={m.title} variants={fadeUp} className="bg-background p-8 lg:p-10 lift">
                  <m.icon className="w-7 h-7 text-secondary" strokeWidth={1.5} />
                  <p className="editorial-eyebrow mt-8 text-[10px]">{m.eyebrow}</p>
                  <h3 className="font-display text-2xl md:text-3xl mt-4 leading-tight">{m.title}</h3>
                  <p className="text-muted-foreground mt-4 leading-relaxed">{m.body}</p>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── PROCESS (numbered editorial list) ────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-36 bg-primary text-primary-foreground relative overflow-hidden grain">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12 relative z-10">
            <div className="grid grid-cols-12 gap-10 mb-20">
              <motion.div className="col-span-12 lg:col-span-5" {...fadeUp}>
                <p className="editorial-eyebrow text-secondary">The Process</p>
                <h2 className="editorial-headline mt-5 text-3xl sm:text-4xl md:text-5xl lg:text-6xl text-primary-foreground break-words">
                  From phone call to <em>publishable file.</em>
                </h2>
              </motion.div>
              <motion.div className="col-span-12 lg:col-span-6 lg:col-start-7 pt-2" {...fadeUp}>
                <p className="editorial-deck text-primary-foreground/80 text-lg">
                  Four steps. Each one is auditable. None of them are optional. You can drop in at any stage
                  through your client portal and see exactly where the inspection stands.
                </p>
              </motion.div>
            </div>
            <motion.div className="space-y-4" {...stagger} initial="initial" whileInView="whileInView">
              {[
                { n: '01', t: 'Book online', d: 'Choose a date, an inspector, and a property. Five minutes.' },
                { n: '02', t: 'On-site visit', d: 'Three to four hours of methodical, room-by-room investigation.' },
                { n: '03', t: 'Senior review', d: 'A second inspector approves the report and signs the cover.' },
                { n: '04', t: 'Delivery & chat', d: 'PDF in your portal. Real-time chat thread with the inspector.' },
              ].map((step) => (
                <motion.div key={step.n} variants={fadeUp} className="grid grid-cols-12 gap-3 sm:gap-6 py-5 sm:py-6 border-t border-primary-foreground/15">
                  <div className="col-span-3 sm:col-span-1 num-marker text-2xl sm:text-4xl md:text-5xl">{step.n}</div>
                  <div className="col-span-9 sm:col-span-4 font-display text-lg sm:text-xl md:text-2xl text-primary-foreground">{step.t}</div>
                  <div className="col-span-12 sm:col-span-7 text-primary-foreground/75 text-sm sm:text-base">{step.d}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── SERVICES ─────────────────────────────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-36">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12">
            <SectionLead
              eyebrow="Catalogue"
              title="What we inspect."
              deck="Our roster covers residential, condominium, new construction, and light commercial work. Custom scopes are quoted on request."
            />
            <motion.div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-10 mt-16" {...stagger} initial="initial" whileInView="whileInView">
              {services.map((s) => (
                <motion.div key={s.title} variants={fadeUp}>
                  <TiltCard className="border-t pt-6 group cursor-pointer p-6 bg-background/40 home-glass" max={4}>
                    <div className="flex items-baseline justify-between home-tilt-pop">
                      <p className="editorial-eyebrow text-[10px]">{s.tag}</p>
                      <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary group-hover:rotate-12 transition-all" />
                    </div>
                    <h3 className="font-display text-3xl md:text-4xl mt-4 leading-tight home-tilt-pop">{s.title}</h3>
                    <p className="text-muted-foreground mt-3">{s.meta}</p>
                  </TiltCard>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── VOICES ───────────────────────────────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-36 bg-muted/40">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12">
            <SectionLead
              eyebrow="Voices"
              title="Said about us."
              align="center"
            />
            <motion.div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-16" {...stagger} initial="initial" whileInView="whileInView">
              {voices.map((v, i) => (
                <motion.figure key={i} variants={fadeUp} className="bg-background border p-8 lg:p-10 lift">
                  <Quote className="w-8 h-8 text-secondary" strokeWidth={1} />
                  <blockquote className="font-display text-xl leading-snug mt-6">&ldquo;{v.quote}&rdquo;</blockquote>
                  <figcaption className="mt-8 pt-6 border-t">
                    <p className="font-semibold">{v.name}</p>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{v.role}</p>
                  </figcaption>
                </motion.figure>
              ))}
            </motion.div>
          </div>
        </section>

        {/* ─── FAQ ──────────────────────────────────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-36">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-4xl">
            <SectionLead eyebrow="Questions" title="Answered, plainly." />
            <div className="mt-16 border-t">
              {faqs.map((f, i) => {
                const open = openFaq === i;
                return (
                  <motion.div key={f.q} {...fadeUp} className="border-b">
                    <button
                      onClick={() => setOpenFaq(open ? -1 : i)}
                      className="w-full py-7 flex items-start justify-between text-left gap-6 group"
                    >
                      <span className="font-display text-xl md:text-2xl leading-snug group-hover:text-secondary transition-colors">{f.q}</span>
                      <span className="mt-1 flex-shrink-0">
                        {open ? <Minus className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                      </span>
                    </button>
                    {open && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                        className="pb-8"
                      >
                        <p className="text-muted-foreground text-base lg:text-lg max-w-2xl">{f.a}</p>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA ────────────────────────────────────────────── */}
        <section className="py-14 sm:py-20 lg:py-36 bg-secondary/20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12">
            <motion.div {...fadeUp} className="max-w-3xl mx-auto text-center">
              <Sparkles className="w-8 h-8 mx-auto text-secondary mb-6" strokeWidth={1.5} />
              <h2 className="editorial-headline text-3xl sm:text-4xl md:text-5xl lg:text-6xl break-words">
                Ready when you are.
              </h2>
              <p className="editorial-deck mt-6 text-lg md:text-xl">
                Five minutes to book. Four hours on site. One document worth keeping.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
                <Button size="lg" className="h-14 px-10 rounded-full text-base" asChild>
                  <Link to="/customer-signup">
                    Become a client <ArrowRight className="w-5 h-5 ml-2" />
                  </Link>
                </Button>
                <Button size="lg" variant="ghost" className="h-14 px-8 rounded-full text-base link-underline" asChild>
                  <Link to="/about">Read about our method</Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <Footer />
      </div>
    </>
  );
};

export default HomePage;
