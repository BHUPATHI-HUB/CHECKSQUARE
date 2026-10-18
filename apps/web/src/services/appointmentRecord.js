// Keep appointment responses consistent with the UI contract used by booking,
// assignment and the inspector's start-inspection flow.
export function rowToAppointment(row) {
  if (!row) return row;
  return {
    ...row,
    customer: row.customer_id,
    inspector: row.inspector_id,
    inspection: row.inspection_id,
    scheduledAt: row.scheduled_at,
    timeSlot: row.time_slot,
    propertyAddress: row.property_address,
    created: row.created_at,
    updated: row.updated_at,
  };
}
