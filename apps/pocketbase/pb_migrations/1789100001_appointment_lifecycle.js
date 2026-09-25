/// <reference path="../pb_data/types.d.ts" />
// Appointment lifecycle metadata and server-side ownership safeguards.
migrate((app) => {
  const appointments = app.findCollectionByNameOrId('appointments');
  const addField = (field) => {
    if (!appointments.fields.getByName(field.name)) appointments.fields.add(field);
  };

  const status = appointments.fields.getByName('status');
  if (status) status.values = ['requested', 'scheduled', 'in_progress', 'completed', 'cancelled'];
  addField({ id: 'text_cancelReason_ap', name: 'cancelReason', type: 'text', required: false, min: 0, max: 2000 });
  addField({ id: 'text_cancelledBy_ap', name: 'cancelledBy', type: 'text', required: false, min: 0, max: 50 });
  addField({ id: 'date_cancelledAt_ap', name: 'cancelledAt', type: 'date', required: false });
  addField({ id: 'date_previousScheduled_ap', name: 'previousScheduledAt', type: 'date', required: false });
  addField({ id: 'number_rescheduleCount_ap', name: 'rescheduleCount', type: 'number', required: false, min: 0, max: 100 });
  addField({ id: 'text_rescheduleReason_ap', name: 'rescheduleReason', type: 'text', required: false, min: 0, max: 2000 });

  // Customers may create only for themselves. Only admins may assign, schedule,
  // link inspections, or update lifecycle metadata.
  appointments.createRule = "@request.auth.id != '' && ((@request.auth.role = 'admin') || (@request.auth.role = 'customer' && @request.body.customer = @request.auth.id))";
  appointments.updateRule = "@request.auth.role = 'admin' || (@request.auth.role = 'inspector' && inspector = @request.auth.id && @request.body.inspector = inspector && @request.body.customer = customer) || (@request.auth.role = 'customer' && customer = @request.auth.id && @request.body.status = 'cancelled' && @request.body.customer = customer && @request.body.inspector = inspector && @request.body.inspection = inspection && @request.body.scheduledAt = scheduledAt)";
  const notifications = app.findCollectionByNameOrId('notifications');
  if (notifications) notifications.createRule = "@request.auth.role = 'admin'";
  app.save(appointments);
  return notifications ? app.save(notifications) : appointments;
}, (app) => {
  const appointments = app.findCollectionByNameOrId('appointments');
  ['cancelReason', 'cancelledBy', 'cancelledAt', 'previousScheduledAt', 'rescheduleCount', 'rescheduleReason']
    .forEach((name) => { const field = appointments.fields.getByName(name); if (field) appointments.fields.removeById(field.id); });
  const status = appointments.fields.getByName('status');
  if (status) status.values = ['scheduled', 'in_progress', 'completed', 'cancelled'];
  appointments.createRule = "@request.auth.id != '' && (@request.auth.role = 'customer' || @request.auth.role = 'admin')";
  appointments.updateRule = "@request.auth.role = 'admin' || inspector = @request.auth.id || customer = @request.auth.id";
  return app.save(appointments);
});
