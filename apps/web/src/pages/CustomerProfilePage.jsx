import React, { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { ArrowLeft, Save, UserCircle } from 'lucide-react';
import { toast } from 'sonner';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';

export default function CustomerProfilePage() {
  const { user, updateProfile } = useAuth();
  const { settings } = useSettings();
  const [form, setForm] = useState({ name: '', phone: '', address: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({ name: user?.name || '', phone: user?.phone || '', address: user?.address || '' });
  }, [user?.id, user?.name, user?.phone, user?.address]);

  const save = async (event) => {
    event.preventDefault();
    if (!form.name.trim()) { toast.error('Enter your name.'); return; }
    setSaving(true);
    try {
      await updateProfile({ name: form.name.trim(), phone: form.phone.trim(), address: form.address.trim() });
      toast.success('Profile saved.');
    } catch (error) {
      toast.error(error?.message || 'Could not save profile.');
    } finally { setSaving(false); }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Helmet><title>Your profile — {settings?.appName || 'CheckSquare'}</title></Helmet>
      <Header />
      <main className="flex-1 container mx-auto px-4 sm:px-6 py-10 sm:py-16 max-w-3xl">
        <Link to="/customer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <UserCircle className="h-9 w-9 text-secondary mt-10" aria-hidden="true" />
        <p className="editorial-eyebrow mt-5">Client details</p>
        <h1 className="font-display text-4xl sm:text-5xl mt-3">Your profile</h1>
        <p className="text-muted-foreground mt-4">Keep your contact details ready for your inspection team.</p>
        <form onSubmit={save} className="mt-10 border bg-card rounded-2xl p-6 sm:p-9 space-y-6">
          <div><Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required maxLength={120} className="mt-2 h-12" /></div>
          <div><Label htmlFor="profile-email">Email</Label>
            <Input id="profile-email" type="email" value={user?.email || ''} readOnly className="mt-2 h-12 bg-muted/50" />
            <p className="text-xs text-muted-foreground mt-2">Your sign-in email is managed by your account.</p></div>
          <div><Label htmlFor="profile-phone">Phone</Label>
            <Input id="profile-phone" type="tel" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              maxLength={30} className="mt-2 h-12" /></div>
          <div><Label htmlFor="profile-address">Address</Label>
            <Input id="profile-address" value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              maxLength={250} className="mt-2 h-12" /></div>
          <Button type="submit" disabled={saving} className="h-12 rounded-full px-6">
            <Save className="h-4 w-4 mr-2" /> {saving ? 'Saving…' : 'Save profile'}
          </Button>
        </form>
      </main>
      <Footer />
    </div>
  );
}
