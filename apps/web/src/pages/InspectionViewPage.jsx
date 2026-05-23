import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import InspectionDetailView from '@/components/InspectionDetailView.jsx';
import InspectionForm from '@/components/InspectionForm.jsx';
import ReportPreviewModal from '@/components/ReportPreviewModal.jsx';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye } from 'lucide-react';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const InspectionViewPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { getInspectionById } = useInspectionStatus();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const [inspection, setInspection] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const canPreview = !isEditing && (user?.role === 'admin' || user?.role === 'inspector');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const found = await getInspectionById(id);
      if (cancelled) return;
      if (found) {
        setInspection(found);
      } else {
        navigate(user?.role === 'admin' ? '/admin/dashboard' : '/inspector/dashboard');
      }
    })();
    return () => { cancelled = true; };
  }, [id, navigate, user, getInspectionById]);

  useEffect(() => {
    const path = window.location.pathname;
    const wantsEdit = path.includes('/edit');
    // Approved reports are immutable to inspectors — only admins may edit
    // them. Silently downgrade an inspector's edit request to view-only.
    if (wantsEdit && inspection?.status === 'approved' && user?.role !== 'admin') {
      setIsEditing(false);
      return;
    }
    setIsEditing(wantsEdit);
  }, [inspection, user]);

  if (!inspection) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="w-12 h-12 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">Loading inspection…</p>
        </div>
      </div>
    );
  }

  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/inspector/dashboard';
  const address = inspection.metadata?.propertyAddress || 'Inspection';
  const refId = String(inspection.id || '').substring(0, 8).toUpperCase();

  return (
    <>
      <Helmet>
        <title>{`${isEditing ? 'Edit' : 'View'} — ${address} — ${brand}`}</title>
        <meta name="description" content={`${isEditing ? 'Edit' : 'View'} inspection report for ${address}`} />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 lg:py-16">
              <motion.div {...fadeUp}>
                <Link to={dashboardPath} className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground mb-6 link-underline">
                  <ArrowLeft className="w-3.5 h-3.5" /> Back to dashboard
                </Link>
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
                  <div className="min-w-0">
                    <p className="editorial-eyebrow">
                      {isEditing ? 'Editing report' : 'Report'} · <span className="font-mono normal-case tracking-normal">#{refId}</span>
                    </p>
                    <h1 className="editorial-headline mt-5 text-3xl md:text-4xl lg:text-5xl break-words">{address}</h1>
                    {inspection.metadata?.inspectionDate && (
                      <p className="editorial-deck mt-4">
                        Walked on {inspection.metadata.inspectionDate}.
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={[
                      'inline-flex items-center gap-2 text-xs uppercase tracking-[0.18em] px-3 py-1.5 border',
                      inspection.status === 'approved' && 'border-[hsl(var(--success))] text-[hsl(var(--success))]',
                      inspection.status === 'rejected' && 'border-destructive text-destructive',
                      inspection.status === 'pending'  && 'border-[hsl(var(--warning))] text-[hsl(var(--warning))]',
                      !inspection.status && 'border-muted-foreground text-muted-foreground',
                    ].filter(Boolean).join(' ')}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current" />
                      {inspection.status || 'draft'}
                    </span>
                    {canPreview && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full"
                        onClick={() => setPreviewOpen(true)}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Preview document
                      </Button>
                    )}
                  </div>
                </div>
              </motion.div>
            </div>
          </section>

          <section className="container mx-auto px-4 sm:px-6 lg:px-12 py-12 lg:py-16">
            <motion.div {...fadeUp}>
              {isEditing ? (
                <InspectionForm existingInspection={inspection} isEditing={true} />
              ) : (
                <InspectionDetailView inspection={inspection} />
              )}
            </motion.div>
          </section>
        </main>

        <Footer />
      </div>

      <ReportPreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        inspection={inspection}
        onSaved={(updated) => setInspection(updated)}
      />
    </>
  );
};

export default InspectionViewPage;
