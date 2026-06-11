import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useApp } from '../../context/AppContext.jsx';
import {
  getTotalValidHours,
  getFullyCoveredFloorCount,
  getActiveBuildings,
  getCumulativeValidHours,
  getOrientationBalance,
  getCollectionByType,
  getHoursPerBuilding,
  getFloorCoverage,
} from '../../utils/calculations.js';

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#fff',
    border: '1px solid #D0D0D0',
    borderRadius: 2,
    fontSize: 13,
    fontFamily: 'Fira Sans, system-ui, sans-serif',
  },
  labelStyle: { color: '#111', fontWeight: 600 },
};

function Section({ title, children }) {
  return (
    <div className="bg-white border border-border p-5">
      <h3 className="text-sm font-ui font-semibold text-text-secondary uppercase tracking-wide border-b border-border pb-2 mb-4">
        {title}
      </h3>
      {children}
    </div>
  );
}

function HBar({ label, hours, maxHours, color = '#CC0000' }) {
  const pct = maxHours > 0 ? (hours / maxHours) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-sm text-text-secondary w-28 truncate capitalize">{label}</span>
      <div className="flex-1 h-2 bg-bg border border-border overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="font-mono text-sm text-text-primary w-14 text-right">{hours.toFixed(2)}h</span>
    </div>
  );
}

export default function Analysis() {
  const { runs, registry, matches, appSettings } = useApp();

  const validRuns = useMemo(() => runs.filter(r => r.isValid), [runs]);
  const validHours = useMemo(() => getTotalValidHours(runs), [runs]);
  const coverage = useMemo(() => getFloorCoverage(runs, matches), [runs, matches]);
  const { count: floorsDone, total: floorsTotal } = useMemo(
    () => getFullyCoveredFloorCount(runs, registry, matches), [runs, registry, matches]
  );
  const activeBuildings = useMemo(() => getActiveBuildings(runs, registry), [runs, registry]);
  const orientBalance = useMemo(() => getOrientationBalance(runs), [runs]);
  const byType = useMemo(() => getCollectionByType(runs), [runs]);
  const byBuilding = useMemo(() => getHoursPerBuilding(runs, registry), [runs, registry]);
  const cumulative = useMemo(() => getCumulativeValidHours(runs), [runs]);

  const passRate = runs.length ? (validRuns.length / runs.length) * 100 : 0;
  const maxOrient = Math.max(orientBalance.forward, orientBalance.backward, orientBalance.lateral, 0.01);
  const maxType = byType[0]?.hours ?? 0.01;
  const maxBuilding = byBuilding[0]?.hours ?? 0.01;

  return (
    <div className="p-6 max-w-[1200px] mx-auto space-y-6">

      <div className="grid grid-cols-2 gap-6">

        <Section title="Collection by Movement">
          <div className="space-y-3">
            <HBar label="Forward" hours={orientBalance.forward} maxHours={maxOrient} color="#CC0000" />
            <HBar label="Backward" hours={orientBalance.backward} maxHours={maxOrient} color="#1D4ED8" />
            <HBar label="Lateral" hours={orientBalance.lateral} maxHours={maxOrient} color="#15803D" />
          </div>
          <p className="mt-4 text-xs italic text-text-secondary border-t border-border/40 pt-3">
            Category sums reflect session-level labels as logged and may not reconcile with the overall valid-hours total.
          </p>
        </Section>

        <Section title="Collection by Type">
          <div className="space-y-3">
            {byType.slice(0, 5).map(({ type, hours }, i) => (
              <HBar key={type} label={type} hours={hours} maxHours={maxType}
                color={['#CC0000', '#1D4ED8', '#15803D', '#B45309', '#7C3AED'][i]} />
            ))}
            {byType.length === 0 && <p className="text-text-secondary text-sm">No valid data</p>}
          </div>
          <p className="mt-4 text-xs italic text-text-secondary border-t border-border/40 pt-3">
            Category sums reflect session-level labels as logged and may not reconcile with the overall valid-hours total.
          </p>
        </Section>

        <Section title="Cumulative Valid Hours Over Time">
          {cumulative.length < 2 ? (
            <div className="h-[200px] flex items-center justify-center text-text-secondary text-sm italic">
              Not enough data points yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={cumulative} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#F0F0F0" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date"
                  tick={{ fill: '#555', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickLine={false} axisLine={{ stroke: '#E5E5E5' }}
                  tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fill: '#555', fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [`${v.toFixed(2)} hrs`, 'Valid Hours']} />
                <Line type="monotone" dataKey="hours" stroke="#CC0000" strokeWidth={2}
                  dot={false} activeDot={{ r: 4, fill: '#CC0000' }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Section>

        <Section title="Hours by Building (top 10)">
          <div className="space-y-2">
            {byBuilding.slice(0, 10).map(({ id, name, hours }) => (
              <HBar key={id} label={id} hours={hours} maxHours={maxBuilding} color="#CC0000" />
            ))}
            {byBuilding.length === 0 && <p className="text-text-secondary text-sm">No data</p>}
          </div>
        </Section>

        <Section title="Run Validity">
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Valid runs', value: validRuns.length, cls: 'text-success' },
                { label: 'Invalid runs', value: runs.length - validRuns.length, cls: 'text-danger' },
                { label: 'Pass rate', value: `${passRate.toFixed(1)}%`, cls: passRate >= 80 ? 'text-success' : passRate >= 60 ? 'text-warning' : 'text-danger' },
                { label: 'Total runs', value: runs.length, cls: 'text-text-primary' },
              ].map(({ label, value, cls }) => (
                <tr key={label} className="border-b border-border/40 last:border-0">
                  <td className="py-2 text-text-secondary">{label}</td>
                  <td className={`py-2 text-right font-mono font-semibold ${cls}`}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="Coverage Summary">
          <table className="w-full text-sm">
            <tbody>
              {[
                { label: 'Floors fully recorded', value: `${floorsDone} / ${floorsTotal}`, pct: floorsTotal > 0 ? floorsDone / floorsTotal : 0 },
                { label: 'Buildings with data', value: `${activeBuildings.size} / ${registry.buildings.length}`, pct: registry.buildings.length > 0 ? activeBuildings.size / registry.buildings.length : 0 },
              ].map(({ label, value, pct }) => (
                <tr key={label} className="border-b border-border/40 last:border-0">
                  <td className="py-2 text-text-secondary">{label}</td>
                  <td className="py-2 text-right">
                    <span className="font-mono font-semibold">{value}</span>
                    <span className="text-text-secondary font-mono ml-2 text-xs">({(pct * 100).toFixed(0)}%)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

      </div>
    </div>
  );
}
