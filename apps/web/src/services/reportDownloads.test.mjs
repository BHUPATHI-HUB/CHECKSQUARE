import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeReportDownloads } from './reportDownloads.js';

test('includes cloud-only reports from another device', () => {
  const remote = { id: 'remote', created_at: '2026-09-26T12:00:00Z', storage_key: 'user/remote.pdf' };
  assert.deepEqual(mergeReportDownloads([], [remote]), [remote]);
});

test('deduplicates a synced report and keeps its local Documents path', () => {
  const local = { id: 'both', created: '2026-09-25T12:00:00Z', docPath: 'report.pdf', syncStatus: 'failed' };
  const cloud = { id: 'both', created_at: '2026-09-25T12:00:00Z', storage_key: 'user/both.pdf', sync_status: 'synced' };
  assert.deepEqual(mergeReportDownloads([local], [cloud]), [{
    ...cloud, ...local, storage_key: cloud.storage_key, syncStatus: 'synced',
  }]);
});

test('retains pending local exports and sorts newest first', () => {
  const pending = { id: 'pending', created: '2026-09-26T12:00:00Z', syncStatus: 'pending' };
  const cloud = { id: 'older', created_at: '2026-09-24T12:00:00Z' };
  assert.deepEqual(mergeReportDownloads([pending], [cloud]).map((row) => row.id), ['pending', 'older']);
});
