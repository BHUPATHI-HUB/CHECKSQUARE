#!/usr/bin/env node
/**
 * scripts/seed-test-users.mjs
 *
 * One-shot test-user seeder for the CheckSquare Phase-1 Supabase side-car.
 * Creates the SAME three accounts in BOTH PocketBase (system of record) and
 * Supabase Auth (for the Google / OAuth bridge), so any sign-in path resolves
 * to the same identity.
 *
 * USAGE
 *   PB_URL=http://127.0.0.1:8090 \
 *   PB_SUPERUSER_EMAIL=admin@example.com \
 *   PB_SUPERUSER_PASSWORD='SuperPass!23' \
 *   SUPABASE_URL=https://xxxxx.supabase.co \
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ... \
 *   node scripts/seed-test-users.mjs
 *
 * Re-runs safely — existing users are updated, not duplicated.
 */

import PocketBase from 'pocketbase';
import { createClient } from '@supabase/supabase-js';

const TEST_USERS = [
  { email: 'admin.test@checksquare.dev',     password: 'AdminPass!23',    name: 'Test Admin',     role: 'admin' },
  { email: 'inspector.test@checksquare.dev', password: 'InspectorPass!23', name: 'Test Inspector', role: 'inspector' },
  { email: 'customer.test@checksquare.dev',  password: 'CustomerPass!23',  name: 'Test Customer',  role: 'customer' },
];

const {
  PB_URL = 'http://127.0.0.1:8090',
  PB_SUPERUSER_EMAIL,
  PB_SUPERUSER_PASSWORD,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

if (!PB_SUPERUSER_EMAIL || !PB_SUPERUSER_PASSWORD) {
  console.error('❌  Set PB_SUPERUSER_EMAIL and PB_SUPERUSER_PASSWORD');
  process.exit(1);
}

const pb = new PocketBase(PB_URL);
await pb.collection('_superusers').authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
console.log(`✓ Authed to PocketBase at ${PB_URL}`);

const supa = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;
if (supa) console.log('✓ Supabase admin client ready');
else      console.log('⚠  SUPABASE_URL / SERVICE_ROLE_KEY missing — skipping Supabase seeding');

for (const u of TEST_USERS) {
  // ── PocketBase upsert ──────────────────────────────────────────────────
  let pbRecord;
  try {
    pbRecord = await pb.collection('users').getFirstListItem(`email = "${u.email}"`);
    await pb.collection('users').update(pbRecord.id, { name: u.name, role: u.role, verified: true });
    console.log(`  · PB updated: ${u.email}  (role=${u.role})`);
  } catch (_) {
    pbRecord = await pb.collection('users').create({
      email: u.email, password: u.password, passwordConfirm: u.password,
      name: u.name, role: u.role, verified: true, emailVisibility: false,
    });
    console.log(`  ✓ PB created: ${u.email}  (role=${u.role})`);
  }

  // ── Supabase Auth upsert (only if configured) ─────────────────────────
  if (supa) {
    const { data: list } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const existing = list?.users?.find((x) => x.email?.toLowerCase() === u.email.toLowerCase());
    if (existing) {
      await supa.auth.admin.updateUserById(existing.id, {
        password: u.password,
        email_confirm: true,
        user_metadata: { full_name: u.name, pocketbase_id: pbRecord.id, role: u.role },
      });
      console.log(`  · Supabase updated: ${u.email}`);
    } else {
      await supa.auth.admin.createUser({
        email: u.email, password: u.password, email_confirm: true,
        user_metadata: { full_name: u.name, pocketbase_id: pbRecord.id, role: u.role },
      });
      console.log(`  ✓ Supabase created: ${u.email}`);
    }
  }
}

console.log('\n✅  Seed complete.  Test credentials:\n');
console.table(TEST_USERS.map(({ email, password, role }) => ({ email, password, role })));
