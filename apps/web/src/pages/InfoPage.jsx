import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { ArrowUpRight } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.25 },
  transition: { duration: 0.7, ease: [0.22, 1, 0.36, 1] },
};

const SIBLING_LINKS = [
  { to: '/about', label: 'About', sub: 'The studio, the people, the rules.' },
  { to: '/privacy', label: 'Privacy', sub: 'What we hold, what we never share.' },
  { to: '/terms', label: 'Terms', sub: 'The agreement between us.' },
];

/**
 * Public InfoPage — renders the admin-editable HTML stored in settings.
 * One component drives /privacy, /terms, and /about so styling stays consistent.
 *
 * Layout: editorial magazine article with eyebrow, oversized serif title,
 * drop-cap first paragraph, narrow measure, and sibling-page navigation.
 */
const InfoPage = ({ title, settingsKey, eyebrow }) => {
  const { settings } = useSettings();
  const html = settings?.[settingsKey] || '<p>Content not yet configured. An administrator can edit this page from the Settings area.</p>';
  const brand = settings?.appName || 'CheckSquare';
  const siblings = SIBLING_LINKS.filter((l) => !l.to.endsWith(settingsKey?.toLowerCase?.() || ''));

  return (
    <>
      <Helmet>
        <title>{title} — {brand}</title>
      </Helmet>

      <div className="min-h-screen flex flex-col bg-background">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 lg:py-32 max-w-5xl">
              <motion.div {...fadeUp}>
                <p className="editorial-eyebrow">{eyebrow || title}</p>
                <h1 className="editorial-headline mt-8 text-4xl sm:text-5xl md:text-6xl lg:text-7xl break-words">{title}</h1>
                <p className="editorial-deck mt-6 text-lg md:text-xl max-w-2xl">
                  Last updated {new Date(settings?.updated || Date.now()).toLocaleDateString(undefined, {
                    year: 'numeric', month: 'long', day: 'numeric',
                  })}.
                </p>
              </motion.div>
            </div>
          </section>

          {/* Article body */}
          <section className="py-12 sm:py-20 lg:py-28">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12">
              <motion.article
                {...fadeUp}
                className="max-w-2xl mx-auto editorial-dropcap prose prose-lg prose-neutral
                           prose-headings:font-display prose-headings:font-light prose-headings:tracking-tight
                           prose-h2:text-3xl md:prose-h2:text-4xl prose-h2:mt-16 prose-h2:mb-6 prose-h2:leading-tight
                           prose-h3:text-2xl prose-h3:mt-12 prose-h3:mb-4
                           prose-p:text-foreground/85 prose-p:leading-[1.75]
                           prose-a:text-primary prose-a:no-underline hover:prose-a:underline
                           prose-strong:text-foreground
                           prose-blockquote:border-l-2 prose-blockquote:border-secondary prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:font-display prose-blockquote:text-xl
                           prose-li:text-foreground/85
                           max-w-none"
                dangerouslySetInnerHTML={{ __html: html }}
              />
            </div>
          </section>

          {/* Sibling pages */}
          <section className="border-t bg-muted/30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-16 lg:py-24 max-w-5xl">
              <motion.div {...fadeUp}>
                <p className="editorial-eyebrow">Continue reading</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border mt-8 border">
                  {siblings.map((l) => (
                    <Link
                      key={l.to}
                      to={l.to}
                      className="group bg-background p-6 sm:p-8 lg:p-10 lift block"
                    >
                      <div className="flex items-baseline justify-between">
                        <p className="editorial-eyebrow text-[10px]">Read next</p>
                        <ArrowUpRight className="w-5 h-5 text-muted-foreground group-hover:text-secondary group-hover:rotate-12 transition-all" />
                      </div>
                      <h3 className="font-display text-2xl sm:text-3xl md:text-4xl mt-4 leading-tight">{l.label}</h3>
                      <p className="text-muted-foreground mt-3">{l.sub}</p>
                    </Link>
                  ))}
                </div>
              </motion.div>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default InfoPage;
