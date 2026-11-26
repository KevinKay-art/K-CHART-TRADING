import React, { useEffect, useState } from 'react';
import { Pause, Play, SkipForward, Square } from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';
import { ScaleMode } from '../types/chart';
import { getChartPaneActions } from '../utils/chartRegistry';

const RANGES: Array<{ label: string; value: number | 'YTD' | 'ALL' }> = [
  { label: '1D', value: 86400 },
  { label: '5D', value: 86400 * 5 },
  { label: '1M', value: 86400 * 30 },
  { label: '3M', value: 86400 * 90 },
  { label: '6M', value: 86400 * 180 },
  { label: 'YTD', value: 'YTD' },
  { label: '1Y', value: 86400 * 365 },
  { label: '5Y', value: 86400 * 1825 },
  { label: 'All', value: 'ALL' },
];

const TIMEZONES = [
  'UTC',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Singapore',
];

export const BottomBar: React.FC = () => {
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const chartSettings = useTerminalStore((s) => s.chartSettings);
  const replay = useTerminalStore((s) => s.replay);

  const setPaneScaleMode = useTerminalStore((s) => s.setPaneScaleMode);
  const setPaneAutoScale = useTerminalStore((s) => s.setPaneAutoScale);
  const updateChartSettings = useTerminalStore((s) => s.updateChartSettings);
  const toggleReplayPlay = useTerminalStore((s) => s.toggleReplayPlay);
  const stepReplayForward = useTerminalStore((s) => s.stepReplayForward);
  const setReplaySpeed = useTerminalStore((s) => s.setReplaySpeed);
  const exitReplay = useTerminalStore((s) => s.exitReplay);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => {
      try {
        const formatted = new Intl.DateTimeFormat('en-GB', {
          timeZone: chartSettings.timezone || 'UTC',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }).format(new Date());
        setClock(`${formatted} (${chartSettings.timezone})`);
      } catch {
        setClock(new Date().toISOString().slice(11, 19) + ' (UTC)');
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [chartSettings.timezone]);

  // Replay interval driver
  useEffect(() => {
    if (!replay.active || !replay.playing) return;
    const ms = Math.max(80, Math.round(800 / replay.speed));
    const timer = setInterval(() => {
      stepReplayForward();
    }, ms);
    return () => clearInterval(timer);
  }, [replay.active, replay.playing, replay.speed, stepReplayForward]);

  const toggleScale = (mode: ScaleMode) => {
    setPaneScaleMode(activePane.id, activePane.scaleMode === mode ? 'normal' : mode);
  };

  return (
    <footer className="shrink-0 w-full bg-white dark:bg-[#1E222D] border-t border-slate-200 dark:border-[#2A2E39] text-[11px] z-20">
      {/* Bar Replay Controls Strip when Active */}
      {replay.active && (
        <div className="flex items-center justify-center gap-3 px-3 py-1 bg-[#2962FF]/15 border-b border-[#2962FF]/30 text-slate-900 dark:text-white">
          <span className="font-semibold text-[#2962FF]">Bar Replay</span>
          <span className="font-mono-num text-slate-500 dark:text-[#D1D4DC]">
            Bar {replay.currentIndex + 1} / {replay.fullCandles.length}
          </span>
          <button
            type="button"
            onClick={toggleReplayPlay}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded bg-[#2962FF] text-white font-medium hover:bg-[#1E53E5]"
          >
            {replay.playing ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
            <span>{replay.playing ? 'Pause' : 'Play'}</span>
          </button>
          <button
            type="button"
            onClick={stepReplayForward}
            title="Step 1 Bar"
            className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-[#2A2E39] hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
          >
            <SkipForward className="w-3 h-3" />
            <span>Step</span>
          </button>
          <div className="flex items-center gap-1">
            {([1, 2, 5, 10] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setReplaySpeed(sp)}
                className={`px-1.5 py-0.5 rounded font-mono-num ${
                  replay.speed === sp
                    ? 'bg-[#2962FF] text-white'
                    : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
                }`}
              >
                {sp}x
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={exitReplay}
            className="flex items-center gap-1 px-2 py-0.5 rounded text-[#EF5350] hover:bg-[#EF5350]/15 font-medium"
          >
            <Square className="w-3 h-3" />
            <span>Exit</span>
          </button>
        </div>
      )}

      {/* Main Bottom Toolbar */}
      <div className="h-8 flex items-center justify-between px-3 gap-3">
        {/* Range Buttons */}
        <div className="flex items-center gap-0.5 overflow-x-auto">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              onClick={() => getChartPaneActions(activePane.id)?.applyRangeSeconds(r.value)}
              className="px-2 py-1 rounded text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39] hover:text-[#2962FF] font-medium whitespace-nowrap transition-colors"
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* Legal Notice (Desktop Center) */}
        <div className="hidden xl:block text-[10px] text-slate-400 dark:text-[#787B86] truncate">
          K-CHART VIEW. Market data provided by Binance and third-party providers. Not financial advice.
        </div>

        {/* Right: Timezone, Clock, Scale Toggles */}
        <div className="flex items-center gap-2 shrink-0">
          <select
            aria-label="Chart Timezone"
            value={chartSettings.timezone}
            onChange={(e) => updateChartSettings({ timezone: e.target.value })}
            className="hidden sm:block bg-transparent text-slate-600 dark:text-[#D1D4DC] font-mono-num text-[11px] focus:outline-none cursor-pointer"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz} className="bg-white dark:bg-[#1E222D]">
                {tz}
              </option>
            ))}
          </select>

          <span className="hidden md:inline font-mono-num text-slate-500 dark:text-[#9CA3AF]">
            {clock}
          </span>

          <div className="h-4 w-px bg-slate-200 dark:bg-[#2A2E39]" />

          <button
            type="button"
            onClick={() => toggleScale('percentage')}
            title="Percentage Scale"
            className={`px-1.5 py-0.5 rounded font-mono-num ${
              activePane.scaleMode === 'percentage'
                ? 'bg-[#2962FF] text-white'
                : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            %
          </button>
          <button
            type="button"
            onClick={() => toggleScale('indexedTo100')}
            title="Indexed to 100"
            className={`px-1.5 py-0.5 rounded font-mono-num ${
              activePane.scaleMode === 'indexedTo100'
                ? 'bg-[#2962FF] text-white'
                : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            100
          </button>
          <button
            type="button"
            onClick={() => toggleScale('logarithmic')}
            title="Logarithmic Scale"
            className={`px-1.5 py-0.5 rounded font-medium ${
              activePane.scaleMode === 'logarithmic'
                ? 'bg-[#2962FF] text-white'
                : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            log
          </button>
          <button
            type="button"
            onClick={() => setPaneAutoScale(activePane.id, !activePane.autoScale)}
            title="Auto-fit Price Scale"
            className={`px-1.5 py-0.5 rounded font-medium ${
              activePane.autoScale
                ? 'bg-[#2962FF]/20 text-[#2962FF]'
                : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            auto
          </button>
        </div>
      </div>
    </footer>
  );
};
