import { useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { getTotalValidHours } from '../utils/calculations.js'

export default function TopBar() {
  const { runs, logFilename, manifestFilename, refresh } = useApp()
  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }

  const validHours = runs ? getTotalValidHours(runs).toFixed(1) : null
  const totalRuns = runs?.length ?? 0
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
            <span className="font-mono text-xs">{totalRuns} runs</span>
            <span className="text-border mx-2">·</span>
            <span className="text-accent font-semibold font-mono text-xs">{validHours}h valid</span>
          </span>
        ) : (
          <span className="text-text-secondary text-sm italic">no data loaded</span>
        )}
      </div>

      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="text-sm px-3 py-1.5 border border-border text-text-secondary hover:border-accent hover:text-accent transition-colors disabled:opacity-50 shrink-0"
      >
        {refreshing ? '↻ refreshing…' : '↻ refresh'}
      </button>
    </header>
  )
}
