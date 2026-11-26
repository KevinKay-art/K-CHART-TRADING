import React, { useEffect, useRef, useState } from 'react';
import {
  Bell,
  ChevronRight,
  Eye,
  EyeOff,
  Flag,
  FolderPlus,
  Layers,
  List,
  Lock,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Settings,
  Table2,
  Trash2,
  Unlock,
} from 'lucide-react';
import { getToolMeta } from '../drawings/toolMeta';
import {
  fetchBinance24hTickers,
  subscribeBinanceMiniTickers,
} from '../services/dataProviders/binanceProvider';
import { useTerminalStore } from '../store/useTerminalStore';
import { FlagColor, WatchlistTicker } from '../types/chart';
import { formatPercent, formatPrice, formatTimestamp, formatVolume } from '../utils/format';

const FLAG_CYCLE: FlagColor[] = ['none', 'red', 'orange', 'green', 'blue', 'purple'];
const FLAG_COLORS: Record<FlagColor, string> = {
  none: 'text-slate-400 opacity-30',
  red: 'text-[#EF5350] fill-[#EF5350]',
  orange: 'text-amber-400 fill-amber-400',
  green: 'text-[#26A69A] fill-[#26A69A]',
  blue: 'text-[#2962FF] fill-[#2962FF]',
  purple: 'text-purple-400 fill-purple-400',
};

