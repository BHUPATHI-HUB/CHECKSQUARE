import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rowToAppointment } from '../apps/web/src/services/appointmentRecord.js';

test('booking response supplies the customer, schedule and address used by the inspection form', () => {
  const row = { id: 'booking', customer_id: 'customer', inspector_id: 'inspector',
    inspection_id: 'report', scheduled_at: '2026-10-01T04:30:00Z',
    time_slot: '10:00 AM', property_address: 'Hyderabad', status: 'in_progress',
    created_at: 'created', updated_at: 'updated', notes: 'Call at gate' };
  const result = rowToAppointment(row);
  assert.deepEqual({ customer: result.customer, inspector: result.inspector,
    inspection: result.inspection, scheduledAt: result.scheduledAt,
    timeSlot: result.timeSlot, propertyAddress: result.propertyAddress },
  { customer: 'customer', inspector: 'inspector', inspection: 'report',
    scheduledAt: '2026-10-01T04:30:00Z', timeSlot: '10:00 AM', propertyAddress: 'Hyderabad' });
  assert.equal(result.status, 'in_progress');
  assert.equal(result.notes, 'Call at gate');
  assert.notEqual(result, row);
});

test('unassigned bookings keep null links rather than fabricating an inspector or report', () => {
  const result = rowToAppointment({ inspector_id: null, inspection_id: null });
  assert.equal(result.inspector, null);
  assert.equal(result.inspection, null);
  assert.equal(rowToAppointment(null), null);
});
