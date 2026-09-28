// Cookie-based Strava sync (NO API, no subscription, no headless browser).
//
// A human logs into the shared Strava account in a browser and pastes the
// `_strava4_session` cookie into Settings. The server then *replays* that
// session with plain HTTP requests — exactly like `curl --cookie` — to:
//   1. list recent activities  (GET /athlete/training_activities, JSON)
//   2. download each new one    (GET /activities/{id}/export_gpx)
//   3. match it to the nearest manifest trace by start time
//   4. write the GPS polyline into paths.json so it shows on the map
//
// The cookie eventually expires (months with "remember me"); when a request
// comes back as the HTML login page instead of JSON/GPX we flag the session
// expired and the Settings card asks for a fresh paste. No credentials are
// ever stored on the server.
//
// Config via env:
//   STRAVA_POLL_MIN              minutes between polls (default 60)
//   STRAVA_MATCH_TOLERANCE_MIN   max start-time gap to match a trace (default 5)
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

const POLL_MIN = Number(process.env.STRAVA_POLL_MIN || 60)
// Keep this tight. We'd rather leave an activity unmatched than force a fuzzy
// match onto the wrong (possibly short) trace — unmatched ones surface in the
// activity log for manual attach later.
const TOLERANCE_MS = Number(process.env.STRAVA_MATCH_TOLERANCE_MIN || 5) * 60 * 1000
const TRACE_RE = /^\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}$/
const STATE_FILE = 'strava.json'

// In-memory status, surfaced via GET /api/strava/status
const status = {
  state: 'disabled',     // 'disabled'(no cookie) | 'idle' | 'syncing' | 'expired' | 'error'
  message: 'Paste the _strava4_session cookie in Settings to enable Strava sync.',
  connected: false,
  lastCheckedAt: null,
  lastSyncAt: null,
  matched: 0,            // activities matched to a trace (paths written)
  unmatched: 0,          // downloaded but no trace within tolerance yet
  pollMinutes: POLL_MIN,
}

// ── State persistence (on the Fly volume) ────────────────────────────
// { cookie, activities: { [id]: { id, name, startMs, durationSec, points, matchedTrace } } }
function loadState(dataDir) {
  const p = path.join(dataDir, STATE_FILE)
  if (fs.existsSync(p)) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch {}
  }
  return { cookie: null, activities: {} }
}
function saveState(dataDir, state) {
  fs.writeFileSync(path.join(dataDir, STATE_FILE), JSON.stringify(state, null, 2))
}

// ── HTTP: replay the pasted session ──────────────────────────────────
class SessionExpired extends Error {}

async function stravaGet(cookie, url, json) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      Cookie: `_strava4_session=${cookie}`,
      'User-Agent': 'Mozilla/5.0',
      ...(json ? { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' } : {}),
    },
  })
  // An expired/invalid cookie redirects to the login page → HTML, not our data.
  const ctype = res.headers.get('content-type') || ''
  if (/\/login/.test(res.url) || (json && !/json/i.test(ctype))) {
    throw new SessionExpired('Strava session expired — paste a fresh _strava4_session cookie.')
  }
  if (!res.ok) throw new Error(`Strava HTTP ${res.status} for ${url}`)
  return json ? res.json() : res.text()
}

async function listActivities(cookie) {
  const url = 'https://www.strava.com/athlete/training_activities'
    + '?new_activity_only=false&per_page=30&page=1'
  const data = await stravaGet(cookie, url, true)
  const rows = Array.isArray(data) ? data : (data.models || data.activities || [])
  return rows.map(a => ({
    id: String(a.id),
    name: a.name || '',
    startMs: activityStartMs(a),
    durationSec: Number(a.elapsed_time_raw || a.moving_time_raw || a.elapsed_time || a.moving_time || 0),
  })).filter(a => a.id && a.startMs != null)
}

// Strava local-time fields are wall-clock (the trace id is also wall-clock), so
// comparing them as-is needs no timezone math.
function activityStartMs(a) {
  if (a.start_date_local_raw) return Number(a.start_date_local_raw) * 1000
  if (a.start_date_local) {
    const ms = Date.parse(a.start_date_local)   // trailing Z makes it parse as wall-clock
    return isNaN(ms) ? null : ms
  }
  return null
}

