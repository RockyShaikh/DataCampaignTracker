import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';

// Cumulative valid hours on a true time axis. Expects points from
// getCumulativeValidHours(): { t (ms), date ("YYYY-MM-DD"), hours }.
//
// Gridlines are drawn as ReferenceLines in two weights (major/minor). Both axes
// pick the finest gridline scheme whose minor lines still fit under
// a per-axis cap, so the chart thins itself as the campaign grows.

const MAX_MINOR_X = 30; // weekly lines until ~7 months
const MAX_MINOR_Y = 40; // 2h lines until 80h
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const MAJOR_STROKE = '#D0D0D0';
const MINOR_STROKE = '#F0F0F0';
const TICK = { fill: '#555', fontFamily: 'JetBrains Mono' };

// Local-midnight timestamps of the 1st of every `every`-th month in [t0, t1].
function monthStarts(t0, t1, every) {
  const out = [];
  const first = new Date(t0);
  for (let d = new Date(first.getFullYear(), first.getMonth(), 1); d <= t1; d.setMonth(d.getMonth() + 1)) {
    if (d >= t0 && d.getMonth() % every === 0) out.push(d.getTime());
  }
  return out;
}

// Local-midnight timestamps of every Monday in [t0, t1].
function weekStarts(t0, t1) {
  const out = [];
  const d = new Date(t0);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7));
  for (; d <= t1; d.setDate(d.getDate() + 7)) {
    if (d >= t0) out.push(d.getTime());
  }
  return out;
}

// Finest first: weeks/months, months/quarters, quarters/years, years only.
const X_SCHEMES = [
  { minor: (a, b) => weekStarts(a, b),        major: (a, b) => monthStarts(a, b, 1) },
  { minor: (a, b) => monthStarts(a, b, 1),    major: (a, b) => monthStarts(a, b, 3) },
  { minor: (a, b) => monthStarts(a, b, 3),    major: (a, b) => monthStarts(a, b, 12) },
  { minor: () => [],                          major: (a, b) => monthStarts(a, b, 12) },
];

// [minor, major] hour steps, finest first.
const Y_SCHEMES = [[1, 5], [2, 10], [5, 25], [10, 50], [25, 100], [50, 250], [100, 500], [250, 1000]];

function xGrid(t0, t1) {
  const scheme = X_SCHEMES.find(s => s.minor(t0, t1).length <= MAX_MINOR_X) ?? X_SCHEMES[X_SCHEMES.length - 1];
  const major = scheme.major(t0, t1);
  const majorSet = new Set(major);
  const minor = scheme.minor(t0, t1).filter(t => !majorSet.has(t));
  return { major, minor };
}

function yGrid(maxHours) {
  const [minorStep, majorStep] =
    Y_SCHEMES.find(([m]) => maxHours / m <= MAX_MINOR_Y) ?? Y_SCHEMES[Y_SCHEMES.length - 1];
  const top = Math.max(majorStep, Math.ceil(maxHours / majorStep) * majorStep);
  const major = [];
  const minor = [];
  for (let h = minorStep; h <= top; h += minorStep) {
    (h % majorStep === 0 ? major : minor).push(h);
  }
  return { top, major, minor, ticks: [0, ...major] };
}

function formatMonth(t, i) {
  const d = new Date(t);
  const label = MONTHS[d.getMonth()];
  // Year on the first label and at each January so multi-year ranges stay readable.
  return i === 0 || d.getMonth() === 0 ? `${label} '${String(d.getFullYear()).slice(2)}` : label;
}

function formatDay(t) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function CumulativeHoursChart({ data, height = 220, fontSize = 10 }) {
  const grid = useMemo(() => {
    const t0 = data[0].t;
    const t1 = data[data.length - 1].t;
    const x = xGrid(t0, t1);
    const y = yGrid(data[data.length - 1].hours);
    // A range too short to contain a month boundary still gets one label.
    const xTicks = x.major.length ? x.major : [t0];
    return { t0, t1, x, y, xTicks };
  }, [data]);

  const tick = { ...TICK, fontSize };
  const tickIndex = new Map(grid.xTicks.map((t, i) => [t, i]));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
        {grid.x.minor.map(t => <ReferenceLine key={`xm${t}`} x={t} stroke={MINOR_STROKE} />)}
        {grid.y.minor.map(h => <ReferenceLine key={`ym${h}`} y={h} stroke={MINOR_STROKE} />)}
        {grid.x.major.map(t => <ReferenceLine key={`xM${t}`} x={t} stroke={MAJOR_STROKE} />)}
        {grid.y.major.map(h => <ReferenceLine key={`yM${h}`} y={h} stroke={MAJOR_STROKE} />)}
        <XAxis dataKey="t" type="number" scale="time"
          domain={[grid.t0, grid.t1]} ticks={grid.xTicks}
          tickFormatter={t => formatMonth(t, tickIndex.get(t) ?? 0)}
          tick={tick} tickLine={{ stroke: MAJOR_STROKE }} axisLine={{ stroke: MAJOR_STROKE }} />
        <YAxis type="number" domain={[0, grid.y.top]} ticks={grid.y.ticks} allowDecimals={false}
          tick={tick} tickLine={false} axisLine={false} />
        <Tooltip
          contentStyle={{ background: '#fff', border: '1px solid #D0D0D0', borderRadius: 2, fontSize: 12, fontFamily: 'Fira Sans' }}
          labelStyle={{ color: '#111', fontWeight: 600 }}
          labelFormatter={formatDay}
          formatter={v => [`${v.toFixed(2)} hrs`, 'Valid Hours']}
        />
        {/* stepAfter: the total only changes on collection days, so gaps read as flat plateaus. */}
        <Line type="stepAfter" dataKey="hours" stroke="#CC0000" strokeWidth={2}
          dot={false} activeDot={{ r: 4, fill: '#CC0000' }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
