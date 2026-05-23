import React from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Home as HomeIcon, CheckSquare } from 'lucide-react';
import { useSettings } from '@/contexts/SettingsContext.jsx';

const NotFoundPage = () => {
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  return (
  <>
    <Helmet>
      <title>404 — Page not found</title>
      <meta name="description" content="The page you are looking for does not exist or has been moved." />
    </Helmet>

    <div className="min-h-screen bg-background flex flex-col">
      <header className="container mx-auto px-4 sm:px-6 lg:px-12 py-8 flex justify-between items-center">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl tracking-tight">
          <CheckSquare className="w-7 h-7 text-primary" strokeWidth={2.25} />
          <span className="text-primary">{brand}</span>
        </Link>
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground link-underline">Home</Link>
      </header>

      <main className="flex-1 flex items-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-12">
          <div className="grid grid-cols-12 gap-y-12 lg:gap-12 items-center">
            <motion.div
              className="col-span-12 lg:col-span-7"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="editorial-eyebrow">Erratum</p>
              <h1 className="editorial-headline mt-8 text-[88px] sm:text-[160px] md:text-[200px] lg:text-[260px] leading-[0.9]">
                4<em>0</em>4
              </h1>
              <p className="editorial-deck mt-10 text-lg md:text-xl max-w-xl">
                The page you went looking for is not where it used to be. The room has been
                re-measured. The corner photographs no longer match.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row gap-4">
                <Button size="lg" variant="outline" onClick={() => window.history.back()} className="h-14 px-8 rounded-full text-base">
                  <ArrowLeft className="w-4 h-4 mr-2" /> Go back
                </Button>
                <Button size="lg" asChild className="h-14 px-8 rounded-full text-base">
                  <Link to="/">
                    <HomeIcon className="w-4 h-4 mr-2" /> Return to the front page
                  </Link>
                </Button>
              </div>
            </motion.div>

            <motion.div
              className="col-span-12 lg:col-span-5"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="aspect-[4/5] bg-muted relative overflow-hidden grain">
                <img
                  src="https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=900&q=80"
                  alt=""
                  className="w-full h-full object-cover grayscale"
                />
                <div className="absolute bottom-6 left-6 right-6 bg-card border px-5 py-4">
                  <p className="editorial-eyebrow text-[10px]">Field note · revised</p>
                  <p className="mt-2 font-display text-base leading-snug">
                    &ldquo;The hallway has been re-numbered. We will update the records.&rdquo;
                  </p>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      <footer className="container mx-auto px-4 sm:px-6 lg:px-12 py-8 text-xs text-muted-foreground border-t">
        © {new Date().getFullYear()} {brand}. <Link to="/privacy" className="link-underline">Privacy</Link> · <Link to="/terms" className="link-underline">Terms</Link>
      </footer>
    </div>
  </>
  );
};

export default NotFoundPage;
