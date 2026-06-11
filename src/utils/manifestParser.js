import Papa from 'papaparse';
import { buildAliasMap, buildZonePatterns, parseLocation, getEffectiveLocations } from './locationParser.js';

const TRACE_RE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/;

export function parseManifest(csvText, registry) {
  const aliasMap = buildAliasMap(registry);
  const zonePatterns = buildZonePatterns(registry);

  const result = Papa.parse(csvText, { header: false, skipEmptyLines: false });
  const allRows = result.data;

  const runs = [];
  const unmatchedMap = new Map();

  for (const row of allRows) {
    const trace = (row[5] || '').trim();
    if (!TRACE_RE.test(trace)) continue;

    // trace is YYYY-MM-DD-HH-MM-SS; first 10 chars = YYYY-MM-DD
    const dateStr = trace.slice(0, 10);
    const date = new Date(dateStr + 'T12:00:00');

    const user = (row[6] || '').trim().toLowerCase();
    const location = (row[7] || '').trim();
    const type = (row[8] || '').trim().toLowerCase();
    const movement = (row[9] || '').trim().toLowerCase();
    const durationSec = parseFloat((row[10] || '0').trim()) || 0;
    const notes = [row[11], row[12], row[13], row[14]]
      .map(n => (n || '').trim())
      .filter(Boolean)
      .join('; ');

    if (!location || type === 'bootup' || location.startsWith('(')) continue;

    const { skip, results, unmatched } = parseLocation(location, aliasMap, zonePatterns);
    if (skip) continue;

    for (const u of unmatched) {
      const key = u.raw;
      if (!unmatchedMap.has(key)) unmatchedMap.set(key, { count: 0, duration: 0 });
      const e = unmatchedMap.get(key);
      e.count++;
      e.duration += durationSec / 60;
    }

    runs.push({
      trace,
      dateStr,
      date,
      user,
      rawLocation: location,
      locationResults: getEffectiveLocations(results, type),
      type,
      movement,
      durationSec,
      duration: durationSec / 60,
      collection: null,
      processing: null,
      notes,
      hasLogEntry: false,
      isProcessed: false,
      isFailed: false,
      isValid: false,
      isClean: false,
      source: 'manifest',
    });
  }

  const unmatchedList = [...unmatchedMap.entries()].map(([raw, { count, duration }]) => ({
    raw, count, duration,
  }));

  return { runs, unmatched: unmatchedList };
}
