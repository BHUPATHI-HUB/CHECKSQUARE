import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, CheckCircle2, FileDown, MessageSquare, Calendar, Quote,
} from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
};

/**
 * ThankYouPage — shown after meaningful completions:
 *   • Inspection submitted by an inspector
 *   • Report downloaded by a customer
 *   • Account created
 *
 * Reads optional context via `location.state`:
 *   { headline, subhead, inspectionId, primaryCta: { to, label }, secondaryCta: { to, label } }
 */
const ThankYouPage = () => {
  const { state } = useLocation();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const headline = state?.headline || 'Thank you.';
  const subhead = state?.subhead || 'Your inspection record has been received. A copy lives in your portal for as long as the property does.';
  const inspectionId = state?.inspectionId;
  const primaryCta = state?.primaryCta || { to: '/customer', label: 'Return to dashboard' };
  const secondaryCta = state?.secondaryCta || { to: '/chat', label: 'Open chat with the inspector' };

  return (
    <>
      <Helmet>
        <title>{`${headline} — ${brand}`}</title>
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* ───────── Editorial hero ───────── */}
          <section className="border-b grain relative overflow-hidden">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-14 sm:py-20 lg:py-36 relative z-10">
              <motion.div {...fadeUp} className="max-w-4xl">
                <p className="editorial-eyebrow">Acknowledgement</p>
                <h1 className="editorial-headline mt-8 text-5xl sm:text-6xl md:text-7xl lg:text-8xl">
                  Thank <em>you.</em>
                </h1>
                <p className="editorial-deck mt-8 text-lg md:text-xl max-w-2xl">{subhead}</p>

                {inspectionId && (
                  <div className="mt-10 inline-flex items-center gap-3 border px-5 py-3">
                    <CheckCircle2 className="w-5 h-5 text-secondary" />
                    <span className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Reference</span>
                    <span className="font-mono text-sm">#{String(inspectionId).substring(0, 8).toUpperCase()}</span>
                  </div>
                )}

                <div className="mt-12 flex flex-col sm:flex-row gap-4">
                  <Button asChild size="lg" className="h-14 px-8 rounded-full text-base group">
                    <Link to={primaryCta.to}>
                      {primaryCta.label}
                      <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                    </Link>
                  </Button>
                  <Button asChild size="lg" variant="outline" className="h-14 px-8 rounded-full text-base">
                    <Link to={secondaryCta.to}>{secondaryCta.label}</Link>
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* ───────── What happens next ───────── */}
          <section className="py-14 sm:py-24 lg:py-32">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12">
              <motion.div {...fadeUp} className="max-w-2xl mb-16">
                <p className="editorial-eyebrow">What happens next</p>
                <h2 className="editorial-headline mt-5 text-3xl md:text-4xl lg:text-5xl">
                  Three quiet steps. <em>No further action required.</em>
                </h2>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border">
                {[
                  {
                    icon: FileDown,
                    n: '01',
                    title: 'Senior review',
                    body: 'A second inspector reviews the document and signs the cover. This typically completes within four working hours.',
                  },
                  {
                    icon: Calendar,
                    n: '02',
                    title: 'Delivery',
                    body: 'You receive an email when the bound PDF is available in your portal. The DOCX version is one click away.',
                  },
                  {
                    icon: MessageSquare,
                    n: '03',
                    title: 'Conversation',
                    body: 'Your inspector is reachable in the chat thread for follow-up questions, photographs, and clarifications.',
                  },
                ].map((s, i) => (
                  <motion.article
                    key={s.n}
                    initial={{ opacity: 0, y: 24 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.3 }}
                    transition={{ duration: 0.6, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] }}
                    className="bg-background p-6 sm:p-8 lg:p-10 lift"
                  >
                    <s.icon className="w-7 h-7 text-secondary" strokeWidth={1.5} />
                    <p className="num-marker text-4xl mt-8">{s.n}</p>
                    <h3 className="font-display text-2xl md:text-3xl mt-4 leading-tight">{s.title}</h3>
                    <p className="text-muted-foreground mt-4 leading-relaxed">{s.body}</p>
                  </motion.article>
                ))}
              </div>
            </div>
          </section>

          {/* ───────── A note from the studio ───────── */}
          <section className="py-24 lg:py-32 bg-primary text-primary-foreground">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 max-w-3xl text-center">
              <motion.div {...fadeUp}>
                <Quote className="w-8 h-8 mx-auto text-secondary mb-8" strokeWidth={1} />
                <blockquote className="font-display font-light text-3xl md:text-4xl lg:text-5xl leading-snug">
                  &ldquo;A property does not announce its defects. The work is in the looking, the
                  documenting, and the honest naming. Thank you for trusting us with that work.&rdquo;
                </blockquote>
                <p className="mt-10 text-sm uppercase tracking-[0.2em] text-primary-foreground/70">
                  — The {brand} Studio
                </p>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default ThankYouPage;
