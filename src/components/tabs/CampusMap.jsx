import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { getFloorCoverage } from '../../utils/calculations.js';
import { getRunKey } from '../../utils/runKey.js';
import EmbeddedMap from '../EmbeddedMap.jsx';

export default function CampusMap() {
  const {
    runs, registry, setRegistry, matches,
    paths, savePath, deletePath,
    pendingPathRunKey, setPendingPathRunKey,
  } = useApp();
  const coverage = useMemo(() => getFloorCoverage(runs, matches), [runs, matches]);

  const gpxInputRef = useRef(null);
  const [showIndoor, setShowIndoor] = useState(true);
  const [showOutdoor, setShowOutdoor] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [drawnPoints, setDrawnPoints] = useState([]);

  const recording = pendingPathRunKey != null;

  // The run currently being recorded for (for the banner label).
  const recordingRun = useMemo(
    () => (runs || []).find(r => getRunKey(r) === pendingPathRunKey),
    [runs, pendingPathRunKey]
  );

  // When entering recording mode, pre-load any existing path's points.
  useEffect(() => {
    if (!recording) return;
    setEditMode(false);
    const existing = paths.find(p => p.runKey === pendingPathRunKey);
    setDrawnPoints(existing?.points ? existing.points.map(p => ({ ...p })) : []);
  }, [pendingPathRunKey]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleMapClick(latlng) {
    if (!recording) return;
    setDrawnPoints(prev => [...prev, { lat: latlng.lat, lng: latlng.lng }]);
  }

  function undoLastPoint() {
    setDrawnPoints(prev => prev.slice(0, -1));
  }

  function clearPoints() {
    setDrawnPoints([]);
  }

  function handleSave() {
    if (drawnPoints.length < 2) return;
    savePath({
      runKey: pendingPathRunKey,
      points: drawnPoints.map(p => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) })),
      recordedAt: new Date().toISOString(),
    });
    setPendingPathRunKey(null);
    setDrawnPoints([]);
  }

  function handleDelete() {
    deletePath(pendingPathRunKey);
    setPendingPathRunKey(null);
    setDrawnPoints([]);
  }

  function cancelRecording() {
    setPendingPathRunKey(null);
    setDrawnPoints([]);
  }

  function handleGpxImport(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const doc = new DOMParser().parseFromString(ev.target.result, 'application/xml');
      const trkpts = [...doc.querySelectorAll('trkpt')];
      if (trkpts.length === 0) {
        alert('No trackpoints found in this GPX file.');
        return;
      }
      const points = trkpts.map(pt => ({
        lat: parseFloat(pt.getAttribute('lat')),
        lng: parseFloat(pt.getAttribute('lon')),
      })).filter(p => !isNaN(p.lat) && !isNaN(p.lng));
      setDrawnPoints(points);
    };
    reader.readAsText(file);
  }

  const hasExistingPath = recording && paths.some(p => p.runKey === pendingPathRunKey);
  const recordingLabel = recordingRun
    ? `${recordingRun.user || 'Unknown'} · ${recordingRun.rawLocation || ''} · ${recordingRun.dateStr || ''}`
    : pendingPathRunKey;

  return (
    <div className="h-[calc(100vh-112px)] relative">
      <EmbeddedMap
        runs={runs}
        registry={registry}
        coverage={coverage}
        showIndoor={showIndoor}
        showOutdoor={showOutdoor}
        paths={paths}
        recordingRunKey={pendingPathRunKey}
        recordingPoints={drawnPoints}
        onMapClick={handleMapClick}
        editMode={editMode}
        setRegistry={setRegistry}
      />

      {/* Recording banner */}
      {recording && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-[1000] bg-white border border-border rounded-xl shadow-lg px-4 py-2.5 flex items-center gap-3 max-w-[90%]">
          <span className="text-xs font-ui text-text-secondary">Recording path for:</span>
          <span className="text-xs font-mono text-text-primary truncate max-w-[360px]" title={recordingLabel}>
            {recordingLabel}
          </span>
          <button
            onClick={cancelRecording}
            className="text-text-secondary hover:text-danger transition-colors text-sm"
            title="Cancel recording"
          >✕</button>
        </div>
      )}

      {/* Top-right toolbar */}
      <div className="absolute top-3 right-3 z-[1000] flex flex-col items-end gap-2">
        {!recording && (
          <>
            {/* Indoor / Outdoor toggles */}
            <div className="flex gap-1.5 bg-white/95 border border-border rounded-lg p-1">
              <button
                onClick={() => setShowIndoor(s => !s)}
                className={`text-xs font-mono px-2.5 py-1.5 rounded transition-colors ${
                  showIndoor ? 'bg-accent text-white' : 'text-text-secondary hover:bg-bg'
                }`}
              >
                Indoor
              </button>
              <button
                onClick={() => setShowOutdoor(s => !s)}
                className={`text-xs font-mono px-2.5 py-1.5 rounded transition-colors ${
                  showOutdoor ? 'bg-warning text-white' : 'text-text-secondary hover:bg-bg'
                }`}
              >
                Outdoor
              </button>
            </div>

            {/* Edit pins button */}
            <button
              onClick={() => { setEditMode(e => !e); }}
              className={`px-3 py-2 rounded-lg border text-xs font-mono transition-colors shadow-sm ${
                editMode
                  ? 'bg-accent text-white border-accent'
                  : 'bg-white/90 text-text-secondary border-border hover:border-text-secondary'
              }`}
            >
              {editMode ? '✓ Done moving pins' : 'Move pins'}
            </button>
          </>
        )}

        {recording && (
          <div className="bg-white/95 border border-border rounded-xl shadow-sm p-3 space-y-2 min-w-[210px]">
            <div className="text-xs font-ui font-semibold text-text-primary">Recording path</div>
            <div className="text-xs font-mono text-text-secondary">
              {drawnPoints.length === 0
                ? 'Click map to add first waypoint'
                : drawnPoints.length === 1
                  ? 'Need at least 1 more waypoint'
                  : `${drawnPoints.length} waypoints`}
            </div>
            <div className="flex gap-1.5">
              <button
                onClick={handleSave}
                disabled={drawnPoints.length < 2}
                className="flex-1 text-xs font-mono py-1.5 bg-accent text-white rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-40"
              >
                Save Path
              </button>
              <button
                onClick={undoLastPoint}
                disabled={drawnPoints.length === 0}
                className="px-2 py-1.5 text-xs font-mono border border-border text-text-secondary rounded-lg hover:border-text-secondary transition-colors disabled:opacity-40"
                title="Undo last point"
              >
                ↩
              </button>
              <button
                onClick={clearPoints}
                disabled={drawnPoints.length === 0}
                className="px-2 py-1.5 text-xs font-mono border border-border text-text-secondary rounded-lg hover:border-text-secondary transition-colors disabled:opacity-40"
                title="Clear all points"
              >
                Clear
              </button>
            </div>
            <button
              onClick={() => gpxInputRef.current?.click()}
              className="w-full text-xs font-mono py-1.5 border border-border text-text-secondary rounded-lg hover:border-accent/40 hover:text-accent transition-colors"
            >
              ↑ Import GPX (Strava)
            </button>
            <input ref={gpxInputRef} type="file" accept=".gpx" className="hidden" onChange={handleGpxImport} />
            {hasExistingPath && (
              <button
                onClick={handleDelete}
                className="w-full text-xs font-mono py-1.5 border border-danger/30 text-danger rounded-lg hover:bg-danger-light transition-colors"
              >
                Delete Path
              </button>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      {!recording && (
        <div className="absolute bottom-5 left-5 bg-white/95 border border-border rounded-xl p-3 z-[1000] font-mono text-xs space-y-1.5">
          <div className="text-text-secondary uppercase tracking-wider text-[10px] mb-2">Coverage</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-success inline-block" />
            <span className="text-text-secondary font-ui text-[11px]">Clean (double-pass)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-warning inline-block" />
            <span className="text-text-secondary font-ui text-[11px]">Collected with errors</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-border inline-block" />
            <span className="text-text-secondary font-ui text-[11px]">Not started</span>
          </div>
          <div className="border-t border-border pt-1.5 mt-1 text-[10px] text-text-secondary/60 font-ui">
            Pie ring: green=clean, yellow=errors<br />
            Line = outdoor path (record from Run Log)
          </div>
        </div>
      )}

      {recording && (
        <div className="absolute bottom-5 left-5 bg-white/95 border border-border rounded-xl p-3 z-[1000] text-xs font-mono text-text-secondary">
          Building pins hidden · click map to trace the walked route · first point is larger
        </div>
      )}
    </div>
  );
}
