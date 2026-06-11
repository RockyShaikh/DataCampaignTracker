# Data Campaign Dashboard — Tutorial

> Last updated: 2026-05-22
> Stack: Vite + React + Tailwind (frontend) · Node/Express (server) · Leaflet map · Recharts

---

## How it works

The app has two parts running together:

1. **Express server** (`server.js`) — reads files from the `data/` folder, serves them to the browser via a small API, and also hosts the built frontend as static files.
2. **React frontend** — fetches everything from the server on load, renders the dashboard. No file uploads, no browser storage.

All state lives on the server in the `data/` folder:

| File | What it stores |
|------|----------------|
| `data/*.csv` | Your collection log (the latest CSV is used automatically) |
| `data/buildings.json` | Building registry edits (auto-created on first save) |
| `data/overrides.json` | Manual floor coverage overrides (auto-created) |
| `data/settings.json` | Hours goal and other settings (auto-created) |

Everyone who opens the dashboard sees the same data. Only the webmaster manages the `data/` folder.

---

## Running the server

### First time only

```bash
cd /home/rocky/WiSELab/DataCampaignTracker
npm install          # install dependencies (~30 seconds)
npm run build        # compile the frontend into dist/
```

### Starting the server

```bash
npm start
```

The server starts at `http://0.0.0.0:5000`. Open it on any machine:
- Same machine: `http://localhost:5000`
- Any machine on the network: `http://<server-ip>:5000`
- From the internet (if port 5000 is open): `http://<public-ip>:5000`

To find your server's local IP:
```bash
hostname -I | awk '{print $1}'
```

### Keeping it running 24/7 with PM2

```bash
npm install -g pm2          # one-time global install
pm2 start server.js --name dashboard
pm2 save                    # remember this process across reboots
pm2 startup                 # follow the printed command to enable auto-start
```

Useful PM2 commands:
```bash
pm2 status                  # is it running?
pm2 logs dashboard          # live log output
pm2 restart dashboard       # restart (e.g. after code changes)
pm2 stop dashboard          # stop it
```

---

## Updating the data (your job as webmaster)

### Replacing the CSV

1. Export from Google Sheets: **File → Download → Comma Separated Values (.csv)**
2. Copy the file into `data/` on the server (overwrite any existing CSV):
   ```bash
   cp ~/Downloads/Collection_Log.csv /home/rocky/WiSELab/DataCampaignTracker/data/
   ```
   Or use `scp` from another machine:
   ```bash
   scp Collection_Log.csv user@<server-ip>:/home/rocky/WiSELab/DataCampaignTracker/data/
   ```
3. Click **Refresh** in the top-right corner of the dashboard. Done.

The server always uses the most recently modified CSV in `data/`. You can leave old exports there — only the latest one is used.

### What the Refresh button does

Re-fetches the CSV and all settings from the server. Takes about 1 second. No page reload needed. Use it after:
- Replacing the CSV file
- Editing `buildings.json` directly on disk
- Any server-side file change

---

## Navigating the dashboard (for your team)

The dashboard is read-only for the team. Six tabs:

### Overview
Main view. Top to bottom:
1. **Hours progress bar** — total valid hours toward the goal, with weekly growth rate
2. **Leaderboard** (left) + **Collection by movement and type** (right)
3. **Campus map** — pie/donut markers showing floor coverage per building
4. **Secondary stats** — by building, cumulative chart, validity breakdown

### Buildings
Full coverage grid. Expand any building to see a floor × orientation table:
- **Green ✓** cell = valid run exists, shows abbreviated collector name. Click to see details.
- **Dashed —** cell = not yet covered.
- **Amber ⚡** cell = manually overridden.

### Campus Map
Full-screen map. Each building marker is a donut chart:
- The arc shows what fraction of floors are fully covered (all 3 orientations)
- Colors: green=100%, blue=67–99%, amber=34–66%, red=1–33%, gray=0%
- Click any marker for a floor-by-floor popup

### Leaderboard
Ranked by valid hours (10% adjusted). Toggle "Show all runs" to include effort from failed/pending runs.

### Run Log
Every run in a filterable, sortable table. Filter by collector, type, movement, validity, or location text. Green rows = valid, red rows = failed.

