import { getRunKey } from './runKey.js';

const VALID_ORIENTATIONS = ['forward', 'backward', 'lateral'];
const HAIRCUT = 1.0;

// A manual match may store a single `floor` (legacy) or `floors` array (multi-floor).
function matchFloors(match) {
  if (Array.isArray(match.floors)) return match.floors;
  if (match.floor != null) return [match.floor];
  return [];
}

// Campaign-valid = processed AND not failed, and backed by a real manifest trace.
// This is the basis for TOTAL CAMPAIGN HOURS (header + Overview big number).
export function getValidRuns(runs) {
  return runs.filter(r => r.source !== 'log' && r.isValid);
}

export function getTotalValidHours(runs) {
  return (getValidRuns(runs).reduce((s, r) => s + r.duration, 0) * HAIRCUT) / 60;
}

// Pending = logged in the collection log but not yet processed into the manifest
// (no trace yet, not failed). Shown separately; NOT in the campaign total.
export function getIncompleteRuns(runs) {
  return runs.filter(r => r.source === 'log' && !r.isFailed);
}

export function getIncompleteHours(runs) {
  return (getIncompleteRuns(runs).reduce((s, r) => s + r.duration, 0) * HAIRCUT) / 60;
}

export function getTotalHours(runs) {
  return (runs.reduce((s, r) => s + r.duration, 0) * HAIRCUT) / 60;
}

export function getRawMinutes(runs) {
  return runs
    .filter(r => r.source !== 'log')
    .reduce((s, r) => s + r.duration, 0);
}

export function getCleanMinutes(runs) {
  return runs
    .filter(r => r.isClean)
    .reduce((s, r) => s + r.duration, 0);
}

// Returns coverage[buildingId][floor][orientation] = { status: 'green'|'yellow', runs: [] }
// Green = at least one isClean run; Yellow = any manifest run but none clean; absent = gray
export function getFloorCoverage(runs, matches = {}) {
  const coverage = {};

  for (const run of runs) {
    if (run.source === 'log') continue;
    if (!VALID_ORIENTATIONS.includes(run.movement)) continue;

    for (const loc of run.locationResults) {
      if (!loc.creditFloor || !loc.building) continue;
      const bid = loc.building.id;
      const floor = loc.floor;
      const orientation = run.movement;

      if (!coverage[bid]) coverage[bid] = {};
      if (!coverage[bid][floor]) coverage[bid][floor] = {};
      if (!coverage[bid][floor][orientation]) {
        coverage[bid][floor][orientation] = { status: 'yellow', runs: [] };
      }
      const cell = coverage[bid][floor][orientation];
      cell.runs.push(run);
      if (run.isClean) cell.status = 'green';
    }
  }

  // Apply manual matches (run → building + one or more floors, direction from run's movement)
  for (const [runKey, match] of Object.entries(matches)) {
    const { buildingId } = match;
    const matchedRun = runs.find(r => getRunKey(r) === runKey);
    if (!matchedRun || matchedRun.source === 'log') continue;
    if (!VALID_ORIENTATIONS.includes(matchedRun.movement)) continue;

    const orientation = matchedRun.movement;
    for (const floor of matchFloors(match)) {
      if (!coverage[buildingId]) coverage[buildingId] = {};
      if (!coverage[buildingId][floor]) coverage[buildingId][floor] = {};
      if (!coverage[buildingId][floor][orientation]) {
        coverage[buildingId][floor][orientation] = { status: 'yellow', runs: [] };
      }
      const cell = coverage[buildingId][floor][orientation];
      if (!cell.runs.includes(matchedRun)) cell.runs.push(matchedRun);
      if (matchedRun.isClean) cell.status = 'green';
    }
  }

  return coverage;
}

export function getCellStatus(coverage, buildingId, floor, orientation) {
  return coverage[buildingId]?.[floor]?.[orientation]?.status ?? 'gray';
}

// Fully covered = all 3 orientations are GREEN (double-pass clean)
export function isFloorFullyCovered(coverage, buildingId, floor) {
  const fc = coverage[buildingId]?.[floor];
  if (!fc) return false;
  return VALID_ORIENTATIONS.every(o => fc[o]?.status === 'green');
}

