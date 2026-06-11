import { MapContainer, TileLayer, Marker, Popup, Polyline, CircleMarker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { getBuildingProgress, getCellStatus } from '../utils/calculations.js';
import { getRunKey } from '../utils/runKey.js';

const ORIENTATIONS = ['forward', 'backward', 'lateral'];
const STATUS_COLOR = { green: '#15803D', yellow: '#D97706', gray: '#9CA3AF' };

function pathColor(run) {
  if (!run) return STATUS_COLOR.gray;
  if (run.isClean) return STATUS_COLOR.green;
  if (run.isValid) return STATUS_COLOR.yellow;
  return STATUS_COLOR.gray;
}

function pathStatusLabel(run) {
  if (!run) return 'Unverified';
  if (run.isClean) return 'Clean';
  if (run.isValid) return 'Valid';
  return 'Unverified';
}

function makePieIcon(greenPct, yellowPct) {
  const size = 52;
  const cx = size / 2;
  const cy = size / 2;
  const r = 17;
  const sw = 8;
  const circumference = 2 * Math.PI * r;
  const gp = Math.max(0, Math.min(greenPct, 1));
  const yp = Math.max(0, Math.min(yellowPct, 1 - gp));
  const greenFilled = gp * circumference;
  const yellowFilled = yp * circumference;
  const greenAngleDeg = gp * 360;
  const totalPct = Math.round((gp + yp) * 100);
  const labelColor = gp > 0 ? '#15803D' : yp > 0 ? '#D97706' : '#9CA3AF';

  const svg = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
    <circle cx="${cx}" cy="${cy}" r="${cx - 1}" fill="white" stroke="#D1D5DB" stroke-width="1.5"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#F3F4F6" stroke-width="${sw}"/>
    ${greenFilled > 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#15803D" stroke-width="${sw}"
      stroke-dasharray="${greenFilled.toFixed(2)} ${(circumference - greenFilled).toFixed(2)}"
      transform="rotate(-90 ${cx} ${cy})"/>` : ''}
    ${yellowFilled > 0 ? `<circle cx="${cx}" cy="${cy}" r="${r}" fill="transparent" stroke="#D97706" stroke-width="${sw}"
      stroke-dasharray="${yellowFilled.toFixed(2)} ${(circumference - yellowFilled).toFixed(2)}"
      transform="rotate(${-90 + greenAngleDeg} ${cx} ${cy})"/>` : ''}
    <text x="${cx}" y="${cy + 3}" text-anchor="middle" fill="${labelColor}"
      font-size="9" font-family="system-ui,sans-serif" font-weight="700">${totalPct}%</text>
  </svg>`;

  return L.divIcon({
    html: svg,
    className: 'custom-pie-marker',
    iconSize: [size, size],
    iconAnchor: [cx, cy],
    popupAnchor: [0, -(cy + 4)],
  });
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({ click: (e) => onMapClick(e.latlng) });
  return null;
}

export default function EmbeddedMap({
  runs, registry, coverage,
  showIndoor, showOutdoor,
  paths = [], recordingRunKey, recordingPoints = [], onMapClick,
  editMode, setRegistry,
}) {
  const recording = recordingRunKey != null;

  function handleDragEnd(buildingId, e) {
    const { lat, lng } = e.target.getLatLng();
    setRegistry({
      ...registry,
      buildings: registry.buildings.map(b =>
        b.id === buildingId ? { ...b, lat: +lat.toFixed(6), lng: +lng.toFixed(6) } : b
      ),
    });
  }

  const indoorBuildings = (registry.buildings || []).filter(b => b.type !== 'zone' && b.lat && b.lng);

  // Index runs by their stable key for path → run lookup.
  const runByKey = new Map((runs || []).map(r => [getRunKey(r), r]));

  return (
    <MapContainer
      center={[40.4433, -79.9436]}
      zoom={16}
      style={{ height: '100%', width: '100%' }}
      zoomControl={true}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      {recording && <MapClickHandler onMapClick={onMapClick} />}

      {/* Indoor building markers — hidden while recording a path */}
      {showIndoor && !recording && indoorBuildings.map(b => {
        const prog = getBuildingProgress(b, coverage);
        const greenPct = prog.total > 0 ? prog.fullyRecorded / prog.total : 0;
        const yellowPct = prog.total > 0 ? prog.partialCovered / prog.total : 0;
        const icon = makePieIcon(greenPct, yellowPct);
        const validMins = runs
          .filter(r => r.isValid && r.locationResults.some(l => l.building?.id === b.id))
          .reduce((s, r) => s + r.duration, 0);

        return (
          <Marker
            key={b.id}
            position={[b.lat, b.lng]}
            icon={icon}
            draggable={editMode}
            eventHandlers={editMode ? { dragend: (e) => handleDragEnd(b.id, e) } : {}}
          >
            <Popup minWidth={200}>
              <div style={{ fontFamily: 'Fira Sans, sans-serif', padding: '8px 10px', minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 2 }}>{b.name}</div>
                <div style={{ fontSize: 11, color: '#555', marginBottom: 6 }}>
                  {prog.fullyRecorded}/{prog.total} clean · {prog.partialCovered} collected-with-errors · {(validMins / 60).toFixed(1)}h valid
                </div>
                <div style={{ borderTop: '1px solid #E5E5E5', paddingTop: 6 }}>
                  {b.floors.map(floor => {
                    const statuses = ORIENTATIONS.map(o => getCellStatus(coverage, b.id, floor, o));
                    return (
                      <div key={floor} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: '#555', width: 20 }}>
                          {String(floor).toUpperCase()}
                        </span>
                        {ORIENTATIONS.map((o, i) => (
                          <span key={o} style={{
                            width: 9, height: 9, borderRadius: '50%',
                            background: STATUS_COLOR[statuses[i]],
                            display: 'inline-block',
                          }} title={o} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {/* Saved outdoor paths — hidden while recording */}
      {showOutdoor && !recording && paths.map(p => {
        if (!p.points || p.points.length < 2) return null;
        const run = runByKey.get(p.runKey);
        const color = pathColor(run);
        const positions = p.points.map(pt => [pt.lat, pt.lng]);

        return (
          <Polyline
            key={p.runKey}
            positions={positions}
            pathOptions={{ color, weight: 3, opacity: 0.8 }}
          >
            <Popup>
              <div style={{ fontFamily: 'Fira Sans, sans-serif', padding: '8px 10px', minWidth: 180 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#111', marginBottom: 2 }}>
                  {run?.user || 'Unknown'} — {run?.dateStr || '—'}
                </div>
                <div style={{ fontSize: 11, color, marginBottom: 4 }}>
                  Duration: {run?.duration ? run.duration.toFixed(1) : '—'} min · Status: {pathStatusLabel(run)}
                </div>
                {run?.notes && (
                  <div style={{ fontSize: 11, color: '#555' }}>{run.notes}</div>
                )}
              </div>
            </Popup>
          </Polyline>
        );
      })}

      {/* In-progress recording preview */}
      {recording && recordingPoints.length >= 2 && (
        <Polyline
          positions={recordingPoints.map(p => [p.lat, p.lng])}
          pathOptions={{ color: '#CC0000', weight: 3, dashArray: '5 4' }}
        />
      )}
      {recording && recordingPoints.map((p, i) => (
        <CircleMarker
          key={i}
          center={[p.lat, p.lng]}
          radius={i === 0 ? 7 : 5}
          pathOptions={{ color: '#CC0000', fillColor: '#CC0000', fillOpacity: 0.9, weight: 1.5 }}
        />
      ))}
    </MapContainer>
  );
}
