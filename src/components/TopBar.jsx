import { useApp } from '../context/AppContext.jsx'
import { getTotalValidHours } from '../utils/calculations.js'

function fmtTime(iso) {
  if (!iso) return null
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function SyncBadge({ status }) {
  if (!status) return null
  if (!status.configured) {
    return <span className="text-[11px] font-mono text-text-secondary/70">auto-sync off</span>
  }
  const dot = status.state === 'error' ? 'bg-danger'
    : status.state === 'syncing' ? 'bg-warning animate-pulse'
    : 'bg-success'
  const when = fmtTime(status.lastSyncAt) || fmtTime(status.lastCheckedAt)
  const label = status.state === 'syncing' ? 'syncing…'
    : status.state === 'error' ? 'sync error'
    : when ? `synced ${when}` : 'waiting…'
  return (
    <span className="flex items-center gap-1.5 text-[11px] font-mono text-text-secondary" title={status.message || ''}>
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} />
      {label}
    </span>
  )
}

export default function TopBar() {
  const { runs, logFilename, manifestFilename, syncStatus } = useApp()

  const campaignHours = runs ? getTotalValidHours(runs).toFixed(1) : null
  const activeFile = manifestFilename || logFilename

  return (
    <header className="sticky top-0 z-20 bg-white border-b-2 border-accent px-5 h-14 flex items-center gap-6">
      <div className="flex flex-col justify-center leading-tight">
        <span className="font-ui font-semibold text-text-primary text-sm tracking-tight">
          CMU WiSELab Data Campaign Tracker
        </span>
        <span className="text-[11px] text-text-secondary italic">
          Wireless Sensing &amp; Embedded Lab
        </span>
      </div>

      <div className="w-px h-6 bg-border shrink-0" />

      <div className="flex-1 min-w-0 flex items-center gap-4">
        {runs && activeFile ? (
          <span className="text-text-secondary text-sm truncate">
            {activeFile}
            <span className="text-border mx-2">·</span>
            <span className="text-accent font-semibold font-mono text-xs">{campaignHours}h campaign</span>
          </span>
        ) : (
          <span className="text-text-secondary text-sm italic">no data loaded</span>
        )}
      </div>

      <SyncBadge status={syncStatus} />
    </header>
  )
}
