import { useEffect, useState } from 'react';

/**
 * Tracks browser online/offline status.
 * Returns `true` when the device reports an active network connection.
 */
export default function useOnlineStatus() {
	const [online, setOnline] = useState(
		typeof navigator !== 'undefined' ? navigator.onLine : true
	);

	useEffect(() => {
		const goOnline = () => setOnline(true);
		const goOffline = () => setOnline(false);
		window.addEventListener('online', goOnline);
		window.addEventListener('offline', goOffline);
		return () => {
			window.removeEventListener('online', goOnline);
			window.removeEventListener('offline', goOffline);
		};
	}, []);

	return online;
}
