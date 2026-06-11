import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import { parseLog } from '../utils/csvParser.js'
import { parseManifest } from '../utils/manifestParser.js'
import { crossReference, getLogOnlyRuns } from '../utils/crossReference.js'
import { getRawMinutes, getCleanMinutes } from '../utils/calculations.js'

const AppContext = createContext(null)

async function apiFetch(path) {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return res
}

async function apiPost(path, body) {
  await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function AppProvider({ children }) {
  const [registry, setRegistryState] = useState(null)
  const [runs, setRuns] = useState(null)
  const [unmatched, setUnmatched] = useState([])
  const [logFilename, setLogFilename] = useState('')
  const [manifestFilename, setManifestFilename] = useState('')
  const [matches, setMatchesState] = useState({})
  const [paths, setPaths] = useState([])
  const [pendingPathRunKey, setPendingPathRunKey] = useState(null)
  const [appSettings, setAppSettingsState] = useState({ hoursGoal: 100 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [showClean, setShowClean] = useState(false)

  const [logText, setLogText] = useState(null)
  const [manifestText, setManifestText] = useState(null)
  const [hasManifest, setHasManifest] = useState(false)

  useEffect(() => {
    if (!registry) return

    if (manifestText) {
      const { runs: mRuns, unmatched: mUnmatched } = parseManifest(manifestText, registry)

      if (logText) {
        const { runs: lRuns, unmatched: lUnmatched } = parseLog(logText, registry)
        const merged = crossReference(mRuns, lRuns)
        const logOnly = getLogOnlyRuns(mRuns, lRuns)
        setRuns([...merged, ...logOnly])
        setUnmatched([...mUnmatched, ...lUnmatched])
      } else {
        for (const r of mRuns) {
          r.isValid = true
          r.isClean = false
        }
        setRuns(mRuns)
        setUnmatched(mUnmatched)
      }
    } else if (logText) {
      const { runs: lRuns, unmatched: lUnmatched } = parseLog(logText, registry)
      setRuns(lRuns)
      setUnmatched(lUnmatched)
    }
  }, [logText, manifestText, registry])

  const loadFromServer = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [buildings, status, matchesData, settings, pathsData] = await Promise.all([
        apiFetch('/api/buildings').then(r => r.json()),
        apiFetch('/api/status').then(r => r.json()),
        apiFetch('/api/matches').then(r => r.json()),
        apiFetch('/api/settings').then(r => r.json()),
        apiFetch('/api/paths').then(r => r.json()),
      ])

      setRegistryState(buildings)
      setMatchesState(matchesData)
      setPaths(pathsData)
      setAppSettingsState(settings)
      setHasManifest(!!status.hasManifest)

      const [lText, mText] = await Promise.all([
        status.hasLog
          ? apiFetch('/api/log-csv').then(r => r.text())
          : Promise.resolve(null),
        status.hasManifest
          ? apiFetch('/api/manifest-csv').then(r => r.text())
          : Promise.resolve(null),
      ])

      setLogText(lText)
      setManifestText(mText)
      setLogFilename(status.logFilename ?? '')
      setManifestFilename(status.manifestFilename ?? '')

      if (!lText && !mText) {
        setRuns(null)
      }
    } catch (err) {
      setError(err.message)
      console.error('Server load failed:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadFromServer() }, [loadFromServer])

  const rawMinutes = useMemo(() => {
    if (!runs) return 0
    if (hasManifest) return getRawMinutes(runs)
    return runs.filter(r => r.isValid).reduce((s, r) => s + r.duration, 0)
  }, [runs, hasManifest])

  const cleanMinutes = useMemo(() => {
    if (!runs) return 0
    return getCleanMinutes(runs)
  }, [runs])

  function setRegistry(newRegistry) {
    setRegistryState(newRegistry)
    apiPost('/api/buildings', newRegistry).catch(console.error)
  }

  function assignMatch(runKey, matchData) {
    setMatchesState(prev => {
      const next = matchData
        ? { ...prev, [runKey]: matchData }
        : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== runKey))
      apiPost('/api/matches', next).catch(console.error)
      return next
    })
  }

  function setAppSettings(s) {
    setAppSettingsState(s)
    apiPost('/api/settings', s).catch(console.error)
  }

  async function savePath(path) {
    await apiPost('/api/paths', path)
    await loadFromServer()
  }

  async function deletePath(runKey) {
    await fetch(`/api/paths/${encodeURIComponent(runKey)}`, { method: 'DELETE' })
    await loadFromServer()
  }

  return (
    <AppContext.Provider value={{
      registry,
      setRegistry,
      runs,
      unmatched,
      logFilename,
      manifestFilename,
      hasManifest,
      rawMinutes,
      cleanMinutes,
      showClean,
      setShowClean,
      matches,
      assignMatch,
      paths,
      savePath,
      deletePath,
      pendingPathRunKey,
      setPendingPathRunKey,
      appSettings,
      setAppSettings,
      activeTab,
      setActiveTab,
      loading,
      error,
      refresh: loadFromServer,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
