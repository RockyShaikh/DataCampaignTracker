// Build alias → building lookup map
export function buildAliasMap(registry) {
  const map = new Map();
  for (const b of registry.buildings) {
    for (const alias of (b.aliases || [])) {
      map.set(alias.toLowerCase().trim(), b);
    }
  }
  return map;
}

// Build zone pattern list for glob matching of unrecognized location strings
export function buildZonePatterns(registry) {
  return (registry.buildings || [])
    .filter(b => b.type === 'zone' && b.locationPatterns?.length > 0)
    .map(b => ({ building: b, patterns: b.locationPatterns }));
}

function globMatch(str, pattern) {
  const re = new RegExp(
    '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
    'i'
  );
  return re.test(str.trim());
}

function findZoneForSegment(raw, zonePatterns) {
  for (const { building, patterns } of zonePatterns) {
    for (const pat of patterns) {
      if (globMatch(raw, pat)) {
        const floor = building.floors?.[0] ?? '1';
        return { building, type: 'specific-floor', floor, rawSegment: raw };
      }
    }
  }
  return null;
}

function normalizeBuildingKey(str) {
  return str.toLowerCase().trim().replace(/\s+hall$/, '').trim();
}

function findBuilding(raw, aliasMap) {
  const key = normalizeBuildingKey(raw);
  if (aliasMap.has(key)) return aliasMap.get(key);
  const stripped = key.replace(/[\d\-]+$/, '').trim();
  if (stripped && aliasMap.has(stripped)) return aliasMap.get(stripped);
  return null;
}

function expandFloorRange(start, end, building) {
  const floors = building.floors || [];
  const startLower = start.toLowerCase();
  const endLower = end.toLowerCase();
  const startNum = parseInt(start, 10);
  const endNum = parseInt(end, 10);

  if (!isNaN(startNum) && !isNaN(endNum)) {
    const result = [];
    for (let i = Math.min(startNum, endNum); i <= Math.max(startNum, endNum); i++) {
      result.push(String(i));
    }
    return result;
  }

  const si = floors.findIndex(f => f.toLowerCase() === startLower);
  const ei = floors.findIndex(f => f.toLowerCase() === endLower);
  if (si !== -1 && ei !== -1) {
    const lo = Math.min(si, ei);
    const hi = Math.max(si, ei);
    return floors.slice(lo, hi + 1);
  }

  return [startLower, endLower];
}

function parseFloorPart(floorStr, building) {
  const f = floorStr.trim().toLowerCase();

  if (building.floorAliases && building.floorAliases[f]) {
    return [{ floor: building.floorAliases[f], type: 'specific-floor' }];
  }

  if (f === 'stairs') return [{ floor: 'stairs', type: 'stairs' }];

  const rangeMatch = f.match(/^([a-z0-9]+)-([a-z0-9]+)$/);
  if (rangeMatch) {
    const floors = expandFloorRange(rangeMatch[1], rangeMatch[2], building);
    return floors.map(fl => ({ floor: fl, type: 'specific-floor' }));
  }

  if (building.roomToFloor && building.roomToFloor[f]) {
    return [{ floor: building.roomToFloor[f], type: 'specific-floor' }];
  }

  return [{ floor: f, type: 'specific-floor' }];
}

function parseSegment(segment, aliasMap) {
  const s = segment.trim();
  if (!s) return [];

  const dotIdx = s.indexOf('.');
  if (dotIdx !== -1) {
    const buildingPart = s.slice(0, dotIdx);
    const floorPart = s.slice(dotIdx + 1);
    const building = findBuilding(buildingPart, aliasMap);
    if (building) {
      const floorResults = parseFloorPart(floorPart, building);
      return floorResults.map(fr => ({ building, ...fr, rawSegment: s }));
    }
    return [{ type: 'unmatched', rawSegment: s }];
  }

  const sortedAliases = [...aliasMap.entries()].sort((a, b) => b[0].length - a[0].length);
  const sLower = s.toLowerCase();
  for (const [alias, building] of sortedAliases) {
    if (sLower.startsWith(alias)) {
      const remainder = s.slice(alias.length).trim();
      if (!remainder) {
        return [{ building, type: 'whole-building', rawSegment: s }];
      }
      const floorResults = parseFloorPart(remainder, building);
      return floorResults.map(fr => ({ building, ...fr, rawSegment: s }));
    }
  }

  return [{ type: 'unmatched', rawSegment: s }];
}

export function parseLocation(locationStr, aliasMap, zonePatterns = []) {
  if (!locationStr || !locationStr.trim()) return { skip: true, results: [], unmatched: [] };

  const loc = locationStr.trim();
  if (loc.startsWith('(')) return { skip: true, results: [], unmatched: [] };

  const segments = loc.split(/,\s*/).map(s => s.trim()).filter(Boolean);

  const results = [];
  const unmatched = [];

  for (const segment of segments) {
    const parsed = parseSegment(segment, aliasMap);
    for (const p of parsed) {
      if (p.type === 'unmatched') {
        const zoneResult = findZoneForSegment(segment, zonePatterns);
        if (zoneResult) {
          results.push(zoneResult);
        } else {
          unmatched.push({ raw: segment });
        }
      } else {
        results.push(p);
      }
    }
  }

  return { skip: false, results, unmatched };
}

export function getEffectiveLocations(results, runType) {
  return results.map(r => ({
    ...r,
    creditFloor: r.type === 'specific-floor',
    creditBuilding: !!r.building,
  }));
}
