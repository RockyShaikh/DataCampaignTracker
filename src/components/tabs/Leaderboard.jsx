import { useMemo } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { getLeaderboard } from '../../utils/calculations.js';

export default function Leaderboard() {
  const { runs, registry } = useApp();

  const board = useMemo(() => getLeaderboard(runs, registry), [runs, registry]);
  const maxHours = board.length > 0 ? board[0].validHours : 1;

  return (
    <div className="p-5 max-w-[1000px] mx-auto space-y-4">
      <h2 className="font-ui font-semibold text-text-primary">Leaderboard</h2>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-secondary text-[11px] uppercase tracking-wider bg-bg">
              <th className="text-left px-4 py-3 w-12">Rank</th>
              <th className="text-left px-4 py-3">Collector</th>
              <th className="text-right px-4 py-3">Valid Hrs</th>
              <th className="text-right px-4 py-3">Runs</th>
              <th className="text-right px-4 py-3">Valid</th>
              <th className="text-left px-4 py-3">Top Location</th>
              <th className="px-4 py-3 w-36">Share</th>
            </tr>
          </thead>
          <tbody>
            {board.map((c, i) => {
              const barPct = maxHours > 0 ? (c.validHours / maxHours) * 100 : 0;
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <tr key={c.user} className="border-b border-border/50 hover:bg-bg transition-colors">
                  <td className="px-4 py-3 text-text-secondary font-ui">
                    {medals[i] ?? <span className="text-xs">#{i + 1}</span>}
                  </td>
                  <td className="px-4 py-3 text-text-primary font-ui font-semibold">{c.user}</td>
                  <td className="px-4 py-3 text-right text-accent font-semibold">{c.validHours.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right text-text-secondary">{c.totalRuns}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-success">{c.validRuns}</span>
                    <span className="text-text-secondary">/{c.totalRuns}</span>
                  </td>
                  <td className="px-4 py-3 text-text-secondary text-xs font-ui truncate max-w-[160px]">{c.topBuilding}</td>
                  <td className="px-4 py-3">
                    <div className="h-1.5 bg-bg rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${barPct}%` }} />
                    </div>
                    <div className="text-[10px] text-text-secondary mt-0.5 text-right">{barPct.toFixed(0)}%</div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {board.length === 0 && (
          <div className="px-4 py-10 text-center text-text-secondary font-ui">No data available</div>
        )}
      </div>

      <p className="text-sm italic text-text-secondary">
        Hours from manifest (exact seconds). Valid runs: collection=pass/recovered in the input log.
      </p>
    </div>
  );
}
