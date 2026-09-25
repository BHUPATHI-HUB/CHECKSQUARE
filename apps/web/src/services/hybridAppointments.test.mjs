import assert from 'node:assert/strict';
import test from 'node:test';
import { createHybridAppointments } from './hybridAppointments.js';

function setup() {
  let online = true;
  const snapshots = new Map();
  const calls = [];
  const cloud = {
    async listAppointments(options) { calls.push(['list', options]); return [{ id: 'appt-1', status: 'scheduled' }]; },
    async createAppointment(payload) { calls.push(['create', payload]); return { id: 'new', ...payload }; },
    async updateAppointment(id, payload) { calls.push(['update', id, payload]); return { id, ...payload }; },
    async transitionAppointment(id, payload) { calls.push(['transition', id, payload]); return { id, ...payload }; },
  };
  const appointments = createHybridAppointments({
    cloud, configured: true, isOnline: () => online,
    getCachedList: async (key) => snapshots.get(key) ?? null,
    putCachedList: async (key, rows) => { snapshots.set(key, rows); },
  });
  return { appointments, cloud, calls, snapshots, setOnline: (value) => { online = value; } };
}

test('refreshes assigned appointments from Supabase and keeps a scoped offline snapshot', async () => {
  const { appointments, calls, setOnline } = setup();
  const options = { filter: 'inspector = "inspector-1"', sort: 'scheduledAt', cacheUserId: 'inspector-1' };
  const online = await appointments.listAppointments(options);
  assert.deepEqual(online, [{ id: 'appt-1', status: 'scheduled' }]);
  assert.deepEqual(calls, [['list', { filter: options.filter, sort: options.sort }]]);
  setOnline(false);
  assert.deepEqual(await appointments.listAppointments(options), online);
  await assert.rejects(appointments.listAppointments({ ...options, cacheUserId: 'inspector-2' }), /unavailable offline/);
});

test('only network failures use cached schedules; authorization errors remain visible', async () => {
  const { appointments, cloud } = setup();
  const options = { filter: 'customer = "customer-1"', cacheUserId: 'customer-1' };
  await appointments.listAppointments(options);
  cloud.listAppointments = async () => { throw new Error('Failed to fetch'); };
  assert.equal((await appointments.listAppointments(options))[0].id, 'appt-1');
  cloud.listAppointments = async () => { throw new Error('401 Unauthorized'); };
  await assert.rejects(appointments.listAppointments(options), /401 Unauthorized/);
});

test('appointment mutations require connectivity and only write to Supabase', async () => {
  const { appointments, calls, setOnline } = setup();
  assert.deepEqual(await appointments.createAppointment({ status: 'requested' }), { id: 'new', status: 'requested' });
  assert.deepEqual(await appointments.updateAppointment('appt-1', { notes: 'A' }), { id: 'appt-1', notes: 'A' });
  assert.deepEqual(await appointments.transitionAppointment('appt-1', { status: 'completed' }), { id: 'appt-1', status: 'completed' });
  assert.deepEqual(calls.map(([type]) => type), ['create', 'update', 'transition']);
  setOnline(false);
  assert.throws(() => appointments.createAppointment({}), /Connect to the internet/);
  assert.throws(() => appointments.transitionAppointment('appt-1', {}), /Connect to the internet/);
  assert.equal(calls.length, 3);
});

test('an unconfigured hybrid build never serves a local appointment as cloud data', async () => {
  const { cloud } = setup();
  const appointments = createHybridAppointments({ cloud, configured: false, isOnline: () => false,
    getCachedList: async () => [{ id: 'old' }], putCachedList: async () => {} });
  await assert.rejects(appointments.listAppointments({ cacheUserId: 'user-1' }), /not configured/);
});
