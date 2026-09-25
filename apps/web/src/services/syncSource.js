// Never acknowledge an outbox operation whose local source disappeared.
// The caller records this error and leaves the operation available to retry.
export function requireSyncSource(source, label) {
  if (!source) throw new Error(`${label} is missing on this device. Restore it or re-add it before retrying sync.`);
  return source;
}
