import { supabase } from '@/lib/supabaseClient.js';
// Record codes and route templates only. Never send report contents, URLs with
// query strings, user-entered text, tokens or stack traces to the database.
export function reportClientError(code) {
  const route = window.location.pathname.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').slice(0,120);
  supabase?.rpc('record_client_error', { p_code:code, p_route:route }).then(()=>{},()=>{});
}
export function startClientMonitoring() {
  window.addEventListener('error',()=>reportClientError('unhandled_error'));
  window.addEventListener('unhandledrejection',()=>reportClientError('unhandled_rejection'));
}
