import { test } from 'node:test';
import assert from 'node:assert/strict';

const loadStore = () => import(`../apps/web/src/lib/localStore.js?case=${Math.random()}`);

test('missing IndexedDB rejects durable writes rather than confirming a save', async () => {
  const store = await loadStore();
  await assert.rejects(store.savePhotoAndQueue({ path: 'photo', blob: new Blob(['photo']), ownerId: 'inspector' }), /unavailable/);
  await assert.rejects(store.enqueue({ type: 'uploadPhoto', path: 'photo' }), /unavailable/);
  await assert.rejects(store.savePendingInspectionAndQueue({ id: 'report' }), /unavailable/);
});

function installDatabase({ failQueue = false } = {}) {
  const committed = [];
  let finish;
  globalThis.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { transaction(names, mode) {
        assert.deepEqual(names, ['inspections', 'outbox']);
        assert.equal(mode, 'readwrite');
        const staged = [];
        const transaction = {
          objectStore(name) { return {
            put(record) { staged.push({ name, record }); },
            add(record) {
              if (failQueue) throw new Error('Quota exceeded');
              staged.push({ name, record });
            },
          }; },
          abort() { transaction.onabort?.(); },
        };
        finish = () => { committed.push(...staged); transaction.oncomplete(); };
        return transaction;
      } };
      request.onsuccess();
    });
    return request;
  } };
  return { committed, finish: () => finish() };
}

test('save confirms only after both report and retry operation commit', async () => {
  const database = installDatabase();
  try {
    const store = await loadStore();
    let confirmed = false;
    const saving = store.savePendingInspectionAndQueue({ id: 'stable-report', inspector: 'owner' })
      .then(() => { confirmed = true; });
    await new Promise(setImmediate);
    assert.equal(confirmed, false);
    assert.equal(database.committed.length, 0);
    database.finish();
    await saving;
    assert.equal(confirmed, true);
    assert.equal(database.committed[0].record.id, 'stable-report');
    assert.equal(database.committed[1].record.inspectionId, 'stable-report');
    assert.equal(database.committed[1].record.id, undefined); // queue owns its numeric ID
  } finally { delete globalThis.indexedDB; }
});

test('queue storage failure aborts and never confirms an offline save', async () => {
  const database = installDatabase({ failQueue: true });
  try {
    const store = await loadStore();
    await assert.rejects(store.savePendingInspectionAndQueue({ id: 'report' }));
    assert.deepEqual(database.committed, []);
  } finally { delete globalThis.indexedDB; }
});

test('photo and retry operation commit together under the same account', async () => {
  const committed = [];
  let complete;
  globalThis.indexedDB = { open() {
    const request = {};
    queueMicrotask(() => {
      request.result = { transaction(names, mode) {
        assert.deepEqual(names, ['photos', 'outbox']);
        assert.equal(mode, 'readwrite');
        const staged = [];
        const transaction = {
          objectStore(name) { return {
            put(record) { staged.push({ name, record }); },
            add(record) { staged.push({ name, record }); },
          }; },
          abort() { transaction.onabort?.(); },
        };
        complete = () => { committed.push(...staged); transaction.oncomplete(); };
        return transaction;
      } };
      request.onsuccess();
    });
    return request;
  } };
  try {
    const store = await loadStore();
    let confirmed = false;
    const saving = store.savePhotoAndQueue({
      path: 'draft/room/p.jpg', blob: new Blob(['photo']), ownerId: 'inspector',
    }).then(() => { confirmed = true; });
    await new Promise(setImmediate);
    assert.equal(confirmed, false);
    assert.equal(committed.length, 0);
    complete();
    await saving;
    assert.equal(committed[0].record.ownerId, 'inspector');
    assert.equal(committed[1].record.ownerId, 'inspector');
    assert.equal(committed[1].record.path, 'draft/room/p.jpg');
    assert.equal(confirmed, true);
  } finally { delete globalThis.indexedDB; }
});

test('photo save rejects missing account and unavailable local storage', async () => {
  const store = await loadStore();
  await assert.rejects(store.savePhotoAndQueue({ path: 'p', blob: new Blob(['photo']) }), /account/);
  await assert.rejects(store.savePhotoAndQueue({ path: 'p', blob: new Blob(['photo']), ownerId: 'inspector' }), /unavailable/);
});
