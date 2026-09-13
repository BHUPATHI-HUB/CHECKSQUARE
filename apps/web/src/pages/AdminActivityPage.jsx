import React, { useEffect, useState } from 'react';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient.js';
import Header from '@/components/Header.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AdminActivityPage() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async () => {
    setLoading(true); setError('');
    if (!supabase) { setError('Supabase is not configured.'); setLoading(false); return; }
    const { data, error: queryError } = await supabase
      .from('user_activity_events').select('*').order('occurred_at', { ascending: false }).limit(200);
    if (queryError) { setError(`Could not load activity: ${queryError.message}`); setLoading(false); return; }
    const ids = [...new Set((data || []).map((event) => event.user_id).filter(Boolean))];
    const profileResult = ids.length ? await supabase.from('profiles').select('id,name,email,role').in('id', ids) : { data: [] };
    const byId = new Map((profileResult.data || []).map((profile) => [profile.id, profile]));
    setEvents((data || []).map((event) => ({ ...event, user: byId.get(event.user_id) || null })));
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);
  return <div className="min-h-screen bg-background"><Header /><main className="container mx-auto px-4 py-8">
    <div className="mb-6 flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-[.2em] text-muted-foreground">Admin</p><h1 className="text-3xl font-semibold tracking-tight">Inspector activity</h1><p className="mt-1 text-muted-foreground">Login, inspection, approval, and report activity.</p></div><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button></div>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-primary" />Activity timeline</CardTitle></CardHeader><CardContent>{loading ? <p className="py-10 text-center text-muted-foreground">Loading activity…</p> : error ? <p className="py-10 text-center text-destructive">{error}</p> : events.length === 0 ? <p className="py-10 text-center text-muted-foreground">No activity recorded yet.</p> : <div className="divide-y">{events.map((event) => <div key={event.id} className="flex items-center justify-between gap-4 py-4"><div><p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p><p className="text-sm text-muted-foreground">{event.property_name || event.property_address || 'No inspection attached'}</p></div><div className="text-right text-xs text-muted-foreground"><p>{event.user?.name || event.user?.email || event.user_id}</p><p>{new Date(event.occurred_at).toLocaleString()}</p></div></div>)}</div>}</CardContent></Card>
  </main></div>;
}

