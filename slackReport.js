// Compose + send a weekly Data Campaign progress report to a Slack Incoming Webhook.
// Reuses the same parse pipeline as the frontend so numbers match the dashboard.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { parseLog } from './src/utils/csvParser.js'
import { parseManifest } from './src/utils/manifestParser.js'
import { crossReference, getLogOnlyRuns } from './src/utils/crossReference.js'
import {
  getTotalValidHours, getGrowthRate, getWeeklyCollectorHours,
  getFloorCoverage, getCoverageRecommendations,
} from './src/utils/calculations.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const APP_URL = process.env.APP_URL || 'https://datacampaigntracker.fly.dev'

function readFile(dataDir, name) {
  const p = path.join(dataDir, name)
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null
}
function readJson(dataDir, name, fallback) {
  const p = path.join(dataDir, name)
  if (fs.existsSync(p)) { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch {} }
  return fallback
}

function loadRuns(dataDir) {
  const registry = readJson(dataDir, 'buildings.json', null)
    || JSON.parse(fs.readFileSync(path.join(__dirname, 'public', 'buildings.json'), 'utf8'))
  const matches = readJson(dataDir, 'matches.json', {})
  const logText = readFile(dataDir, 'log.csv')
  const manText = readFile(dataDir, 'manifest.csv')

  let runs = []
  if (manText) {
    const { runs: mRuns } = parseManifest(manText, registry)
    if (logText) {
      const { runs: lRuns } = parseLog(logText, registry)
      runs = [...crossReference(mRuns, lRuns), ...getLogOnlyRuns(mRuns, lRuns)]
    } else {
      for (const r of mRuns) { r.isProcessed = true; r.isValid = true }
      runs = mRuns
    }
  } else if (logText) {
    runs = parseLog(logText, registry).runs
  }
  return { runs, registry, matches }
}

export function buildReport(dataDir) {
  const { runs, registry, matches } = loadRuns(dataDir)
  const goal = readJson(dataDir, 'settings.json', { hoursGoal: 100 }).hoursGoal ?? 100

  const total = getTotalValidHours(runs)
  const pct = goal > 0 ? Math.round((total / goal) * 100) : 0
  const g = getGrowthRate(runs)
  const weekly = getWeeklyCollectorHours(runs, 7)
  const recs = getCoverageRecommendations(registry, getFloorCoverage(runs, matches))

  const arrow = g.delta >= 0 ? '▲' : '▼'
  const pctStr = g.pct === null ? '' : ` (${g.pct >= 0 ? '+' : ''}${g.pct.toFixed(0)}%)`
  const sign = g.delta >= 0 ? '+' : '−'

  const lines = []
  lines.push('*📊 Data Campaign — Weekly Update*')
  lines.push(`*Total collected:* ${total.toFixed(1)}h / ${goal}h  (${pct}%)`)
  lines.push(`*This week:* ${g.thisWeekHours.toFixed(1)}h  ${arrow} ${sign}${Math.abs(g.delta).toFixed(1)}h vs last week${pctStr}`)

  lines.push('')
  lines.push('*Collectors this week:*')
  if (weekly.length === 0) {
    lines.push('_no collection logged this week_')
  } else {
    for (const c of weekly.slice(0, 12)) lines.push(`• ${c.user} — ${c.hours.toFixed(1)}h`)
  }

  lines.push('')
  lines.push('*Cover next (indoor):*')
  if (recs.indoor.length === 0) {
    lines.push('_every floor has some coverage 🎉_')
  } else {
    for (const e of recs.indoor.slice(0, 6)) {
      const tag = e.untouched ? ' _(untouched)_' : ''
      lines.push(`• ${e.name}${tag} — floors ${e.uncovered.join(', ')}`)
    }
  }
  if (recs.outdoor.length > 0) {
    lines.push('*Cover next (outdoor):*')
    for (const e of recs.outdoor.slice(0, 4)) lines.push(`• ${e.name} — ${e.uncovered.join(', ')}`)
  }

  lines.push('')
  lines.push(`<${APP_URL}/|Open the dashboard →>`)

  return { text: lines.join('\n'), total, weekCount: weekly.length }
}

export async function sendReport(dataDir, webhookUrl) {
  const report = buildReport(dataDir)
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: report.text }),
  })
  const body = await res.text()
  if (!res.ok || body.trim() !== 'ok') {
    throw new Error(`Slack responded ${res.status}: ${body.slice(0, 200)}`)
  }
  return report
}
