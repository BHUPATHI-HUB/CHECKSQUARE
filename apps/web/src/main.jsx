import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '@/App';
import '@/index.css';
import AppErrorBoundary from '@/components/AppErrorBoundary.jsx';
import { startClientMonitoring } from '@/lib/clientMonitoring.js';
startClientMonitoring();

ReactDOM.createRoot(document.getElementById('root')).render(
	<AppErrorBoundary><App /></AppErrorBoundary>
);