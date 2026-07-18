import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useChatContext } from '@/contexts/ChatContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Calendar, MessageSquare, Clock, MapPin, ChevronRight, UserCircle,
  ArrowRight, FileText, Plus,
} from 'lucide-react';
import data from '@/services/dataService.js';
import AdminDownloadReport from '@/components/AdminDownloadReport.jsx';

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch { return iso; }
};

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

// Stale-while-revalidate cache (per customer) so returning to the portal shows
// the last-loaded appointments + inspections instantly instead of a spinner.
const customerDashCache = {};

const CustomerDashboard = () => {
  const { user } = useAuth();
  const { unreadCount, chats, createChat } = useChatContext();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const [upcomingAppointments, setUpcomingAppointments] = useState(() => customerDashCache[user?.id]?.appts || []);
  const [pastInspections, setPastInspections] = useState(() => customerDashCache[user?.id]?.insps || []);
  const [loading, setLoading] = useState(() => !customerDashCache[user?.id]);

  // First-visit: ensure customer has a direct line to an admin.
  useEffect(() => {
    if (!user?.id || chats.length > 0) return;
    let cancelled = false;
    (async () => {
      try {
        const admins = await data.listUsers({ filter: 'role = "admin"', fields: 'id' });
        if (cancelled || admins.length === 0) return;
        await createChat([user.id, admins[0].id], 'direct', '');
      } catch (err) {
        console.warn('Could not auto-create support chat:', err?.message || err);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, chats.length, createChat]);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      if (!customerDashCache[user.id]) setLoading(true);
      try {
        const nowIso = new Date().toISOString().replace('T', ' ');
        const [appts, insps] = await Promise.all([
          data.listAppointments({
            filter: `customer = "${user.id}" && status = "scheduled" && scheduledAt >= "${nowIso}"`,
            sort: 'scheduledAt',
          }),
          data.listInspections({
            filter: `customer = "${user.id}" && deletedAt = null`,
            sort: '-created',
          }),
        ]);

        // Re-hydrate the inspector display name for every upcoming appointment.
        // We dropped the PB `expand: 'inspector'` shortcut when migrating to
        // dataService — a separate batched lookup keeps the dashboard text
        // ("with Inspector X") intact without inventing a new service method.
        const inspectorIds = [...new Set(appts.map((a) => a.inspector).filter(Boolean))];
        if (inspectorIds.length) {
          const inspectors = await Promise.all(
            inspectorIds.map((id) => data.getUser(id).catch(() => null)),
          );
          const byId = Object.fromEntries(inspectors.filter(Boolean).map((u) => [u.id, u]));
          appts.forEach((a) => {
            if (a.inspector && byId[a.inspector]) {
              a.expand = { ...(a.expand || {}), inspector: byId[a.inspector] };
            }
          });
        }
        if (!cancelled) {
          setUpcomingAppointments(appts);
          setPastInspections(insps);
          customerDashCache[user.id] = { appts, insps };
        }
      } catch (e) {
        console.error('Failed to load customer dashboard', e);
        if (!cancelled) { setUpcomingAppointments([]); setPastInspections([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const next = upcomingAppointments[0];
  const approvedCount = pastInspections.filter((i) => i.status === 'approved').length;

  return (
    <>
      <Helmet>
        <title>{`Your portal — ${brand}`}</title>
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
              <motion.div {...fadeUp} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                <div>
                  <p className="editorial-eyebrow">Your portal · {new Date().toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</p>
                  <h1 className="editorial-headline mt-6 text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
                    Good morning, <em>{firstName}.</em>
                  </h1>
                  <p className="editorial-deck mt-5 max-w-xl">
                    Your appointments, reports, and conversations — held in one quiet place.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="h-12 px-6 rounded-full">
                    <Link to="/customer/book-appointment">
                      <Plus className="w-4 h-4 mr-2" /> Book inspection
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-12 px-6 rounded-full relative">
                    <Link to="/chat">
                      <MessageSquare className="w-4 h-4 mr-2" /> Messages
                      {unreadCount > 0 && (
                        <span className="ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-[10px] font-semibold rounded-full bg-secondary text-primary">
                          {unreadCount}
                        </span>
                      )}
                    </Link>
                  </Button>
                </div>
              </motion.div>
            </div>
          </section>

          {/* Stat strip */}
          <section className="border-b bg-muted/30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border">
                {[
                  { label: 'Upcoming', value: upcomingAppointments.length },
                  { label: 'Reports', value: pastInspections.length },
                  { label: 'Approved', value: approvedCount },
                  { label: 'Conversations', value: chats.length },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="bg-muted/30 px-4 sm:px-6 py-4 sm:py-5"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.label}</p>
                    <p className="font-display font-light text-2xl sm:text-4xl mt-2">{s.value}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
            <div className="grid grid-cols-12 gap-8">
              {/* Left: appointment + history */}
              <div className="col-span-12 lg:col-span-8 space-y-16">
                <motion.section {...fadeUp}>
                  <p className="editorial-eyebrow mb-6">Next appointment</p>
                  {next ? (
                    <div className="border bg-card overflow-hidden">
                      <div className="grid grid-cols-1 md:grid-cols-3">
                        <div className="md:col-span-2 p-5 sm:p-8 lg:p-10">
                          <Badge className="bg-secondary/20 text-secondary border-none uppercase tracking-wider text-[10px]">
                            Scheduled
                          </Badge>
                          <h2 className="font-display font-light text-2xl sm:text-3xl md:text-4xl mt-4 sm:mt-5 leading-tight break-words">
                            {next.propertyAddress}
                          </h2>
                          <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-6 text-sm">
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Date</p>
                              <p className="mt-1.5 flex items-center gap-2"><Calendar className="w-4 h-4 text-secondary" /> {formatDate(next.scheduledAt)}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Window</p>
                              <p className="mt-1.5 flex items-center gap-2"><Clock className="w-4 h-4 text-secondary" /> {next.timeSlot}</p>
                            </div>
                            <div>
                              <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Inspector</p>
                              <p className="mt-1.5 flex items-center gap-2"><UserCircle className="w-4 h-4 text-secondary" /> {next.expand?.inspector?.name || 'Unassigned'}</p>
                            </div>
                          </div>
                        </div>
                        <div className="bg-primary text-primary-foreground p-5 sm:p-8 lg:p-10 flex flex-col justify-between">
                          <div>
                            <p className="editorial-eyebrow text-primary-foreground/70">Reference</p>
                            <p className="font-mono text-xl mt-2">#{String(next.id).substring(0, 8).toUpperCase()}</p>
                          </div>
                          <Button asChild variant="secondary" className="mt-6 rounded-full">
                            <Link to="/chat">
                              Message inspector <ArrowRight className="w-4 h-4 ml-2" />
                            </Link>
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="border border-dashed bg-card p-12 text-center">
                      <Calendar className="w-10 h-10 mx-auto text-muted-foreground/60 mb-4" strokeWidth={1.5} />
                      <h3 className="font-display text-2xl mb-2">{loading ? 'Loading…' : 'Nothing on the calendar'}</h3>
                      <p className="text-muted-foreground mb-6">When you're ready, book a time and we will take it from there.</p>
                      <Button asChild className="rounded-full">
                        <Link to="/customer/book-appointment">Book an inspection</Link>
                      </Button>
                    </div>
                  )}
                </motion.section>

                <motion.section {...fadeUp}>
                  <div className="flex items-baseline justify-between mb-6">
                    <p className="editorial-eyebrow">Inspection history</p>
                    <span className="text-xs text-muted-foreground">{pastInspections.length} record{pastInspections.length === 1 ? '' : 's'}</span>
                  </div>
                  {pastInspections.length === 0 && !loading ? (
                    <div className="border border-dashed bg-card p-12 text-center text-muted-foreground">
                      <FileText className="w-10 h-10 mx-auto opacity-50 mb-3" strokeWidth={1.5} />
                      <p>Your bound reports will appear here.</p>
                    </div>
                  ) : (
                    <div className="border divide-y bg-card">
                      {pastInspections.map((insp, i) => (
                        <div key={insp.id} className="p-4 sm:p-6 lg:p-7 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-muted/30 transition-colors">
                          <div className="flex items-start gap-4 sm:gap-5 flex-1 min-w-0">
                            <span className="num-marker text-2xl pt-1">{String(i + 1).padStart(2, '0')}</span>
                            <div className="min-w-0 flex-1">
                              <h4 className="font-display text-xl truncate">{insp.metadata?.propertyAddress || 'Inspection'}</h4>
                              <p className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                                <span>{formatDate(insp.created)}</span>
                                <span className="opacity-40">·</span>
                                <span className="capitalize">{insp.status}</span>
                              </p>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            {insp.status === 'approved' && <AdminDownloadReport inspection={insp} />}
                            <Button variant="outline" size="sm" disabled className="rounded-full">Details</Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </motion.section>
              </div>

              {/* Right: quick links + support */}
              <aside className="col-span-12 lg:col-span-4 space-y-6">
                <motion.div {...fadeUp} className="border bg-card p-5 sm:p-7">
                  <p className="editorial-eyebrow mb-5">At a glance</p>
                  <div className="space-y-1">
                    {[
                      { to: '/customer/book-appointment', icon: Calendar, label: 'Book new inspection', desc: 'Pick a date and inspector.' },
                      { to: '/chat', icon: MessageSquare, label: 'Open messages', desc: 'Talk to your inspector or admin.' },
                      { to: '/customer/profile', icon: UserCircle, label: 'Your profile', desc: 'Address, contact, preferences.' },
                    ].map((a) => (
                      <Link key={a.to} to={a.to} className="group block py-3 border-b last:border-b-0">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <a.icon className="w-4 h-4 text-secondary flex-shrink-0" strokeWidth={1.5} />
                            <div className="min-w-0">
                              <p className="font-medium text-sm">{a.label}</p>
                              <p className="text-xs text-muted-foreground truncate">{a.desc}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:translate-x-1 transition-transform flex-shrink-0" />
                        </div>
                      </Link>
                    ))}
                  </div>
                </motion.div>

                <motion.div {...fadeUp} className="bg-primary text-primary-foreground p-5 sm:p-7">
                  <p className="editorial-eyebrow text-primary-foreground/70">Studio</p>
                  <h3 className="font-display text-2xl mt-3 leading-tight">A real person, at the other end of the message.</h3>
                  <p className="text-primary-foreground/80 text-sm mt-4 leading-relaxed">
                    Billing, scheduling, or a question about the report — write to us and a human will write back.
                  </p>
                  <Button asChild variant="secondary" className="mt-6 w-full rounded-full">
                    <Link to="/chat">Contact administrator</Link>
                  </Button>
                </motion.div>

                <motion.div {...fadeUp} className="border border-dashed p-6 text-center">
                  <MapPin className="w-5 h-5 mx-auto text-secondary mb-2" strokeWidth={1.5} />
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Records are retained for the life of the property. Download anytime.
                  </p>
                </motion.div>
              </aside>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default CustomerDashboard;
