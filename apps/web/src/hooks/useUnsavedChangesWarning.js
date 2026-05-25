import { useEffect, useRef } from 'react';

/**
 * Warns / confirms before the user leaves a page with unsaved work.
 *
 * Guards against:
 *   1. Browser tab close / refresh / OS back gesture          → beforeunload
 *   2. Android hardware Back button inside the Capacitor APK  → App.backButton
 *
 * Note: in-app react-router <Link> clicks are NOT intercepted here because
 * the app uses the legacy <BrowserRouter> component router, and `useBlocker`
 * only works inside `createBrowserRouter` (data router). Wiring it in would
 * crash every consumer with "useBlocker must be used within a data router."
 *
 * @param {boolean} when    True while there is unsaved work.
 * @param {string}  message Confirmation prompt shown to the user.
 */
export default function useUnsavedChangesWarning(
	when,
	message = 'You have an inspection in progress. Are you sure you want to leave? Unsaved changes will be lost.'
) {
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
				const sub = await App.addListener('backButton', ({ canGoBack } = {}) => {
					if (!when) {
						// No unsaved work — preserve normal Android back semantics:
						// navigate back if possible, otherwise exit the app.
						if (canGoBack || window.history.length > 1) window.history.back();
						else App.exitApp?.();
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
