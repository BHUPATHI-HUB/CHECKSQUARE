import assert from 'node:assert/strict';
import test from 'node:test';
import { getOfflineCaptureOwner, resolvePhotoCaptureOwner } from './photoCaptureOwner.js';

const storageFor = (value) => ({ getItem: () => value });

test('offline PIN identity allows capture without contacting Supabase', async () => {
  const storage = storageFor(JSON.stringify({ mode: 'offline-auth', user: { id: 'inspector-1', role: 'inspector' } }));
  assert.equal(getOfflineCaptureOwner(storage), 'inspector-1');
  assert.equal(await resolvePhotoCaptureOwner(() => { throw new Error('network unavailable'); }, storage), 'inspector-1');
});

test('a normal authenticated session supplies the capture owner', async () => {
  const id = await resolvePhotoCaptureOwner(async () => ({ data: { session: { user: { id: 'inspector-2' } } } }), null);
  assert.equal(id, 'inspector-2');
});

test('malformed and customer offline sessions cannot authorize inspector capture', async () => {
  assert.equal(getOfflineCaptureOwner(storageFor('{')), null);
  const customer = storageFor(JSON.stringify({ mode: 'offline-auth', user: { id: 'customer-1', role: 'customer' } }));
  assert.equal(getOfflineCaptureOwner(customer), null);
  await assert.rejects(resolvePhotoCaptureOwner(async () => ({ data: { session: null } }), customer), /Sign in before adding inspection photos/);
});
