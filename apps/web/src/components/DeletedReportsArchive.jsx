
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Search, RotateCcw, Trash2, Archive, Download, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useInspectionStatus } from '@/hooks/useInspectionStatus.js';
import { useFeedback } from '@/contexts/FeedbackContext.jsx';
import pb from '@/lib/pocketbaseClient.js';
import data from '@/services/dataService.js';

const DeletedReportsArchive = () => {
  const { getDeletedInspections, restoreInspection, permanentlyDeleteInspection } = useInspectionStatus();
  const { showSuccess, showDeleted } = useFeedback();
  const [deletedReports, setDeletedReports] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [reportToPermanentlyDelete, setReportToPermanentlyDelete] = useState(null);
  const [exporting, setExporting] = useState(false);

  const loadData = async () => {
    const data = await getDeletedInspections();
    setDeletedReports(data);
  };

  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRestore = async (report) => {
    const ok = await restoreInspection(report.id);
    if (ok) {
      const addr = report.metadata?.propertyAddress || 'The report';
      loadData();
      showSuccess('Report restored', `"${addr}" is back in your active inspections.`);
    }
  };

  const handlePermanentDelete = async () => {
    if (!reportToPermanentlyDelete) return;
    const ok = await permanentlyDeleteInspection(reportToPermanentlyDelete.id);
    if (ok) {
      const addr = reportToPermanentlyDelete.metadata?.propertyAddress || 'The report';
      setReportToPermanentlyDelete(null);
      loadData();
      showDeleted('Permanently deleted', `"${addr}" has been removed for good. This action cannot be undone.`);
    }
  };

  const exportArchive = async () => {
    if (deletedReports.length === 0) return;
    setExporting(true);
    try {
      // The list view stores the LEAN row shape (no roomInspections, areaCalculations,
      // waterQuality, scoreOverrides). For an audit/restore export we re-fetch the
      // full record per row so the JSON dump is complete.
      const full = await Promise.all(
        deletedReports.map((r) =>
          data.getInspection(r.id).catch(() => r),
        ),
      );
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(full, null, 2));
      const downloadAnchorNode = document.createElement('a');
      downloadAnchorNode.setAttribute("href", dataStr);
      downloadAnchorNode.setAttribute("download", `deleted_reports_archive_${new Date().toISOString().split('T')[0]}.json`);
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
    } catch (err) {
      console.error('Failed to export archive', err);
      toast.error('Failed to export archive');
    } finally {
      setExporting(false);
    }
  };

  const filtered = deletedReports.filter(r => 
    r.metadata?.propertyAddress?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.inspectorName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.id?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <Card className="border-destructive/20 shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <CardTitle className="text-destructive flex items-center gap-2">
            <Archive className="w-5 h-5" /> Deleted Reports Archive
          </CardTitle>
          <CardDescription>View, restore, or permanently remove deleted inspections.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={exportArchive} disabled={deletedReports.length === 0 || exporting}>
          {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          {exporting ? 'Bundling…' : 'Export Log'}
        </Button>
      </CardHeader>
      <CardContent>
        <div className="relative mb-6 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            placeholder="Search archive..." 
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="font-medium p-4">ID / Address</th>
                <th className="font-medium p-4">Inspector</th>
                <th className="font-medium p-4">Deleted Date</th>
                <th className="font-medium p-4">Reason</th>
                <th className="font-medium p-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y bg-background">
              {filtered.length > 0 ? filtered.map(report => (
                <tr key={report.id} className="hover:bg-muted/50">
                  <td className="p-4">
                    <div className="font-medium">{report.metadata?.propertyAddress || 'No Address'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{report.id.substring(0,8)}...</div>
                  </td>
                  <td className="p-4">{report.inspectorName}</td>
                  <td className="p-4 text-muted-foreground">
                    {report.deletedAt ? new Date(report.deletedAt).toLocaleDateString() : 'Unknown'}
                  </td>
                  <td className="p-4">
                    <Badge variant="outline" className="text-xs font-normal">
                      {report.deletionReason || 'Manual deletion'}
                    </Badge>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleRestore(report)}>
                        <RotateCcw className="w-4 h-4 mr-1" /> Restore
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setReportToPermanentlyDelete(report)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="5" className="p-8 text-center text-muted-foreground">
                    No deleted reports found in archive.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>

      <Dialog open={!!reportToPermanentlyDelete} onOpenChange={() => setReportToPermanentlyDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete Report</DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete the report for <strong>{reportToPermanentlyDelete?.metadata?.propertyAddress}</strong>? 
              This action cannot be undone and all associated photos will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setReportToPermanentlyDelete(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handlePermanentDelete}>Permanently Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default DeletedReportsArchive;
