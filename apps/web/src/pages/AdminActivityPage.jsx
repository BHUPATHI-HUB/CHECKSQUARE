import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Activity, RefreshCw } from 'lucide-react';
import { supabase } from '@/lib/supabaseClient.js';
import Header from '@/components/Header.jsx';
import InspectionSignal from '@/components/InspectionSignal.jsx';
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
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main>
        <section className="border-b">
          <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: .55, ease: [.22, 1, .36, 1] }}
              className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8"
            >
              <div>
                <p className="editorial-eyebrow flex items-center gap-2"><Activity className="h-3.5 w-3.5" /> Admin observatory</p>
                <h1 className="editorial-headline mt-6 text-4xl sm:text-5xl md:text-6xl">The field, <em>in motion.</em></h1>
                <p className="editorial-deck mt-5 max-w-xl">A live trail of sign-ins, inspections, approvals, and report delivery.</p>
              </div>
              <div className="flex items-end gap-4">
                <div className="workspace-signal hidden sm:block w-[240px] p-3" aria-hidden="true"><InspectionSignal /></div>
                <Button variant="outline" className="h-12 rounded-full px-5" onClick={() => void load()} disabled={loading}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh
                </Button>
              </div>
            </motion.div>
          </div>
        </section>
        <section className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
          <Card className="overflow-hidden rounded-2xl">
            <CardHeader className="border-b bg-muted/20"><CardTitle className="flex items-center gap-2 font-display text-2xl"><Activity className="h-5 w-5 text-secondary" />Activity timeline <span className="ml-auto text-xs font-sans font-medium uppercase tracking-[.18em] text-muted-foreground">{events.length} events</span></CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="py-10 text-center text-muted-foreground">Loading activity…</p> : error ? <p className="py-10 text-center text-destructive">{error}</p> : events.length === 0 ? <p className="py-10 text-center text-muted-foreground">No activity recorded yet.</p> : <div className="divide-y">{events.map((event) => <div key={event.id} className="flex items-start justify-between gap-4 py-4"><div><p className="font-medium capitalize">{event.event_type.replaceAll('_', ' ')}</p><p className="text-sm text-muted-foreground">{event.property_name || event.property_address || 'No inspection attached'}</p></div><div className="text-right text-xs text-muted-foreground"><p>{event.user?.name || event.user?.email || event.user_id}</p><p>{new Date(event.occurred_at).toLocaleString()}</p></div></div>)}</div>}
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}