export const RightSidebar: React.FC = () => {
  const rightPanelOpen = useTerminalStore((s) => s.rightPanelOpen);
  const rightPanelTab = useTerminalStore((s) => s.rightPanelTab);
  const watchlists = useTerminalStore((s) => s.watchlists);
  const activeWatchlistId = useTerminalStore((s) => s.activeWatchlistId);
  const tickers = useTerminalStore((s) => s.tickers);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const drawingsBySymbol = useTerminalStore((s) => s.drawingsBySymbol);
  const selectedDrawingId = useTerminalStore((s) => s.selectedDrawingId);
  const alerts = useTerminalStore((s) => s.alerts);
  const alertLogs = useTerminalStore((s) => s.alertLogs);
  const crosshairByPane = useTerminalStore((s) => s.crosshairByPane);
  const candlesByPane = useTerminalStore((s) => s.candlesByPane);
  const chartSettings = useTerminalStore((s) => s.chartSettings);

  const setRightPanelOpen = useTerminalStore((s) => s.setRightPanelOpen);
  const setRightPanelTab = useTerminalStore((s) => s.setRightPanelTab);
  const setActiveWatchlist = useTerminalStore((s) => s.setActiveWatchlist);
  const createWatchlist = useTerminalStore((s) => s.createWatchlist);
  const deleteWatchlist = useTerminalStore((s) => s.deleteWatchlist);
  const addSectionToWatchlist = useTerminalStore((s) => s.addSectionToWatchlist);
  const removeWatchlistItem = useTerminalStore((s) => s.removeWatchlistItem);
  const reorderWatchlistItems = useTerminalStore((s) => s.reorderWatchlistItems);
  const setWatchlistItemFlag = useTerminalStore((s) => s.setWatchlistItemFlag);
  const upsertTickers = useTerminalStore((s) => s.upsertTickers);
  const setPaneSymbol = useTerminalStore((s) => s.setPaneSymbol);
  const setSymbolSearchOpen = useTerminalStore((s) => s.setSymbolSearchOpen);
  const setAlertsModalOpen = useTerminalStore((s) => s.setAlertsModalOpen);
  const toggleAlertActive = useTerminalStore((s) => s.toggleAlertActive);
  const deleteAlert = useTerminalStore((s) => s.deleteAlert);
  const clearAlertLogs = useTerminalStore((s) => s.clearAlertLogs);
  const setSelectedDrawingId = useTerminalStore((s) => s.setSelectedDrawingId);
  const updateDrawing = useTerminalStore((s) => s.updateDrawing);
  const removeDrawing = useTerminalStore((s) => s.removeDrawing);
  const updateIndicator = useTerminalStore((s) => s.updateIndicator);
  const removeIndicator = useTerminalStore((s) => s.removeIndicator);
  const setEditingIndicatorId = useTerminalStore((s) => s.setEditingIndicatorId);
  const evaluateAlertsForPrice = useTerminalStore((s) => s.evaluateAlertsForPrice);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [newWlPrompt, setNewWlPrompt] = useState(false);
  const [newWlName, setNewWlName] = useState('');
  const [newSectionPrompt, setNewSectionPrompt] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');
  const [flashMap, setFlashMap] = useState<Record<string, 'up' | 'down'>>({});

  const prevPricesRef = useRef<Record<string, number>>({});

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const activeWatchlist = watchlists.find((w) => w.id === activeWatchlistId) || watchlists[0];
  const symbolKey = activePane.symbol.symbol;
  const drawings = drawingsBySymbol[symbolKey] || [];

  // Fetch initial 24h snapshot + subscribe to live Binance miniTicker stream for all Binance watchlist symbols
  useEffect(() => {
    const allBinanceSymbols = new Set<string>();
    for (const wl of watchlists) {
      for (const item of wl.items) {
        if (item.kind === 'symbol' && item.symbol && (!item.provider || item.provider === 'binance')) {
          allBinanceSymbols.add(item.symbol.toUpperCase());
        }
      }
    }

    if (allBinanceSymbols.size > 0) {
      fetchBinance24hTickers(Array.from(allBinanceSymbols))
        .then((map) => {
          const arr = Object.values(map);
          for (const t of arr) {
            prevPricesRef.current[t.symbol] = t.price;
          }
          upsertTickers(arr);
        })
        .catch(() => {});
    }

    const unsub = subscribeBinanceMiniTickers(
      () => {
        const s = new Set<string>();
        for (const wl of useTerminalStore.getState().watchlists) {
          for (const item of wl.items) {
            if (item.kind === 'symbol' && item.symbol && (!item.provider || item.provider === 'binance')) {
              s.add(item.symbol.toUpperCase());
            }
          }
        }
        return s;
      },
      (batch) => {
        const updates: WatchlistTicker[] = [];
        const flashes: Record<string, 'up' | 'down'> = {};
        for (const item of batch) {
          const prev = prevPricesRef.current[item.symbol];
          const dir =
            prev === undefined
              ? 'flat'
              : item.price > prev
              ? 'up'
              : item.price < prev
              ? 'down'
              : 'flat';
          if (prev !== undefined && item.price !== prev) {
            flashes[item.symbol] = item.price > prev ? 'up' : 'down';
            evaluateAlertsForPrice(item.symbol, prev, item.price);
          }
          prevPricesRef.current[item.symbol] = item.price;
          const change = item.price - item.open;
          const changePercent = item.open ? (change / item.open) * 100 : 0;
          updates.push({
            symbol: item.symbol,
            price: item.price,
            change,
            changePercent,
            volume: item.volume,
            direction: dir,
            updatedAt: Date.now(),
          });
        }
        upsertTickers(updates);
        if (Object.keys(flashes).length > 0) {
          setFlashMap((prev) => ({ ...prev, ...flashes }));
          setTimeout(() => {
            setFlashMap((prev) => {
              const next = { ...prev };
              for (const sym of Object.keys(flashes)) delete next[sym];
              return next;
            });
          }, 420);
        }
      }
    );

    return unsub;
  }, [watchlists.length, watchlists.map((w) => w.items.length).join(',')]);

  const crosshair = crosshairByPane[activePane.id];
  const activeCandles = candlesByPane[activePane.id] || [];
  const dataCandle = crosshair?.candle || activeCandles[activeCandles.length - 1] || null;
  const dataPrevClose =
    crosshair?.prevClose ??
    (activeCandles.length > 1 ? activeCandles[activeCandles.length - 2].close : null);

  return (
    <div className="flex h-full shrink-0 z-20">
      {/* Main Collapsible Drawer */}
      {rightPanelOpen && (
        <aside className="fixed top-11 bottom-8 right-10 z-40 md:static md:inset-auto w-72 xl:w-80 md:h-full flex flex-col bg-white dark:bg-[#1E222D] border-l border-slate-200 dark:border-[#2A2E39] shadow-2xl md:shadow-none text-xs overflow-hidden">
          {/* WATCHLIST TAB */}
          {rightPanelTab === 'watchlist' && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between gap-1 px-2.5 py-2 border-b border-slate-200 dark:border-[#2A2E39]">
                <select
                  aria-label="Select Watchlist"
                  value={activeWatchlist.id}
                  onChange={(e) => setActiveWatchlist(e.target.value)}
                  className="font-semibold text-slate-900 dark:text-[#F8FAFC] bg-transparent focus:outline-none truncate max-w-[140px] cursor-pointer"
                >
                  {watchlists.map((w) => (
                    <option key={w.id} value={w.id} className="bg-white dark:bg-[#1E222D]">
                      {w.name}
                    </option>
                  ))}
                </select>

                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() => setSymbolSearchOpen(true)}
                    title="Add Symbol to Watchlist"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-500 dark:text-[#D1D4DC]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewSectionPrompt((v) => !v)}
                    title="Add Section Divider"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-500 dark:text-[#D1D4DC]"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewWlPrompt((v) => !v)}
                    title="New Watchlist"
                    className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-500 dark:text-[#D1D4DC]"
                  >
                    <List className="w-3.5 h-3.5" />
                  </button>
                  {watchlists.length > 1 && (
                    <button
                      type="button"
                      onClick={() => deleteWatchlist(activeWatchlist.id)}
                      title="Delete Watchlist"
                      className="p-1 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39] text-slate-400 hover:text-[#EF5350]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {newWlPrompt && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newWlName.trim()) createWatchlist(newWlName);
                    setNewWlName('');
                    setNewWlPrompt(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 dark:bg-[#131722] border-b border-slate-200 dark:border-[#2A2E39]"
                >
                  <input
                    autoFocus
                    value={newWlName}
                    onChange={(e) => setNewWlName(e.target.value)}
                    placeholder="Watchlist name…"
                    className="flex-1 bg-transparent px-1.5 py-1 rounded border border-slate-200 dark:border-[#2A2E39] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded bg-[#2962FF] text-white font-medium"
                  >
                    Create
                  </button>
                </form>
              )}

              {newSectionPrompt && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (newSectionName.trim()) {
                      addSectionToWatchlist(activeWatchlist.id, newSectionName);
                    }
                    setNewSectionName('');
                    setNewSectionPrompt(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-50 dark:bg-[#131722] border-b border-slate-200 dark:border-[#2A2E39]"
                >
                  <input
                    autoFocus
                    value={newSectionName}
                    onChange={(e) => setNewSectionName(e.target.value)}
                    placeholder="Section header…"
                    className="flex-1 bg-transparent px-1.5 py-1 rounded border border-slate-200 dark:border-[#2A2E39] focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1 rounded bg-[#2962FF] text-white font-medium"
                  >
                    Add
                  </button>
                </form>
              )}

              {/* Column Headers */}
              <div className="grid grid-cols-[1fr_70px_58px_52px] gap-1 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-200 dark:border-[#2A2E39]">
                <span>Symbol</span>
                <span className="text-right">Last</span>
                <span className="text-right">Chg%</span>
                <span className="text-right">Vol</span>
              </div>

              {/* Items List */}
              <div className="flex-1 overflow-y-auto">
                {activeWatchlist.items.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 space-y-2">
                    <p>This watchlist is empty.</p>
                    <button
                      type="button"
                      onClick={() => setSymbolSearchOpen(true)}
                      className="px-3 py-1.5 rounded bg-[#2962FF] text-white font-medium"
                    >
                      Add Symbol
                    </button>
                  </div>
                ) : (
                  activeWatchlist.items.map((item, idx) => {
                    if (item.kind === 'section') {
                      return (
                        <div
                          key={item.id}
                          draggable
                          onDragStart={() => setDragIdx(idx)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (dragIdx !== null && dragIdx !== idx) {
                              reorderWatchlistItems(activeWatchlist.id, dragIdx, idx);
                            }
                            setDragIdx(null);
                          }}
                          className="group flex items-center justify-between px-2.5 py-1 bg-slate-50 dark:bg-[#131722]/70 border-y border-slate-200/70 dark:border-[#2A2E39]/60 text-[10px] font-semibold uppercase tracking-wider text-slate-400 cursor-grab"
                        >
                          <span>{item.sectionTitle}</span>
                          <button
                            type="button"
                            onClick={() => removeWatchlistItem(activeWatchlist.id, item.id)}
                            className="opacity-0 group-hover:opacity-100 hover:text-[#EF5350]"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      );
                    }

                    const sym = item.symbol || '';
                    const tick = tickers[sym];
                    const flash = flashMap[sym];
                    const isSelected = activePane.symbol.symbol === sym;
                    const chgPositive = (tick?.changePercent ?? 0) >= 0;

                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={() => setDragIdx(idx)}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => {
                          if (dragIdx !== null && dragIdx !== idx) {
                            reorderWatchlistItems(activeWatchlist.id, dragIdx, idx);
                          }
                          setDragIdx(null);
                        }}
                        onClick={() => {
                          setPaneSymbol(activePane.id, {
                            symbol: sym,
                            displaySymbol: item.displaySymbol || sym,
                            name: item.name || sym,
                            exchange: item.provider === 'binance' ? 'BINANCE' : (item.provider || 'MARKET').toUpperCase(),
                            assetClass: item.assetClass || 'crypto',
                            provider: item.provider || 'binance',
                          });
                        }}
                        className={`group grid grid-cols-[1fr_70px_58px_52px] items-center gap-1 px-2.5 py-2 border-b border-slate-100 dark:border-[#2A2E39]/40 cursor-pointer transition-colors ${
                          flash === 'up'
                            ? 'animate-flash-up'
                            : flash === 'down'
                            ? 'animate-flash-down'
                            : ''
                        } ${
                          isSelected
                            ? 'bg-[#2962FF]/12'
                            : 'hover:bg-slate-50 dark:hover:bg-[#2A2E39]/50'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const curIdx = FLAG_CYCLE.indexOf(item.flag || 'none');
                              const nextFlag = FLAG_CYCLE[(curIdx + 1) % FLAG_CYCLE.length];
                              setWatchlistItemFlag(activeWatchlist.id, item.id, nextFlag);
                            }}
                            title="Cycle Flag Color"
                            className="shrink-0"
                          >
                            <Flag className={`w-3 h-3 ${FLAG_COLORS[item.flag || 'none']}`} />
                          </button>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-900 dark:text-[#F8FAFC] truncate">
                              {item.displaySymbol || sym}
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              {item.name}
                            </div>
                          </div>
                        </div>

                        <div className="text-right font-mono-num font-medium text-slate-800 dark:text-[#F8FAFC]">
                          {tick ? formatPrice(tick.price) : '—'}
                        </div>

                        <div
                          className={`text-right font-mono-num font-medium ${
                            tick
                              ? chgPositive
                                ? 'text-[#26A69A]'
                                : 'text-[#EF5350]'
                              : 'text-slate-400'
                          }`}
                        >
                          {tick ? formatPercent(tick.changePercent) : '—'}
                        </div>

                        <div className="flex items-center justify-end gap-1 font-mono-num text-[11px] text-slate-500 dark:text-[#9CA3AF]">
                          <span className="group-hover:hidden">
                            {tick ? formatVolume(tick.volume) : '—'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeWatchlistItem(activeWatchlist.id, item.id);
                            }}
                            className="hidden group-hover:inline-flex p-0.5 text-slate-400 hover:text-[#EF5350]"
                            title="Remove"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* ALERTS TAB */}
          {rightPanelTab === 'alerts' && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-[#2A2E39]">
                <span className="font-semibold text-slate-900 dark:text-[#F8FAFC]">Price & Drawing Alerts</span>
                <button
                  type="button"
                  onClick={() => setAlertsModalOpen(true, null, null)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-[#2962FF] text-white font-medium hover:bg-[#1E53E5]"
                >
                  <Plus className="w-3 h-3" />
                  <span>New</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto divide-y divide-slate-200 dark:divide-[#2A2E39]">
                <div className="p-2.5 space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Configured ({alerts.length})
                  </div>
                  {alerts.length === 0 ? (
                    <p className="text-slate-400 py-3 text-center">
                      No active alerts. Right-click the chart or click New to add one.
                    </p>
                  ) : (
                    alerts.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center justify-between gap-2 p-2 rounded bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A2E39]"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-[#F8FAFC]">
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                a.active ? 'bg-[#26A69A]' : 'bg-slate-400'
                              }`}
                            />
                            <span>{a.symbol}</span>
                            <span className="font-mono-num text-[#2962FF]">
                              {a.condition === 'crossingDrawing'
                                ? a.drawingLabel || 'Line'
                                : formatPrice(a.targetPrice)}
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {a.condition} · Triggered {a.triggeredCount}x
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => toggleAlertActive(a.id)}
                            className="px-1.5 py-0.5 rounded border border-slate-200 dark:border-[#2A2E39] text-[10px] hover:bg-slate-200 dark:hover:bg-[#2A2E39]"
                          >
                            {a.active ? 'Pause' : 'Resume'}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAlert(a.id)}
                            className="p-1 text-slate-400 hover:text-[#EF5350]"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                <div className="p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Alert Log ({alertLogs.length})
                    </span>
                    {alertLogs.length > 0 && (
                      <button
                        type="button"
                        onClick={clearAlertLogs}
                        className="text-[10px] text-slate-400 hover:text-[#EF5350]"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {alertLogs.length === 0 ? (
                    <p className="text-slate-400 py-2 text-center">No triggered alerts yet.</p>
                  ) : (
                    alertLogs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-[11px]"
                      >
                        <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-[#F8FAFC]">
                          <span>{log.symbol}</span>
                          <span className="font-mono-num">{formatPrice(log.price)}</span>
                        </div>
                        <div className="text-slate-600 dark:text-[#D1D4DC]">{log.message}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {formatTimestamp(Math.floor(log.triggeredAt / 1000), chartSettings.timezone)}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* OBJECT TREE TAB */}
          {rightPanelTab === 'objects' && (
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-[#2A2E39]">
                <span className="font-semibold text-slate-900 dark:text-[#F8FAFC]">
                  Object Tree · {activePane.symbol.displaySymbol}
                </span>
              </div>
              <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Indicators ({activePane.indicators.length})
                  </div>
                  {activePane.indicators.length === 0 ? (
                    <p className="text-slate-400 text-[11px]">No indicators added.</p>
                  ) : (
                    <div className="space-y-1">
                      {activePane.indicators.map((ind) => (
                        <div
                          key={ind.id}
                          className="flex items-center justify-between px-2 py-1.5 rounded bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A2E39]"
                        >
                          <span className="font-medium truncate">
                            {ind.name} ({Object.values(ind.params).join(', ') || 'Auto'})
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                updateIndicator(activePane.id, ind.id, { visible: !ind.visible })
                              }
                              className="p-0.5 text-slate-400 hover:text-white"
                            >
                              {ind.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingIndicatorId(ind.id)}
                              className="p-0.5 text-slate-400 hover:text-white"
                            >
                              <Settings className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeIndicator(activePane.id, ind.id)}
                              className="p-0.5 text-slate-400 hover:text-[#EF5350]"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Drawings ({drawings.length})
                  </div>
                  {drawings.length === 0 ? (
                    <p className="text-slate-400 text-[11px]">No drawings on {symbolKey}.</p>
                  ) : (
                    <div className="space-y-1">
                      {[...drawings].reverse().map((drv) => {
                        const meta = getToolMeta(drv.tool);
                        const isSel = selectedDrawingId === drv.id;
                        return (
                          <div
                            key={drv.id}
                            onClick={() => setSelectedDrawingId(drv.id)}
                            className={`flex items-center justify-between px-2 py-1.5 rounded border cursor-pointer ${
                              isSel
                                ? 'border-[#2962FF] bg-[#2962FF]/15'
                                : 'border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-2.5 h-2.5 rounded-sm shrink-0"
                                style={{ backgroundColor: drv.style.color }}
                              />
                              <span className="truncate font-medium">
                                {drv.text || meta.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateDrawing(symbolKey, drv.id, { visible: !drv.visible });
                                }}
                                className="p-0.5 text-slate-400 hover:text-white"
                              >
                                {drv.visible ? (
                                  <Eye className="w-3.5 h-3.5" />
                                ) : (
                                  <EyeOff className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateDrawing(symbolKey, drv.id, { locked: !drv.locked });
                                }}
                                className="p-0.5 text-slate-400 hover:text-amber-400"
                              >
                                {drv.locked ? (
                                  <Lock className="w-3.5 h-3.5 text-amber-400" />
                                ) : (
                                  <Unlock className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeDrawing(symbolKey, drv.id);
                                }}
                                className="p-0.5 text-slate-400 hover:text-[#EF5350]"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* DATA WINDOW TAB */}
          {rightPanelTab === 'data' && (
            <div className="flex flex-col h-full">
              <div className="px-3 py-2 border-b border-slate-200 dark:border-[#2A2E39] font-semibold text-slate-900 dark:text-[#F8FAFC]">
                Data Window · {activePane.symbol.displaySymbol}
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {dataCandle ? (
                  <>
                    <div className="text-[11px] text-slate-400 font-mono-num pb-1 border-b border-slate-200 dark:border-[#2A2E39]">
                      {formatTimestamp(dataCandle.time, chartSettings.timezone)}
                    </div>
                    {[
                      ['Open', formatPrice(dataCandle.open)],
                      ['High', formatPrice(dataCandle.high)],
                      ['Low', formatPrice(dataCandle.low)],
                      ['Close', formatPrice(dataCandle.close)],
                      [
                        'Change',
                        (() => {
                          const ref = dataPrevClose ?? dataCandle.open;
                          const diff = dataCandle.close - ref;
                          const pct = ref ? (diff / ref) * 100 : 0;
                          return `${diff >= 0 ? '+' : ''}${formatPrice(diff)} (${formatPercent(pct)})`;
                        })(),
                      ],
                      ['Volume', formatVolume(dataCandle.volume)],
                    ].map(([label, val]) => (
                      <div key={label} className="flex items-center justify-between py-0.5">
                        <span className="text-slate-500 dark:text-[#787B86]">{label}</span>
                        <span className="font-mono-num font-medium text-slate-900 dark:text-[#F8FAFC]">
                          {val}
                        </span>
                      </div>
                    ))}

                    {crosshair?.indicatorValues &&
                      Object.keys(crosshair.indicatorValues).length > 0 && (
                        <div className="pt-2 mt-2 border-t border-slate-200 dark:border-[#2A2E39] space-y-1.5">
                          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                            Indicator Values
                          </div>
                          {Object.entries(crosshair.indicatorValues).map(([indName, map]) => (
                            <div key={indName} className="space-y-0.5">
                              <div className="font-semibold text-slate-700 dark:text-[#D1D4DC]">
                                {indName}
                              </div>
                              {Object.entries(map).map(([k, v]) => (
                                <div key={k} className="flex items-center justify-between pl-2">
                                  <span className="text-slate-400">{k}</span>
                                  <span className="font-mono-num">
                                    {v !== null ? v.toFixed(4) : '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                  </>
                ) : (
                  <p className="text-slate-400 text-center py-6">
                    Move cursor over chart to inspect OHLCV values.
                  </p>
                )}
              </div>
            </div>
          )}
        </aside>
      )}

      {/* Far-Right Narrow Tab Rail */}
      <div className="w-10 shrink-0 h-full flex flex-col items-center py-2 gap-1.5 bg-white dark:bg-[#1E222D] border-l border-slate-200 dark:border-[#2A2E39]">
        <button
          type="button"
          onClick={() => setRightPanelOpen(!rightPanelOpen)}
          title={rightPanelOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          className="w-7 h-7 rounded flex items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-[#2A2E39] dark:text-[#D1D4DC]"
        >
          {rightPanelOpen ? (
            <PanelRightClose className="w-4 h-4" />
          ) : (
            <PanelRightOpen className="w-4 h-4" />
          )}
        </button>

        <div className="w-5 h-px bg-slate-200 dark:bg-[#2A2E39]" />

        {(
          [
            ['watchlist', 'Watchlist', <List key="w" className="w-4 h-4" />],
            ['alerts', 'Alerts', <Bell key="a" className="w-4 h-4" />],
            ['objects', 'Object Tree', <Layers key="o" className="w-4 h-4" />],
            ['data', 'Data Window', <Table2 key="d" className="w-4 h-4" />],
          ] as const
        ).map(([tab, label, icon]) => (
          <button
            key={tab}
            type="button"
            title={label}
            onClick={() => {
              if (rightPanelOpen && rightPanelTab === tab) {
                setRightPanelOpen(false);
              } else {
                setRightPanelTab(tab);
              }
            }}
            className={`relative w-8 h-8 rounded flex items-center justify-center transition-colors ${
              rightPanelOpen && rightPanelTab === tab
                ? 'bg-[#2962FF]/20 text-[#2962FF]'
                : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
            }`}
          >
            {icon}
            {tab === 'alerts' && alerts.some((a) => a.active) && (
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#26A69A]" />
            )}
          </button>
        ))}

        {rightPanelOpen && (
          <button
            type="button"
            onClick={() => setRightPanelOpen(false)}
            title="Hide Panel"
            className="mt-auto w-7 h-7 rounded flex items-center justify-center text-slate-400 hover:text-white"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
};
