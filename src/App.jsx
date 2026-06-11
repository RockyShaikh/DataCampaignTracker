import { useApp } from './context/AppContext.jsx'
import TopBar from './components/TopBar.jsx'
import Overview from './components/tabs/Overview.jsx'
import Buildings from './components/tabs/Buildings.jsx'
import CampusMap from './components/tabs/CampusMap.jsx'
import Leaderboard from './components/tabs/Leaderboard.jsx'
import RunLog from './components/tabs/RunLog.jsx'
import Analysis from './components/tabs/Analysis.jsx'
import Settings from './components/tabs/Settings.jsx'

const TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'map',         label: 'Campus Map' },
  { id: 'buildings',   label: 'Buildings' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'runlog',      label: 'Run Log' },
  { id: 'analysis',    label: 'Analysis' },
  { id: 'settings',    label: 'Settings' },
]

function LoadingScreen() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-sm text-text-secondary italic">Loading dashboard…</p>
      </div>
    </div>
  )
}

function NoDataScreen({ error, refresh }) {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <TopBar />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-border flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          {error ? (
            <>
              <h2 className="font-ui font-semibold text-text-primary text-lg mb-2">Cannot reach server</h2>
              <p className="text-text-secondary text-sm italic mb-4">{error}</p>
            </>
          ) : (
            <>
              <h2 className="font-ui font-semibold text-text-primary text-lg mb-2">No data files found</h2>
              <p className="text-text-secondary text-sm mb-1">
                Upload the log and manifest CSVs via the <strong>Settings</strong> tab, then click Refresh.
              </p>
            </>
          )}
          <button
            onClick={refresh}
            className="mt-4 px-4 py-2 bg-accent text-white text-sm font-ui hover:bg-accent-dark transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const { runs, loading, error, refresh, activeTab, setActiveTab } = useApp()

  if (loading) return <LoadingScreen />
  if (!runs || error) return <NoDataScreen error={error} refresh={refresh} />

  return (
    <div className="min-h-screen flex flex-col bg-bg">
      <TopBar />

      <div className="border-b border-border bg-white sticky top-[56px] z-10">
        <div className="flex">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-ui transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'border-accent text-accent bg-accent-light'
                  : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activeTab === 'overview'    && <Overview />}
        {activeTab === 'buildings'   && <Buildings />}
        {activeTab === 'map'         && <CampusMap />}
        {activeTab === 'leaderboard' && <Leaderboard />}
        {activeTab === 'runlog'      && <RunLog />}
        {activeTab === 'analysis'    && <Analysis />}
        {activeTab === 'settings'    && <Settings />}
      </div>
    </div>
  )
}
