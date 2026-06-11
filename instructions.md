# Outdoor Path Recording — Implementation Instructions

## Background & Motivation

The current outdoor coverage system uses **zones** — closed polygon areas drawn on the map. Runs are associated with zones via `locationPatterns` wildcards. This is unintuitive because:
- Outdoor data collection is always done by walking a path, not covering an area
- Mapping multiple runs to one zone loses per-run spatial information
- Drawing a polygon doesn't reflect how collection actually happens

**New approach:** Replace zones with **paths** (open polylines). Each outdoor run in the RunLog gets a "Record Path" button. The user clicks points on the map to trace the route they walked. The path is associated directly with that specific run (via its trace ID or run key), and is displayed on the CampusMap as a colored polyline.

---

## User Stories

### US-1: Record a Path for an Outdoor Run
**As a** data collection coordinator,  
**I want to** attach a GPS path to a specific outdoor run in the RunLog,  
**So that** I can see exactly where the collector walked on the map.

**Acceptance Criteria:**
- Each run row in RunLog has a "Path" button (map pin icon or similar)
- Clicking the button opens the CampusMap tab in "path recording" mode for that run
- In recording mode, clicking on the map adds waypoints forming a polyline
- The user can undo the last point
- When satisfied, the user clicks "Save Path" — the path is persisted and the mode exits
- The run row in RunLog shows a visual indicator that a path has been recorded

### US-2: View Paths on the Map
**As a** data collection coordinator,  
**I want to** see all recorded outdoor paths on the campus map,  
**So that** I can understand spatial coverage across the outdoor environment.

**Acceptance Criteria:**
- Saved paths are rendered as polylines on the map in CampusMap
- Path color reflects run validity: green (isClean), yellow (isValid but not clean), gray (unverified/failed)
- Hovering or clicking a path shows a popup with: collector name, date, duration, run status
- A toggle button (matching the existing Indoor/Outdoor toggles) shows/hides all paths

### US-3: Edit or Delete a Recorded Path
**As a** data collection coordinator,  
**I want to** correct a path I recorded incorrectly,  
**So that** the map reflects the actual route walked.

**Acceptance Criteria:**
- Each run row with a saved path has an "Edit Path" button (replaces "Record Path")
- Clicking it re-enters path recording mode with the existing points pre-loaded
- The user can add, undo, or clear all points and re-save
- A "Clear Path" / delete option removes the path entirely

### US-4: Remove the Old Zone System
**As a** developer,  
**I want to** remove the zone polygon drawing UI,  
**So that** the interface is not confusing with two conflicting outdoor paradigms.

**Acceptance Criteria:**
- Zone polygon drawing is removed from CampusMap (the "+ Draw Zone" button and drawing workflow)
- Existing zone registry entries with `type: "zone"` are ignored or migrated
- The CampusMap tab still exists for viewing building markers and outdoor paths
- The "Outdoor" toggle now controls path visibility (instead of zone polygon visibility)

---

## Data Model

### New: `OutdoorPath` Object
```js
{
  runKey: string,           // trace ID ("YYYY-MM-DD-HH-MM-SS") OR "dateStr|user|location|movement"
  points: [{ lat, lng }],   // Ordered waypoints; minimum 2 to render
  recordedAt: string,       // ISO timestamp of when path was saved
}
```

### Storage
Paths are stored as a flat array in a new server file, accessed via:
- `GET /api/paths` — returns `OutdoorPath[]`
- `POST /api/paths` — saves a single path (upsert by `runKey`); body: `OutdoorPath`
- `DELETE /api/paths/:runKey` — removes a path

Server should upsert: if a path already exists for a `runKey`, overwrite it.

### Run Key Convention
Use the run's `trace` field when available (manifest runs). For log-only runs, use the same key format as `matches`: `"dateStr|user|rawLocation|movement"`. This must be computed consistently — extract the key-building logic into a shared utility `getRunKey(run)` in `utils/runKey.js` (or similar).

---

## Implementation Requirements

### 1. Server Changes (`server.js`)

Add three new endpoints:
```
GET  /api/paths           → read paths.json, return [] if missing
POST /api/paths           → upsert path by runKey in paths.json
DELETE /api/paths/:runKey → remove path by runKey from paths.json
```

The `paths.json` file lives alongside the other server-persisted JSON files.

---

### 2. AppContext Changes (`src/context/AppContext.jsx`)

- Add `paths` state: `OutdoorPath[]`, loaded from `GET /api/paths` on refresh
- Add `savePath(path: OutdoorPath)` → POST to `/api/paths`, then refresh
- Add `deletePath(runKey: string)` → DELETE to `/api/paths/:runKey`, then refresh
- Add `pendingPathRunKey` state (string | null) — when set, navigates to CampusMap in recording mode for that run
- Add `setPendingPathRunKey(key)` action

---

### 3. Shared Utility: `src/utils/runKey.js`

```js
// Returns a stable string key for a run, preferring trace ID
export function getRunKey(run) {
  if (run.trace) return run.trace;
  return `${run.dateStr}|${run.user}|${run.rawLocation}|${run.movement}`;
}
```

