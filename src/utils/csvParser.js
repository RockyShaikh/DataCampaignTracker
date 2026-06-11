import Papa from 'papaparse';
import { buildAliasMap, buildZonePatterns, parseLocation, getEffectiveLocations } from './locationParser.js';

function parseDate(str) {
  if (!str) return null;
  // Handles "2026.04.26", "2026.5.11", etc.
  const parts = str.trim().split('.');
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d);
    }
  }
  // Fallback to native parse
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function parseDuration(str) {
  if (!str || str.trim() === '-' || str.trim() === '') return 0;
  const n = parseFloat(str.trim());
  return isNaN(n) ? 0 : n;
}

function checkValidity(collection, processing) {
  const col = (collection || '').toLowerCase().trim();
  const proc = (processing || '').toLowerCase().trim();
  return (col === 'pass' || col === 'recovered') && (proc === 'pass' || proc === 'minor issue');
}

function checkClean(collection, processing) {
  const col = (collection || '').toLowerCase().trim();
  const proc = (processing || '').toLowerCase().trim();
  return col === 'pass' && proc === 'pass';
}

function logDateToISO(str) {
  const parts = str.trim().split('.');
  if (parts.length === 3) {
    return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
  }
  return null;
}

export function parseCSV(csvText, registry) {
  const aliasMap = buildAliasMap(registry);
  const zonePatterns = buildZonePatterns(registry);

  const result = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: false,
  });

  const allRows = result.data;

  // Row 0-4 are metadata (skip). Row 5 is header (skip). Row 6+ are data.
  const dataRows = allRows.slice(6);

  const runs = [];
  const unmatchedMap = new Map(); // raw location string → { count, duration }
  let lastDate = null;
  let lastDateStr = null;

  for (const row of dataRows) {
    // Date forward-fill
    const rawDate = row[0] ? row[0].trim() : '';
    if (rawDate) {
      const parsed = parseDate(rawDate);
      if (parsed) {
        lastDate = parsed;
        lastDateStr = logDateToISO(rawDate);
      }
    }

    const location = (row[2] || '').trim();
    const type = (row[3] || '').trim().toLowerCase();
    const movement = (row[4] || '').trim().toLowerCase();

    // Skip rows: bootup type, or location starts with "(", or location empty
    if (type === 'bootup') continue;
    if (!location) continue;
    if (location.startsWith('(')) continue;

    const user = (row[1] || '').trim();
    const duration = parseDuration(row[5]);
    const collection = (row[6] || '').trim();
    const processing = (row[7] || '').trim();
    const notes = [row[8], row[9]].map(n => (n || '').trim()).filter(Boolean).join('; ');

    const isValid = checkValidity(collection, processing);
    const isClean = checkClean(collection, processing);

    // Parse location
    const { skip, results, unmatched } = parseLocation(location, aliasMap, zonePatterns);
    if (skip) continue;

    // Track unmatched
    for (const u of unmatched) {
      const key = u.raw;
      if (!unmatchedMap.has(key)) unmatchedMap.set(key, { count: 0, duration: 0 });
      const entry = unmatchedMap.get(key);
      entry.count += 1;
      entry.duration += duration;
    }

    const effectiveLocations = getEffectiveLocations(results, type);

    runs.push({
      date: lastDate,
      dateStr: lastDateStr,
      user,
      rawLocation: location,
      locationResults: effectiveLocations,
      type,
      movement,
      duration,
      durationSec: duration * 60,
      collection,
      processing,
      notes,
      isValid,
      isClean,
      hasLogEntry: true,
      source: 'log',
    });
  }

  const unmatchedList = [...unmatchedMap.entries()].map(([raw, stats]) => ({
    raw,
    count: stats.count,
    duration: stats.duration,
  }));

  return { runs, unmatched: unmatchedList };
}

export { parseCSV as parseLog };