async function downloadPoints(cookie, id) {
  // export_gpx returns a processed/stripped GPX; that's fine for a map polyline.
  const gpx = await stravaGet(cookie, `https://www.strava.com/activities/${id}/export_gpx`, false)
  return parseGpxPoints(gpx)
}

// Minimal trkpt extractor (no DOM in node): <trkpt lat="..." lon="...">
function parseGpxPoints(gpx) {
  const pts = []
  const re = /<trkpt[^>]*\blat="([-\d.]+)"[^>]*\blon="([-\d.]+)"/g
  let m
  while ((m = re.exec(gpx)) !== null) {
    const lat = parseFloat(m[1]), lng = parseFloat(m[2])
    if (!isNaN(lat) && !isNaN(lng)) pts.push({ lat: +lat.toFixed(6), lng: +lng.toFixed(6) })
  }
  return pts
}

// ── Manifest traces (the match targets) ──────────────────────────────
function loadTraces(dataDir) {
  const p = path.join(dataDir, 'manifest.csv')
  if (!fs.existsSync(p)) return []
  const rows = Papa.parse(fs.readFileSync(p, 'utf8'), { header: false, skipEmptyLines: false }).data
  const traces = []
  for (const row of rows) {
    const trace = (row[5] || '').trim()
    if (!TRACE_RE.test(trace)) continue
    const [y, mo, d, h, mi, s] = trace.split('-').map(Number)
    traces.push({
      trace,
      user: (row[6] || '').trim(),
      location: (row[7] || '').trim(),
      startMs: Date.UTC(y, mo - 1, d, h, mi, s),   // wall-clock, same basis as activity
      durationSec: parseFloat((row[10] || '0').trim()) || 0,
    })
  }
  return traces
}

// ── Path output ──────────────────────────────────────────────────────
function writePath(dataDir, runKey, points, activityId) {
  const p = path.join(dataDir, 'paths.json')
  const paths = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []
  const entry = { runKey, points, source: 'strava', activityId, recordedAt: new Date().toISOString() }
  const idx = paths.findIndex(x => x.runKey === runKey)
  if (idx >= 0) paths[idx] = entry
  else paths.push(entry)
  fs.writeFileSync(p, JSON.stringify(paths, null, 2))
}

// ── One poll ──────────────────────────────────────────────────────────
export async function pollOnce(dataDir) {
  const state = loadState(dataDir)
  if (!state.cookie) {
    status.state = 'disabled'
    status.connected = false
    status.message = 'Paste the _strava4_session cookie in Settings to enable Strava sync.'
    return false
  }

  status.state = 'syncing'
  let newlyMatched = 0
  try {
    // 1. fetch & cache GPX for any activities we haven't seen
    const activities = await listActivities(state.cookie)
    for (const a of activities) {
      if (state.activities[a.id]) continue
      const points = await downloadPoints(state.cookie, a.id)
      state.activities[a.id] = { ...a, points, matchedTrace: null }
    }

    // 2. (re)match any unmatched cached activity against current traces.
    //    Re-runs every poll so a path recorded before its trace is processed
    //    still gets matched once the trace lands in the manifest.
    const traces = loadTraces(dataDir)
    const used = new Set(
      Object.values(state.activities).map(a => a.matchedTrace).filter(Boolean)
    )
    for (const a of Object.values(state.activities)) {
      if (a.matchedTrace || !a.points?.length) continue
      let best = null, bestGap = Infinity
      for (const t of traces) {
        if (used.has(t.trace)) continue
        const gap = Math.abs(t.startMs - a.startMs)
        if (gap < bestGap) { best = t; bestGap = gap }
      }
      if (best && bestGap <= TOLERANCE_MS) {
        a.matchedTrace = best.trace
        used.add(best.trace)
        writePath(dataDir, best.trace, a.points, a.id)
        newlyMatched++
      }
    }

    const all = Object.values(state.activities)
    status.matched = all.filter(a => a.matchedTrace).length
    status.unmatched = all.filter(a => !a.matchedTrace).length
    status.connected = true
    status.state = 'idle'
    status.message = null
    status.lastCheckedAt = new Date().toISOString()
    if (newlyMatched > 0) status.lastSyncAt = new Date().toISOString()
    saveState(dataDir, state)
    return newlyMatched > 0
  } catch (err) {
    status.lastCheckedAt = new Date().toISOString()
    if (err instanceof SessionExpired) {
      status.state = 'expired'
      status.connected = false
      status.message = err.message
    } else {
      status.state = 'error'
      status.message = err.message
    }
    saveState(dataDir, state)
    return false
  }
}

