import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext.jsx';
import pb from '@/lib/pocketbaseClient';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
	Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Download, Trash2, FileText, FileSpreadsheet, FileType2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { saveFile } from '@/utils/saveFile';

const formatIcon = (fmt) => {
	if (fmt === 'pdf')  return <FileType2 className="w-5 h-5 text-red-500" />;
	if (fmt === 'docx') return <FileText className="w-5 h-5 text-blue-600" />;
	if (fmt === 'xlsx') return <FileSpreadsheet className="w-5 h-5 text-emerald-600" />;
	return <FileText className="w-5 h-5" />;
};

const prettyBytes = (n) => {
	if (!n || n < 1024) return `${n || 0} B`;
	if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
	return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

const DownloadsPage = () => {
	const { user } = useAuth();
	const [items, setItems] = useState([]);
	const [loading, setLoading] = useState(true);
	const [deleting, setDeleting] = useState(null); // id pending delete
	const [confirm, setConfirm] = useState(null);   // record awaiting confirmation

	const load = async () => {
		if (!user?.id) return;
		setLoading(true);
		try {
			const records = await pb.collection('report_downloads').getFullList({
				filter: `user="${user.id}"`,
				sort: '-created',
				expand: 'inspection',
				$autoCancel: false,
			});
			setItems(records);
		} catch (err) {
			console.warn('Could not load downloads:', err?.message || err);
			toast.error('Could not load your downloads.');
			setItems([]);
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user?.id]);

	const handleDownload = async (rec) => {
		if (!rec.file) {
			toast.error('This download has no stored file. It may have been generated before sync.');
			return;
		}
		try {
			// Use PB's authenticated file URL so protected files are accessible.
			const url = pb.files.getUrl(rec, rec.file, { token: await pb.files.getToken() });
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const blob = await res.blob();
			await saveFile(blob, rec.filename, { sync: false }); // don't double-log
		} catch (err) {
			console.warn('Re-download failed:', err);
			toast.error('Could not re-download this file.');
		}
	};

	const handleDelete = async (rec) => {
		setDeleting(rec.id);
		try {
			await pb.collection('report_downloads').delete(rec.id);
			setItems((prev) => prev.filter((x) => x.id !== rec.id));
			toast.success('Permanently deleted.');
		} catch (err) {
			console.warn('Delete failed:', err);
			toast.error('Could not delete. Please try again.');
		} finally {
			setDeleting(null);
			setConfirm(null);
		}
	};

	return (
		<div className="min-h-screen flex flex-col bg-background">
			<Helmet><title>My Downloads</title></Helmet>
			<Header />

			<main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-8 py-8">
				<div className="flex items-center justify-between mb-6 gap-3 flex-wrap">
					<div>
						<h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Downloads</h1>
						<p className="text-sm text-muted-foreground mt-1">
							Reports you&rsquo;ve downloaded, synced across all your devices.
						</p>
					</div>
					<Button variant="outline" size="sm" onClick={load} disabled={loading}>
						<RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
						Refresh
					</Button>
				</div>

				{loading ? (
					<div className="text-sm text-muted-foreground py-12 text-center">Loading…</div>
				) : items.length === 0 ? (
					<Card>
						<CardHeader>
							<CardTitle>No downloads yet</CardTitle>
							<CardDescription>
								When you download a PDF or DOCX report, it will appear here and
								sync to all your devices automatically.
							</CardDescription>
						</CardHeader>
					</Card>
				) : (
					<div className="grid gap-3">
						{items.map((rec) => (
							<Card key={rec.id} className="hover:shadow-md transition-shadow">
								<CardContent className="p-4 flex items-center gap-4">
									<div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
										{formatIcon(rec.format)}
									</div>
									<div className="flex-1 min-w-0">
										<div className="flex items-center gap-2 flex-wrap">
											<p className="font-medium truncate">{rec.filename}</p>
											<Badge variant="secondary" className="uppercase text-xs">
												{rec.format}
											</Badge>
										</div>
										<p className="text-xs text-muted-foreground mt-0.5">
											{prettyBytes(rec.fileSize)} ·{' '}
											{new Date(rec.created).toLocaleString()}
											{rec.expand?.inspection?.metadata?.propertyAddress && (
												<>
													{' · '}
													<Link
														to={`/admin/inspection/${rec.inspection}`}
														className="text-primary hover:underline"
													>
														{rec.expand.inspection.metadata.propertyAddress}
													</Link>
												</>
											)}
										</p>
									</div>
									<div className="flex items-center gap-2 flex-shrink-0">
										<Button
											size="sm"
											variant="outline"
											onClick={() => handleDownload(rec)}
											disabled={!rec.file}
											title={rec.file ? 'Re-download' : 'No stored file'}
										>
											<Download className="w-4 h-4" />
											<span className="hidden sm:inline ml-2">Download</span>
										</Button>
										<Button
											size="sm"
											variant="destructive"
											onClick={() => setConfirm(rec)}
											disabled={deleting === rec.id}
										>
											<Trash2 className="w-4 h-4" />
											<span className="hidden sm:inline ml-2">Delete</span>
										</Button>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
				)}
			</main>

			<Footer />

			<Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Permanently delete?</DialogTitle>
						<DialogDescription>
							This will permanently remove <strong>{confirm?.filename}</strong> and
							its stored file from the server. The copy already on your device
							is not affected. This cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="gap-2">
						<Button variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
						<Button
							variant="destructive"
							onClick={() => confirm && handleDelete(confirm)}
							disabled={!!deleting}
						>
							{deleting ? 'Deleting…' : 'Delete forever'}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default DownloadsPage;
