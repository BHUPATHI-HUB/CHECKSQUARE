// Capacitor-aware file save helper, with optional sync to Supabase so the
// download appears in the user's Downloads page on any device they sign in on.
//
//   Web      → file-saver (anchor download)
//   Android  → @capacitor/filesystem (Documents/) + @capacitor/share sheet
//   Always   → queue the file for Supabase Storage when cloud auth is available.
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { IS_OFFLINE_ADMIN, USE_LOCAL_INSPECTION_STORAGE, OFFLINE_ADMIN_USER } from '@/lib/appTarget.js';
import data from '@/services/dataService.js';
import { queueReportUpload } from '@/lib/localStore.js';
import { requestSync } from '@/services/syncEngine.js';

const isNative = () => {
	try {
		return Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform();
	} catch {
		return false;
	}
};

const blobToBase64 = (blob) =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onloadend = () => {
			const result = reader.result || '';
			// strip the `data:*/*;base64,` prefix
			const comma = String(result).indexOf(',');
			resolve(comma >= 0 ? String(result).slice(comma + 1) : String(result));
		};
		reader.onerror = reject;
		reader.readAsDataURL(blob);
	});

const extToFormat = (filename) => {
	const ext = String(filename).toLowerCase().split('.').pop();
	if (ext === 'pdf' || ext === 'docx' || ext === 'xlsx') return ext;
	return 'other';
};

/**
 * Save a Blob to the user's device + queue a durable Supabase upload.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @param {object} [opts]
 * @param {string} [opts.inspectionId] Links the synced row to an inspection.
 * @param {boolean} [opts.sync=true]   Set false to skip cloud synchronization.
 * @returns {Promise<{ method: 'web'|'native', uri?: string }>}
 */
export async function saveFile(blob, filename, opts = {}) {
	const { inspectionId, sync = true } = opts;

	// 1. Save locally on the device (always — works offline).
	let method = 'web';
	let nativeUri;

	if (isNative()) {
		try {
			const { Filesystem, Directory } = await import('@capacitor/filesystem');
			const { Share } = await import('@capacitor/share');
			const base64 = await blobToBase64(blob);
			const writeRes = await Filesystem.writeFile({
				path: filename,
				data: base64,
				directory: Directory.Documents,
				recursive: true,
			});
			nativeUri = writeRes.uri;
			method = 'native';
			toast.success(`Saved to Documents/${filename}`);
			try {
				await Share.share({
					title: filename,
					text: 'Inspection report',
					url: writeRes.uri,
					dialogTitle: 'Open or share report',
				});
			} catch {
				/* user cancelled — file is still saved */
			}
		} catch (err) {
			console.warn('Native save failed, falling back to anchor download:', err);
			saveAs(blob, filename);
		}
	} else {
		saveAs(blob, filename);
	}

	// 2. Persist report metadata locally and queue the cloud upload. The local
	// copy is already safe before this block runs; the outbox makes reconnects
	// and app restarts retryable instead of best-effort.
	if (sync) {
		const cloudEnabled = !IS_OFFLINE_ADMIN && isSupabaseConfigured && !!supabase;
		let userId = IS_OFFLINE_ADMIN ? OFFLINE_ADMIN_USER.id : (opts.userId || null);
		let cloudUserId = null;
		if (cloudEnabled) {
			try {
				// The cached session is available offline; getUser() needs a network request.
				const { data: { session } = {} } = await supabase.auth.getSession();
				cloudUserId = session?.user?.id || null;
				userId = cloudUserId || userId;
			} catch (err) {
				console.warn('Could not read report sync identity:', err?.message || err);
			}
		}
		const report = {
			id: crypto.randomUUID(), userId, inspectionId: inspectionId || null,
			filename, format: extToFormat(filename), fileSize: blob.size || 0,
			contentType: blob.type || 'application/octet-stream',
			created: new Date().toISOString(), syncStatus: 'pending', syncAttempts: 0,
		};
		if (USE_LOCAL_INSPECTION_STORAGE) {
			try {
				await data.createReportDownload({
					id: report.id, user: userId, inspection: report.inspectionId,
					filename, format: report.format, fileSize: report.fileSize,
					docPath: nativeUri ? filename : null, url: nativeUri || null,
					created: report.created,
					syncStatus: cloudEnabled ? (cloudUserId ? 'pending' : 'failed') : null, syncAttempts: 0,
				});
			} catch (err) {
				console.warn('Could not record local download:', err?.message || err);
			}
		}
		if (cloudEnabled && cloudUserId) {
			try {
				await queueReportUpload({ ...report, userId: cloudUserId, blob });
				requestSync();
			} catch (err) {
				console.warn('Could not queue report for Supabase sync:', err?.message || err);
				if (USE_LOCAL_INSPECTION_STORAGE) {
					await data.updateReportDownload(report.id, { syncStatus: 'failed', lastSyncError: String(err?.message || err) });
				}
				toast.warning('Report saved locally, but cloud sync could not be queued.');
			}
		} else if (cloudEnabled) {
			toast.warning('Report saved locally. Sign in to enable cloud sync.');
		}
	}

	return { method, uri: nativeUri };
}

export default saveFile;