// Any coverage (green or yellow) on this floor
export function isFloorAnyCovered(coverage, buildingId, floor) {
  const fc = coverage[buildingId]?.[floor];
  if (!fc) return false;
  return VALID_ORIENTATIONS.some(o => fc[o]);
}

export function getBuildingProgress(building, coverage) {
  const floors = building.floors || [];
  const total = floors.length * VALID_ORIENTATIONS.length;
  let green = 0;
  let yellow = 0;
  for (const floor of floors) {
    for (const o of VALID_ORIENTATIONS) {
      const status = getCellStatus(coverage, building.id, floor, o);
      if (status === 'green') green++;
      else if (status === 'yellow') yellow++;
    }
  }
  return { fullyRecorded: green, partialCovered: yellow, total };
}

export function getBuildingValidMinutes(buildingId, runs) {
  let total = 0;
  for (const run of runs) {
    if (!run.isValid) continue;
    const touched = run.locationResults.some(l => l.building?.id === buildingId);
    if (touched) total += run.duration;
  }
  return total;
}

export function getActiveBuildings(runs, registry) {
  const ids = new Set();
  for (const run of runs) {
    if (run.source === 'log') continue;
    for (const loc of run.locationResults) {
      if (loc.building) ids.add(loc.building.id);
    }
  }
  return ids;
}

export function getFullyCoveredFloorCount(runs, registry, matches) {
  const coverage = getFloorCoverage(runs, matches);
  let count = 0;
  let total = 0;
  for (const b of registry.buildings) {
    for (const f of b.floors) {
      total++;
      if (isFloorFullyCovered(coverage, b.id, f)) count++;
    }
  }
  return { count, total };
}

export function getOrientationBalance(runs) {
  const mins = { forward: 0, backward: 0, lateral: 0 };
  for (const run of getValidRuns(runs)) {
    if (VALID_ORIENTATIONS.includes(run.movement)) {
      mins[run.movement] += run.duration;
    }
  }
  return {
    forward: (mins.forward * HAIRCUT) / 60,
    backward: (mins.backward * HAIRCUT) / 60,
    lateral: (mins.lateral * HAIRCUT) / 60,
  };
}

// Cross-tab: campaign hours by movement (forward/backward/lateral) × environment.
// Environment comes straight from the manifest `type` column (indoor/outdoor/etc.)
// — no location-string matching needed. "mixed" type counts in both rows.
const OUTDOOR_TYPES = new Set(['outdoor', 'park', 'campus', 'night']);
export function environmentOfType(type) {
  const t = (type || '').toLowerCase().trim();
  if (t === 'mixed') return ['indoor', 'outdoor'];
  if (OUTDOOR_TYPES.has(t)) return ['outdoor'];
  return ['indoor']; // indoor, stairs, room, or anything else
}

export function getMovementByEnvironment(runs) {
  const mins = {
    indoor: { forward: 0, backward: 0, lateral: 0 },
    outdoor: { forward: 0, backward: 0, lateral: 0 },
  };
  for (const run of getValidRuns(runs)) {
    const m = run.movement;
    if (!VALID_ORIENTATIONS.includes(m)) continue;
    for (const env of environmentOfType(run.type)) {
      mins[env][m] += run.duration;
    }
  }
  const h = v => (v * HAIRCUT) / 60;
  const rows = ['indoor', 'outdoor'].map(env => {
    const f = h(mins[env].forward), b = h(mins[env].backward), l = h(mins[env].lateral);
    return { env, forward: f, backward: b, lateral: l, total: f + b + l };
  });
  const colTotal = o => rows.reduce((s, r) => s + r[o], 0);
  return {
    rows,
    colTotals: { forward: colTotal('forward'), backward: colTotal('backward'), lateral: colTotal('lateral') },
    grandTotal: rows.reduce((s, r) => s + r.total, 0),
  };
}

export function getCollectionByType(runs) {
  const map = {};
  for (const run of getValidRuns(runs)) {
    const t = run.type || 'unknown';
    map[t] = (map[t] || 0) + run.duration;
  }
  return Object.entries(map)
    .map(([type, mins]) => ({ type, hours: (mins * HAIRCUT) / 60 }))
    .sort((a, b) => b.hours - a.hours);
}

