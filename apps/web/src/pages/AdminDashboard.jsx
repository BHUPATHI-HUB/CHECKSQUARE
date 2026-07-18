import React, { useState, useEffect, useMemo } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Search, FileText, Clock, ArrowUpDown, Eye, Edit, Trash2, MessageCircle,
  Plus, Settings as SettingsIcon, MessageSquare, CheckCircle, XCircle, Shield,
} from 'lucide-react';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useChatContext } from '@/contexts/ChatContext.jsx';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';
import AdminInspectionDetailModal from '@/components/AdminInspectionDetailModal.jsx';
import AdminApprovalActions from '@/components/AdminApprovalActions.jsx';
import AdminDownloadReport from '@/components/AdminDownloadReport.jsx';
import DeletedReportsArchive from '@/components/DeletedReportsArchive.jsx';
import data from '@/services/dataService.js';
import { toast } from 'sonner';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const AdminDashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { unreadCount, chats, createChat, getChats } = useChatContext();
  const { showDeleted } = useFeedback();
  const { getAllInspections, softDeleteInspection } = useInspectionStatus();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const [inspections, setInspections] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'desc' });

  const [selectedInspection, setSelectedInspection] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirmReport, setDeleteConfirmReport] = useState(null);

  const loadData = async () => {
    const records = await getAllInspections();
    setInspections(records);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getAllInspections]);

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const handleDelete = async () => {
    if (!deleteConfirmReport) return;
    const ok = await softDeleteInspection(deleteConfirmReport.id, user);
    if (ok) {
      const addr = deleteConfirmReport.metadata?.propertyAddress || 'The report';
      setDeleteConfirmReport(null);
      loadData();
      showDeleted('Report deleted', `"${addr}" was moved to the deleted archive. You can restore it from the archive tab.`);
    }
  };

  // Admin chat shortcut — find or create the inspection's group chat.
  const handleOpenInspectionChat = async (inspection) => {
    if (!inspection) return;
    try {
      let existing = chats.find((c) => c.inspectionId === inspection.id);
      if (!existing) {
        try {
          existing = await data.findChat(`inspectionId = "${inspection.id}"`);
        } catch (_) { /* not found */ }
      }
      if (existing) { navigate(`/chat/${existing.id}`); return; }
      const participants = [user.id, inspection.inspector].filter(Boolean);
      if (inspection.customer) participants.push(inspection.customer);
      const created = await createChat([...new Set(participants)], 'group', inspection.id);
      if (created) {
        await getChats();
        navigate(`/chat/${created.id}`);
      } else {
        toast.error('Could not open chat for this inspection');
      }
    } catch (error) {
      console.error('Open inspection chat failed', error);
      toast.error('Could not open chat for this inspection');
    }
  };

  const sortedAndFilteredInspections = useMemo(() => {
    const filtered = inspections.filter((i) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        i.metadata?.propertyAddress?.toLowerCase().includes(q) ||
        i.inspectorName?.toLowerCase().includes(q) ||
        i.id?.toLowerCase().includes(q);
      const matchStatus = statusFilter === 'all' || i.status === statusFilter;
      return matchSearch && matchStatus;
    });

    return filtered.sort((a, b) => {
      let aVal = ''; let bVal = '';
      switch (sortConfig.key) {
        case 'id': aVal = a.id; bVal = b.id; break;
        case 'address': aVal = a.metadata?.propertyAddress || ''; bVal = b.metadata?.propertyAddress || ''; break;
        case 'inspector': aVal = a.inspectorName || ''; bVal = b.inspectorName || ''; break;
        case 'date': aVal = a.metadata?.inspectionDate || ''; bVal = b.metadata?.inspectionDate || ''; break;
        case 'status': aVal = a.status || ''; bVal = b.status || ''; break;
        default: break;
      }
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [inspections, searchTerm, statusFilter, sortConfig]);

  const stats = {
    total: inspections.length,
    pending: inspections.filter((i) => i.status === 'pending').length,
    approved: inspections.filter((i) => i.status === 'approved').length,
    rejected: inspections.filter((i) => i.status === 'rejected').length,
  };

  const StatusPill = ({ status }) => {
    const map = {
      approved: { color: 'text-[hsl(var(--success))]', dot: 'bg-[hsl(var(--success))]', label: 'Approved' },
      rejected: { color: 'text-destructive', dot: 'bg-destructive', label: 'Rejected' },
      pending:  { color: 'text-[hsl(var(--warning))]', dot: 'bg-[hsl(var(--warning))]', label: 'Pending' },
    };
    const s = map[status] || { color: 'text-muted-foreground', dot: 'bg-muted-foreground', label: 'Draft' };
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wider ${s.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} /> {s.label}
      </span>
    );
  };

  const SortHeader = ({ k, children, className = '' }) => (
    <button
      onClick={() => handleSort(k)}
      className={`flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground transition-colors ${className}`}
    >
      {children}
      <ArrowUpDown className="w-3 h-3 opacity-50" />
    </button>
  );

  return (
    <>
      <Helmet>
        <title>{`Studio oversight | ${brand}`}</title>
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
              <motion.div {...fadeUp} className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8">
                <div>
                  <p className="editorial-eyebrow flex items-center gap-2">
                    <Shield className="w-3.5 h-3.5" /> Editorial board
                  </p>
                  <h1 className="editorial-headline mt-6 text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
                    The studio, <em>watched.</em>
                  </h1>
                  <p className="editorial-deck mt-5 max-w-xl">
                    Approve, review, archive. The full ledger of every inspection, every conversation, every report.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button asChild className="h-12 px-6 rounded-full">
                    <Link to="/admin/new-inspection">
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
                  <Button asChild variant="outline" className="h-12 px-6 rounded-full">
                    <Link to="/admin/settings">
                      <SettingsIcon className="w-4 h-4 mr-2" /> Settings
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
                  { label: 'Total reports', value: stats.total, accent: 'text-foreground', icon: FileText },
                  { label: 'Pending review', value: stats.pending, accent: 'text-[hsl(var(--warning))]', icon: Clock },
                  { label: 'Approved', value: stats.approved, accent: 'text-[hsl(var(--success))]', icon: CheckCircle },
                  { label: 'Rejected', value: stats.rejected, accent: 'text-destructive', icon: XCircle },
                ].map((s, i) => (
                  <motion.div
                    key={s.label}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: i * 0.05 }}
                    className="bg-muted/30 px-4 sm:px-6 py-4 sm:py-5 flex items-start justify-between"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.label}</p>
                      <p className={`font-display font-light text-2xl sm:text-4xl mt-2 ${s.accent}`}>{s.value}</p>
                    </div>
                    <s.icon className={`w-5 h-5 ${s.accent} opacity-40`} strokeWidth={1.5} />
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          <section className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
            <Tabs defaultValue="active" className="space-y-8">
              <TabsList className="bg-transparent border-b w-full justify-start rounded-none p-0 h-auto">
                <TabsTrigger
                  value="active"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 sm:px-6 pb-2 sm:pb-3 font-display text-sm sm:text-base"
                >
                  Active inspections
                </TabsTrigger>
                <TabsTrigger
                  value="deleted"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-secondary data-[state=active]:bg-transparent data-[state=active]:shadow-none px-3 sm:px-6 pb-2 sm:pb-3 font-display text-sm sm:text-base"
                >
                  Deleted archive
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active" className="space-y-6">
                <motion.div {...fadeUp}>
                  <div className="flex flex-col md:flex-row gap-3 mb-6">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by ID, address, or inspector…"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-11 rounded-full border-2"
                      />
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="h-11 w-full md:w-48 rounded-full border-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="border bg-card">
                    {/* Header row */}
                    <div className="hidden lg:grid grid-cols-12 gap-3 sm:gap-4 px-4 sm:px-6 py-4 border-b bg-muted/30">
                      <div className="col-span-1"><SortHeader k="id">№</SortHeader></div>
                      <div className="col-span-4"><SortHeader k="address">Property</SortHeader></div>
                      <div className="col-span-2"><SortHeader k="inspector">Inspector</SortHeader></div>
                      <div className="col-span-2"><SortHeader k="date">Date</SortHeader></div>
                      <div className="col-span-1"><SortHeader k="status">Status</SortHeader></div>
                      <div className="col-span-2 text-right text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Actions</div>
                    </div>

                    {sortedAndFilteredInspections.length > 0 ? (
                      <div className="divide-y">
                        {sortedAndFilteredInspections.map((inspection) => (
                          <div
                            key={inspection.id}
                            className="grid grid-cols-12 gap-3 sm:gap-4 px-4 sm:px-6 py-4 sm:py-5 items-center hover:bg-muted/30 transition-colors"
                          >
                            <div className="col-span-12 lg:col-span-1 font-mono text-xs text-muted-foreground">
                              #{inspection.id.substring(0, 6).toUpperCase()}
                            </div>
                            <div className="col-span-12 lg:col-span-4 min-w-0">
                              <p className="font-display text-lg leading-tight truncate" title={inspection.metadata?.propertyAddress}>
                                {inspection.metadata?.propertyAddress || 'No address'}
                              </p>
                            </div>
                            <div className="col-span-6 lg:col-span-2 text-sm text-muted-foreground truncate">
                              {inspection.inspectorName}
                            </div>
                            <div className="col-span-6 lg:col-span-2 text-sm text-muted-foreground">
                              {inspection.metadata?.inspectionDate}
                            </div>
                            <div className="col-span-6 lg:col-span-1">
                              <StatusPill status={inspection.status} />
                            </div>
                            <div className="col-span-12 lg:col-span-2 flex items-center lg:justify-end gap-1 flex-wrap">
                              {inspection.status === 'pending' && (
                                <AdminApprovalActions
                                  inspection={inspection}
                                  onStatusChanged={loadData}
                                />
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full"
                                title="View chat"
                                onClick={() => handleOpenInspectionChat(inspection)}
                              >
                                <MessageSquare className="w-4 h-4" />
                              </Button>
                              <AdminDownloadReport inspection={inspection} />
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full"
                                onClick={() => { setSelectedInspection(inspection); setModalOpen(true); }}
                                title="Details"
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                              {inspection.status !== 'approved' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-full"
                                  asChild
                                  title={inspection.status === 'draft' ? 'Edit draft' : 'Edit'}
                                >
                                  <Link to={`/admin/inspection/${inspection.id}/edit`}>
                                    <Edit className="w-4 h-4" />
                                  </Link>
                                </Button>
                              )}
                              {inspection.status === 'approved' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-full"
                                  asChild
                                  title="Edit approved report (admin override)"
                                >
                                  <Link to={`/admin/inspection/${inspection.id}/edit`}>
                                    <Edit className="w-4 h-4" />
                                  </Link>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="icon"
                                className="rounded-full text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => setDeleteConfirmReport(inspection)}
                                title="Archive"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-20 text-center">
                        <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-4" strokeWidth={1.5} />
                        <p className="font-display text-2xl mb-2">No active inspections</p>
                        <p className="text-muted-foreground">The ledger is empty — for now.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              </TabsContent>

              <TabsContent value="deleted">
                <motion.div {...fadeUp}>
                  <DeletedReportsArchive />
                </motion.div>
              </TabsContent>
            </Tabs>
          </section>

          <AdminInspectionDetailModal
            inspection={selectedInspection}
            open={modalOpen}
            onOpenChange={setModalOpen}
            onInspectionUpdated={loadData}
          />

          <Dialog open={!!deleteConfirmReport} onOpenChange={() => setDeleteConfirmReport(null)}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-display text-2xl text-destructive">Archive this report?</DialogTitle>
                <DialogDescription className="text-base leading-relaxed mt-2">
                  The record for <strong className="text-foreground">{deleteConfirmReport?.metadata?.propertyAddress}</strong> will
                  move to the deleted archive. You can restore it from there.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter className="mt-6 gap-2">
                <Button variant="outline" onClick={() => setDeleteConfirmReport(null)} className="rounded-full">Cancel</Button>
                <Button variant="destructive" onClick={handleDelete} className="rounded-full">Move to archive</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>

        <Footer />
      </div>
    </>
  );
};

export default AdminDashboard;
