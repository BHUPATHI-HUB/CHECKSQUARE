import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import InspectionForm from '@/components/InspectionForm.jsx';
import { useChatContext } from '@/contexts/ChatContext.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { toast } from 'sonner';
import { Shield, Users, ArrowLeft } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const NewInspectionPage = () => {
  const { createChat } = useChatContext();
  const { user } = useAuth();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';

  // Each visit to "New Inspection" should start clean. Clear any stale
  // in-browser draft cache so prior data doesn't pre-populate the form.
  // (Drafts saved via the "Save as Draft" button are persisted server-side
  // and remain editable from the dashboard.)
  React.useEffect(() => {
    try { localStorage.removeItem('inspection-draft'); } catch (_) {}
  }, []);

  // Auto-create chat after inspection submission (form dispatches a custom event).
  const handleInspectionCreated = async (inspectionId, customerId) => {
    if (!user) return;
    const participants = ['admin-1', user.id];
    if (customerId) participants.push(customerId);
    const chat = await createChat(participants, 'group', inspectionId);
    if (chat) toast.success('Group chat created for this inspection.');
  };

  React.useEffect(() => {
    const handleCustomEvent = (e) => {
      if (e.detail && e.detail.id) {
        handleInspectionCreated(e.detail.id, e.detail.customerId);
      }
    };
    window.addEventListener('inspection-created', handleCustomEvent);
    return () => window.removeEventListener('inspection-created', handleCustomEvent);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/inspector/dashboard';

  return (
    <>
      <Helmet>
        <title>{`New inspection — ${brand}`}</title>
        <meta name="description" content="Create a new home inspection report" />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-14 lg:py-20">
              <motion.div {...fadeUp}>
                <Link to={dashboardPath} className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground mb-8 link-underline">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
                </Link>
                <p className="editorial-eyebrow">New report</p>
                <h1 className="editorial-headline mt-6 text-3xl sm:text-4xl md:text-5xl lg:text-6xl">
                  Begin a <em>new inspection.</em>
                </h1>
                <p className="editorial-deck mt-5 max-w-2xl">
                  The form below mirrors the field notebook. Save as draft, return anytime, submit when the document is honest.
                </p>
              </motion.div>
            </div>
          </section>

          {/* Context note */}
          <section className="border-b bg-muted/30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-6">
              <motion.div {...fadeUp} className="flex items-start gap-4">
                {user?.role === 'admin' ? (
                  <>
                    <Shield className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="font-display text-base leading-tight">Self-service admin inspection</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Reports submitted here are <strong className="text-foreground">auto-approved</strong>. A group chat will still link the studio, the inspector, and the customer.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <Users className="w-5 h-5 text-secondary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                    <div>
                      <p className="font-display text-base leading-tight">Communications</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        When this inspection is saved, a dedicated group chat will automatically be created connecting you, the customer, and administration.
                      </p>
                    </div>
                  </>
                )}
              </motion.div>
            </div>
          </section>

          <section className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 lg:py-16">
            <motion.div {...fadeUp}>
              <InspectionForm />
            </motion.div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default NewInspectionPage;
