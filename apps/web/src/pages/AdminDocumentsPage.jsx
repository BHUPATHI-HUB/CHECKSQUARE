import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Download, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import data from '@/services/dataService.js';
import { saveFile } from '@/utils/saveFile.js';

const AdminDocumentsPage = () => {
  const [documents, setDocuments] = useState([]);
  const [users, setUsers] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');

  const userById = useMemo(() => Object.fromEntries(users.map((row) => [row.id, row])), [users]);
  const inspectionById = useMemo(() => Object.fromEntries(inspections.map((row) => [row.id, row])), [inspections]);

  const load = async () => {
    setLoading(true);
    try {
      const [rows, userRows, inspectionRows] = await Promise.all([
        data.listAllReportDownloads(),
        data.listUsers(),
        data.listInspections({ filter: 'deletedAt = null', sort: '-created' }),
      ]);
      setDocuments(rows);
      setUsers(userRows);
      setInspections(inspectionRows);
    } catch (error) {
      console.error('Failed to load admin documents', error);
      toast.error('Could not load cloud documents.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const download = async (record) => {
    setBusy(record.id);
    try {
      const url = await data.getReportDownloadFileUrl(record);
      if (!url) throw new Error('This document is still waiting to sync.');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await saveFile(await response.blob(), record.filename, { sync: false });
    } catch (error) {
      toast.error(error?.message || 'Could not download document.');
    } finally {
      setBusy('');
    }
  };

  const remove = async (record) => {
    if (!window.confirm(`Delete ${record.filename} from cloud storage?`)) return;
    setBusy(record.id);
    try {
      await data.deleteReportDownload(record.id, record);
      setDocuments((rows) => rows.filter((row) => row.id !== record.id));
      toast.success('Document deleted from cloud storage.');
    } catch (error) {
      toast.error(error?.message || 'Could not delete document.');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet><title>Cloud Documents — CheckSquare</title></Helmet>
      <Header />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-12 py-8">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div>
            <p className="editorial-eyebrow">Admin workspace</p>
            <h1 className="editorial-headline mt-3 text-4xl">Cloud documents</h1>
            <p className="text-muted-foreground mt-2">Reports uploaded from customer and inspector workflows.</p>
          </div>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
        {loading ? <p className="text-muted-foreground">Loading cloud documents…</p> : documents.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">No cloud documents found.</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {documents.map((record) => {
              const owner = userById[record.user_id || record.user];
              const inspection = inspectionById[record.inspection_id || record.inspection];
              const status = record.sync_status || record.syncStatus || 'synced';
              return (
                <Card key={record.id}>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-base break-all">{record.filename}</CardTitle>
                      <div className="flex gap-2">
                        <Badge variant="secondary" className="uppercase">{record.format}</Badge>
                        <Badge variant={status === 'failed' ? 'destructive' : 'outline'}>{status}</Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
                    <div className="text-muted-foreground">
                      <p>{owner?.name || owner?.email || record.user_id || record.user || 'Unknown user'}</p>
                      <p>{inspection?.metadata?.propertyAddress || record.inspection_id || record.inspection || 'No linked inspection'} · {new Date(record.created_at || record.created).toLocaleString()}</p>
                      {status === 'failed' && <p className="text-destructive mt-1">{record.last_sync_error || record.lastSyncError || 'Upload failed; retry from the source device.'}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => download(record)} disabled={busy === record.id || !record.storage_key && !record.storageKey}>
                        <Download className="w-4 h-4 mr-2" /> Download
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => remove(record)} disabled={busy === record.id}>
                        <Trash2 className="w-4 h-4 mr-2" /> Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default AdminDocumentsPage;
