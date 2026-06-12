import express from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createBackup } from './scripts/backup.js'
import { startSync, getStatus, pollOnce } from './sync.js'
import { buildReport, sendReport } from './slackReport.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data')
const DIST = path.join(__dirname, 'dist')
const BACKUPS = path.join(__dirname, 'backups')
const DEFAULT_BUILDINGS = path.join(__dirname, 'public', 'buildings.json')
const PORT = process.env.PORT || 5000

app.use(express.json({ limit: '50mb' }))
app.use(express.static(DIST))

function ensureData() {
  fs.mkdirSync(DATA, { recursive: true })
}

function read(filename, fallback) {
  const p = path.join(DATA, filename)
  if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'))
  return fallback
}

function write(filename, data) {
  ensureData()
  fs.writeFileSync(path.join(DATA, filename), JSON.stringify(data, null, 2))
}

function fileInfo(filename) {
  const p = path.join(DATA, filename)
  if (!fs.existsSync(p)) return null
  const stat = fs.statSync(p)
  return { name: filename, mtime: stat.mtimeMs }
}

function appendUploadLog(entry) {
  ensureData()
  const logPath = path.join(DATA, 'upload_log.json')
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : []
  log.push(entry)
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2))
}

// ── Status ──────────────────────────────────────────────────────────
app.get('/api/status', (req, res) => {
  const log = fileInfo('log.csv')
  const manifest = fileInfo('manifest.csv')
  res.json({
    hasLog: !!log,
    logFilename: log?.name ?? null,
    logMtime: log ? new Date(log.mtime).toISOString() : null,
    hasManifest: !!manifest,
    manifestFilename: manifest?.name ?? null,
    manifestMtime: manifest ? new Date(manifest.mtime).toISOString() : null,
  })
})

// ── Log CSV ──────────────────────────────────────────────────────────
app.get('/api/log-csv', (req, res) => {
  const p = path.join(DATA, 'log.csv')
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'No log.csv found' })
  res.sendFile(p)
})

app.post('/api/log-csv', (req, res) => {
  const { filename, content } = req.body
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'Missing content' })
  ensureData()
  fs.writeFileSync(path.join(DATA, 'log.csv'), content, 'utf8')
  appendUploadLog({ fileType: 'log', filename: filename || 'log.csv', uploadedAt: new Date().toISOString(), bytes: Buffer.byteLength(content, 'utf8') })
  res.json({ ok: true })
})

// ── Manifest CSV ─────────────────────────────────────────────────────
app.get('/api/manifest-csv', (req, res) => {
  const p = path.join(DATA, 'manifest.csv')
  if (!fs.existsSync(p)) return res.status(404).json({ error: 'No manifest.csv found' })
  res.sendFile(p)
})

app.post('/api/manifest-csv', (req, res) => {
  const { filename, content } = req.body
  if (!content || typeof content !== 'string') return res.status(400).json({ error: 'Missing content' })
  ensureData()
  fs.writeFileSync(path.join(DATA, 'manifest.csv'), content, 'utf8')
  appendUploadLog({ fileType: 'manifest', filename: filename || 'manifest.csv', uploadedAt: new Date().toISOString(), bytes: Buffer.byteLength(content, 'utf8') })
  res.json({ ok: true })
})

app.get('/api/upload-log', (req, res) => {
  const logPath = path.join(DATA, 'upload_log.json')
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : []
  res.json(log)
})

// ── Auto-sync status ─────────────────────────────────────────────────
app.get('/api/sync-status', (req, res) => {
  res.json(getStatus())
})

// Force an immediate poll (used for testing / a manual "check now")
app.post('/api/sync-now', async (req, res) => {
  try {
    const committed = await pollOnce(DATA)
    res.json({ ok: true, committed, status: getStatus() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Slack weekly report ──────────────────────────────────────────────
app.get('/api/slack-report/preview', (req, res) => {
  try {
    const report = buildReport(DATA)
    res.json({ configured: !!process.env.SLACK_WEBHOOK_URL, ...report })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/slack-report', async (req, res) => {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return res.status(400).json({ error: 'SLACK_WEBHOOK_URL not set' })
  try {
    const report = await sendReport(DATA, url)
    res.json({ ok: true, total: report.total, weekCount: report.weekCount })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Backups (snapshot data/ tied to git sha) ─────────────────────────
app.post('/api/backup', (req, res) => {
  try {
    res.json({ ok: true, backup: createBackup() })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.get('/api/backups', (req, res) => {
  if (!fs.existsSync(BACKUPS)) return res.json([])
  const list = fs.readdirSync(BACKUPS)
    .filter(d => { try { return fs.statSync(path.join(BACKUPS, d)).isDirectory() } catch { return false } })
    .map(d => {
      let meta = {}
      const vp = path.join(BACKUPS, d, 'version.json')
      if (fs.existsSync(vp)) { try { meta = JSON.parse(fs.readFileSync(vp, 'utf8')) } catch {} }
      return { name: d, ...meta }
    })
    .sort((a, b) => (a.name < b.name ? 1 : -1))
  res.json(list)
})

// ── Buildings registry ───────────────────────────────────────────────
app.get('/api/buildings', (req, res) => {
  const local = path.join(DATA, 'buildings.json')
  const src = fs.existsSync(local) ? local : DEFAULT_BUILDINGS
  res.sendFile(src)
})

app.post('/api/buildings', (req, res) => {
  write('buildings.json', req.body)
  res.json({ ok: true })
})

// ── Overrides ────────────────────────────────────────────────────────
app.get('/api/overrides', (req, res) => {
  res.json(read('overrides.json', []))
})

app.post('/api/overrides', (req, res) => {
  write('overrides.json', req.body)
  res.json({ ok: true })
})

// ── Matches (run → floor manual assignments) ─────────────────────────
app.get('/api/matches', (req, res) => {
  res.json(read('matches.json', {}))
})

app.post('/api/matches', (req, res) => {
  write('matches.json', req.body)
  res.json({ ok: true })
})

// ── Outdoor paths (run → recorded polyline) ──────────────────────────
app.get('/api/paths', (req, res) => {
  res.json(read('paths.json', []))
})

app.post('/api/paths', (req, res) => {
  const path = req.body
  if (!path || typeof path.runKey !== 'string') {
    return res.status(400).json({ error: 'Missing runKey' })
  }
  const paths = read('paths.json', [])
  const idx = paths.findIndex(p => p.runKey === path.runKey)
  if (idx >= 0) paths[idx] = path
  else paths.push(path)
  write('paths.json', paths)
  res.json({ ok: true })
})

app.delete('/api/paths/:runKey', (req, res) => {
  const runKey = req.params.runKey
  const paths = read('paths.json', [])
  write('paths.json', paths.filter(p => p.runKey !== runKey))
  res.json({ ok: true })
})

// ── App settings ─────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json(read('settings.json', { hoursGoal: 100 }))
})

app.post('/api/settings', (req, res) => {
  write('settings.json', req.body)
  res.json({ ok: true })
})

// ── SPA fallback ─────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(DIST, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dashboard → http://0.0.0.0:${PORT}`)
  console.log(`Data folder → ${DATA}`)
  console.log(fileInfo('log.csv') ? `Log CSV → log.csv` : 'No log.csv — upload via Settings')
  console.log(fileInfo('manifest.csv') ? `Manifest → manifest.csv` : 'No manifest.csv — upload via Settings')
  startSync(DATA, { onCommit: () => console.log('[sync] committed new log/manifest from sheet') })
})
