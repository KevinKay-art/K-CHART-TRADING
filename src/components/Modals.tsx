import React, { useEffect, useMemo, useState } from 'react';
import { Bookmark, Check, Plus, Search, Star, Trash2, X } from 'lucide-react';
import { INDICATOR_CATALOG } from '../indicators/catalog';
import { searchAllSymbols } from '../services/dataProviders';
import { loadLocalProviderKeys, saveLocalProviderKeys } from '../services/dataProviders/types';
import { useTerminalStore } from '../store/useTerminalStore';
import {
  AlertCondition,
  AssetClass,
  DataProviderId,
  PriceSource,
  SymbolInfo,
  Timeframe,
} from '../types/chart';
import { ALL_TIMEFRAMES } from '../utils/format';

/* ------------------------------------------------------------------
   1. Symbol Search Modal
------------------------------------------------------------------- */
export const SymbolSearchModal: React.FC = () => {
  const open = useTerminalStore((s) => s.symbolSearchOpen);
  const setOpen = useTerminalStore((s) => s.setSymbolSearchOpen);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const activeWatchlistId = useTerminalStore((s) => s.activeWatchlistId);
  const setPaneSymbol = useTerminalStore((s) => s.setPaneSymbol);
  const addSymbolToWatchlist = useTerminalStore((s) => s.addSymbolToWatchlist);
  const pushToast = useTerminalStore((s) => s.pushToast);

  const [query, setQuery] = useState('');
  const [assetFilter, setAssetFilter] = useState<'all' | AssetClass>('all');
  const [results, setResults] = useState<SymbolInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(() => {
      searchAllSymbols(query, 'all')
        .then((res) => {
          if (!cancelled) {
            setResults(res);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, query]);

  if (!open) return null;

  const filtered = results.filter((r) => assetFilter === 'all' || r.assetClass === assetFilter);

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-16 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl overflow-hidden text-xs"
      >
        <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-slate-200 dark:border-[#2A2E39]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search symbol or name (e.g. BTCUSDT, ETH, SOL, AAPL, EUR/USD)…"
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-[#F8FAFC] focus:outline-none"
          />
          <button type="button" onClick={() => setOpen(false)} className="p-1 text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-1 px-3.5 py-2 border-b border-slate-200 dark:border-[#2A2E39] overflow-x-auto">
          {(['all', 'crypto', 'stock', 'forex', 'index', 'commodity'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setAssetFilter(cat)}
              className={`px-2.5 py-1 rounded capitalize font-medium ${
                assetFilter === cat
                  ? 'bg-[#2962FF] text-white'
                  : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
              }`}
            >
              {cat === 'all' ? 'All Markets' : cat}
            </button>
          ))}
        </div>

        <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2E39]/60">
          {loading && filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">Loading symbols…</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              No matching symbols found. Configure Twelve Data / Finnhub / Polygon API keys in Settings for full equity & FX search.
            </div>
          ) : (
            filtered.map((sym) => (
              <div
                key={`${sym.provider}:${sym.symbol}`}
                onClick={() => {
                  setPaneSymbol(activePane.id, sym);
                  setOpen(false);
                }}
                className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#2A2E39] cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-slate-900 dark:text-[#F8FAFC] w-28 truncate">
                    {sym.displaySymbol}
                  </span>
                  <span className="text-slate-500 dark:text-[#9CA3AF] truncate">{sym.name}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-[11px] text-slate-400 uppercase">
                    {sym.assetClass} · {sym.exchange}
                  </span>
                  <button
                    type="button"
                    title="Add to Watchlist"
                    onClick={(e) => {
                      e.stopPropagation();
                      addSymbolToWatchlist(activeWatchlistId, sym);
                      pushToast({
                        title: 'Added to Watchlist',
                        message: sym.displaySymbol,
                        tone: 'success',
                      });
                    }}
                    className="p-1 rounded hover:bg-[#2962FF]/20 text-[#2962FF]"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------
   2. Indicators Dialog
------------------------------------------------------------------- */
export const IndicatorsModal: React.FC = () => {
  const open = useTerminalStore((s) => s.indicatorsModalOpen);
  const setOpen = useTerminalStore((s) => s.setIndicatorsModalOpen);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const favoriteIndicators = useTerminalStore((s) => s.favoriteIndicators);
  const toggleFavoriteIndicator = useTerminalStore((s) => s.toggleFavoriteIndicator);
  const addIndicator = useTerminalStore((s) => s.addIndicator);
  const indicatorTemplates = useTerminalStore((s) => s.indicatorTemplates);
  const saveIndicatorTemplate = useTerminalStore((s) => s.saveIndicatorTemplate);
  const applyIndicatorTemplate = useTerminalStore((s) => s.applyIndicatorTemplate);
  const deleteIndicatorTemplate = useTerminalStore((s) => s.deleteIndicatorTemplate);

  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'favorites' | 'overlay' | 'oscillator' | 'volume' | 'templates'>('all');
  const [tplName, setTplName] = useState('');

  if (!open) return null;
  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];

  const filtered = INDICATOR_CATALOG.filter((ind) => {
    if (tab === 'favorites' && !favoriteIndicators.includes(ind.type)) return false;
    if ((tab === 'overlay' || tab === 'oscillator' || tab === 'volume') && ind.category !== tab) {
      return false;
    }
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      ind.name.toLowerCase().includes(q) ||
      ind.shortName.toLowerCase().includes(q) ||
      ind.description.toLowerCase().includes(q)
    );
  });

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-14 p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl overflow-hidden text-xs"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#2A2E39]">
          <span className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
            Indicators & Templates
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-200 dark:border-[#2A2E39]">
          <Search className="w-4 h-4 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search indicators (RSI, MACD, Bollinger, Supertrend, Ichimoku)…"
            className="flex-1 bg-transparent text-slate-900 dark:text-[#F8FAFC] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 px-4 py-2 border-b border-slate-200 dark:border-[#2A2E39] overflow-x-auto">
          {(
            [
              ['all', 'All'],
              ['favorites', 'Favorites'],
              ['overlay', 'Overlays'],
              ['oscillator', 'Oscillators'],
              ['volume', 'Volume'],
              ['templates', 'Templates'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`px-2.5 py-1 rounded font-medium whitespace-nowrap ${
                tab === id
                  ? 'bg-[#2962FF] text-white'
                  : 'text-slate-500 dark:text-[#D1D4DC] hover:bg-slate-100 dark:hover:bg-[#2A2E39]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'templates' ? (
          <div className="p-4 space-y-3 max-h-96 overflow-y-auto">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveIndicatorTemplate(tplName || 'My Setup', activePane.indicators);
                setTplName('');
              }}
              className="flex items-center gap-2"
            >
              <input
                value={tplName}
                onChange={(e) => setTplName(e.target.value)}
                placeholder="Template name for current indicators…"
                className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
              />
              <button
                type="submit"
                disabled={activePane.indicators.length === 0}
                className="px-3 py-1.5 rounded bg-[#2962FF] text-white font-medium disabled:opacity-40"
              >
                Save Current
              </button>
            </form>
            {indicatorTemplates.length === 0 ? (
              <p className="text-slate-400 text-center py-6">No saved indicator templates yet.</p>
            ) : (
              <div className="space-y-1.5">
                {indicatorTemplates.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between px-3 py-2 rounded bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A2E39]"
                  >
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-[#F8FAFC]">{t.name}</div>
                      <div className="text-[11px] text-slate-400">
                        {t.indicators.map((i) => i.name).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          applyIndicatorTemplate(activePane.id, t);
                          setOpen(false);
                        }}
                        className="px-2.5 py-1 rounded bg-[#2962FF] text-white font-medium"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteIndicatorTemplate(t.id)}
                        className="p-1 text-slate-400 hover:text-[#EF5350]"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100 dark:divide-[#2A2E39]/60">
            {filtered.map((ind) => {
              const isFav = favoriteIndicators.includes(ind.type);
              const count = activePane.indicators.filter((i) => i.type === ind.type).length;
              return (
                <div
                  key={ind.type}
                  onClick={() => addIndicator(activePane.id, ind.type)}
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-[#2A2E39] cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavoriteIndicator(ind.type);
                      }}
                      className="text-slate-400 hover:text-amber-400"
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                    </button>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900 dark:text-[#F8FAFC] flex items-center gap-2">
                        <span>{ind.name}</span>
                        {count > 0 && (
                          <span className="text-[10px] text-[#26A69A] font-mono-num">({count} active)</span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{ind.description}</div>
                    </div>
                  </div>
                  <span className="text-[10px] uppercase text-slate-400 ml-3 shrink-0">
                    {ind.category}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------
   3. Indicator Settings Modal
------------------------------------------------------------------- */
export const IndicatorSettingsModal: React.FC = () => {
  const editingId = useTerminalStore((s) => s.editingIndicatorId);
  const setEditingId = useTerminalStore((s) => s.setEditingIndicatorId);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const updateIndicator = useTerminalStore((s) => s.updateIndicator);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const indicator = activePane.indicators.find((i) => i.id === editingId);
  if (!editingId || !indicator) return null;

  const def = INDICATOR_CATALOG.find((d) => d.type === indicator.type);

  return (
    <div
      onClick={() => setEditingId(null)}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl p-4 space-y-4 text-xs text-slate-800 dark:text-[#D1D4DC]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2E39] pb-2.5">
          <span className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
            {def?.name || indicator.name} Settings
          </span>
          <button type="button" onClick={() => setEditingId(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-2.5">
          <label className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-[#9CA3AF]">Price Source</span>
            <select
              value={indicator.source}
              onChange={(e) =>
                updateIndicator(activePane.id, indicator.id, {
                  source: e.target.value as PriceSource,
                })
              }
              className="px-2.5 py-1 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
            >
              {(['close', 'open', 'high', 'low', 'hl2', 'hlc3', 'ohlc4'] as PriceSource[]).map((s) => (
                <option key={s} value={s}>
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </label>

          {Object.entries(indicator.params).map(([key, val]) => (
            <label key={key} className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-[#9CA3AF]">
                {def?.paramLabels[key] || key}
              </span>
              <input
                type="number"
                step={key === 'step' || key === 'max' || key === 'mult' ? '0.01' : '1'}
                value={val}
                onChange={(e) =>
                  updateIndicator(activePane.id, indicator.id, {
                    params: { ...indicator.params, [key]: Number(e.target.value) },
                  })
                }
                className="w-24 px-2.5 py-1 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] font-mono-num text-right"
              />
            </label>
          ))}

          <label className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-[#9CA3AF]">Line Width</span>
            <input
              type="number"
              min={1}
              max={4}
              value={indicator.lineWidth}
              onChange={(e) =>
                updateIndicator(activePane.id, indicator.id, {
                  lineWidth: Math.min(4, Math.max(1, Number(e.target.value) || 1)),
                })
              }
              className="w-24 px-2.5 py-1 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] font-mono-num text-right"
            />
          </label>

          {/* Colors */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#2A2E39] space-y-1.5">
            <div className="text-[10px] font-semibold uppercase text-slate-400">Colors</div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(indicator.colors).map(([k, hex]) => (
                <label key={k} className="flex items-center justify-between px-2 py-1 rounded bg-slate-50 dark:bg-[#131722]">
                  <span>{def?.colorLabels[k] || k}</span>
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) =>
                      updateIndicator(activePane.id, indicator.id, {
                        colors: { ...indicator.colors, [k]: e.target.value },
                      })
                    }
                    className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
              ))}
            </div>
          </div>

          {/* Visibility per Timeframe */}
          <div className="pt-2 border-t border-slate-200 dark:border-[#2A2E39] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase text-slate-400">Timeframe Visibility</span>
              <button
                type="button"
                onClick={() =>
                  updateIndicator(activePane.id, indicator.id, {
                    timeframeVisibility:
                      indicator.timeframeVisibility === 'all' ? [activePane.timeframe] : 'all',
                  })
                }
                className="text-[#2962FF] font-medium"
              >
                {indicator.timeframeVisibility === 'all' ? 'All Timeframes' : 'Custom'}
              </button>
            </div>
            {indicator.timeframeVisibility !== 'all' && (
              <div className="flex flex-wrap gap-1">
                {ALL_TIMEFRAMES.map((tf: Timeframe) => {
                  const active = indicator.timeframeVisibility.includes(tf);
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => {
                        const cur = indicator.timeframeVisibility as Timeframe[];
                        const next = active ? cur.filter((x) => x !== tf) : [...cur, tf];
                        updateIndicator(activePane.id, indicator.id, { timeframeVisibility: next });
                      }}
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        active ? 'bg-[#2962FF] text-white' : 'bg-slate-100 dark:bg-[#131722] text-slate-400'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={() => setEditingId(null)}
            className="px-4 py-1.5 rounded bg-[#2962FF] text-white font-medium hover:bg-[#1E53E5]"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------
   4. Create Alert Modal
------------------------------------------------------------------- */
export const AlertModal: React.FC = () => {
  const open = useTerminalStore((s) => s.alertsModalOpen);
  const initialPrice = useTerminalStore((s) => s.alertsModalInitialPrice);
  const initialDrawingId = useTerminalStore((s) => s.alertsModalDrawingId);
  const setOpen = useTerminalStore((s) => s.setAlertsModalOpen);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const candlesByPane = useTerminalStore((s) => s.candlesByPane);
  const drawingsBySymbol = useTerminalStore((s) => s.drawingsBySymbol);
  const createAlert = useTerminalStore((s) => s.createAlert);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const candles = candlesByPane[activePane.id] || [];
  const lastClose = candles[candles.length - 1]?.close ?? 0;
  const lineDrawings = (drawingsBySymbol[activePane.symbol.symbol] || []).filter(
    (d) => d.tool === 'horizontalLine' || d.tool === 'horizontalRay' || d.tool === 'trendLine'
  );

  const [condition, setCondition] = useState<AlertCondition>('crossing');
  const [targetPrice, setTargetPrice] = useState<string>('');
  const [drawingId, setDrawingId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [oncePerTrigger, setOncePerTrigger] = useState(true);
  const [playSound, setPlaySound] = useState(true);
  const [browserNotify, setBrowserNotify] = useState(true);

  useEffect(() => {
    if (!open) return;
    if (initialDrawingId) {
      setCondition('crossingDrawing');
      setDrawingId(initialDrawingId);
    } else {
      setCondition('crossing');
      setDrawingId(lineDrawings[0]?.id || '');
    }
    const p = initialPrice ?? lastClose;
    setTargetPrice(p ? String(p) : '');
    setMessage('');
  }, [open, initialPrice, initialDrawingId]);

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const selectedDrv = lineDrawings.find((d) => d.id === drawingId);
    const numPrice = Number(targetPrice) || selectedDrv?.anchors[0]?.price || lastClose;
    createAlert({
      symbol: activePane.symbol.symbol,
      provider: activePane.symbol.provider,
      condition,
      targetPrice: numPrice,
      drawingId: condition === 'crossingDrawing' ? drawingId : undefined,
      drawingLabel: condition === 'crossingDrawing' ? `${selectedDrv?.tool || 'Line'}` : undefined,
      message:
        message.trim() ||
        `${activePane.symbol.displaySymbol} ${condition} ${condition === 'crossingDrawing' ? selectedDrv?.tool || 'drawing' : numPrice}`,
      oncePerTrigger,
      playSound,
      browserNotify,
    });
    setOpen(false);
  };

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl p-4 space-y-3.5 text-xs text-slate-800 dark:text-[#D1D4DC]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2E39] pb-2.5">
          <span className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
            Create Alert · {activePane.symbol.displaySymbol}
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Condition</span>
          <select
            value={condition}
            onChange={(e) => setCondition(e.target.value as AlertCondition)}
            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
          >
            <option value="crossing">Crossing Price</option>
            <option value="crossingUp">Crossing Up</option>
            <option value="crossingDown">Crossing Down</option>
            <option value="greaterThan">Greater Than</option>
            <option value="lessThan">Less Than</option>
            {lineDrawings.length > 0 && (
              <option value="crossingDrawing">Crossing Drawing (Line)</option>
            )}
          </select>
        </label>

        {condition === 'crossingDrawing' ? (
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Target Drawing</span>
            <select
              value={drawingId}
              onChange={(e) => setDrawingId(e.target.value)}
              className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
            >
              {lineDrawings.map((d, i) => (
                <option key={d.id} value={d.id}>
                  #{i + 1} {d.tool} ({d.anchors[0]?.price.toFixed(2)})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-slate-400">Target Value</span>
            <input
              type="number"
              step="any"
              required
              value={targetPrice}
              onChange={(e) => setTargetPrice(e.target.value)}
              className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] font-mono-num"
            />
          </label>
        )}

        <label className="flex flex-col gap-1">
          <span className="text-slate-400">Message (Optional)</span>
          <input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={`${activePane.symbol.displaySymbol} crossed target`}
            className="px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
          />
        </label>

        <div className="space-y-1.5 pt-1">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={oncePerTrigger}
              onChange={(e) => setOncePerTrigger(e.target.checked)}
              className="accent-[#2962FF]"
            />
            <span>Trigger once and pause</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={playSound}
              onChange={(e) => setPlaySound(e.target.checked)}
              className="accent-[#2962FF]"
            />
            <span>Play alert chime</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={browserNotify}
              onChange={(e) => setBrowserNotify(e.target.checked)}
              className="accent-[#2962FF]"
            />
            <span>Send browser notification</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="px-3 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39]"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-4 py-1.5 rounded bg-[#2962FF] text-white font-medium hover:bg-[#1E53E5]"
          >
            Create Alert
          </button>
        </div>
      </form>
    </div>
  );
};

/* ------------------------------------------------------------------
   5. Chart & Data Provider Settings Modal
------------------------------------------------------------------- */
export const SettingsModal: React.FC = () => {
  const open = useTerminalStore((s) => s.settingsModalOpen);
  const tab = useTerminalStore((s) => s.settingsModalTab);
  const setOpen = useTerminalStore((s) => s.setSettingsModalOpen);
  const chartSettings = useTerminalStore((s) => s.chartSettings);
  const updateChartSettings = useTerminalStore((s) => s.updateChartSettings);
  const resetChartSettings = useTerminalStore((s) => s.resetChartSettings);
  const pushToast = useTerminalStore((s) => s.pushToast);

  const [activeTab, setActiveTab] = useState<'chart' | 'providers'>(tab);
  const [keys, setKeys] = useState(() => loadLocalProviderKeys());
  const [serverStatus, setServerStatus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setActiveTab(tab);
  }, [tab]);

  useEffect(() => {
    if (!open) return;
    fetch('/api/providers/status')
      .then((r) => r.json())
      .then((d) => setServerStatus(d))
      .catch(() => {});
  }, [open]);

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl overflow-hidden text-xs text-slate-800 dark:text-[#D1D4DC]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-[#2A2E39]">
          <span className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
            Terminal Settings
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex border-b border-slate-200 dark:border-[#2A2E39] px-4 gap-4">
          <button
            type="button"
            onClick={() => setActiveTab('chart')}
            className={`py-2.5 font-medium border-b-2 ${
              activeTab === 'chart'
                ? 'border-[#2962FF] text-[#2962FF]'
                : 'border-transparent text-slate-400'
            }`}
          >
            Symbol & Canvas
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('providers')}
            className={`py-2.5 font-medium border-b-2 ${
              activeTab === 'providers'
                ? 'border-[#2962FF] text-[#2962FF]'
                : 'border-transparent text-slate-400'
            }`}
          >
            Data Providers & Keys
          </button>
        </div>

        {activeTab === 'chart' ? (
          <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
            <div className="grid grid-cols-2 gap-2.5">
              {(
                [
                  ['upColor', 'Bull Body'],
                  ['downColor', 'Bear Body'],
                  ['borderUpColor', 'Bull Border'],
                  ['borderDownColor', 'Bear Border'],
                  ['wickUpColor', 'Bull Wick'],
                  ['wickDownColor', 'Bear Wick'],
                ] as const
              ).map(([field, label]) => (
                <label
                  key={field}
                  className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A2E39]"
                >
                  <span>{label}</span>
                  <input
                    type="color"
                    value={chartSettings[field]}
                    onChange={(e) => updateChartSettings({ [field]: e.target.value })}
                    className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-200 dark:border-[#2A2E39]">
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Background Mode</span>
                <select
                  value={chartSettings.backgroundType}
                  onChange={(e) =>
                    updateChartSettings({
                      backgroundType: e.target.value as 'solid' | 'gradient',
                    })
                  }
                  className="px-2 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
                >
                  <option value="solid">Solid</option>
                  <option value="gradient">Vertical Gradient</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">Price Scale Side</span>
                <select
                  value={chartSettings.scalePosition}
                  onChange={(e) =>
                    updateChartSettings({
                      scalePosition: e.target.value as 'left' | 'right',
                    })
                  }
                  className="px-2 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
                >
                  <option value="right">Right</option>
                  <option value="left">Left</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-[#131722]">
                <span>Background Color</span>
                <input
                  type="color"
                  value={chartSettings.backgroundColor}
                  onChange={(e) => updateChartSettings({ backgroundColor: e.target.value })}
                  className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                />
              </label>
              {chartSettings.backgroundType === 'gradient' && (
                <label className="flex items-center justify-between px-2.5 py-1.5 rounded bg-slate-50 dark:bg-[#131722]">
                  <span>Gradient Bottom</span>
                  <input
                    type="color"
                    value={chartSettings.backgroundGradientBottom}
                    onChange={(e) =>
                      updateChartSettings({ backgroundGradientBottom: e.target.value })
                    }
                    className="w-6 h-5 border-0 bg-transparent cursor-pointer"
                  />
                </label>
              )}
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-200 dark:border-[#2A2E39]">
              <label className="flex items-center justify-between cursor-pointer">
                <span>Show Grid Lines</span>
                <input
                  type="checkbox"
                  checked={chartSettings.showGridLines}
                  onChange={(e) => updateChartSettings({ showGridLines: e.target.checked })}
                  className="accent-[#2962FF]"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Show Symbol Watermark</span>
                <input
                  type="checkbox"
                  checked={chartSettings.showWatermark}
                  onChange={(e) => updateChartSettings({ showWatermark: e.target.checked })}
                  className="accent-[#2962FF]"
                />
              </label>
              <label className="flex items-center justify-between cursor-pointer">
                <span>Show Volume Overlay in Main Pane</span>
                <input
                  type="checkbox"
                  checked={chartSettings.showVolumeInMainPane}
                  onChange={(e) =>
                    updateChartSettings({ showVolumeInMainPane: e.target.checked })
                  }
                  className="accent-[#2962FF]"
                />
              </label>
            </div>

            <div className="flex justify-between pt-3 border-t border-slate-200 dark:border-[#2A2E39]">
              <button
                type="button"
                onClick={resetChartSettings}
                className="px-3 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
              >
                Reset Defaults
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-4 py-1.5 rounded bg-[#2962FF] text-white font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 space-y-3 max-h-[65vh] overflow-y-auto">
            <div className="p-2.5 rounded bg-[#26A69A]/10 border border-[#26A69A]/30 text-[11px]">
              <strong>Binance Spot (Crypto):</strong> Active by default with zero API key required.
            </div>

            {(
              [
                ['twelvedata', 'Twelve Data (Stocks / Forex / Indices / Commodities)'],
                ['finnhub', 'Finnhub (Equities & Forex)'],
                ['polygon', 'Polygon.io (US Stocks, Options, FX)'],
              ] as Array<[DataProviderId, string]>
            ).map(([pid, label]) => (
              <div key={pid} className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{label}</span>
                  <span
                    className={`text-[10px] font-medium ${
                      serverStatus[pid] || keys[pid] ? 'text-[#26A69A]' : 'text-slate-400'
                    }`}
                  >
                    {serverStatus[pid]
                      ? 'Configured via Server .env'
                      : keys[pid]
                      ? 'Custom Key Saved'
                      : 'Not Configured'}
                  </span>
                </div>
                <input
                  type="password"
                  value={keys[pid] || ''}
                  onChange={(e) => setKeys({ ...keys, [pid]: e.target.value })}
                  placeholder={`Optional ${pid} API key (proxied via /api/market/*)`}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] font-mono-num"
                />
              </div>
            ))}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  saveLocalProviderKeys(keys);
                  pushToast({
                    title: 'Provider Keys Saved',
                    message: 'Requests route securely through backend proxy.',
                    tone: 'success',
                  });
                  setOpen(false);
                }}
                className="px-4 py-1.5 rounded bg-[#2962FF] text-white font-medium"
              >
                Save Keys
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------
   6. Saved Layouts Manager Modal
------------------------------------------------------------------- */
export const LayoutsModal: React.FC = () => {
  const open = useTerminalStore((s) => s.layoutsModalOpen);
  const setOpen = useTerminalStore((s) => s.setLayoutsModalOpen);
  const savedLayouts = useTerminalStore((s) => s.savedLayouts);
  const saveCurrentLayout = useTerminalStore((s) => s.saveCurrentLayout);
  const loadSavedLayout = useTerminalStore((s) => s.loadSavedLayout);
  const renameSavedLayout = useTerminalStore((s) => s.renameSavedLayout);
  const deleteSavedLayout = useTerminalStore((s) => s.deleteSavedLayout);

  const [name, setName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');

  if (!open) return null;

  return (
    <div
      onClick={() => setOpen(false)}
      className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl p-4 space-y-3 text-xs text-slate-800 dark:text-[#D1D4DC]"
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A2E39] pb-2.5">
          <span className="text-sm font-semibold text-slate-900 dark:text-[#F8FAFC]">
            Saved Chart Layouts
          </span>
          <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveCurrentLayout(name || `Layout ${savedLayouts.length + 1}`);
            setName('');
          }}
          className="flex items-center gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name current workspace layout…"
            className="flex-1 px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722]"
          />
          <button
            type="submit"
            className="px-3 py-1.5 rounded bg-[#2962FF] text-white font-medium flex items-center gap-1"
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Save</span>
          </button>
        </form>

        <div className="max-h-72 overflow-y-auto space-y-1.5">
          {savedLayouts.length === 0 ? (
            <p className="text-slate-400 text-center py-6">
              No saved layouts yet. Save your multi-chart grid, indicators, and visual settings.
            </p>
          ) : (
            savedLayouts.map((lay) => (
              <div
                key={lay.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A2E39]"
              >
                {renamingId === lay.id ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      renameSavedLayout(lay.id, renameText);
                      setRenamingId(null);
                    }}
                    className="flex items-center gap-1 flex-1"
                  >
                    <input
                      autoFocus
                      value={renameText}
                      onChange={(e) => setRenameText(e.target.value)}
                      className="flex-1 px-2 py-0.5 rounded bg-white dark:bg-[#1E222D] border border-[#2962FF]"
                    />
                    <button type="submit" className="p-1 text-[#26A69A]">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                  </form>
                ) : (
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-[#F8FAFC] truncate">
                      {lay.name}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {lay.layoutId.toUpperCase()} Grid · {lay.panes.map((p) => p.symbol.symbol).join(', ')}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => loadSavedLayout(lay.id)}
                    className="px-2 py-1 rounded bg-[#2962FF] text-white font-medium"
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRenamingId(lay.id);
                      setRenameText(lay.name);
                    }}
                    className="px-2 py-1 rounded border border-slate-200 dark:border-[#2A2E39]"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedLayout(lay.id)}
                    className="p-1 text-slate-400 hover:text-[#EF5350]"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------
   7. Drawing Text / Emoji Editor Modal
------------------------------------------------------------------- */
const EMOJI_CHOICES = ['🎯', '🚀', '⚠️', '🔥', '💎', '📈', '📉', '✅', '❌', '💡', '🛑', '⚡'];

export const DrawingTextModal: React.FC = () => {
  const editingId = useTerminalStore((s) => s.editingDrawingTextId);
  const setEditingId = useTerminalStore((s) => s.setEditingDrawingTextId);
  const panes = useTerminalStore((s) => s.panes);
  const activePaneId = useTerminalStore((s) => s.activePaneId);
  const drawingsBySymbol = useTerminalStore((s) => s.drawingsBySymbol);
  const updateDrawing = useTerminalStore((s) => s.updateDrawing);

  const activePane = panes.find((p) => p.id === activePaneId) || panes[0];
  const symbol = activePane.symbol.symbol;
  const drawing = useMemo(
    () => (drawingsBySymbol[symbol] || []).find((d) => d.id === editingId),
    [drawingsBySymbol, symbol, editingId]
  );

  const [textVal, setTextVal] = useState('');

  useEffect(() => {
    if (drawing) setTextVal(drawing.text || '');
  }, [drawing?.id]);

  if (!editingId || !drawing) return null;

  return (
    <div
      onClick={() => setEditingId(null)}
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-2xl p-4 space-y-3 text-xs"
      >
        <div className="flex items-center justify-between font-semibold text-slate-900 dark:text-[#F8FAFC]">
          <span>{drawing.tool === 'emoji' ? 'Choose Icon' : 'Edit Annotation'}</span>
          <button type="button" onClick={() => setEditingId(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        {drawing.tool === 'emoji' ? (
          <div className="grid grid-cols-6 gap-2">
            {EMOJI_CHOICES.map((em) => (
              <button
                key={em}
                type="button"
                onClick={() => {
                  updateDrawing(symbol, drawing.id, { emoji: em });
                  setEditingId(null);
                }}
                className="text-xl p-2 rounded hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
              >
                {em}
              </button>
            ))}
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              updateDrawing(symbol, drawing.id, { text: textVal || 'Text' });
              setEditingId(null);
            }}
            className="space-y-3"
          >
            <input
              autoFocus
              value={textVal}
              onChange={(e) => setTextVal(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded border border-slate-200 dark:border-[#2A2E39] bg-slate-50 dark:bg-[#131722] text-slate-900 dark:text-[#F8FAFC]"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingId(null)}
                className="px-3 py-1 rounded border border-slate-200 dark:border-[#2A2E39]"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 rounded bg-[#2962FF] text-white font-medium"
              >
                Save
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
