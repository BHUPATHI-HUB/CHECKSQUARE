import test from 'node:test';
import assert from 'node:assert/strict';
import { persistChatMessage } from '../apps/web/src/services/chatAttachments.js';

const file = (name = 'room.jpg') => Object.assign(new Blob(['photo'], { type: 'image/jpeg' }), { name });

function client({ failUpload = false, failInsert = false } = {}) {
  const calls = [];
  const storage = {
    upload: async (path, body) => {
      calls.push(['upload', path, body.name]);
      return { error: failUpload ? new Error('Upload failed') : null };
    },
    remove: async (paths) => { calls.push(['remove', paths]); return { error: null }; },
  };
  return {
    calls,
    storage: { from: (bucket) => { assert.equal(bucket, 'chat-attachments'); return storage; } },
    from: (table) => {
      assert.equal(table, 'messages');
      return { insert: (row) => {
        calls.push(['insert', row]);
        return { select: () => ({ single: async () => ({ data: row, error: failInsert ? new Error('Message failed') : null }) }) };
      } };
    },
  };
}

test('uploads selected files before inserting their durable message references', async () => {
  const db = client();
  const row = await persistChatMessage(db, { chat_id: 'chat-id', content: 'See photo' }, [file()]);
  assert.deepEqual(db.calls.map(([action]) => action), ['upload', 'insert']);
  assert.equal(row.attachments[0].name, 'room.jpg');
  assert.equal(row.attachments[0].type, 'image/jpeg');
  assert.match(row.attachments[0].path, /^chat-id\//);
});

test('failed upload does not send a message or report success', async () => {
  const db = client({ failUpload: true });
  await assert.rejects(persistChatMessage(db, { chat_id: 'chat-id' }, [file()]), /Upload failed/);
  assert.deepEqual(db.calls.map(([action]) => action), ['upload']);
});

test('failed message insert removes uploaded files before surfacing the error', async () => {
  const db = client({ failInsert: true });
  await assert.rejects(persistChatMessage(db, { chat_id: 'chat-id' }, [file()]), /Message failed/);
  assert.deepEqual(db.calls.map(([action]) => action), ['upload', 'insert', 'remove']);
  assert.deepEqual(db.calls[2][1], [db.calls[0][1]]);
});
