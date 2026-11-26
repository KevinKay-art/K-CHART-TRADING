import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BarChart2,
  Bell,
  Camera,
  ChevronDown,
  Columns2,
  Copy,
  Download,
  FolderOpen,
  Grid2x2,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Moon,
  Play,
  Redo2,
  Rows2,
  Search,
  Settings,
  Square,
  Star,
  Sun,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import { useTerminalStore } from '../store/useTerminalStore';
import { ChartLayoutId, ChartType, Timeframe } from '../types/chart';
import { getChartPaneActions } from '../utils/chartRegistry';
import { ALL_TIMEFRAMES, exportCandlesToCsv } from '../utils/format';
import { KChartLogo } from './Logo';

const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
  { id: 'candlestick', label: 'Candles' },
  { id: 'hollow', label: 'Hollow Candles' },
  { id: 'bar', label: 'Bars (OHLC)' },
  { id: 'line', label: 'Line' },
  { id: 'lineMarkers', label: 'Line with Markers' },
  { id: 'area', label: 'Area' },
  { id: 'baseline', label: 'Baseline' },
  { id: 'heikinAshi', label: 'Heikin Ashi' },
  { id: 'histogram', label: 'Histogram' },
];

const LAYOUT_OPTIONS: Array<{ id: ChartLayoutId; label: string; icon: React.ReactNode }> = [
  { id: '1', label: 'Single Chart', icon: <Square className="w-3.5 h-3.5" /> },
  { id: '2v', label: '2 Vertical', icon: <Columns2 className="w-3.5 h-3.5" /> },
  { id: '2h', label: '2 Horizontal', icon: <Rows2 className="w-3.5 h-3.5" /> },
  { id: '3', label: '3 Panes', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
  { id: '4', label: '4 Grid (2×2)', icon: <Grid2x2 className="w-3.5 h-3.5" /> },
  { id: '6', label: '6 Grid (3×2)', icon: <LayoutGrid className="w-3.5 h-3.5" /> },
];

export const TopToolbar: React.FC = () => {
  const theme = useTerminalStore((s) => s.theme);
  const toggleTheme = useTerminalStore((s) => s.toggleTheme);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const layoutId = useTerminalStore((s) => s.layoutId);
  const sync = useTerminalStore((s) => s.sync);
  const favoriteTimeframes = useTerminalStore((s) => s.favoriteTimeframes);
  const connectionStatus = useTerminalStore((s) => s.connectionStatusByPane[activePaneId] || 'offline');
  const undoStackBySymbol = useTerminalStore((s) => s.undoStackBySymbol);
  const redoStackBySymbol = useTerminalStore((s) => s.redoStackBySymbol);

  const setPaneTimeframe = useTerminalStore((s) => s.setPaneTimeframe);
  const setPaneChartType = useTerminalStore((s) => s.setPaneChartType);
  const toggleFavoriteTimeframe = useTerminalStore((s) => s.toggleFavoriteTimeframe);
  const setLayout = useTerminalStore((s) => s.setLayout);
  const setSyncOption = useTerminalStore((s) => s.setSyncOption);
  const setSymbolSearchOpen = useTerminalStore((s) => s.setSymbolSearchOpen);
  const setIndicatorsModalOpen = useTerminalStore((s) => s.setIndicatorsModalOpen);
  const setAlertsModalOpen = useTerminalStore((s) => s.setAlertsModalOpen);
  const setSettingsModalOpen = useTerminalStore((s) => s.setSettingsModalOpen);
  const setLayoutsModalOpen = useTerminalStore((s) => s.setLayoutsModalOpen);
  const undoDrawing = useTerminalStore((s) => s.undoDrawing);
  const redoDrawing = useTerminalStore((s) => s.redoDrawing);
  const startReplaySelection = useTerminalStore((s) => s.startReplaySelection);
  const pushToast = useTerminalStore((s) => s.pushToast);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const symbolKey = activePane.symbol.symbol;
  const canUndo = (undoStackBySymbol[symbolKey]?.length || 0) > 0;
  const canRedo = (redoStackBySymbol[symbolKey]?.length || 0) > 0;

  const [tfMenuOpen, setTfMenuOpen] = useState(false);
  const [chartTypeOpen, setChartTypeOpen] = useState(false);
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const menuContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (menuContainerRef.current && !menuContainerRef.current.contains(e.target as Node)) {
        setTfMenuOpen(false);
        setChartTypeOpen(false);
        setLayoutMenuOpen(false);
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const handleScreenshotDownload = () => {
    const actions = getChartPaneActions(activePane.id);
    const canvas = actions?.takeScreenshot();
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `K-CHART-VIEW_${activePane.symbol.symbol}_${activePane.timeframe}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setExportMenuOpen(false);
    pushToast({ title: 'Screenshot Saved', message: link.download, tone: 'success' });
  };

  const handleCopyScreenshot = async () => {
    const actions = getChartPaneActions(activePane.id);
    const canvas = actions?.takeScreenshot();
    if (!canvas) return;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob && navigator.clipboard && 'write' in navigator.clipboard) {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        pushToast({ title: 'Copied', message: 'Chart PNG copied to clipboard.', tone: 'success' });
      }
    } catch {
      handleScreenshotDownload();
    }
    setExportMenuOpen(false);
  };

  const handleExportCsv = () => {
    const actions = getChartPaneActions(activePane.id);
    if (!actions) return;
    const csv = exportCandlesToCsv(actions.getSymbol(), actions.getTimeframe(), actions.getCandles());
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `K-CHART-VIEW_${actions.getSymbol()}_${actions.getTimeframe()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExportMenuOpen(false);
  };

  const handleShareLink = () => {
    const url = new URL(window.location.href);
    url.searchParams.set('symbol', activePane.symbol.symbol);
    url.searchParams.set('interval', activePane.timeframe);
    url.searchParams.set('layout', layoutId);
    navigator.clipboard?.writeText(url.toString());
    setExportMenuOpen(false);
    pushToast({ title: 'Share Link Copied', message: url.toString(), tone: 'info' });
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const statusColor =
    connectionStatus === 'live'
      ? 'text-[#26A69A]'
      : connectionStatus === 'reconnecting'
      ? 'text-amber-400'
      : 'text-[#EF5350]';

  const statusDot =
    connectionStatus === 'live'
      ? 'bg-[#26A69A]'
      : connectionStatus === 'reconnecting'
      ? 'bg-amber-400 animate-pulse'
      : 'bg-[#EF5350]';

  return (
    <header
      ref={menuContainerRef}
      className="h-11 shrink-0 w-full flex items-center justify-between gap-2 px-2.5 bg-white dark:bg-[#1E222D] border-b border-slate-200 dark:border-[#2A2E39] text-xs z-30"
    >
      {/* Left Group: Logo + Symbol Search + Timeframes + Chart Type */}
      <div className="flex items-center gap-1.5 min-w-0">
        <div className="pr-2 border-r border-slate-200 dark:border-[#2A2E39] shrink-0">
          <KChartLogo />
        </div>

        {/* Symbol Search Trigger */}
        <button
          type="button"
          onClick={() => setSymbolSearchOpen(true)}
          title="Search Symbols (Crypto, Stocks, Forex, Indices)"
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-900 dark:text-[#F8FAFC] font-semibold whitespace-nowrap shrink-0 transition-colors"
        >
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <span>{activePane.symbol.displaySymbol}</span>
          <span className="hidden sm:inline text-[10px] font-normal text-slate-400 uppercase">
            {activePane.symbol.exchange}
          </span>
        </button>

        <div className="h-5 w-px bg-slate-200 dark:bg-[#2A2E39] shrink-0" />

        {/* Favorite Timeframes Inline */}
        <div className="hidden lg:flex items-center gap-0.5">
          {favoriteTimeframes.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setPaneTimeframe(activePane.id, tf)}
              className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors ${
                activePane.timeframe === tf
                  ? 'bg-[#2962FF]/15 text-[#2962FF] font-semibold'
                  : 'text-slate-600 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* All Timeframes Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setTfMenuOpen((v) => !v);
              setChartTypeOpen(false);
              setLayoutMenuOpen(false);
              setExportMenuOpen(false);
            }}
            className="flex items-center gap-1 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-700 dark:text-[#D1D4DC] font-medium whitespace-nowrap"
          >
            <span className="lg:hidden">{activePane.timeframe}</span>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          </button>

          {tfMenuOpen && (
            <div className="absolute left-0 top-full mt-1 w-44 rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-xl py-1 z-50">
              <div className="px-2.5 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                Timeframes
              </div>
              {ALL_TIMEFRAMES.map((tf: Timeframe) => {
                const isFav = favoriteTimeframes.includes(tf);
                const isSelected = activePane.timeframe === tf;
                return (
                  <div
                    key={tf}
                    className={`flex items-center justify-between px-2.5 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39] ${
                      isSelected ? 'text-[#2962FF] font-semibold' : 'text-slate-700 dark:text-[#D1D4DC]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setPaneTimeframe(activePane.id, tf);
                        setTfMenuOpen(false);
                      }}
                      className="flex-1 text-left"
                    >
                      {tf}
                    </button>
                    <button
                      type="button"
                      title="Pin to toolbar"
                      onClick={() => toggleFavoriteTimeframe(tf)}
                      className="p-0.5 text-slate-400 hover:text-amber-400"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`}
                      />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-[#2A2E39] shrink-0" />

        {/* Chart Type Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setChartTypeOpen((v) => !v);
              setTfMenuOpen(false);
              setLayoutMenuOpen(false);
              setExportMenuOpen(false);
            }}
            title="Chart Type"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-700 dark:text-[#D1D4DC] whitespace-nowrap"
          >
            <BarChart2 className="w-3.5 h-3.5 text-[#2962FF]" />
            <span className="hidden md:inline">
              {CHART_TYPES.find((c) => c.id === activePane.chartType)?.label || 'Candles'}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {chartTypeOpen && (
            <div className="absolute left-0 top-full mt-1 w-48 rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-xl py-1 z-50">
              {CHART_TYPES.map((ct) => (
                <button
                  key={ct.id}
                  type="button"
                  onClick={() => {
                    setPaneChartType(activePane.id, ct.id);
                    setChartTypeOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39] flex items-center justify-between ${
                    activePane.chartType === ct.id
                      ? 'text-[#2962FF] font-semibold'
                      : 'text-slate-700 dark:text-[#D1D4DC]'
                  }`}
                >
                  <span>{ct.label}</span>
                  {activePane.chartType === ct.id && <span className="text-[10px]">●</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-5 w-px bg-slate-200 dark:bg-[#2A2E39] shrink-0 hidden sm:block" />

        {/* Indicators, Alerts, Replay */}
        <button
          type="button"
          onClick={() => setIndicatorsModalOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-700 dark:text-[#D1D4DC] whitespace-nowrap"
        >
          <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Indicators</span>
        </button>

        <button
          type="button"
          onClick={() => setAlertsModalOpen(true, null, null)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-700 dark:text-[#D1D4DC] whitespace-nowrap"
        >
          <Bell className="w-3.5 h-3.5 text-slate-400" />
          <span className="hidden sm:inline">Alert</span>
        </button>

        <button
          type="button"
          onClick={startReplaySelection}
          title="Bar Replay"
          className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-700 dark:text-[#D1D4DC] whitespace-nowrap"
        >
          <Play className="w-3.5 h-3.5 text-slate-400" />
          <span>Replay</span>
        </button>

        <div className="hidden sm:flex items-center gap-0.5 ml-1">
          <button
            type="button"
            disabled={!canUndo}
            onClick={() => undoDrawing(symbolKey)}
            title="Undo Drawing (Ctrl+Z)"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] disabled:opacity-35 text-slate-600 dark:text-[#D1D4DC]"
          >
            <Undo2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            disabled={!canRedo}
            onClick={() => redoDrawing(symbolKey)}
            title="Redo Drawing (Ctrl+Y)"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] disabled:opacity-35 text-slate-600 dark:text-[#D1D4DC]"
          >
            <Redo2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Right Group: Connection Status, Layouts, Export/Screenshot, Fullscreen, Settings, Theme */}
      <div className="flex items-center gap-1 shrink-0">
        {/* Live Stream Indicator */}
        <div
          className={`hidden xl:flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium ${statusColor}`}
          title="WebSocket Stream Status"
        >
          <span className={`w-2 h-2 rounded-full ${statusDot}`} />
          <span className="capitalize">{connectionStatus}</span>
        </div>

        {/* Multi-Chart Layout Selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setLayoutMenuOpen((v) => !v);
              setTfMenuOpen(false);
              setChartTypeOpen(false);
              setExportMenuOpen(false);
            }}
            title="Chart Layouts & Sync"
            className="flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-700 dark:text-[#D1D4DC] whitespace-nowrap"
          >
            <Grid2x2 className="w-3.5 h-3.5 text-slate-400" />
            <span className="hidden md:inline">Layout</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>

          {layoutMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-60 rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-xl p-2 z-50">
              <div className="text-[10px] font-semibold text-slate-400 uppercase px-1 mb-1.5">
                Multi-Chart Grid
              </div>
              <div className="grid grid-cols-3 gap-1 mb-2.5">
                {LAYOUT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setLayout(opt.id);
                      setLayoutMenuOpen(false);
                    }}
                    className={`flex flex-col items-center gap-1 p-2 rounded border text-[11px] transition-colors ${
                      layoutId === opt.id
                        ? 'border-[#2962FF] bg-[#2962FF]/15 text-[#2962FF]'
                        : 'border-slate-200 dark:border-[#2A2E39] hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]'
                    }`}
                  >
                    {opt.icon}
                    <span>{opt.id.toUpperCase()}</span>
                  </button>
                ))}
              </div>
              <div className="text-[10px] font-semibold text-slate-400 uppercase px-1 mb-1 border-t border-slate-200 dark:border-[#2A2E39] pt-2">
                Sync In Layout
              </div>
              {(
                [
                  ['symbol', 'Symbol'],
                  ['interval', 'Interval'],
                  ['crosshair', 'Crosshair'],
                  ['time', 'Time Range'],
                ] as const
              ).map(([key, label]) => (
                <label
                  key={key}
                  className="flex items-center justify-between px-1.5 py-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] cursor-pointer"
                >
                  <span>{label}</span>
                  <input
                    type="checkbox"
                    checked={sync[key]}
                    onChange={(e) => setSyncOption(key, e.target.checked)}
                    className="accent-[#2962FF]"
                  />
                </label>
              ))}
              <button
                type="button"
                onClick={() => {
                  setLayoutMenuOpen(false);
                  setLayoutsModalOpen(true);
                }}
                className="mt-2 w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded bg-[#2962FF] text-white font-medium hover:bg-[#1E53E5]"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Saved Layouts & Templates</span>
              </button>
            </div>
          )}
        </div>

        {/* Screenshot & Export Menu */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setExportMenuOpen((v) => !v);
              setLayoutMenuOpen(false);
              setTfMenuOpen(false);
              setChartTypeOpen(false);
            }}
            title="Screenshot & Export"
            className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
          >
            <Camera className="w-4 h-4" />
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-xl py-1 z-50">
              <button
                type="button"
                onClick={handleScreenshotDownload}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39] flex items-center gap-2"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save PNG Image</span>
              </button>
              <button
                type="button"
                onClick={handleCopyScreenshot}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39] flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Image</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39] flex items-center gap-2"
              >
                <Activity className="w-3.5 h-3.5" />
                <span>Export Data (CSV)</span>
              </button>
              <button
                type="button"
                onClick={handleShareLink}
                className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39] flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Shareable Link</span>
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={toggleFullscreen}
          title="Fullscreen"
          className="hidden sm:block p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={() => setSettingsModalOpen(true)}
          title="Chart Settings"
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          <Settings className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={toggleTheme}
          title={theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-600 dark:text-[#D1D4DC]"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
