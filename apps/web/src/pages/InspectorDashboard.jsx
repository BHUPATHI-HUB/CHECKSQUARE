import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useChatContext } from '@/contexts/ChatContext.jsx';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Search, Eye, Edit, FileText, CheckCircle, Clock, XCircle,
  MessageCircle, ArrowUpRight, Undo2,
} from 'lucide-react';
import AdminDownloadReport from '@/components/AdminDownloadReport.jsx';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';
import { toast } from 'sonner';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const InspectorDashboard = () => {
  const { user } = useAuth();
  const { unreadCount } = useChatContext();
  const { getInspectionsForInspector, updateInspectionStatus } = useInspectionStatus();
  const { showSuccess } = useFeedback();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const [inspections, setInspections] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const reload = async () => {
    const records = await getInspectionsForInspector(user.id);
    setInspections(records);
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const records = await getInspectionsForInspector(user.id);
      if (!cancelled) setInspections(records);
    })();
    return () => { cancelled = true; };
  }, [user.id, getInspectionsForInspector]);

  // Inspector can pull a previously-submitted, approved, or rejected
  // inspection back into draft state so they can keep editing without
  // anyone reviewing it. Approved reports also clear the approval trail
  // when recalled so a subsequent re-submit goes through review again.
  const handleRecallToDraft = async (inspection) => {
    const wasApproved = inspection.status === 'approved';
    const ok = window.confirm(
      wasApproved
        ? `"${inspection.metadata?.propertyAddress || 'This inspection'}" is already approved. Moving it to Draft will remove the approval and require it to be re-submitted and re-approved. Continue?`
        : `Move "${inspection.metadata?.propertyAddress || 'this inspection'}" back to Draft? You can keep editing and re-submit it whenever you're ready.`,
    );
    if (!ok) return;
    const success = await updateInspectionStatus(inspection.id, 'draft', user, {
      // Clear any prior approval / rejection trail so the inspector's draft starts clean.
      rejectedBy: null,
      rejectedAt: null,
      approvedBy: null,
      approvedAt: null,
    });
    if (success) {
      const addr = inspection.metadata?.propertyAddress || 'The inspection';
      reload();
      showSuccess(
        'Moved to Draft',
        wasApproved
          ? `Approval cleared on "${addr}". Make your edits and re-submit it for review.`
          : `"${addr}" is back in your drafts. Keep editing it whenever you're ready.`,
      );
    }
  };

  const filteredInspections = inspections.filter((inspection) => {
    const matchesSearch = inspection.metadata.propertyAddress.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || inspection.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: inspections.length,
    pending: inspections.filter((i) => i.status === 'pending').length,
    approved: inspections.filter((i) => i.status === 'approved').length,
    rejected: inspections.filter((i) => i.status === 'rejected').length,
  };

  const StatusPill = ({ status }) => {
    switch (status) {
      case 'approved':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[hsl(var(--success))]">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--success))]" /> Approved
          </span>
        );
      case 'rejected':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-destructive">
            <span className="w-1.5 h-1.5 rounded-full bg-destructive" /> Rejected
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-[hsl(var(--warning))]">
            <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--warning))]" /> Pending
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/60" /> Draft
          </span>
        );
    }
  };

  return (
    <>
      <Helmet>
        <title>{`Inspector workspace — ${brand}`}</title>
        <meta name="description" content="Manage your inspections and track approval status" />
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
              <motion.div {...fadeUp} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                <div>
                  <p className="editorial-eyebrow">Field office · {user?.name}</p>
                  <h1 className="editorial-headline mt-6 text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
                    The work, <em>at hand.</em>
                  </h1>
                  <p className="editorial-deck mt-5 max-w-xl">
                    Open reports, drafts in progress, and the ones the studio has signed.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="h-12 px-6 rounded-full">
                    <Link to="/inspector/new-inspection">
                      <Plus className="w-4 h-4 mr-2" /> New inspection
                    </Link>
                  </Button>
                  <Button asChild variant="outline" className="h-12 px-6 rounded-full relative">
                    <Link to="/chat">
                      <MessageCircle className="w-4 h-4 mr-2" /> Messages
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
                  { label: 'Total', value: stats.total, accent: 'text-foreground' },
                  { label: 'Pending', value: stats.pending, accent: 'text-[hsl(var(--warning))]' },
                  { label: 'Approved', value: stats.approved, accent: 'text-[hsl(var(--success))]' },
                  { label: 'Rejected', value: stats.rejected, accent: 'text-destructive' },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="bg-muted/30 px-4 sm:px-6 py-4 sm:py-5"
                  >
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.label}</p>
                    <p className={`font-display font-light text-2xl sm:text-4xl mt-2 ${s.accent}`}>{s.value}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Filters + table */}
          <section className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
            <motion.div {...fadeUp}>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                  <p className="editorial-eyebrow">The ledger</p>
                  <h2 className="font-display text-3xl md:text-4xl mt-3">Inspection history</h2>
                </div>
                <div className="flex flex-col md:flex-row gap-3 md:items-center">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search property address…"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 h-11 w-full md:w-80 rounded-full border-2"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-11 w-full md:w-44 rounded-full border-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="border bg-card">
                <div className="hidden md:grid grid-cols-12 gap-3 sm:gap-4 px-4 sm:px-6 py-4 border-b bg-muted/30 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <div className="col-span-1">№</div>
                  <div className="col-span-5">Property</div>
                  <div className="col-span-2">Date</div>
                  <div className="col-span-2">Status</div>
                  <div className="col-span-2 text-right">Actions</div>
                </div>

                {filteredInspections.length > 0 ? (
                  <div className="divide-y">
                    {filteredInspections.map((inspection, i) => (
                      <div
                        key={inspection.id}
                        className="grid grid-cols-12 gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 items-center hover:bg-muted/30 transition-colors"
                      >
                        <div className="col-span-12 md:col-span-1 num-marker text-base">
                          {String(i + 1).padStart(2, '0')}
                        </div>
                        <div className="col-span-12 md:col-span-5 min-w-0">
                          <Link
                            to={`/inspector/inspection/${inspection.id}`}
                            className="font-display text-lg md:text-xl leading-tight hover:text-primary transition-colors block truncate"
                          >
                            {inspection.metadata.propertyAddress}
                          </Link>
                          <p className="text-xs text-muted-foreground mt-1 font-mono">
                            #{inspection.id.substring(0, 8).toUpperCase()}
                          </p>
                        </div>
                        <div className="col-span-6 md:col-span-2 text-sm text-muted-foreground">
                          {inspection.metadata.inspectionDate}
                        </div>
                        <div className="col-span-6 md:col-span-2">
                          <StatusPill status={inspection.status} />
                        </div>
                        <div className="col-span-12 md:col-span-2 flex items-center md:justify-end gap-1">
                          <Button variant="ghost" size="icon" asChild className="rounded-full">
                            <Link to={`/inspector/inspection/${inspection.id}`} title="View">
                              <Eye className="w-4 h-4" />
                            </Link>
                          </Button>
                          {inspection.status !== 'approved' && (
                            <Button variant="ghost" size="icon" asChild className="rounded-full">
                              <Link to={`/inspector/inspection/${inspection.id}/edit`} title="Edit">
                                <Edit className="w-4 h-4" />
                              </Link>
                            </Button>
                          )}
                          {inspection.status !== 'draft' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="rounded-full text-muted-foreground hover:text-foreground"
                              title={
                                inspection.status === 'approved'
                                  ? 'Recall to Draft — will remove approval and require re-review'
                                  : 'Recall to Draft — keep editing before re-submitting'
                              }
                              onClick={() => handleRecallToDraft(inspection)}
                            >
                              <Undo2 className="w-4 h-4" />
                            </Button>
                          )}
                          {inspection.status === 'approved' && (
                            <AdminDownloadReport inspection={inspection} />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-20 text-center">
                    <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-4" strokeWidth={1.5} />
                    <p className="font-display text-2xl mb-2">No inspections yet</p>
                    <p className="text-muted-foreground mb-6">Begin the first one when you're ready.</p>
                    <Button asChild className="rounded-full">
                      <Link to="/inspector/new-inspection">
                        <Plus className="w-4 h-4 mr-2" /> Create first inspection
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </section>

          {/* Quick prompt */}
          <section className="border-t bg-primary text-primary-foreground">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-14 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div>
                <p className="editorial-eyebrow text-primary-foreground/70">Studio reminder</p>
                <h3 className="font-display text-2xl md:text-3xl mt-3">Every report passes through senior review.</h3>
              </div>
              <Button asChild variant="secondary" className="rounded-full h-12 px-6 group">
                <Link to="/inspector/new-inspection">
                  Start a new report <ArrowUpRight className="w-4 h-4 ml-2 group-hover:rotate-12 transition-transform" />
                </Link>
              </Button>
            </div>
          </section>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default InspectorDashboard;
