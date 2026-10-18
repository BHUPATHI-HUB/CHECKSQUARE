import React from 'react';
import { WifiOff } from 'lucide-react';
import useOnlineStatus from '@/hooks/useOnlineStatus';

/**
 * Fixed-position banner shown when the device goes offline.
 * Shows which work can be kept on this device while the network is down.
 */
export default function OfflineBanner() {
	const online = useOnlineStatus();
	if (online) return null;

	return (
		<div
			role="status"
			aria-live="polite"
			className="relative z-[60] border-b border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-100"
		>
			<div className="max-w-5xl mx-auto px-4 py-2 flex items-center gap-2 text-sm font-medium">
				<WifiOff className="w-4 h-4 flex-shrink-0" />
				<span>
                    You&rsquo;re offline. Inspection drafts, photos and admin settings
                    can save on this device and sync when you reconnect. Other actions need a connection.
				</span>
			</div>
		</div>
	);
}
