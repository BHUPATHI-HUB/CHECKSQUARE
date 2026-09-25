import assert from 'node:assert/strict';
import test from 'node:test';
import { requireSyncSource } from './syncSource.js';

test('missing photo, inspection, or report source fails instead of acknowledging sync', () => {
  for (const label of ['Photo image-1', 'Inspection inspection-1', 'Report report-1']) {
    assert.throws(() => requireSyncSource(null, label), new RegExp(`${label} is missing`));
  }
});

test('present local source is passed through for upload', () => {
  const source = new Blob(['photo']);
  assert.equal(requireSyncSource(source, 'Photo image-1'), source);
});