// ── Public API ────────────────────────────────────────────────────────
export function getStatus() {
  return status
}

// The "Strava manifest": every pulled activity and whether it matched a trace.
// Unmatched ones are the actionable list (manual-attach is a future provision).
// Points arrays are omitted to keep the payload small.
export function getActivities(dataDir) {
  const state = loadState(dataDir)
  return Object.values(state.activities)
    .map(a => ({
      id: a.id,
      name: a.name,
      start: a.startMs ? new Date(a.startMs).toISOString() : null,
      durationMin: Math.round((a.durationSec || 0) / 60),
      pointCount: a.points?.length || 0,
      matchedTrace: a.matchedTrace || null,
    }))
    .sort((x, y) => (x.start < y.start ? 1 : -1))
}

// Manifest traces for the manual-attach dropdown, newest first, flagged if a
// Strava path is already attached.
export function getTraces(dataDir) {
  const state = loadState(dataDir)
  const taken = new Set(Object.values(state.activities).map(a => a.matchedTrace).filter(Boolean))
  return loadTraces(dataDir)
    .map(t => ({
      trace: t.trace,
      user: t.user,
      location: t.location,
      start: new Date(t.startMs).toISOString(),
      matched: taken.has(t.trace),
    }))
    .sort((a, b) => (a.start < b.start ? 1 : -1))
}

// Manually attach an activity to a trace (or detach when trace is null).
function removeActivityPaths(paths, activity) {
  return paths.filter(p => !(p.source === 'strava' && p.activityId === activity.id))
}
export function setManualMatch(dataDir, activityId, trace) {
  const state = loadState(dataDir)
  const a = state.activities[activityId]
  if (!a) throw new Error('Unknown activity')

  const p = path.join(dataDir, 'paths.json')
  let paths = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : []
  paths = removeActivityPaths(paths, a)   // drop whatever this activity wrote before

  if (trace) {
    a.matchedTrace = trace
    a.manual = true
    paths = paths.filter(x => x.runKey !== trace)   // replace any path on the target trace
    if (a.points?.length) {
      paths.push({ runKey: trace, points: a.points, source: 'strava', activityId: a.id, manual: true, recordedAt: new Date().toISOString() })
    }
  } else {
    a.matchedTrace = null
    a.manual = false
  }
  fs.writeFileSync(p, JSON.stringify(paths, null, 2))

  const all = Object.values(state.activities)
  status.matched = all.filter(x => x.matchedTrace).length
  status.unmatched = all.filter(x => !x.matchedTrace).length
  status.lastSyncAt = new Date().toISOString()   // nudge the open tab to reload the map
  saveState(dataDir, state)
}

export function setCookie(dataDir, cookie) {
  const state = loadState(dataDir)
  state.cookie = (cookie || '').trim() || null
  saveState(dataDir, state)
  status.connected = !!state.cookie
  status.state = state.cookie ? 'idle' : 'disabled'
  status.message = state.cookie ? null : 'Paste the _strava4_session cookie in Settings to enable Strava sync.'
}

export function startStravaSync(dataDir, { onMatch } = {}) {
  const state = loadState(dataDir)
  status.connected = !!state.cookie
  if (!state.cookie) {
    console.log('Strava sync idle — no cookie set (paste one in Settings)')
  } else {
    console.log(`Strava sync enabled — polling every ${POLL_MIN} min`)
  }
  const tick = async () => {
    const matched = await pollOnce(dataDir)
    if (matched && onMatch) onMatch()
  }
  tick()
  setInterval(tick, POLL_MIN * 60 * 1000)
}
