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
 * Save a Blob to the user's device + optionally sync to PocketBase.
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

	// 2. Sync to PocketBase (best-effort — silent on failure).
	// `authStore.record` is the canonical accessor in PB JS SDK ≥0.21;
	// `authStore.model` is deprecated and undefined on newer builds.
	const authUser = pb?.authStore?.record || pb?.authStore?.model;
	if (sync && pb?.authStore?.isValid && authUser?.id) {
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
			// Common causes: migration not applied yet, offline, or quota.
			// Local save already succeeded — don't surface a noisy error.
			console.warn('Could not sync download to PocketBase:', err?.message || err);
		}
	}

	return { method, uri: nativeUri };
}

export default saveFile;
