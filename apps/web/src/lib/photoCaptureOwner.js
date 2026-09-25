const OFFLINE_SESSION_KEY = 'auth-offline-session-v1';

// AuthContext writes this after an offline PIN check. Device storage is not a
// server trust boundary: syncEngine.getUser() still binds the queued upload
// to a real Supabase account before anything reaches cloud storage.
export function getOfflineCaptureOwner(storage) {
  try {
    const session = JSON.parse(storage?.getItem(OFFLINE_SESSION_KEY) || 'null');
    const id = session?.user?.id;
    return session?.mode === 'offline-auth'
      && ['inspector', 'admin'].includes(session.user?.role)
      && typeof id === 'string' && id.length > 0 ? id : null;
  } catch {
    return null;
  }
}

export async function resolvePhotoCaptureOwner(getSession, storage) {
  const offlineOwner = getOfflineCaptureOwner(storage);
  if (offlineOwner) return offlineOwner;
  const { data, error } = await getSession();
  const id = data?.session?.user?.id;
  if (error || !id) throw new Error('Sign in before adding inspection photos.');
  return id;
}
