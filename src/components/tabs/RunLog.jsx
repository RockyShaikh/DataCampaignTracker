import { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { getRunKey } from '../../utils/runKey.js';

const VALID_ORIENTATIONS = ['forward', 'backward', 'lateral'];

function unique(arr) {
  return [...new Set(arr.filter(Boolean))].sort();
}

function validityLabel(run) {
  if (!run.hasLogEntry) return 'unverified';
  if (run.isValid) {
    const proc = run.processing?.toLowerCase().trim();
    if (proc === 'minor issue' || proc === 'major issue') return 'minor-issue';
    return 'valid';
  }
  const col = run.collection?.toLowerCase().trim();
  const proc = run.processing?.toLowerCase().trim();
  if (!col || col === '-' || !proc || proc === '-') return 'pending';
  return 'failed';
}

function rowStyle(run) {
  const v = validityLabel(run);
  if (v === 'valid') return 'bg-success-light/50';
  if (v === 'minor-issue') return 'bg-warning-light/50';
  if (v === 'failed') return 'bg-danger-light/50';
  if (v === 'unverified') return 'bg-bg/60';
  return '';
}

function matchedBuilding(run) {
  const ids = [...new Set(run.locationResults.filter(l => l.building).map(l => l.building.id))];
  return ids.join(', ') || '—';
}

function hasFloorCredit(run) {
  return run.locationResults.some(l => l.creditFloor && l.building);
}

function floorCreditPairs(run) {
  if (!VALID_ORIENTATIONS.includes(run.movement)) return [];
  const pairs = run.locationResults
    .filter(l => l.creditFloor && l.building)
    .map(l => `${l.building.id}.${l.floor}`);
  return [...new Set(pairs)];
}

// A match stores a single `floor` (legacy) or a `floors` array (multi-floor).
function assignedFloors(match) {
  if (!match) return [];
  if (Array.isArray(match.floors)) return match.floors;
  if (match.floor != null) return [match.floor];
  return [];
}

function AssignFloorCell({ run }) {
  const { registry, matches, assignMatch } = useApp();
  const [open, setOpen] = useState(false);
  const [selBuilding, setSelBuilding] = useState('');
  const [selFloors, setSelFloors] = useState([]);

  const runKey = getRunKey(run);
  const assigned = matches[runKey];
  const floors = assignedFloors(assigned);

  function startEdit() {
    setSelBuilding(assigned?.buildingId || '');
    setSelFloors(floors);
    setOpen(true);
  }

  if (assigned && !open) {
    return (
      <span className="font-mono text-[10px] text-accent leading-tight">
        {floors.map(f => `${assigned.buildingId}.${f}`).join(' · ')}
        <button
          onClick={startEdit}
          className="ml-1 text-text-secondary hover:text-accent transition-colors"
          title="Edit assignment"
        >✎</button>
        <button
          onClick={() => assignMatch(runKey, null)}
          className="ml-1 text-text-secondary hover:text-danger transition-colors"
          title="Remove assignment"
        >✕</button>
      </span>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => { setSelBuilding(''); setSelFloors([]); setOpen(true); }}
        className="text-[10px] font-mono text-accent/70 hover:text-accent hover:underline transition-colors"
      >
        Assign →
      </button>
    );
  }

  const building = registry.buildings.find(b => b.id === selBuilding);

  function toggleFloor(f) {
    setSelFloors(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  function confirm() {
    if (selBuilding && selFloors.length > 0) {
      assignMatch(runKey, { buildingId: selBuilding, floors: selFloors });
      setOpen(false);
    }
  }

  const selCls = "text-[10px] font-mono border border-border rounded px-1 py-0.5 bg-white focus:outline-none focus:border-accent/40";

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <select value={selBuilding} onChange={e => { setSelBuilding(e.target.value); setSelFloors([]); }} className={selCls}>
        <option value="">Bldg…</option>
        {registry.buildings.map(b => (
          <option key={b.id} value={b.id}>{b.id}</option>
        ))}
      </select>
      {(building?.floors || []).map(f => (
        <button
          key={f}
          onClick={() => toggleFloor(f)}
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
            selFloors.includes(f)
              ? 'bg-accent text-white border-accent'
              : 'border-border text-text-secondary hover:border-accent/40'
          }`}
        >{f}</button>
      ))}
      <button
        onClick={confirm}
        disabled={!selBuilding || selFloors.length === 0}
        className="text-[10px] font-mono px-1.5 py-0.5 bg-accent text-white rounded disabled:opacity-40 hover:bg-accent-dark transition-colors"
      >✓</button>
      <button onClick={() => setOpen(false)} className="text-[10px] text-text-secondary hover:text-text-primary transition-colors">✕</button>
    </div>
  );
}

function PathCell({ run }) {
  const { paths, setPendingPathRunKey, setActiveTab } = useApp();
  const runKey = getRunKey(run);
  const hasPath = paths.some(p => p.runKey === runKey && p.points?.length >= 2);

  function record() {
    setPendingPathRunKey(runKey);
    setActiveTab('map');
  }

  if (hasPath) {
    return (
      <button
        onClick={record}
        className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-success/40 text-success hover:bg-success-light transition-colors whitespace-nowrap"
        title="Edit recorded path"
      >
        ✓ Edit Path
      </button>
    );
  }

  return (
    <button
      onClick={record}
      className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-border text-text-secondary/70 hover:text-accent hover:border-accent/40 transition-colors whitespace-nowrap"
      title="Record a path for this run"
    >
      📍 Record
    </button>
  );
}

export default function RunLog() {
  const { runs, paths } = useApp();

  const pathKeys = useMemo(
    () => new Set(paths.filter(p => p.points?.length >= 2).map(p => p.runKey)),
    [paths]
  );

  const users = useMemo(() => unique(runs.map(r => r.user)), [runs]);
  const types = useMemo(() => unique(runs.map(r => r.type)), [runs]);
  const movements = useMemo(() => unique(runs.map(r => r.movement)), [runs]);

  const [filterUsers, setFilterUsers] = useState([]);
  const [filterType, setFilterType] = useState('');
  const [filterMovement, setFilterMovement] = useState('');
  const [filterValidity, setFilterValidity] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterFloorCredit, setFilterFloorCredit] = useState('');
  const [filterPath, setFilterPath] = useState('');
  const [sortKey, setSortKey] = useState('date');
  const [sortDir, setSortDir] = useState('desc');

  function toggleUser(u) {
    setFilterUsers(prev => prev.includes(u) ? prev.filter(x => x !== u) : [...prev, u]);
  }

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const filtered = useMemo(() => {
    let list = [...runs];
    if (filterUsers.length > 0) list = list.filter(r => filterUsers.includes(r.user));
    if (filterType) list = list.filter(r => r.type === filterType);
    if (filterMovement) list = list.filter(r => r.movement === filterMovement);
    if (filterValidity) list = list.filter(r => validityLabel(r) === filterValidity);
    if (filterLocation) {
      const q = filterLocation.toLowerCase();
      list = list.filter(r => r.rawLocation.toLowerCase().includes(q));
    }
    if (filterFloorCredit === 'yes') list = list.filter(r => hasFloorCredit(r));
    if (filterFloorCredit === 'no') list = list.filter(r => !hasFloorCredit(r));
    if (filterPath === 'recorded') list = list.filter(r => pathKeys.has(getRunKey(r)));
    if (filterPath === 'none') list = list.filter(r => !pathKeys.has(getRunKey(r)));
    list.sort((a, b) => {
      let va, vb;
      if (sortKey === 'date') { va = a.date?.getTime() ?? 0; vb = b.date?.getTime() ?? 0; }
      else if (sortKey === 'duration') { va = a.duration; vb = b.duration; }
      else { va = a[sortKey] || ''; vb = b[sortKey] || ''; }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  }, [runs, filterUsers, filterType, filterMovement, filterValidity, filterLocation, filterFloorCredit, filterPath, pathKeys, sortKey, sortDir]);

  function Th({ col, label, right = false }) {
    return (
      <th
        className={`px-3 py-2.5 cursor-pointer hover:text-text-primary transition-colors select-none whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}
        onClick={() => handleSort(col)}
      >
        {label}{sortKey === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    );
  }

  const selectClass = "bg-white border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-secondary focus:outline-none focus:border-accent/40 cursor-pointer";

  return (
    <div className="p-5 max-w-[1600px] mx-auto space-y-3">
      {/* Filters */}
      <div className="bg-white border border-border rounded-xl p-3 flex flex-wrap gap-2 items-center">
        <span className="text-xs font-mono text-text-secondary mr-1">Filter:</span>
        <div className="flex flex-wrap gap-1">
          {users.map(u => (
            <button key={u} onClick={() => toggleUser(u)}
              className={`text-xs font-mono px-2 py-1 rounded-lg border transition-colors ${
                filterUsers.includes(u)
                  ? 'border-accent bg-accent-light text-accent font-semibold'
                  : 'border-border text-text-secondary hover:border-accent/40'
              }`}>
              {u}
            </button>
          ))}
        </div>
        <div className="w-px h-5 bg-border mx-1" />
        <select className={selectClass} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All types</option>
          {types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className={selectClass} value={filterMovement} onChange={e => setFilterMovement(e.target.value)}>
          <option value="">All movements</option>
          {movements.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select className={selectClass} value={filterValidity} onChange={e => setFilterValidity(e.target.value)}>
          <option value="">All validity</option>
          <option value="valid">✓ Valid</option>
          <option value="minor-issue">~ Minor Issue</option>
          <option value="failed">✗ Failed</option>
          <option value="pending">– Pending</option>
          <option value="unverified">? Unverified</option>
        </select>
        <select className={selectClass} value={filterFloorCredit} onChange={e => setFilterFloorCredit(e.target.value)}>
          <option value="">All floor credit</option>
          <option value="yes">✓ Has floor credit</option>
          <option value="no">— No floor credit</option>
        </select>
        <select className={selectClass} value={filterPath} onChange={e => setFilterPath(e.target.value)}>
          <option value="">All paths</option>
          <option value="recorded">✓ Path recorded</option>
          <option value="none">✗ Path not recorded</option>
        </select>
        <input type="text" placeholder="Search location…" value={filterLocation}
          onChange={e => setFilterLocation(e.target.value)}
          className="bg-white border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent/40 w-36" />
        <span className="text-xs font-mono text-text-secondary ml-auto">
          <span className="text-text-primary font-semibold">{filtered.length}</span> of {runs.length} runs
        </span>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-text-secondary uppercase tracking-wider text-[10px] bg-bg font-mono">
              <Th col="date" label="Date" />
              <Th col="user" label="User" />
              <th className="text-left px-3 py-2.5">Location</th>
              <th className="text-left px-3 py-2.5">Building</th>
              <Th col="type" label="Type" />
              <Th col="movement" label="Movement" />
              <Th col="duration" label="Min (manifest)" right />
              <th className="text-left px-3 py-2.5">Collect</th>
              <th className="text-left px-3 py-2.5">Process</th>
              <th className="text-center px-3 py-2.5">✓</th>
              <th className="text-left px-3 py-2.5 min-w-[120px]">Floor</th>
              <th className="text-left px-3 py-2.5">Notes</th>
              <th className="text-left px-3 py-2.5">Path</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((run, i) => {
              const pairs = floorCreditPairs(run);
              const canAssign = run.source !== 'log' && pairs.length === 0;

              return (
                <tr key={i} className={`border-b border-border/30 hover:bg-bg transition-colors font-mono ${rowStyle(run)}`}>
                  <td className="px-3 py-2 text-text-secondary whitespace-nowrap">
                    {run.date ? run.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2 text-text-primary font-ui font-medium">{run.user}</td>
                  <td className="px-3 py-2 text-text-secondary max-w-[120px] truncate" title={run.rawLocation}>
                    {run.rawLocation}
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{matchedBuilding(run)}</td>
                  <td className="px-3 py-2 text-text-secondary capitalize">{run.type}</td>
                  <td className="px-3 py-2 text-text-secondary capitalize">{run.movement}</td>
                  <td className="px-3 py-2 text-right text-text-primary font-mono">
                    {run.duration ? run.duration.toFixed(1) : '—'}
                    {run.source === 'log' && <span className="text-text-secondary text-[9px] ml-0.5">est</span>}
                  </td>
                  <td className={`px-3 py-2 ${(run.collection?.toLowerCase() === 'pass' || run.collection?.toLowerCase() === 'recovered') ? 'text-success' : 'text-danger'}`}>
                    {run.collection || '—'}
                  </td>
                  <td className={`px-3 py-2 ${
                    run.processing?.toLowerCase().trim() === 'pass' ? 'text-success' :
                    run.processing?.toLowerCase().trim() === 'minor issue' ? 'text-warning' :
                    'text-danger'
                  }`}>
                    {run.processing || '—'}
                  </td>
                  <td className="px-3 py-2 text-center">
                    {(() => {
                      const v = validityLabel(run);
                      if (v === 'valid') return <span className="text-success">✓</span>;
                      if (v === 'minor-issue') return <span className="text-warning">~</span>;
                      if (v === 'unverified') return <span className="text-text-secondary text-[10px]">?</span>;
                      return <span className="text-danger">✗</span>;
                    })()}
                  </td>
                  <td className="px-3 py-2 max-w-[160px]">
                    {pairs.length > 0
                      ? <span className="font-mono text-[10px] text-success leading-tight">{pairs.join(' · ')}</span>
                      : canAssign
                        ? <AssignFloorCell run={run} />
                        : run.isValid
                          ? <span className="text-text-secondary/40 text-xs">—</span>
                          : null
                    }
                  </td>
                  <td className="px-3 py-2 text-text-secondary max-w-[160px] truncate font-ui" title={run.notes}>
                    {run.notes}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <PathCell run={run} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="px-4 py-10 text-center text-text-secondary font-ui">No runs match the current filters</div>
        )}
      </div>
    </div>
  );
}
