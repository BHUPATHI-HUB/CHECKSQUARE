import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Calendar as CalendarIcon, Clock, MapPin, ArrowRight, CheckCircle2, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import pb from '@/lib/pocketbaseClient.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { useSettings } from '@/contexts/SettingsContext.jsx';

const fadeUp = {
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

const TIME_SLOTS = ['09:00 AM', '10:00 AM', '11:00 AM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM'];

// ─── Editorial calendar ─────────────────────────────────────────────────
// A bespoke month grid. Weekends are disabled to mirror the studio's hours.
const EditorialCalendar = ({ selected, onSelect }) => {
  const today = new Date();
  const [view, setView] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const firstWeekday = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
  const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.getFullYear(), view.getMonth(), d));

  const monthLabel = view.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <button
          type="button"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
          className="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <p className="font-display text-xl md:text-2xl">{monthLabel}</p>
        <button
          type="button"
          onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
          className="w-9 h-9 rounded-full border flex items-center justify-center hover:bg-muted transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground mb-2">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="text-center py-2">{d.slice(0, 1)}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const isSelected = selected && selected.toDateString() === d.toDateString();
          const isPast = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          const disabled = isPast || isWeekend;
          const isToday = d.toDateString() === today.toDateString();
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(d)}
              className={[
                'aspect-square flex items-center justify-center text-sm transition-all relative',
                isSelected
                  ? 'bg-primary text-primary-foreground font-medium'
                  : disabled
                    ? 'text-muted-foreground/30 cursor-not-allowed'
                    : 'hover:bg-muted hover:scale-105 text-foreground',
                isToday && !isSelected ? 'ring-1 ring-secondary' : '',
              ].join(' ')}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
};

const AppointmentBookingPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useSettings();
  const brand = settings?.appName || 'CheckSquare';
  const [date, setDate] = useState(null);
  const [time, setTime] = useState('');
  const [inspector, setInspector] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inspectors, setInspectors] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const records = await pb.collection('users').getFullList({
          filter: 'role = "inspector"', sort: 'name', $autoCancel: false,
        });
        if (!cancelled) setInspectors(records);
      } catch (e) {
        console.error('Failed to load inspectors', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const canProceed = date && time && inspector && address;
  const completion = [date, time, inspector, address].filter(Boolean).length;

  const handleBook = async () => {
    if (!user) { toast.error('You must be signed in to book an appointment.'); return; }
    // Defensive validation: the calendar already disables past dates and
    // weekends, but a determined user could call this handler with stale
    // state, so we re-validate before hitting PocketBase.
    if (!date || !time || !inspector) {
      toast.error('Please choose a date, time, and inspector before confirming.');
      return;
    }
    if (!address || address.trim().length < 5) {
      toast.error('Please enter the full property address (street, city, state).');
      return;
    }
    setIsSubmitting(true);
    try {
      const scheduled = new Date(date);
      const match = /^(\d{2}):(\d{2})\s?(AM|PM)$/i.exec(time);
      if (match) {
        let hour = parseInt(match[1], 10);
        const min = parseInt(match[2], 10);
        const isPM = match[3].toUpperCase() === 'PM';
        if (isPM && hour !== 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
        scheduled.setHours(hour, min, 0, 0);
      }
      if (scheduled.getTime() < Date.now()) {
        toast.error('That time slot has already passed. Please pick a future date and time.');
        setIsSubmitting(false);
        return;
      }

      const appt = await pb.collection('appointments').create({
        customer: user.id,
        inspector: inspector === 'any' ? null : inspector,
        scheduledAt: scheduled.toISOString(),
        timeSlot: time,
        propertyAddress: address,
        notes,
        status: 'scheduled',
      });

      // Auto-provision a group chat. Best effort — never block the booking.
      try {
        const adminIds = await pb.collection('users').getFullList({
          filter: 'role = "admin"', fields: 'id', $autoCancel: false,
        }).then((rows) => rows.map((r) => r.id));
        const participants = [
          ...new Set([user.id, ...(inspector !== 'any' ? [inspector] : []), ...adminIds].filter(Boolean)),
        ];
        if (participants.length >= 2) {
          await pb.collection('chats').create({
            type: 'group', participants, inspectionId: '',
          }, { $autoCancel: false });
        }
      } catch (chatErr) {
        console.warn('Auto-create chat after booking failed:', chatErr?.message || chatErr);
      }

      setConfirmOpen(false);
      navigate('/thank-you', {
        state: {
          headline: 'Booked.',
          subhead: `Your inspection at ${address} is scheduled for ${date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}, ${time}. A confirmation is on its way.`,
          inspectionId: appt?.id,
          primaryCta: { to: '/customer', label: 'Open dashboard' },
          secondaryCta: { to: '/chat', label: 'Open chat' },
        },
      });
    } catch (e) {
      toast.error(e?.message || 'Failed to book appointment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>{`Book an inspection — ${brand}`}</title>
      </Helmet>

      <div className="min-h-screen bg-background flex flex-col">
        <Header />

        <main className="flex-1">
          {/* Editorial header */}
          <section className="border-b">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
              <motion.div {...fadeUp}>
                <p className="editorial-eyebrow">Reserve a date</p>
                <h1 className="editorial-headline mt-6 text-3xl sm:text-5xl md:text-6xl lg:text-7xl">
                  Book the <em>walk-through.</em>
                </h1>
                <p className="editorial-deck mt-5 max-w-2xl">
                  Choose a morning or an afternoon. A senior inspector arrives at the property and the rest is paperwork — done in their hands, not yours.
                </p>
              </motion.div>
            </div>
          </section>

          {/* Progress strip */}
          <section className="border-b bg-muted/30">
            <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-4">
              <div className="flex items-center justify-between gap-4">
                <p className="editorial-eyebrow text-[10px]">Step {completion}/4</p>
                <div className="flex-1 h-px bg-border relative">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-secondary"
                    style={{ height: 1 }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(completion / 4) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{completion === 4 ? 'Ready to confirm' : 'Continue'}</p>
              </div>
            </div>
          </section>

          <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10 sm:py-14 lg:py-20">
            <div className="grid grid-cols-12 gap-8">
              {/* Left: Calendar + time + details */}
              <div className="col-span-12 lg:col-span-8 space-y-12">
                <motion.section {...fadeUp} className="border bg-card p-5 sm:p-8 lg:p-10">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="num-marker text-2xl">01</span>
                    <p className="editorial-eyebrow">Pick a date</p>
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl mb-6 sm:mb-8">When should we arrive?</h2>
                  <EditorialCalendar selected={date} onSelect={(d) => { setDate(d); setTime(''); }} />
                  <p className="mt-6 text-xs text-muted-foreground">Weekends are reserved for emergencies. Reach out via chat if needed.</p>
                </motion.section>

                <motion.section {...fadeUp} className="border bg-card p-5 sm:p-8 lg:p-10">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="num-marker text-2xl">02</span>
                    <p className="editorial-eyebrow">Pick a time</p>
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl mb-5 sm:mb-6">
                    {date ? `Available windows on ${date.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}` : 'Select a date first'}
                  </h2>
                  {date ? (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {TIME_SLOTS.map((slot) => (
                        <button
                          key={slot}
                          type="button"
                          onClick={() => setTime(slot)}
                          className={[
                            'h-14 border-2 transition-all text-sm font-medium',
                            time === slot
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'border-border bg-background hover:border-secondary hover:text-primary',
                          ].join(' ')}
                        >
                          {slot}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-12 text-center text-muted-foreground border border-dashed">
                      Choose a date above to reveal windows.
                    </div>
                  )}
                </motion.section>

                <motion.section {...fadeUp} className="border bg-card p-5 sm:p-8 lg:p-10">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="num-marker text-2xl">03</span>
                    <p className="editorial-eyebrow">Property & inspector</p>
                  </div>
                  <h2 className="font-display text-xl sm:text-2xl md:text-3xl mb-6 sm:mb-8">A few last details.</h2>
                  <div className="space-y-7">
                    <div>
                      <Label htmlFor="address" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Property address</Label>
                      <Input
                        id="address"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Street, city, state, zip"
                        required
                        minLength={5}
                        aria-required="true"
                        className="mt-2 h-12 rounded-none border-0 border-b-2 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary text-base"
                      />
                    </div>
                    <div>
                      <Label className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Preferred inspector</Label>
                      <Select value={inspector} onValueChange={setInspector}>
                        <SelectTrigger className="mt-2 h-12 rounded-none border-0 border-b-2 bg-transparent px-0 focus:ring-0 focus:border-primary text-base">
                          <SelectValue placeholder="Choose an inspector or let us assign one" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="any">Any available inspector</SelectItem>
                          {inspectors.map((i) => (
                            <SelectItem key={i.id} value={i.id}>{i.name || i.email}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="notes" className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Access notes <span className="opacity-50">(optional)</span></Label>
                      <Textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Gate codes, pets on property, areas to focus on…"
                        className="mt-2 resize-none h-24 rounded-none border-0 border-b-2 bg-transparent px-0 focus-visible:ring-0 focus-visible:border-primary text-base"
                      />
                    </div>
                  </div>
                </motion.section>
              </div>

              {/* Right: summary */}
              <aside className="col-span-12 lg:col-span-4">
                <motion.div {...fadeUp} className="lg:sticky lg:top-8">
                  <div className="border bg-card">
                    <div className="p-5 sm:p-7 border-b">
                      <p className="editorial-eyebrow">Your booking</p>
                      <h3 className="font-display text-xl sm:text-2xl mt-3 leading-tight">Summary</h3>
                    </div>
                    <div className="p-5 sm:p-7 space-y-5">
                      <div className="flex items-start gap-3">
                        <CalendarIcon className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Date</p>
                          <p className="font-medium mt-1">{date ? date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }) : <span className="text-muted-foreground italic">Not selected</span>}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <Clock className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Time</p>
                          <p className="font-medium mt-1">{time || <span className="text-muted-foreground italic">Not selected</span>}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-secondary mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Property</p>
                          <p className="font-medium mt-1 break-words">{address || <span className="text-muted-foreground italic">Not provided</span>}</p>
                        </div>
                      </div>
                    </div>
                    <div className="p-5 sm:p-7 pt-0">
                      <Button
                        className="w-full h-14 rounded-full text-base group"
                        disabled={!canProceed}
                        onClick={() => setConfirmOpen(true)}
                      >
                        Confirm booking
                        <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                      </Button>
                      <p className="text-[11px] text-muted-foreground mt-4 text-center leading-relaxed">
                        By confirming you agree to our <a href="/terms" className="underline">terms</a>. You'll receive an email and the inspector will be in touch.
                      </p>
                    </div>
                  </div>
                </motion.div>
              </aside>
            </div>
          </div>
        </main>

        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 font-display text-2xl">
                <CheckCircle2 className="w-6 h-6 text-secondary" /> Confirm this booking
              </DialogTitle>
              <DialogDescription className="text-base pt-3 leading-relaxed">
                You're scheduling an inspection at <strong className="text-foreground">{address}</strong> on{' '}
                <strong className="text-foreground">{date?.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</strong> at{' '}
                <strong className="text-foreground">{time}</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/40 border p-4 my-2 text-sm text-muted-foreground leading-relaxed">
              A confirmation will be sent to your email. The studio will reach out within one business day to verify access.
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={isSubmitting} className="rounded-full">Cancel</Button>
              <Button onClick={handleBook} disabled={isSubmitting} className="rounded-full">
                {isSubmitting ? 'Booking…' : 'Confirm & book'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Footer />
      </div>
    </>
  );
};

export default AppointmentBookingPage;
