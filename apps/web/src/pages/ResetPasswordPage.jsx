import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { CheckSquare, LockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/lib/supabaseClient.js';
import { RECOVERY_PENDING_KEY } from '@/lib/authRedirect.js';
import { useSettings } from '@/contexts/SettingsContext.jsx';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    if (!supabase) { setChecking(false); return undefined; }
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted && session) { setReady(true); setChecking(false); }
    });
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setReady(Boolean(data.session)); setChecking(false); }
    }).catch(() => { if (mounted) setChecking(false); });
    return () => { mounted = false; subscription.subscription.unsubscribe(); };
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < 8) { toast.error('Use at least 8 characters.'); return; }
    if (password !== confirmation) { toast.error('Passwords do not match.'); return; }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      try { localStorage.removeItem(RECOVERY_PENDING_KEY); } catch { /* optional flag */ }
      await supabase.auth.signOut();
      toast.success('Password changed. Sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (error) {
      toast.error(error?.message || 'Could not change password. Please try again.');
    } finally { setSaving(false); }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-12 flex items-center justify-center">
      <Helmet><title>Reset password — {settings?.appName || 'CheckSquare'}</title></Helmet>
      <div className="w-full max-w-md rounded-2xl border bg-card p-7 sm:p-10 shadow-sm">
        <Link to="/" className="inline-flex items-center gap-2 font-display text-xl text-primary">
          <CheckSquare className="h-6 w-6" /> {settings?.appName || 'CheckSquare'}
        </Link>
        <LockKeyhole className="h-8 w-8 text-secondary mt-10" aria-hidden="true" />
        <h1 className="font-display text-3xl mt-4">Choose a new password</h1>
        {checking ? <p role="status" className="mt-4 text-muted-foreground">Checking reset link…</p>
          : !ready ? <div className="mt-5 space-y-4">
            <p className="text-sm text-muted-foreground">This reset link is unavailable or expired. Request a new one from the sign-in page.</p>
            <Button asChild variant="outline"><Link to="/login">Back to sign in</Link></Button>
          </div>
            : <form onSubmit={submit} className="mt-7 space-y-5">
              <div><Label htmlFor="new-password">New password</Label>
                <Input id="new-password" type="password" autoComplete="new-password" minLength={8} required
                  value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 h-12" /></div>
              <div><Label htmlFor="confirm-password">Confirm password</Label>
                <Input id="confirm-password" type="password" autoComplete="new-password" minLength={8} required
                  value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="mt-2 h-12" /></div>
              <Button type="submit" className="w-full h-12" disabled={saving}>{saving ? 'Updating…' : 'Update password'}</Button>
            </form>}
      </div>
    </main>
  );
}
