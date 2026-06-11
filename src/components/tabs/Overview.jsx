import { useMemo } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import {
  getLeaderboard,
  getFloorCoverage,
  getGrowthRate,
  getCumulativeValidHours,
} from '../../utils/calculations.js';
import EmbeddedMap from '../EmbeddedMap.jsx';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

export default function Overview() {
  const {
    runs, registry, matches, paths, appSettings,
    rawMinutes, cleanMinutes, showClean, setShowClean, hasManifest,
  } = useApp();
  const goal = appSettings?.hoursGoal ?? 100;

  const rawHours = rawMinutes / 60;
  const cleanHours = cleanMinutes / 60;
  const rawPct  = Math.min((rawHours  / goal) * 100, 100);
  const cleanPct = Math.min((cleanHours / goal) * 100, 100);

  const coverage   = useMemo(() => getFloorCoverage(runs, matches), [runs, matches]);
  const leaderboard = useMemo(() => getLeaderboard(runs, registry),   [runs, registry]);
  const growth     = useMemo(() => getGrowthRate(runs),               [runs]);
  const cumulative = useMemo(() => getCumulativeValidHours(runs),     [runs]);

  return (
    <div className="p-5 max-w-[1300px] mx-auto space-y-5">

      {/* Hours progress */}
      <div className="bg-white border border-border p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="space-y-2 flex-1">

            {/* Raw bar */}
            <div className="flex items-baseline gap-3 mb-1">
              <span className="font-mono font-bold text-4xl text-accent">{rawHours.toFixed(1)}</span>
              <span className="text-text-secondary text-lg">/ {goal}h</span>
              <span className="text-xs font-mono text-text-secondary uppercase tracking-wide">raw total</span>
              {growth.pct !== null && (
                <span className={`text-sm font-mono ml-auto ${growth.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                  {growth.delta >= 0 ? '↑' : '↓'} {Math.abs(growth.delta).toFixed(1)}h this week
                  {' '}({growth.pct >= 0 ? '+' : ''}{growth.pct.toFixed(0)}%)
                </span>
              )}
            </div>
            <div className="h-3 bg-bg border border-border overflow-hidden relative">
              <div className="absolute inset-y-0 left-0 bg-accent transition-all" style={{ width: `${rawPct}%` }} />
            </div>

            {/* Clean bar (conditional) */}
            {showClean && (
              <>
                <div className="flex items-baseline gap-3 mt-3 mb-1">
                  <span className="font-mono font-semibold text-2xl text-accent/70">{cleanHours.toFixed(1)}</span>
                  <span className="text-text-secondary">/ {goal}h</span>
                  <span className="text-xs font-mono text-text-secondary uppercase tracking-wide">double-pass clean</span>
                </div>
                <div className="h-3 bg-bg border border-border overflow-hidden relative">
                  <div className="absolute inset-y-0 left-0 bg-accent/25 transition-all" style={{ width: `${rawPct}%` }} />
                  <div className="absolute inset-y-0 left-0 bg-accent/70 transition-all" style={{ width: `${cleanPct}%` }} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Legend + toggle */}
        <div className="flex items-center gap-5 mt-3 text-xs font-mono text-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-2 bg-accent" />
            {rawHours.toFixed(1)}h raw (manifest)
          </span>
          {showClean && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-2 bg-accent/70" />
              {cleanHours.toFixed(1)}h clean
              <span className="inline-block w-3 h-2 bg-accent/25 border border-accent/30 ml-2" />
              {(rawHours - cleanHours).toFixed(1)}h not yet double-passed
            </span>
          )}
          {hasManifest && (
            <label className="flex items-center gap-1.5 cursor-pointer ml-auto text-text-secondary hover:text-text-primary transition-colors select-none">
              <input
                type="checkbox"
                checked={showClean}
                onChange={e => setShowClean(e.target.checked)}
                className="accent-accent"
              />
              Show clean data
            </label>
          )}
        </div>
      </div>

      {/* Main grid: leaderboard + chart */}
      <div className="grid grid-cols-5 gap-5">

        {/* Leaderboard */}
        <div className="col-span-2 bg-white border border-border p-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide border-b border-border pb-2 mb-3">Leaderboard</h2>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-secondary text-xs border-b border-border">
                <th className="text-left pb-2 font-normal w-6">#</th>
                <th className="text-left pb-2 font-normal">Name</th>
                <th className="text-right pb-2 font-normal">Hrs</th>
                <th className="text-right pb-2 font-normal">Runs</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.slice(0, 10).map((c, i) => (
                <tr key={c.user} className="border-b border-border/20 last:border-0">
                  <td className="py-2 text-text-secondary font-mono text-xs">{i + 1}</td>
                  <td className="py-2 font-medium text-text-primary">{c.user}</td>
                  <td className="py-2 text-right font-mono text-accent text-sm">{c.validHours.toFixed(1)}</td>
                  <td className="py-2 text-right font-mono text-text-secondary text-xs">{c.validRuns}</td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr><td colSpan={4} className="py-6 text-center text-text-secondary text-sm">No data</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Cumulative chart */}
        <div className="col-span-3 bg-white border border-border p-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide border-b border-border pb-2 mb-3">Cumulative Valid Hours</h2>
          {cumulative.length < 2 ? (
            <div className="h-[220px] flex items-center justify-center text-text-secondary text-sm italic">
              Not enough data points yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={cumulative} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#F0F0F0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date"
                  tick={{ fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickLine={false} axisLine={{ stroke: '#E5E5E5' }}
                  tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#fff', border: '1px solid #D0D0D0', borderRadius: 2, fontSize: 12, fontFamily: 'Fira Sans' }}
                  labelStyle={{ color: '#111', fontWeight: 600 }}
                  formatter={v => [`${v.toFixed(2)} hrs`, 'Valid Hours']}
                />
                <Line type="monotone" dataKey="hours" stroke="#CC0000" strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: '#CC0000' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Map */}
      <div className="bg-white border border-border overflow-hidden">
        <div className="px-5 py-3 border-b border-border text-sm font-semibold text-text-secondary uppercase tracking-wide">
          Campus Coverage
        </div>
        <div className="h-[380px]">
          <EmbeddedMap runs={runs} registry={registry} coverage={coverage} paths={paths} showIndoor showOutdoor />
        </div>
      </div>

    </div>
  );
}
