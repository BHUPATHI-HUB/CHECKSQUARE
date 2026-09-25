import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import Header from '@/components/Header.jsx';
import Footer from '@/components/Footer.jsx';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { CalendarClock, RefreshCw } from 'lucide-react';
import data from '@/services/dataService.js';
import { useAuth } from '@/contexts/AuthContext.jsx';
import { logActivity } from '@/services/activityLogger.js';

const statuses = ['requested', 'scheduled', 'in_progress', 'completed', 'cancelled'];
const toInputDate = (value) => value ? new Date(value).toISOString().slice(0, 16) : '';

const AdminAppointmentsPage = () => {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState([]);
  const [inspectors, setInspectors] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');

  const customerById = useMemo(() => Object.fromEntries(customers.map((u) => [u.id, u])), [customers]);
  const inspectorById = useMemo(() => Object.fromEntries(inspectors.map((u) => [u.id, u])), [inspectors]);

  const load = async () => {
    setLoading(true);
    try {
      const [appts, inspectorRows, inspectionRows, customerRows] = await Promise.all([
        data.listAppointments({ sort: '-scheduledAt' }),
        data.listUsersByRole('inspector'),
        data.listInspections({ filter: 'deletedAt = null', sort: '-created' }),
        data.listUsersByRole('customer'),
      ]);
      setAppointments(appts);
      setInspectors(inspectorRows);
      setInspections(inspectionRows);
      setCustomers(customerRows);
    } catch (error) {
      console.error('Failed to load appointments', error);
      toast.error('Could not load appointment requests');
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const save = async (appointment, patch) => {
    setSaving(appointment.id);
    const previousInspector = appointment.inspector;
    let inspectionReassigned = false;
    try {
      const nextPatch = { ...patch };
      const inspectorChanged = Object.prototype.hasOwnProperty.call(patch, 'inspector')
        && patch.inspector !== appointment.inspector;
      if (inspectorChanged && appointment.inspection) {
        if (!patch.inspector) throw new Error('Unlink the inspection before removing its inspector.');
        const nextInspector = inspectorById[patch.inspector];
        await data.updateInspection(appointment.inspection, {
          inspector: patch.inspector,
          inspectorName: nextInspector?.name || nextInspector?.email || '',
        });
        setInspections((rows) => rows.map((row) => row.id === appointment.inspection
          ? { ...row, inspector: patch.inspector, inspectorName: nextInspector?.name || nextInspector?.email || '' }
          : row));
        inspectionReassigned = true;
      }
      if (inspectorChanged && patch.inspector && appointment.status === 'requested' && nextPatch.status === undefined) {
        nextPatch.status = 'scheduled';
      }
      const updated = await data.transitionAppointment(appointment.id, nextPatch);
      setAppointments((rows) => rows.map((row) => row.id === updated.id ? { ...row, ...updated } : row));
      const recipients = [...new Set([updated.customer, updated.inspector, previousInspector].filter(Boolean))];
      await Promise.all(recipients.map((userId) => data.createNotification({
        userId,
        type: 'appointment',
        title: nextPatch.status === 'cancelled' ? 'Appointment cancelled' : 'Appointment updated',
        message: nextPatch.status === 'cancelled' ? (nextPatch.cancelReason || 'Your appointment was cancelled.') : 'Your appointment details were updated.',
        data: { appointmentId: updated.id },
      }).catch(() => null)));
      void logActivity(user, 'appointment_updated', { propertyAddress: updated.propertyAddress, metadata: { appointmentId: updated.id, patch: nextPatch } });
      toast.success('Appointment updated');
    } catch (error) {
      if (inspectionReassigned && appointment.inspection && previousInspector) {
        try {
          const oldInspector = inspectorById[previousInspector];
          await data.updateInspection(appointment.inspection, {
            inspector: previousInspector,
            inspectorName: oldInspector?.name || oldInspector?.email || '',
          });
        } catch (rollbackError) {
          console.error('Could not roll back linked inspection reassignment', rollbackError);
        }
      }
      console.error('Failed to update appointment', error);
      toast.error(error?.message || 'Could not update appointment');
    } finally { setSaving(''); }
  };

  return <>
    <Helmet><title>Appointments — CheckSquare</title></Helmet>
    <div className="min-h-screen bg-background flex flex-col"><Header />
      <main className="flex-1 container mx-auto px-4 sm:px-6 lg:px-12 py-8">
        <div className="flex items-end justify-between gap-4 mb-8">
          <div><p className="editorial-eyebrow">Admin workspace</p><h1 className="editorial-headline mt-3 text-4xl">Appointments</h1><p className="text-muted-foreground mt-2">Review booking requests, assign the team, and keep each inspection linked.</p></div>
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>
        {loading ? <p className="text-muted-foreground">Loading appointment requests…</p> : appointments.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No appointment requests yet.</CardContent></Card> : <div className="space-y-4">
          {appointments.map((appointment) => {
            const customer = customerById[appointment.customer];
            const linkedInspections = inspections.filter((inspection) => (
              inspection.id === appointment.inspection
              || (inspection.customer === appointment.customer
                && (!appointment.inspector || inspection.inspector === appointment.inspector))
            ));
            return <Card key={appointment.id}>
              <CardHeader className="pb-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle className="text-xl">{appointment.propertyAddress}</CardTitle><p className="text-sm text-muted-foreground mt-1">{customer?.name || customer?.email || appointment.customer} · {appointment.timeSlot}</p></div><span className="text-xs uppercase tracking-wider rounded-full bg-muted px-3 py-1">{appointment.status}</span></div></CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div><Label>Inspector</Label><Select value={appointment.inspector || 'unassigned'} onValueChange={(value) => save(appointment, { inspector: value === 'unassigned' ? null : value })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unassigned">Unassigned</SelectItem>{inspectors.map((u) => <SelectItem key={u.id} value={u.id}>{u.name || u.email}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground mt-1">Current: {inspectorById[appointment.inspector]?.name || 'Not assigned'}</p></div>
                <div><Label>Status</Label><Select value={appointment.status} onValueChange={(value) => save(appointment, { status: value })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{statuses.map((status) => <SelectItem key={status} value={status}>{status.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Schedule</Label><Input className="mt-1" type="datetime-local" defaultValue={toInputDate(appointment.scheduledAt)} onBlur={(event) => { const value = event.target.value; if (value && value !== toInputDate(appointment.scheduledAt)) { const reason = window.prompt('Reschedule reason (optional):'); if (reason !== null) save(appointment, { scheduledAt: new Date(value).toISOString(), rescheduleReason: reason.trim() }); } }} /><p className="text-xs text-muted-foreground mt-1">Change this field to reschedule.</p></div>
                <div><Label>Linked inspection</Label><Select value={appointment.inspection || 'none'} onValueChange={(value) => save(appointment, { inspection: value === 'none' ? null : value })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No inspection linked</SelectItem>{linkedInspections.map((inspection) => <SelectItem key={inspection.id} value={inspection.id}>#{inspection.id.slice(0, 6).toUpperCase()} · {inspection.metadata?.propertyAddress || inspection.propertyAddress || 'Inspection'}</SelectItem>)}</SelectContent></Select><p className="text-xs text-muted-foreground mt-1">Only matching customer/inspector inspections are shown.</p></div>
                <div className="md:col-span-2 xl:col-span-4 flex items-center justify-between border-t pt-3"><p className="text-xs text-muted-foreground"><CalendarClock className="inline w-4 h-4 mr-1" />{new Date(appointment.scheduledAt).toLocaleString()}</p><Button size="sm" variant="outline" disabled={saving === appointment.id || appointment.status === 'cancelled'} onClick={() => { const reason = window.prompt('Cancellation reason (optional):'); if (reason !== null) save(appointment, { status: 'cancelled', cancelReason: reason.trim() }); }}>Cancel appointment</Button></div>
              </CardContent>
            </Card>;
          })}
        </div>}
      </main><Footer />
    </div>
  </>;
};

export default AdminAppointmentsPage;
