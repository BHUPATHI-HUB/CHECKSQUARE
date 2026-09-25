// Capacitor-aware file save helper, with optional sync to PocketBase so the
// download appears in the user's Downloads page on any device they sign in on.
//
//   Web      → file-saver (anchor download)
//   Android  → @capacitor/filesystem (Documents/) + @capacitor/share sheet
//   Always   → if a PocketBase auth session exists, also upload the file to
//              the `report_downloads` collection (best-effort, never blocking).
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { IS_OFFLINE_ADMIN, USE_LOCAL_INSPECTION_STORAGE, OFFLINE_ADMIN_USER } from '@/lib/appTarget.js';
import data from '@/services/dataService.js';
import { enqueue, putReportUpload } from '@/lib/localStore.js';
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
 * @param {boolean} [opts.sync=true]   Set false to skip the PB upload.
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
	const USE_SUPABASE_DB = isSupabaseConfigured;

	if (sync && USE_LOCAL_INSPECTION_STORAGE) {
		// Offline build: record the download in local SQLite so the Downloads
		// page lists it. Store the Documents-relative path so it can be
		// re-opened / shared later from the device.
		try {
			await data.createReportDownload({
				user: IS_OFFLINE_ADMIN ? OFFLINE_ADMIN_USER.id : (opts.userId || null),
				inspection: inspectionId || null,
				filename,
				format: extToFormat(filename),
				fileSize: blob.size || 0,
				docPath: nativeUri ? filename : null,
				url: nativeUri || null,
				created: new Date().toISOString(),
			});
		} catch (err) {
			console.warn('Could not record local download:', err?.message || err);
		}
	} else if (sync && USE_SUPABASE_DB && supabase) {
		try {
			const { data: { user } = {} } = await supabase.auth.getUser();
			if (user?.id) {
				const id = crypto.randomUUID();
				const report = {
					id,
					userId: user.id,
					inspectionId: inspectionId || null,
					filename,
					format: extToFormat(filename),
					fileSize: blob.size || 0,
					contentType: blob.type || 'application/octet-stream',
					created: new Date().toISOString(),
					syncStatus: 'pending',
					syncAttempts: 0,
				};
				if (USE_LOCAL_INSPECTION_STORAGE) {
					await data.createReportDownload({
						id,
						user: user.id,
						inspection: inspectionId || null,
						filename,
						format: report.format,
						fileSize: report.fileSize,
						created: report.created,
						syncStatus: 'pending',
						syncAttempts: 0,
					});
				}
				await putReportUpload({ ...report, blob });
				await enqueue({ type: 'uploadReport', reportId: id, userId: user.id });
				requestSync();
			}
		} catch (err) {
			console.warn('Could not queue report for Supabase sync:', err?.message || err);
		}
	} else if (sync && pb?.authStore?.isValid) {
		const authUser = pb?.authStore?.record || pb?.authStore?.model;
		if (authUser?.id) {
			try {
				const fd = new FormData();
				fd.append('user', authUser.id);
				if (inspectionId) fd.append('inspection', inspectionId);
				fd.append('filename', filename);
				fd.append('format', extToFormat(filename));
				fd.append('fileSize', String(blob.size || 0));
				fd.append('file', blob, filename);
				await pb.collection('report_downloads').create(fd);
			} catch (err) {
				console.warn('Could not sync download to PocketBase:', err?.message || err);
			}
		}
	}

	return { method, uri: nativeUri };
}

export default saveFile;
