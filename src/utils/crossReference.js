function normLoc(location) {
  return location.trim().toLowerCase()
    .replace(/\s*,\s*/g, ',')
    .replace(/\s+/g, '')
    .split(',').sort().join(',');
}

function makeKey(dateStr, user, location, movement) {
  return `${dateStr}|${user.trim().toLowerCase()}|${normLoc(location)}|${movement.trim().toLowerCase()}`;
}

// Higher score = prefer this log entry when multiple match same key
function logScore(run) {
  const col = (run.collection || '').toLowerCase().trim();
  const proc = (run.processing || '').toLowerCase().trim();
  let score = 0;
  if (col === 'pass' || col === 'recovered') score += 2;
  if (proc === 'pass') score += 1;
  return score;
}

export function crossReference(manifestRuns, logRuns) {
  // Build key → best log run map
  const logMap = new Map();
  for (const run of logRuns) {
    if (!run.dateStr || !run.rawLocation) continue;
    const key = makeKey(run.dateStr, run.user, run.rawLocation, run.movement);
    const existing = logMap.get(key);
    if (!existing || logScore(run) > logScore(existing)) {
      logMap.set(key, run);
    }
  }

  // Attach log fields to manifest runs and derive validity
  for (const mRun of manifestRuns) {
    const key = makeKey(mRun.dateStr, mRun.user, mRun.rawLocation, mRun.movement);
    const lRun = logMap.get(key);
    if (lRun) {
      mRun.collection = lRun.collection;
      mRun.processing = lRun.processing;
      mRun.notes = mRun.notes || lRun.notes;
      mRun.hasLogEntry = true;
      mRun.source = 'both';
    }

    const col = (mRun.collection || '').toLowerCase().trim();
    const proc = (mRun.processing || '').toLowerCase().trim();
    mRun.isValid = mRun.hasLogEntry && (col === 'pass' || col === 'recovered');
    mRun.isClean = mRun.hasLogEntry && col === 'pass' && proc === 'pass';
  }

  return manifestRuns;
}

// Log-only runs = log entries that have no manifest counterpart (failed/unmatched)
export function getLogOnlyRuns(manifestRuns, logRuns) {
  const manifestKeys = new Set(
    manifestRuns.map(r => makeKey(r.dateStr, r.user, r.rawLocation, r.movement))
  );

  return logRuns
    .filter(r => {
      if (!r.dateStr || !r.rawLocation) return false;
      const key = makeKey(r.dateStr, r.user, r.rawLocation, r.movement);
      return !manifestKeys.has(key);
    })
    .map(r => ({
      ...r,
      durationSec: r.duration * 60,
      source: 'log',
      hasLogEntry: true,
      isClean: false,
    }));
}
