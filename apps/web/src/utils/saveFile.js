// Capacitor-aware file save helper with optional Supabase sync.
//
//   Web      → file-saver (anchor download)
//   Android  → @capacitor/filesystem (Documents/) + @capacitor/share sheet
import { saveAs } from 'file-saver';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabaseClient';

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
 * Save a Blob to the user's device + optionally sync to Supabase.
 *
 * @param {Blob} blob
 * @param {string} filename
 * @param {object} [opts]
 * @param {string} [opts.inspectionId] Links the synced row to an inspection.
 * @param {boolean} [opts.sync=true]   Set false to skip the Supabase upload.
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

	// 2. Sync a re-downloadable copy. A local save remains successful if the
	// cloud is unavailable, but tell the user it is only on this device.
	if (sync && supabase) {
		try {
			const { data: { user } = {}, error: userError } = await supabase.auth.getUser();
			if (userError) throw userError;
			if (!user?.id) throw new Error('Sign in to sync this report.');
			const storageKey = `${user.id}/${Date.now()}-${crypto.randomUUID()}-${filename}`;
			const { error: uploadError } = await supabase.storage.from('reports').upload(storageKey, blob, {
				contentType: blob.type || 'application/octet-stream', upsert: false,
			});
			if (uploadError) throw uploadError;
			const { error: recordError } = await supabase.from('report_downloads').insert({
				user_id: user.id,
				inspection_id: inspectionId || null,
				filename,
				format: extToFormat(filename),
				file_size: blob.size || 0,
				storage_key: storageKey,
			});
			if (recordError) {
				await supabase.storage.from('reports').remove([storageKey]).catch(() => {});
				throw recordError;
			}
		} catch (err) {
			console.warn('Could not sync download to Supabase:', err?.message || err);
			toast.warning('Saved on this device; cloud copy unavailable.', {
				description: 'Reconnect and download the report again to add it to your Downloads list.',
			});
		}
	}

	return { method, uri: nativeUri };
}

export default saveFile;