export function getHoursPerBuilding(runs, registry) {
  const map = {};
  for (const run of getValidRuns(runs)) {
    const seen = new Set();
    for (const loc of run.locationResults) {
      if (loc.building && !seen.has(loc.building.id)) {
        seen.add(loc.building.id);
        const bid = loc.building.id;
        map[bid] = (map[bid] || 0) + run.duration;
      }
    }
  }
  return Object.entries(map)
    .map(([id, mins]) => {
      const b = registry.buildings.find(b => b.id === id);
      return { id, name: b?.name ?? id, hours: (mins * HAIRCUT) / 60 };
    })
    .sort((a, b) => b.hours - a.hours);
}

export function getCumulativeValidHours(runs) {
  const valid = getValidRuns(runs).filter(r => r.date);
  valid.sort((a, b) => a.date - b.date);

  const points = [];
  let cumulative = 0;
  for (const run of valid) {
    cumulative += run.duration;
    const dateStr = run.date.toISOString().slice(0, 10);
    if (points.length && points[points.length - 1].date === dateStr) {
      points[points.length - 1].hours = (cumulative * HAIRCUT) / 60;
    } else {
      points.push({ date: dateStr, hours: (cumulative * HAIRCUT) / 60 });
    }
  }
  return points;
}

export function getGrowthRate(runs) {
  const now = new Date();
  const MS_WEEK = 7 * 24 * 60 * 60 * 1000;
  const weekAgo = new Date(now - MS_WEEK);
  const twoWeeksAgo = new Date(now - 2 * MS_WEEK);

  const validRuns = getValidRuns(runs).filter(r => r.date);
  const thisWeekMins = validRuns
    .filter(r => r.date >= weekAgo)
    .reduce((s, r) => s + r.duration, 0);
  const lastWeekMins = validRuns
    .filter(r => r.date >= twoWeeksAgo && r.date < weekAgo)
    .reduce((s, r) => s + r.duration, 0);

  const thisWeekHours = (thisWeekMins * HAIRCUT) / 60;
  const lastWeekHours = (lastWeekMins * HAIRCUT) / 60;
  const delta = thisWeekHours - lastWeekHours;
  const pct = lastWeekHours > 0 ? (delta / lastWeekHours) * 100 : null;

  return { thisWeekHours, lastWeekHours, delta, pct };
}

// Leaderboard = processed hours per person, straight from the manifest
// (campaign-valid runs). Sums to the campaign total. Log-only rows (no trace)
// are not counted, keeping the leaderboard consistent with the manifest numbers.
export function getLeaderboard(runs, registry) {
  const collectors = {};
  for (const run of getValidRuns(runs)) {
    const user = run.user || 'unknown';
    if (!collectors[user]) {
      collectors[user] = { user, totalMinutes: 0, buildingMinutes: {} };
    }
    const c = collectors[user];
    c.totalMinutes += run.duration;
    const seen = new Set();
    for (const loc of run.locationResults) {
      if (loc.building && !seen.has(loc.building.id)) {
        seen.add(loc.building.id);
        c.buildingMinutes[loc.building.id] = (c.buildingMinutes[loc.building.id] || 0) + run.duration;
      }
    }
  }

  return Object.values(collectors)
    .map(c => {
      const topBuildingId = Object.entries(c.buildingMinutes).sort((a, b) => b[1] - a[1])[0]?.[0];
      const topBuilding = topBuildingId
        ? registry.buildings.find(b => b.id === topBuildingId)?.name ?? topBuildingId
        : '—';
      return {
        ...c,
        rawHours: (c.totalMinutes * HAIRCUT) / 60,
        topBuilding,
      };
    })
    .sort((a, b) => b.rawHours - a.rawHours);
}

export function getBuildingStairsRuns(buildingId, runs) {
  return runs.filter(r => r.locationResults.some(l =>
    l.building?.id === buildingId && l.type === 'stairs'
  ));
}

export function getBuildingWholeBuildingRuns(buildingId, runs) {
  return runs.filter(r => r.locationResults.some(l =>
    l.building?.id === buildingId && l.type === 'whole-building'
  ));
}
