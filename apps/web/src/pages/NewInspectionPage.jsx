import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import InspectionForm from '@/components/InspectionForm.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Shield, Users, ArrowLeft } from 'lucide-react';
import data from '@/services/dataService.js';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const NewInspectionPage = () => {
  const { user } = useAuth();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const [searchParams] = useSearchParams();
  const appointmentId = searchParams.get('appointmentId');
  const [appointment, setAppointment] = React.useState(null);
  const [appointmentError, setAppointmentError] = React.useState('');
  const [appointmentLoading, setAppointmentLoading] = React.useState(Boolean(appointmentId));

  React.useEffect(() => {
    if (!appointmentId) return undefined;
    let cancelled = false;
    setAppointmentLoading(true);
    setAppointment(null);
    setAppointmentError('');
    data.listAppointments({ filter: `id = "${appointmentId}"` })
      .then((rows) => {
        if (cancelled) return;
        if (!rows[0]) setAppointmentError('This appointment is unavailable or you do not have access.');
        else setAppointment(rows[0]);
      })
      .catch(() => { if (!cancelled) setAppointmentError('Could not load the appointment. Please return to the dashboard and try again.'); })
      .finally(() => { if (!cancelled) setAppointmentLoading(false); });
    return () => { cancelled = true; };
  }, [appointmentId]);

  const dashboardPath = user?.role === 'admin' ? '/admin/dashboard' : '/inspector/dashboard';

  if (appointment?.inspection) {
    const prefix = user?.role === 'admin' ? '/admin/inspection' : '/inspector/inspection';
    return <Navigate to={`${prefix}/${encodeURIComponent(appointment.inspection)}`} replace />;
  }
  const appointmentBlocked = appointmentId && (appointmentError
    || (!appointmentLoading && (!appointment || appointment.status !== 'scheduled')));

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
              {appointmentLoading && <p role="status">Loading appointment…</p>}
              {appointmentBlocked && <p role="alert">{appointmentError || 'This appointment is no longer available to start.'}</p>}
              {!appointmentLoading && !appointmentBlocked && (
                <InspectionForm
                  initialData={appointment ? {
                    metadata: {
                      preparedFor: '',
                      propertyAddress: appointment.propertyAddress || '',
                      inspectionDate: appointment.scheduledAt ? new Date(appointment.scheduledAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
                      appointmentId: appointment.id,
                    },
                    customer: appointment.customer || null,
                    propertyType: 'Residential',
                  } : null}

                />
              )}
            </motion.div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default NewInspectionPage;
