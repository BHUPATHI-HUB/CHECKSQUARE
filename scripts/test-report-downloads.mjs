import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SourceTextModule, createContext } from 'node:vm';

const source = await readFile(new URL('../apps/web/src/services/reportDownloadRecord.js', import.meta.url), 'utf8');
const module = new SourceTextModule(source, { context: createContext({}) });
await module.link(() => { throw new Error('Unexpected import'); });
await module.evaluate();
const { rowToReportDownload, hasStoredReport, deleteStoredReport } = module.namespace;

test('Supabase report row enables re-download and shows its saved metadata', () => {
  const row = rowToReportDownload({ id: 'r1', storage_key: 'owner/report.pdf', file_size: 2048,
    created_at: '2026-10-18T00:00:00Z', inspection_id: 'i1' });
  assert.equal(hasStoredReport(row), true);
  assert.equal(row.storageKey, 'owner/report.pdf');
  assert.equal(row.fileSize, 2048);
  assert.equal(row.created, '2026-10-18T00:00:00Z');
  assert.equal(row.inspection, 'i1');
});

function clientForDelete({ removalError } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, 'report_downloads');
      return {
        select(column) {
          assert.equal(column, 'storage_key');
          return { eq(field, id) {
            assert.equal(field, 'id'); assert.equal(id, 'r1');
            return { single: async () => ({ data: { storage_key: 'owner/report.pdf' }, error: null }) };
          } };
        },
        delete() {
          calls.push('delete-row');
          return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'r1' }, error: null }) }) }) };
        },
      };
    },
    storage: { from(bucket) {
      assert.equal(bucket, 'reports');
      return { remove: async (paths) => { calls.push(`remove:${paths[0]}`); return { error: removalError || null }; } };
    } },
  };
}

test('permanent delete removes the stored file before its row', async () => {
  const client = clientForDelete();
  await deleteStoredReport(client, 'r1');
  assert.deepEqual(client.calls, ['remove:owner/report.pdf', 'delete-row']);
});

test('failed storage removal leaves the record available for retry', async () => {
  const client = clientForDelete({ removalError: new Error('storage unavailable') });
  await assert.rejects(deleteStoredReport(client, 'r1'), /storage unavailable/);
  assert.deepEqual(client.calls, ['remove:owner/report.pdf']);
});
