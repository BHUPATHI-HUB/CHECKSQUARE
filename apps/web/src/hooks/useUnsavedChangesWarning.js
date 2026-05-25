import { useEffect, useRef } from 'react';
import { useBlocker } from 'react-router-dom';

/**
 * Warns / confirms before the user leaves a page with unsaved work.
 *
 * Guards against:
 *   1. Browser tab close / refresh / OS back gesture          → beforeunload
 *   2. In-app navigation via react-router (clicking a Link)   → useBlocker
 *   3. Android hardware Back button inside the Capacitor APK  → App.backButton
 *
 * @param {boolean} when    True while there is unsaved work.
 * @param {string}  message Confirmation prompt shown to the user.
 */
export default function useUnsavedChangesWarning(
	when,
	message = 'You have an inspection in progress. Are you sure you want to leave? Unsaved changes will be lost.'
) {
	// Router blocker — pauses in-app navigation and shows native confirm().
	const blocker = useBlocker(when);
	useEffect(() => {
		if (blocker.state === 'blocked') {
			if (window.confirm(message)) blocker.proceed();
			else blocker.reset();
		}
	}, [blocker, message]);

	// Browser tab close / refresh / web back-button.
	useEffect(() => {
		if (!when) return;
		const handler = (e) => {
			e.preventDefault();
			e.returnValue = message;
			return message;
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [when, message]);

	// Capacitor (Android) hardware Back button.
	const subRef = useRef(null);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const { Capacitor } = await import('@capacitor/core');
				if (!Capacitor?.isNativePlatform?.()) return;
				const { App } = await import('@capacitor/app');
				const sub = await App.addListener('backButton', () => {
					if (!when) {
						// Default behaviour: let the system go back.
						App.exitApp?.();
						return;
					}
					if (window.confirm(message)) {
						window.history.back();
					}
				});
				if (cancelled) sub.remove();
				else subRef.current = sub;
			} catch {
				/* @capacitor/app not installed or not on native — ignore */
			}
		})();
		return () => {
			cancelled = true;
			subRef.current?.remove?.();
			subRef.current = null;
		};
	}, [when, message]);
}
