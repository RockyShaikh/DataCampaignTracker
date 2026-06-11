import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import {
  getFloorCoverage,
  getBuildingProgress,
  getBuildingValidMinutes,
  getBuildingStairsRuns,
  getBuildingWholeBuildingRuns,
  getCellStatus,
  getCoverageRecommendations,
} from '../../utils/calculations.js';

const ORIENTATIONS = ['forward', 'backward', 'lateral'];
const ORIENT_LABEL = { forward: 'Fwd', backward: 'Bwd', lateral: 'Lat' };

const STATUS_DOT = {
  green:  'bg-success border-success/30 cursor-pointer hover:opacity-75',
  yellow: 'bg-warning border-warning/30 cursor-pointer hover:opacity-75',
  gray:   'bg-border/40 border-border cursor-default',
};

function abbrev(user) {
  return user ? user.slice(0, 3).toLowerCase() : '';
}

function FloorCell({ buildingId, floor, orientation, coverage }) {
  const [show, setShow] = useState(false);
  const status = getCellStatus(coverage, buildingId, floor, orientation);
  const cell = coverage[buildingId]?.[floor]?.[orientation];
  const runs = cell?.runs ?? [];

  return (
    <div className="relative flex justify-center">
      <button
        onClick={() => runs.length > 0 && setShow(s => !s)}
        className={`w-3.5 h-3.5 rounded-full border transition-opacity ${STATUS_DOT[status]}`}
        title={`${orientation} · ${status}${runs.length > 0 ? ` · ${runs.length} run${runs.length !== 1 ? 's' : ''}` : ''}`}
      />
      {show && runs.length > 0 && (
        <div className="absolute z-50 top-full left-1/2 -translate-x-1/2 mt-1 bg-white border border-border rounded-lg p-2 w-52 text-xs font-mono shadow-sm">
          <div className="flex justify-between mb-1">
            <span className="text-text-secondary capitalize">{status} · {runs.length} run{runs.length !== 1 ? 's' : ''}</span>
            <button onClick={() => setShow(false)} className="text-text-secondary hover:text-text-primary">✕</button>
          </div>
          {runs.map((r, i) => (
            <div key={i} className="text-text-secondary py-0.5">
              {r.user} · {r.duration?.toFixed(1)}m
              {r.date ? ` · ${r.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
              {r.isClean && <span className="text-success ml-1">✓clean</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function BuildingCard({ building, runs, coverage }) {
  const [expanded, setExpanded] = useState(false);
  const progress = useMemo(() => getBuildingProgress(building, coverage), [building, coverage]);
  const validMinutes = useMemo(() => getBuildingValidMinutes(building.id, runs), [building.id, runs]);
  const stairsRuns = useMemo(() => getBuildingStairsRuns(building.id, runs), [building.id, runs]);
  const wholeBldgRuns = useMemo(() => getBuildingWholeBuildingRuns(building.id, runs), [building.id, runs]);

  const { fullyRecorded: green, partialCovered: yellow, total } = progress;
  const greenPct = total > 0 ? green / total : 0;
  const yellowPct = total > 0 ? yellow / total : 0;
  const isZone = building.type === 'zone';

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <button
        className="w-full px-4 py-3 flex items-center gap-4 hover:bg-bg transition-colors text-left"
        onClick={() => setExpanded(e => !e)}
      >
        {/* Two-tone progress bar */}
        <div className="w-28 shrink-0">
          <div className="h-1.5 bg-bg rounded-full overflow-hidden flex">
            <div className="h-full bg-success transition-all" style={{ width: `${greenPct * 100}%` }} />
            <div className="h-full bg-warning transition-all" style={{ width: `${yellowPct * 100}%` }} />
          </div>
          <div className="text-[10px] font-mono text-text-secondary mt-0.5">
            {green}✓ {yellow > 0 ? `${yellow}~ ` : ''}{total - green - yellow > 0 ? `${total - green - yellow}— ` : ''}/ {total}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          {isZone && <span className="text-[9px] font-mono uppercase text-text-secondary mr-1.5 bg-bg border border-border rounded px-1 py-0.5">zone</span>}
          <span className="font-mono text-xs font-semibold text-text-secondary">{building.id}</span>
          {' '}
          <span className="font-ui text-sm text-text-primary">{building.name}</span>
        </div>

        <div className="flex items-center gap-3 text-xs font-mono">
          {validMinutes > 0 && (
            <span className="text-success">{(validMinutes / 60).toFixed(1)}h valid</span>
          )}
          <span className="text-text-secondary text-[10px]">{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 bg-bg/30">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse min-w-[380px]">
              <thead>
                <tr className="text-text-secondary text-[10px] uppercase tracking-wider">
                  <th className="text-left py-1.5 pr-3 w-12">Floor</th>
                  {ORIENTATIONS.map(o => (
                    <th key={o} className="text-center py-1.5 px-4 w-20">{ORIENT_LABEL[o]}</th>
                  ))}
                  <th className="text-left py-1.5 px-4">Status</th>
                  <th className="text-right py-1.5 w-14">Time</th>
                </tr>
              </thead>
              <tbody>
                {building.floors.map(floor => {
                  const floorMins = runs
                    .filter(r => r.source !== 'log' && r.locationResults.some(l =>
                      l.building?.id === building.id && l.floor === floor
                    ))
                    .reduce((s, r) => s + r.duration, 0);

                  const statuses = ORIENTATIONS.map(o => getCellStatus(coverage, building.id, floor, o));
                  const allGreen = statuses.every(s => s === 'green');
                  const anyGreen = statuses.some(s => s === 'green');
                  const anyYellow = statuses.some(s => s === 'yellow');

                  return (
                    <tr key={floor} className="border-t border-border/40">
                      <td className="py-2 pr-3 text-text-secondary font-semibold uppercase">{floor}</td>
                      {ORIENTATIONS.map(orientation => (
                        <td key={orientation} className="py-2 px-4">
                          <FloorCell
                            buildingId={building.id}
                            floor={floor}
                            orientation={orientation}
                            coverage={coverage}
                          />
                        </td>
                      ))}
                      <td className="py-2 px-4 text-xs">
                        {allGreen
                          ? <span className="text-success font-semibold">✓ Clean</span>
                          : anyGreen && anyYellow
                            ? <span className="text-warning">partial</span>
                            : anyGreen
                              ? <span className="text-success">partial clean</span>
                              : anyYellow
                                ? <span className="text-warning">collected</span>
                                : <span className="text-text-secondary/40">—</span>
                        }
                      </td>
                      <td className="py-2 text-right text-text-secondary">
                        {floorMins > 0 ? `${floorMins.toFixed(0)}m` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div className="flex gap-4 mt-3 text-[10px] font-mono text-text-secondary">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-success inline-block" /> Clean (double-pass)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-warning inline-block" /> Collected (errors)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-border/40 border border-border inline-block" /> No data</span>
          </div>

          {stairsRuns.length > 0 && (
            <div className="mt-3 text-xs font-mono text-text-secondary border-t border-border/40 pt-2">
              stairs: {stairsRuns.length} run{stairsRuns.length !== 1 ? 's' : ''}, {stairsRuns.reduce((s, r) => s + r.duration, 0).toFixed(0)}m
            </div>
          )}
          {wholeBldgRuns.length > 0 && (
            <div className="mt-1 text-xs font-mono text-text-secondary">
              whole-building: {wholeBldgRuns.length} run{wholeBldgRuns.length !== 1 ? 's' : ''} ({wholeBldgRuns.reduce((s, r) => s + r.duration, 0).toFixed(0)}m)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecsGroup({ title, entries }) {
  if (entries.length === 0) return null;
  return (
    <div className="flex-1 min-w-[260px]">
      <div className="text-[11px] font-mono uppercase tracking-wider text-text-secondary mb-2">{title}</div>
      <div className="space-y-1.5">
        {entries.slice(0, 8).map(e => (
          <div key={e.id} className="flex items-start gap-2 text-xs">
            <span className="font-mono font-semibold text-text-secondary w-12 shrink-0 pt-0.5">{e.id}</span>
            <div className="flex-1 min-w-0">
              <span className="font-ui text-text-primary">{e.name}</span>
              {e.untouched && (
                <span className="ml-1.5 text-[9px] font-mono uppercase bg-accent-light text-accent border border-accent/20 rounded px-1 py-0.5">untouched</span>
              )}
              <div className="flex flex-wrap gap-1 mt-1">
                {e.uncovered.map(f => (
                  <span key={f} className="font-mono text-[10px] bg-bg border border-border rounded px-1.5 py-0.5 text-text-secondary uppercase">{f}</span>
                ))}
              </div>
            </div>
          </div>
        ))}
        {entries.length > 8 && (
          <div className="text-[10px] font-mono text-text-secondary/60 pt-1">+{entries.length - 8} more buildings</div>
        )}
      </div>
    </div>
  );
}

function Recommendations({ registry, coverage }) {
  const recs = useMemo(() => getCoverageRecommendations(registry, coverage), [registry, coverage]);
  const empty = recs.indoor.length === 0 && recs.outdoor.length === 0;
  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <h3 className="font-ui font-semibold text-text-primary text-sm mb-1">Recommended to cover next</h3>
      <p className="text-[11px] font-mono text-text-secondary mb-3">
        Floors with no coverage yet (any orientation). Untouched buildings first.
      </p>
      {empty ? (
        <p className="text-sm text-success">🎉 Every floor has at least some coverage.</p>
      ) : (
        <div className="flex gap-6 flex-wrap">
          <RecsGroup title={`Indoor (${recs.indoor.length})`} entries={recs.indoor} />
          <RecsGroup title={`Outdoor (${recs.outdoor.length})`} entries={recs.outdoor} />
        </div>
      )}
    </div>
  );
}

export default function Buildings() {
  const { runs, registry, matches, unmatched } = useApp();
  const [sortAlpha, setSortAlpha] = useState(false);

  const coverage = useMemo(() => getFloorCoverage(runs, matches), [runs, matches]);

  const buildings = useMemo(() => {
    const list = [...registry.buildings];
    if (sortAlpha) {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => {
        const ap = getBuildingProgress(a, coverage);
        const bp = getBuildingProgress(b, coverage);
        const apct = ap.total > 0 ? (ap.fullyRecorded + ap.partialCovered) / ap.total : 0;
        const bpct = bp.total > 0 ? (bp.fullyRecorded + bp.partialCovered) / bp.total : 0;
        return bpct - apct;
      });
    }
    return list;
  }, [registry, coverage, sortAlpha]);

  return (
    <div className="p-5 max-w-[1200px] mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-ui font-semibold text-text-primary">Building Coverage</h2>
        <button
          onClick={() => setSortAlpha(s => !s)}
          className="text-xs font-mono px-3 py-1.5 border border-border rounded-lg text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors"
        >
          Sort: {sortAlpha ? 'A → Z' : 'Coverage ↓'}
        </button>
      </div>

      <Recommendations registry={registry} coverage={coverage} />

      <div className="space-y-2">
        {buildings.map(b => (
          <BuildingCard
            key={b.id}
            building={b}
            runs={runs}
            coverage={coverage}
          />
        ))}
      </div>

      {unmatched.length > 0 && (
        <div className="bg-warning-light border border-warning/20 rounded-xl p-4 mt-6">
          <h3 className="font-ui font-semibold text-warning text-sm mb-3">
            Unmatched Locations ({unmatched.length})
          </h3>
          <div className="space-y-1">
            {unmatched.map((u, i) => (
              <div key={i} className="font-mono text-xs text-text-secondary">
                "{u.raw}" — {u.count} run{u.count !== 1 ? 's' : ''}, {u.duration.toFixed(0)}m
                <span className="text-text-secondary/50 ml-2">
                  · add a zone in Campus Map, or assign runs manually in Run Log
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
