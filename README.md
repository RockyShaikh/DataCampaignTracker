# Data Campaign Tracker

**Operational dashboard for multi-person, multi-modal sensor data collection campaigns.**

You have a sensor rig. You have a team taking it out every day. The hard part isn't
recording traces — it's knowing *what you already have*, *what's usable*, and *where to
go next*. This is the tool that answers those three questions.

Built and run at the **CMU WiSELab** to coordinate an indoor/outdoor campus data
collection campaign across a dozen collectors and forty-odd buildings.

![Data Campaign Tracker dashboard](docs/dashboard.gif)

---

## The problem

A data campaign generates two independent records that never quite agree:

- **The rig** auto-emits a *manifest* — one row per recorded trace, with a timestamp,
  duration, and whatever location string the operator typed.
- **The humans** keep a *collection log* — a spreadsheet noting what they did, whether
  the capture went cleanly, and whether it survived post-processing.

Traces go missing from the log. Log rows describe traces that failed to record. Location
strings are free text (`"weh 5 forward"`, `"cic.l, cic.ll"`, `"frick"`). Nobody can answer
"is floor 4 of Wean Hall done?" without reading a spreadsheet line by line.

This dashboard cross-references the two records, resolves the free-text locations against
a building registry, and renders coverage as something you can actually look at.

---

## How it works

```
  Google Sheet (log tab + manifest tab)
        │   auto-sync, polled every N min, debounce-guarded
        ▼
  data/log.csv   data/manifest.csv            ← server-side state (never in git)
        │
        ├── parseLog()       csvParser.js      free-text → structured runs
        ├── parseManifest()  manifestParser.js rig traces → structured runs
        │
        ├── parseLocation()  locationParser.js "cic.l, weh 5" → [{building, floor}]
        │                                       via alias / floor-alias / room map
        │
        ├── crossReference() crossReference.js manifest ⨝ log on date|user|loc|movement
        │                                       → source: "both" | "manifest" | "log"
        │
        └── calculations.js                    coverage, validity, leaderboard, gaps
                    │
                    ▼
            React dashboard (7 tabs)
```

Everything is derived. There is no database — the server holds a folder of JSON and CSV
files, the browser fetches them on load, and every analytic is a `useMemo` over the parsed
runs. Blow away the derived state and it rebuilds from the two source CSVs.

### The coverage model

Coverage is tracked per **building → floor → orientation** (`forward` / `backward` /
`lateral`), because a floor walked in only one direction isn't covered for training
purposes.

| Status | Meaning |
|--------|---------|
| 🟩 `green`  | at least one *clean* run — collection **pass** and processing **pass** |
| 🟨 `yellow` | collected, but every run had a capture or processing issue |
| ⬜ `gray`   | no data |

Runs are classified on two axes rather than one boolean, so a trace that simply hasn't
been processed yet is distinguishable from one that failed:

- `isProcessed` — a processor has filled in the processing column
- `isFailed` — collection **or** processing is `fail`
- `isValid` — processed and not failed → counts toward campaign hours
- `isClean` — `pass` + `pass`, the strictest bar → what turns a cell green

### Location parsing

Operators type free text. The parser resolves each comma-separated segment against the
registry in priority order: exact building ID → alias → floor alias → room-to-floor
mapping → outdoor zone pattern. A segment naming a building but no floor credits the
building without crediting any floor; stairwell traces credit their own category.
Anything unresolved is surfaced in the UI as an unmatched location you can map by hand.

---

## What's in it

| Tab | What it does |
|-----|--------------|
| **Overview** | Campaign hours against goal, progress bars, recent activity, top collectors |
| **Campus Map** | Leaflet map with per-building pie markers showing floor coverage; outdoor zone polygons drawn in-browser |
| **Buildings** | Floor × orientation coverage grid per building, with manual overrides |
| **Leaderboard** | Collector rankings by hours, runs, and clean-run rate |
| **Run Log** | Every run, filterable and searchable; manual floor assignment for ambiguous locations |
| **Analysis** | Time series, indoor/outdoor split, duration distributions, failure breakdowns |
| **Settings** | Building registry editor, hours goal, sync status, Slack report preview |

Beyond the tabs:

- **Auto-sync** (`sync.js`) pulls both tabs from a link-shared Google Sheet on a timer.
  It commits a change only when two consecutive polls return *identical* content, so a
  sheet that's mid-edit is never half-ingested.
