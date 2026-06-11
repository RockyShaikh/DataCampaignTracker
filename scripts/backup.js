// Snapshot the live data/ folder into backups/<timestamp>-<git-sha>/
// Each snapshot is tied to the current code version via version.json.
// Usage: npm run backup   (or)   node scripts/backup.js
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const DATA = process.env.DATA_DIR || path.join(ROOT, 'data')
const BACKUPS = path.join(ROOT, 'backups')

export function createBackup() {
  let sha = 'nogit'
  try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim() } catch {}

  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const name = `${ts}-${sha}`
  const dir = path.join(BACKUPS, name)
  fs.mkdirSync(dir, { recursive: true })

  const copied = []
  for (const f of fs.readdirSync(DATA)) {
    if (f.includes(':Zone.Identifier')) continue
    const src = path.join(DATA, f)
    if (fs.statSync(src).isFile()) {
      fs.copyFileSync(src, path.join(dir, f))
      copied.push(f)
    }
  }

  fs.writeFileSync(
    path.join(dir, 'version.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), gitSha: sha, files: copied }, null, 2)
  )
  return { name, createdAt: new Date().toISOString(), gitSha: sha, files: copied }
}

// Run directly (not when imported)
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const b = createBackup()
  console.log(`Backup created → backups/${b.name} (${b.files.length} files)`)
}