This key is used for both `paths` and `matches` lookups.

---

### 4. RunLog Changes (`src/components/tabs/RunLog.jsx`)

For each run row, add a path button in a new "Path" column (rightmost, after the existing action column):
- If no path exists for this run: render a faint "Record Path" button (map-pin icon + "Record")
- If a path exists: render a green "Edit Path" button (and optionally a small "✓ path" badge)
- Clicking either calls `setPendingPathRunKey(getRunKey(run))` then navigates to the CampusMap tab (`setActiveTab("campus-map")`)

Only show the path button for runs where the location suggests outdoor collection. Heuristic: at least one `locationResult` has `type: "unmatched"` OR the run's `rawLocation` matches a loose outdoor keyword (e.g., contains "outdoor", "campus", "path", "outside"). Alternatively, show it for all runs and let the user decide — simpler and avoids false negatives.

---

### 5. CampusMap Changes (`src/components/tabs/CampusMap.jsx`)

#### Path Recording Mode

When `pendingPathRunKey` is non-null (set by RunLog), CampusMap enters **path recording mode**:

- Show a top banner: `"Recording path for: [run label]"` with a cancel (×) button
- Load any existing path for this runKey as the initial `drawnPoints` state
- Replace the existing zone drawing controls with path controls:
  - **Undo last point** button
  - **Clear all** button  
  - **Save Path** button (disabled if fewer than 2 points)
- On "Save Path": call `savePath({ runKey, points: drawnPoints, recordedAt: new Date().toISOString() })`, then clear `pendingPathRunKey`
- On cancel: clear `pendingPathRunKey`, no save

#### Zone Drawing Removal

- Remove the "+ Draw Zone" button and all `drawingMode` / `ZoneForm` state/logic
- Remove the `ZoneForm` modal component (or leave the file but stop rendering it)
- Zone entries already in the registry (`type: "zone"`) should just be ignored on the map (no polygon rendered)

#### Path Display

Pass `paths` and `pendingPathRunKey` down to `EmbeddedMap` as new props:
```js
paths={paths}
recordingRunKey={pendingPathRunKey}
recordingPoints={drawnPoints}
onMapClick={handleMapClick}
```

#### Outdoor Toggle

The existing "Outdoor" toggle now controls whether saved paths are visible (instead of zone polygons). Keep the same toggle UI.

---

### 6. EmbeddedMap Changes (`src/components/EmbeddedMap.jsx`)

#### Remove Zone Polygon Rendering
- Remove the block that renders `<Polygon>` for registry entries with `type: "zone"`
- Remove any zone-specific logic from the drawing preview

#### Add Path Polyline Rendering
When `showOutdoor` is true, for each `OutdoorPath` in `paths` with ≥ 2 points:
1. Look up the corresponding run by matching `path.runKey === getRunKey(run)` across `runs`
2. Determine color based on matched run:
   - `#15803D` (green) → `isClean: true`
   - `#D97706` (yellow) → `isValid: true` but not clean
   - `#9CA3AF` (gray) → invalid/unverified/no match
3. Render `<Polyline positions={path.points.map(p => [p.lat, p.lng])} color={color} weight={3} opacity={0.8} />`
4. Add a `<Popup>` on click:
   ```
   [User name] — [date]
   Duration: [X] min | Status: [Valid/Unverified/etc.]
   [Notes if any]
   ```

#### Add Recording Preview Polyline
When `recordingRunKey` is set and `recordingPoints` has ≥ 1 points:
- Render a dashed red `<Polyline>` for the in-progress path (same as current drawing preview)
- Render `<CircleMarker>` for each point (first point radius 7, others radius 5)
- Map click events should add a point: call `onMapClick({ lat, lng })`
- Do NOT render building pins in recording mode (hide them to reduce clutter) — or keep them but make them non-interactive

---

### 7. Migration / Backward Compatibility

- Old zone entries in `buildings.json` with `type: "zone"` are silently ignored (no polygon rendered, no location matching)
- No active migration needed — zones weren't providing accurate spatial data anyway
- `locationPatterns` on old zone entries can be left as-is since zone matching in `locationParser.js` can be removed or left harmless

---

## Implementation Order

1. **`server.js`** — add `/api/paths` endpoints (CRUD)
2. **`src/utils/runKey.js`** — create shared key utility
3. **`src/context/AppContext.jsx`** — add `paths`, `savePath`, `deletePath`, `pendingPathRunKey`
4. **`src/components/EmbeddedMap.jsx`** — remove zone polygon rendering, add path polyline rendering, add recording preview
5. **`src/components/tabs/CampusMap.jsx`** — remove zone drawing, add path recording mode UI
6. **`src/components/tabs/RunLog.jsx`** — add path column with Record/Edit buttons

---

## Out of Scope

- GPS import from file (e.g., GPX) — manual click-to-add is sufficient for now
- Path editing individual points (drag a vertex) — undo + re-draw is sufficient
- Path length calculations or analytics — purely visual for now
- Associating one path with multiple runs — one path per run
- Removing zone entries from the stored registry — leave them, just don't render
