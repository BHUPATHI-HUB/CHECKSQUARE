import React from 'react';
import { WifiOff } from 'lucide-react';
import useOnlineStatus from '@/hooks/useOnlineStatus';

/**
 * Fixed-position banner shown when the device goes offline.
 * Lets users know that browsing cached data is OK, but saving requires a connection.
 */
export default function OfflineBanner() {
	const online = useOnlineStatus();
	if (online) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			className="fixed top-0 inset-x-0 z-[9999] bg-amber-500 text-amber-950 shadow-md"
		>
			<div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 text-sm font-medium">
				<WifiOff className="w-4 h-4 flex-shrink-0" />
				<span>
					You&rsquo;re offline. You can browse previously loaded data, but new
					inspections, edits and uploads won&rsquo;t save until you reconnect.
				</span>
			</div>
		</div>
	);
}