- **Coverage recommendations** rank what to collect next by marginal campaign value.
- **Slack weekly report** (`slackReport.js`) posts progress to an incoming webhook.
- **Strava sync** (`strava.js`) pulls GPS tracks for outdoor traces and matches them to
  manifest rows by timestamp proximity.
- **Backups** (`scripts/backup.js`) snapshot the whole data folder on demand.

---

## Where the data goes

**No campaign data is included in this repository, and none will be.**

The `data/` folder is the app's entire state store, and everything that lands in it is
real operational record: collector names, timestamped runs, the buildings and floors
individual people walked through on specific dates, and free-text notes about rig
failures. That's personnel movement data about a working research team. It is not ours to
publish, so `data/` is gitignored wholesale — the directory ships empty except for the
ignore rules that keep it that way.

What the running app expects to find there:

| File | Source | Contents |
|------|--------|----------|
| `log.csv` | human-maintained sheet | the collection log — date, user, location, type, movement, duration, collection/processing status, notes |
| `manifest.csv` | auto-generated by the rig | one row per recorded trace, keyed by a `YYYY-MM-DD-HH-MM-SS` trace ID |
| `buildings.json` | created on first registry edit | building/zone registry overrides; falls back to `public/buildings.json` |
| `matches.json` | created by the UI | manual floor assignments for locations the parser couldn't resolve |
| `overrides.json` | created by the UI | manual coverage overrides |
| `paths.json` | created by Strava sync | GPS tracks matched to outdoor traces |
| `settings.json` | created by the UI | hours goal and app settings |
| `strava.json` | created by Settings | Strava session cookie — **never commit this** |
| `upload_log.json` | created by the server | upload/sync audit trail |

`public/buildings.json` **is** committed — it's the default registry (CMU building IDs,
aliases, floor lists, coordinates), which is configuration rather than collection data,
and it's what makes the parsing logic legible. Point it at your own campus and the rest of
the system follows.

The screenshot above is rendered from a **synthetic dataset** with invented collector
names — the dashboard shown is real, the data in it is not.

---

## Running it

```bash
npm install
npm run build
npm start              # → http://localhost:5000
```

Development, with hot reload on the frontend and the API proxied to Express:

```bash
npm run dev
```

The app boots fine against an empty `data/` folder — it just shows an empty campaign.
Drop a `log.csv` and `manifest.csv` in, or configure auto-sync, and it fills in.

### Configuration

All optional; every integration degrades gracefully when unset.

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `5000`) |
| `DATA_DIR` | state folder (default `./data`) |
| `SHEET_ID`, `LOG_GID`, `MANIFEST_GID` | Google Sheet auto-sync source |
| `SYNC_POLL_MIN` | minutes between sync polls (default `5`) |
| `SLACK_WEBHOOK_URL` | destination for the weekly progress report |
| `APP_URL` | public URL, used in Slack report links |
| `STRAVA_POLL_MIN`, `STRAVA_MATCH_TOLERANCE_MIN` | Strava sync cadence and match window |

### Deployment

Dockerfile and `fly.toml` are included. The Fly config mounts a persistent volume at
`/data` and sets `DATA_DIR=/data`, so campaign state survives redeploys.

```bash
fly deploy
fly secrets set SLACK_WEBHOOK_URL=... SHEET_ID=...
```

---

## Repo map

```
server.js              Express — API + static host; all persistence is flat files
sync.js                Google Sheet auto-sync with mid-edit debounce guard
slackReport.js         weekly progress report composer + webhook sender
strava.js              Strava activity pull and trace matching
scripts/backup.js      data folder snapshots
public/buildings.json  default building/zone registry (committed)

src/
  context/AppContext.jsx   global state, fetch + refresh
  components/
    EmbeddedMap.jsx        Leaflet map, SVG pie markers, zone polygons
    tabs/                  the seven dashboard tabs
  utils/
    csvParser.js           collection log → runs
    manifestParser.js      rig manifest → runs
    locationParser.js      free-text location → building/floor
    crossReference.js      manifest ⨝ log
    calculations.js        coverage, hours, leaderboard, recommendations
```

**Stack:** React 18 · Vite · Tailwind · React-Leaflet · Recharts · PapaParse · Express.

See [TUTORIAL.md](TUTORIAL.md) for operator-level instructions (running the server,
keeping it alive with PM2, managing the data folder).

---

## Status

Actively used for a live campaign. The tracker is one stage of a larger effort to make
sensor-rig data collection modular and reusable — the rig gets you traces; this tells you
whether the traces add up to a dataset.
