import { supabase } from '@/lib/supabaseClient.js';

const QUEUE_KEY = 'checksquare-activity-queue-v1';

const readQueue = () => {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
};

export async function logActivity(user, eventType, details = {}) {
  if (!user?.id || !eventType) return;
  const event = {
    user_id: user.id,
    event_type: eventType,
    session_id: details.sessionId || null,
    inspection_id: details.inspectionId || null,
    property_name: details.propertyName || null,
    property_address: details.propertyAddress || null,
    app_version: import.meta.env?.VITE_APP_VERSION || null,
    device_type: /Android|iPhone|iPad/i.test(navigator?.userAgent || '') ? 'mobile' : 'desktop',
    connectivity: navigator?.onLine === false ? 'offline' : 'online',
    metadata: details.metadata || {},
  };
  try {
    if (!supabase) throw new Error('Supabase unavailable');
    const { error } = await supabase.from('user_activity_events').insert(event);
    if (error) throw error;
  } catch {
    const next = [...readQueue(), event].slice(-500);
    try { localStorage.setItem(QUEUE_KEY, JSON.stringify(next)); } catch { /* tracking never blocks the app */ }
  }
}

export async function flushActivityQueue() {
  if (!supabase || typeof window === 'undefined') return;
  const queued = readQueue();
  if (!queued.length) return;
  const { error } = await supabase.from('user_activity_events').insert(queued);
  if (!error) localStorage.removeItem(QUEUE_KEY);
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { void flushActivityQueue(); });
  window.setTimeout(() => { void flushActivityQueue(); }, 1500);
}
