import React, { useEffect, useState } from 'react';
import { CalendarClock, LoaderCircle, UserRound } from 'lucide-react';
import { toast } from 'sonner';
import data from '@/services/dataService.js';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const formatDate = (value) => {
  if (!value) return 'No date';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, {
    dateStyle: 'medium', timeStyle: 'short',
  });
};

/** Admin-only appointment queue. Assignment and status changes are also
 * enforced by Supabase RLS/triggers; this component is only the operator UI.
 */
export default function AdminAppointmentsPanel() {
  const [appointments, setAppointments] = useState([]);
  const [inspectors, setInspectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [nextAppointments, nextInspectors] = await Promise.all([
        data.listAppointments({ sort: 'scheduledAt' }),
        data.listUsersByRole('inspector'),
      ]);
      setAppointments(nextAppointments);
      setInspectors(nextInspectors);
    } catch (error) {
      toast.error(error?.message || 'Could not load appointments.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const assign = async (appointment, inspectorId) => {
    setSavingId(appointment.id);
    try {
      await data.updateAppointment(appointment.id, {
        inspector: inspectorId === 'unassigned' ? null : inspectorId,
      });
      setAppointments((rows) => rows.map((row) => (
        row.id === appointment.id ? { ...row, inspector: inspectorId === 'unassigned' ? null : inspectorId } : row
      )));
      toast.success('Inspector assignment saved.');
    } catch (error) {
      toast.error(error?.message || 'Could not assign inspector.');
    } finally {
      setSavingId(null);
    }
  };

  const changeStatus = async (appointment, status) => {
    setSavingId(appointment.id);
    try {
      await data.updateAppointment(appointment.id, { status });
      setAppointments((rows) => rows.map((row) => row.id === appointment.id ? { ...row, status } : row));
      toast.success('Appointment status saved.');
    } catch (error) {
      toast.error(error?.message || 'Could not update appointment status.');
    } finally {
      setSavingId(null);
    }
  };

  const inspectorName = (id) => inspectors.find((item) => item.id === id)?.name || 'Unassigned';

  return (
    <section className="border-b bg-muted/20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-12 py-10">
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <p className="editorial-eyebrow">Operations</p>
            <h2 className="font-display text-2xl mt-2">Appointment queue</h2>
          </div>
          <CalendarClock className="w-6 h-6 text-muted-foreground" aria-hidden="true" />
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="w-4 h-4 animate-spin" /> Loading appointments…
          </div>
        ) : appointments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No appointments require attention.</p>
        ) : (
          <div className="space-y-3">
            {appointments.map((appointment) => (
              <article key={appointment.id} className="rounded-xl border bg-background p-4 grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-center">
                <div>
                  <p className="font-medium">{appointment.propertyAddress || 'Property address unavailable'}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {formatDate(appointment.scheduledAt)} · {appointment.timeSlot || 'Flexible time'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                    <UserRound className="w-3.5 h-3.5" /> Inspector: {inspectorName(appointment.inspector)}
                  </p>
                </div>
                <Select
                  value={appointment.inspector || 'unassigned'}
                  onValueChange={(value) => assign(appointment, value)}
                  disabled={savingId === appointment.id || Boolean(appointment.inspection)}
                >
                  <SelectTrigger className="w-full lg:w-48" aria-label={`Assign inspector for ${appointment.propertyAddress || appointment.id}`}>
                    <SelectValue placeholder="Assign inspector" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Unassigned</SelectItem>
                    {inspectors.map((inspector) => <SelectItem key={inspector.id} value={inspector.id}>{inspector.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={appointment.status || 'scheduled'} onValueChange={(value) => changeStatus(appointment, value)} disabled={savingId === appointment.id}>
                  <SelectTrigger className="w-full lg:w-40" aria-label={`Status for ${appointment.propertyAddress || appointment.id}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </article>
            ))}
          </div>
        )}
        {!loading && appointments.length > 0 && <Button variant="ghost" className="mt-4" onClick={load}>Refresh queue</Button>}
      </div>
    </section>
  );
}