### Settings
Admin panel — described below.

---

## What counts as valid

A run is **valid** if and only if:
- `collection` column = `pass` or `recovered` (case-insensitive)
- **AND** `processing` column = `pass` (case-insensitive, exact match)

`minor issue`, `-`, blank → invalid. All "valid hours" shown have a **10% haircut** applied (×0.90) to compensate for rounded-up duration estimates in the sheet.

A floor is **fully recorded** when all three orientations (forward, backward, lateral) have at least one valid run, or are manually overridden.

Movement `mixed` or `-` → the run is still valid if collection/processing pass, but earns **no orientation credit** toward floor coverage.

---

## Settings tab (webmaster)

### Collection Goal
The target hours for the Overview progress bar. Default: 100h. Change it and it saves immediately to the server — everyone sees the updated target.

### Building Registry Editor
The registry defines every building: name, ID, floor list, location aliases, map coordinates.

**Fixing a wrong map pin:**
1. Expand the building in Settings
2. Update **Lat** and **Lng** (right-click a spot on Google Maps → "What's here?" gives coordinates)
3. Saved automatically

**Adding a location alias:**
If a location string in the CSV doesn't match a building, it shows up in the "Unmatched Locations" section at the bottom of the Buildings tab. Fix it:
1. Settings → expand the correct building
2. Add the unmatched string to **Aliases** (comma-separated)
3. Metrics recompute immediately

**Modifying floors:**
Add or remove floor chips. Removing a floor instantly drops it from all coverage calculations.

### Registry Import / Export
- **Download buildings.json** — exports the current registry. Commit this to version control to track changes.
- **Upload buildings.json** — imports a JSON to replace the current registry.

The registry is also saved automatically whenever you edit it through the UI — changes persist on the server in `data/buildings.json`.

### Manual Overrides
Floor coverage cells you've manually marked are listed here. Remove them individually or clear all. Overrides are shared — if you mark a floor as covered, everyone sees it.

---

## CSV location parsing

The dashboard handles messy location strings from the sheet:

| Input | Parsed as |
|-------|-----------|
| `ghc.3` | GHC floor 3 |
| `ghc.3-9` | GHC floors 3,4,5,6,7,8,9 |
| `nsh.a-1` | NSH floors a,b,1 (uses canonical floor order) |
| `nsh.highbay` | NSH floor 1 (via floor alias) |
| `nsh.bridge` | NSH floor 3 (via floor alias) |
| `cic.l, cic.ll` | CIC floor L and floor LL |
| `ghc3-9` (no dot) | GHC floors 3–9 (prefix match fallback) |
| `tepper` | Tepper, whole-building (time only, no floor credit) |
| `scott, hammerschlag` + type=campus | Both touched, no floor credit |
| `(test entry)` | Skipped |
| Blank location | Skipped |
| type = bootup | Skipped |

---

## Updating the code

When the source code changes (e.g. after a `git pull`):

```bash
npm install          # only if package.json changed
npm run build        # recompile the frontend
pm2 restart dashboard
```

---

## Firewall / network access

To allow access from outside your local network, open port 5000:

```bash
sudo ufw allow 5000
```

Then access the dashboard at `http://<your-public-ip>:5000`.

For a cleaner setup with a domain name, put nginx in front:
```nginx
server {
    listen 80;
    server_name your-domain-or-ip;
    location / {
        proxy_pass http://localhost:5000;
        proxy_set_header Host $host;
    }
}
```

Then run `sudo systemctl restart nginx` and the app is accessible on port 80 (standard HTTP).

---

## Troubleshooting

**Dashboard shows "No data file found"**
→ No CSV is in the `data/` folder. Drop one there and click Refresh.

**Map pin in wrong location**
→ Settings → expand building → fix Lat/Lng.

**Location string not matching a building**
→ Buildings tab → scroll to "Unmatched Locations" → add the string as an alias in Settings.

**Team member sees stale data**
→ They need to click Refresh. The server always has the latest file; the browser fetches on demand.

**PM2 process not running after reboot**
→ Run `pm2 startup` and follow the printed command. Then `pm2 save`.

**Port 5000 already in use**
→ `PORT=3000 npm start` (or set `PORT` in a `.env` file / PM2 config).
