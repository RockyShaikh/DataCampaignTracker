import { useState, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext.jsx';

function FloorChips({ floors, onChange, placeholder = 'Add floor…' }) {
  const [input, setInput] = useState('');
  function add() {
    const f = input.trim().toLowerCase();
    if (f && !floors.includes(f)) onChange([...floors, f]);
    setInput('');
  }
  return (
    <div className="flex flex-wrap gap-1.5 items-center">
      {floors.map(f => (
        <span key={f} className="flex items-center gap-1 bg-bg text-text-primary border border-border rounded-lg px-2 py-0.5 text-xs font-mono">
          {f}
          <button onClick={() => onChange(floors.filter(x => x !== f))} className="hover:text-danger ml-0.5 transition-colors">✕</button>
        </span>
      ))}
      <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
        placeholder={placeholder}
        className="bg-white border border-dashed border-border rounded-lg px-2 py-0.5 text-xs font-mono text-text-primary placeholder-text-secondary focus:outline-none focus:border-accent/40 w-24" />
      <button onClick={add} className="text-xs font-mono px-2 py-0.5 border border-border rounded-lg text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">
        Add
      </button>
    </div>
  );
}

function KVEditor({ data, onChange, keyPlaceholder = 'key', valPlaceholder = 'value' }) {
  const [k, setK] = useState('');
  const [v, setV] = useState('');
  function add() {
    if (k.trim() && v.trim()) { onChange({ ...data, [k.trim()]: v.trim() }); setK(''); setV(''); }
  }
  function remove(key) {
    const next = { ...data }; delete next[key]; onChange(next);
  }
  const inp = "bg-white border border-dashed border-border rounded-lg px-2 py-0.5 text-xs font-mono text-text-primary placeholder-text-secondary focus:outline-none w-24";
  return (
    <div className="space-y-1">
      {Object.entries(data || {}).map(([key, val]) => (
        <div key={key} className="flex items-center gap-2 text-xs font-mono">
          <span className="text-text-secondary w-24 truncate">{key}</span>
          <span className="text-text-secondary">→</span>
          <span className="text-accent">{val}</span>
          <button onClick={() => remove(key)} className="text-text-secondary hover:text-danger transition-colors ml-1">✕</button>
        </div>
      ))}
      <div className="flex gap-2 items-center">
        <input value={k} onChange={e => setK(e.target.value)} placeholder={keyPlaceholder} className={inp} />
        <span className="text-text-secondary text-xs">→</span>
        <input value={v} onChange={e => setV(e.target.value)} placeholder={valPlaceholder} className={inp} />
        <button onClick={add} className="text-xs font-mono px-2 py-0.5 border border-border rounded-lg text-text-secondary hover:text-accent hover:border-accent/40 transition-colors">Add</button>
      </div>
    </div>
  );
}

function BuildingRow({ building, onUpdate, onRemove }) {
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const field = (key, val) => onUpdate({ ...building, [key]: val });
  const inp = "mt-1 block w-full bg-white border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent/40";

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-bg transition-colors" onClick={() => setExpanded(e => !e)}>
        <span className="font-mono text-xs font-semibold text-text-secondary w-12">{building.id}</span>
        <span className="font-ui text-sm text-text-primary">{building.name}</span>
        <span className="text-xs text-text-secondary ml-1">· {building.floors?.length ?? 0} floors</span>
        <span className="ml-auto text-text-secondary text-[10px]">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3 space-y-4 bg-bg/30">
          <div className="grid grid-cols-2 gap-3">
            <label><span className="text-xs text-text-secondary font-mono">Name</span><input value={building.name} onChange={e => field('name', e.target.value)} className={inp} /></label>
            <label><span className="text-xs text-text-secondary font-mono">ID</span><input value={building.id} onChange={e => field('id', e.target.value)} className={inp} /></label>
          </div>
          <div>
            <span className="text-xs text-text-secondary font-mono block mb-1.5">
              Aliases <span className="text-text-secondary/60">(names typed in logs — the matching key)</span>
            </span>
            <FloorChips floors={building.aliases || []} onChange={v => field('aliases', v)} placeholder="Add alias…" />
          </div>
          <div>
            <span className="text-xs text-text-secondary font-mono block mb-1.5">Floors</span>
            <FloorChips floors={building.floors || []} onChange={v => field('floors', v)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs text-text-secondary font-mono block mb-1.5">Floor Aliases</span>
              <KVEditor data={building.floorAliases || {}} onChange={v => field('floorAliases', v)} keyPlaceholder="alias" valPlaceholder="floor" />
            </div>
            <div>
              <span className="text-xs text-text-secondary font-mono block mb-1.5">Room → Floor</span>
              <KVEditor data={building.roomToFloor || {}} onChange={v => field('roomToFloor', v)} keyPlaceholder="room#" valPlaceholder="floor" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="text-xs text-text-secondary font-mono">Lat</span><input type="number" step="0.0001" value={building.lat || ''} onChange={e => field('lat', parseFloat(e.target.value))} className={inp} /></label>
            <label><span className="text-xs text-text-secondary font-mono">Lng</span><input type="number" step="0.0001" value={building.lng || ''} onChange={e => field('lng', parseFloat(e.target.value))} className={inp} /></label>
          </div>
          <div className="flex justify-end pt-1">
            {confirm ? (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-danger font-mono">Remove {building.name}?</span>
                <button onClick={onRemove} className="text-xs font-mono px-3 py-1 bg-danger/10 border border-danger/30 text-danger rounded-lg hover:bg-danger/20 transition-colors">Confirm</button>
                <button onClick={() => setConfirm(false)} className="text-xs font-mono px-3 py-1 border border-border text-text-secondary rounded-lg">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirm(true)} className="text-xs font-mono px-3 py-1 border border-danger/20 text-danger rounded-lg hover:bg-danger-light transition-colors">
                🗑 Remove
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}
function BackupsCard() {
  const [list, setList] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(() => {
    fetch('/api/backups').then(r => r.json()).then(setList).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createNow() {
    setBusy(true); setErr('');
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      load();
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-ui font-semibold text-text-primary text-sm">Data Backups</h3>
        <button onClick={createNow} disabled={busy}
          className="text-xs font-ui px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50">
          {busy ? 'Backing up…' : '⤓ Create backup now'}
        </button>
      </div>
      <p className="text-xs font-mono text-text-secondary mb-3">
        Snapshots the live data folder (matches, paths, registry, log/manifest) tied to the current code version.
      </p>
      {err && <p className="text-xs font-mono text-danger mb-2">{err}</p>}
      {list.length === 0 ? (
        <p className="text-xs font-mono text-text-secondary">No backups yet.</p>
      ) : (
        <div className="space-y-1">
          {list.slice(0, 10).map(b => (
            <div key={b.name} className="flex items-center gap-3 text-xs font-mono">
              <span className="text-text-secondary w-32 shrink-0">{b.createdAt ? fmt(b.createdAt) : b.name}</span>
              <span className="text-accent shrink-0">{b.gitSha || '—'}</span>
              <span className="text-text-secondary truncate">{(b.files || []).length} files</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SlackReportCard() {
  const [preview, setPreview] = useState(null);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    fetch('/api/slack-report/preview').then(r => r.json()).then(d => {
      setPreview(d.text || ''); setConfigured(!!d.configured);
    }).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function send() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/slack-report', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `Error ${res.status}`);
      setMsg(`Sent ✓ (${d.weekCount} collectors this week)`);
    } catch (e) { setMsg(`Failed: ${e.message}`); }
    finally { setBusy(false); }
  }

  return (
    <div className="bg-white border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-ui font-semibold text-text-primary text-sm">Slack Weekly Report</h3>
        <button onClick={send} disabled={busy || !configured}
          className="text-xs font-ui px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
          title={configured ? '' : 'Set SLACK_WEBHOOK_URL on the server first'}>
          {busy ? 'Sending…' : configured ? '➤ Send to Slack' : 'Webhook not set'}
        </button>
      </div>
      {msg && <p className="text-xs font-mono text-text-secondary mb-2">{msg}</p>}
      <pre className="text-[11px] font-mono text-text-secondary whitespace-pre-wrap bg-bg border border-border rounded-lg p-3 max-h-72 overflow-auto">
        {preview ?? 'Loading preview…'}
      </pre>
    </div>
  );
}

export default function Settings() {
  const { registry, setRegistry, appSettings, setAppSettings } = useApp();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newB, setNewB] = useState({ id: '', name: '', aliases: [], floors: [], lat: 40.4433, lng: -79.9436 });
  const uploadRef = useRef(null);

  function updateBuilding(idx, updated) {
    const buildings = [...registry.buildings];
    buildings[idx] = updated;
    setRegistry({ ...registry, buildings });
  }
  function removeBuilding(idx) {
    setRegistry({ ...registry, buildings: registry.buildings.filter((_, i) => i !== idx) });
  }
  function addBuilding() {
    setRegistry({ ...registry, buildings: [...registry.buildings, newB] });
    setNewB({ id: '', name: '', aliases: [], floors: [], lat: 40.4433, lng: -79.9436 });
    setShowNewForm(false);
  }
  function downloadJSON() {
    const blob = new Blob([JSON.stringify(registry, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'buildings.json'; a.click();
    URL.revokeObjectURL(url);
  }
  function handleUpload(e) {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (confirm('Replace current building registry?')) setRegistry(data);
      } catch { alert('Invalid JSON'); }
    };
    reader.readAsText(file); e.target.value = '';
  }

  const inputCls = "bg-white border border-border rounded-lg px-2 py-1.5 text-xs font-mono text-text-primary focus:outline-none focus:border-accent/40";

  return (
    <div className="p-5 max-w-[900px] mx-auto space-y-6">

      {/* Data sync info */}
      <div className="bg-white border border-border rounded-xl p-4">
        <h3 className="font-ui font-semibold text-text-primary text-sm mb-1">Data Source</h3>
        <p className="text-xs font-mono text-text-secondary">
          Log &amp; manifest sync automatically from the Google Sheet every few minutes.
          See the sync status in the top bar — no manual upload needed.
        </p>
      </div>

      {/* Backups */}
      <BackupsCard />

      {/* Slack report */}
      <SlackReportCard />

      {/* Hours goal */}
      <div className="bg-white border border-border rounded-xl p-4">
        <h3 className="font-ui font-semibold text-text-primary text-sm mb-3">Collection Goal</h3>
        <div className="flex items-center gap-3">
          <label className="text-xs font-mono text-text-secondary">Hours goal (displayed on Overview progress bar):</label>
          <input
            type="number"
            min="1"
            value={appSettings?.hoursGoal ?? 100}
            onChange={e => setAppSettings({ ...appSettings, hoursGoal: parseInt(e.target.value) || 100 })}
            className={`${inputCls} w-24`}
          />
          <span className="text-xs font-mono text-text-secondary">hours</span>
        </div>
      </div>

      {/* Import/Export */}
      <div className="bg-white border border-border rounded-xl p-4">
        <h3 className="font-ui font-semibold text-text-primary text-sm mb-3">Registry Import / Export</h3>
        <div className="flex gap-3 flex-wrap">
          <button onClick={downloadJSON} className="text-xs font-ui px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors">
            ↓ Download buildings.json
          </button>
          <button onClick={() => uploadRef.current?.click()} className="text-xs font-ui px-4 py-2 border border-border text-text-secondary rounded-lg hover:border-text-secondary hover:text-text-primary transition-colors">
            ↑ Upload buildings.json
          </button>
          <input ref={uploadRef} type="file" accept=".json" className="hidden" onChange={handleUpload} />
        </div>
        <p className="text-xs font-mono text-text-secondary mt-2">
          Download to version-control your registry. Upload to restore or share with teammates.
        </p>
      </div>

      {/* Buildings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-ui font-semibold text-text-primary">Campus Buildings ({registry.buildings.length})</h3>
          {!showNewForm && (
            <button onClick={() => setShowNewForm(true)} className="text-xs font-ui px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors">
              + Add Building
            </button>
          )}
        </div>

        {showNewForm && (
          <div className="mb-3 border border-accent/20 bg-accent-light rounded-xl px-4 pb-4 pt-3 space-y-3">
            <h4 className="font-ui text-sm font-semibold text-accent">New Building</h4>
            <div className="grid grid-cols-2 gap-3">
              <label><span className="text-xs text-text-secondary font-mono">ID</span>
                <input value={newB.id} onChange={e => setNewB(b => ({ ...b, id: e.target.value }))} className={`mt-1 block w-full ${inputCls}`} /></label>
              <label><span className="text-xs text-text-secondary font-mono">Name</span>
                <input value={newB.name} onChange={e => setNewB(b => ({ ...b, name: e.target.value }))} className={`mt-1 block w-full ${inputCls}`} /></label>
            </div>
            <div>
              <span className="text-xs text-text-secondary font-mono block mb-1.5">
                Aliases <span className="text-text-secondary/60">(names typed in logs — the matching key)</span>
              </span>
              <FloorChips floors={newB.aliases || []} onChange={v => setNewB(b => ({ ...b, aliases: v }))} placeholder="Add alias…" />
            </div>
            <div>
              <span className="text-xs text-text-secondary font-mono block mb-1.5">Floors</span>
              <FloorChips floors={newB.floors || []} onChange={v => setNewB(b => ({ ...b, floors: v }))} />
            </div>
            <div className="flex gap-2 pt-1">
              <button onClick={addBuilding} className="text-xs font-ui px-3 py-1.5 bg-accent text-white rounded-lg hover:bg-accent-dark">Add Building</button>
              <button onClick={() => setShowNewForm(false)} className="text-xs font-ui px-3 py-1.5 border border-border text-text-secondary rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {registry.buildings.map((b, i) => (
            <BuildingRow key={`${b.id}-${i}`} building={b}
              onUpdate={updated => updateBuilding(i, updated)}
              onRemove={() => removeBuilding(i)} />
          ))}
        </div>
      </div>

    </div>
  );
}
