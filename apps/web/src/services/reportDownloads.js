// Combine on-device exports with this user's cloud records. Preserve the
// device path for offline reopening while trusting cloud upload state.
export function mergeReportDownloads(local, cloud) {
  const merged = new Map(cloud.map((row) => [row.id, row]));
  for (const row of local) {
    const remote = merged.get(row.id);
    merged.set(row.id, remote ? {
      ...remote, ...row,
      storage_key: remote.storage_key || row.storage_key || row.storageKey,
      syncStatus: remote.sync_status || row.syncStatus,
    } : row);
  }
  return [...merged.values()].sort((a, b) =>
    Date.parse(b.created || b.created_at || 0) - Date.parse(a.created || a.created_at || 0));
}
