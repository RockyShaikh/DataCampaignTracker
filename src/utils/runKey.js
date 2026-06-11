// Returns a stable string key for a run, preferring the manifest trace ID.
// Used for both `paths` and `matches` lookups.
export function getRunKey(run) {
  if (run.trace) return run.trace;
  return `${run.dateStr}|${run.user}|${run.rawLocation}|${run.movement}`;
}
