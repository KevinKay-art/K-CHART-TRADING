import { create } from 'zustand';
import { createIndicatorInstance } from '../indicators/catalog';
import { DEFAULT_SYMBOL } from '../services/dataProviders';
import {
  AlertCondition,
  AlertItem,
  AlertLogEntry,
  Candle,
  ChartLayoutId,
  ChartPaneInstance,
  ChartType,
  ChartVisualSettings,
  ConnectionStatus,
  CrosshairData,
  DrawingObject,
  DrawingTemplate,
  DrawingToolId,
  FlagColor,
  IndicatorConfig,
  IndicatorId,
  IndicatorTemplate,
  LayoutSyncOptions,
  MagnetMode,
  ReplayState,
  SavedLayout,
  ScaleMode,
  SymbolInfo,
  ThemeMode,
  Timeframe,
  Watchlist,
  WatchlistEntry,
  WatchlistTicker,
} from '../types/chart';
import { playAlertChime, sendBrowserNotification } from '../utils/audioAlert';
import { formatPrice } from '../utils/format';

export interface ToastNotice {
  id: string;
  title: string;
  message: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
  createdAt: number;
}

const STORAGE_KEYS = {
  theme: 'kchart_theme_v1',
  drawings: 'kchart_drawings_v1',
  watchlists: 'kchart_watchlists_v1',
  alerts: 'kchart_alerts_v1',
  alertLogs: 'kchart_alert_logs_v1',
  layouts: 'kchart_saved_layouts_v1',
  indicatorTemplates: 'kchart_ind_templates_v1',
  drawingTemplates: 'kchart_drv_templates_v1',
  favTimeframes: 'kchart_fav_tf_v1',
  favIndicators: 'kchart_fav_ind_v1',
  chartSettings: 'kchart_visual_settings_v1',
};

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore storage quota errors
  }
}

export const DARK_VISUAL_SETTINGS: ChartVisualSettings = {
  upColor: '#26A69A',
  downColor: '#EF5350',
  borderUpColor: '#26A69A',
  borderDownColor: '#EF5350',
  wickUpColor: '#26A69A',
  wickDownColor: '#EF5350',
  backgroundType: 'solid',
  backgroundColor: '#131722',
  backgroundGradientBottom: '#0B0E14',
  gridVertColor: '#1E222D',
  gridHorzColor: '#1E222D',
  showGridLines: true,
  showWatermark: true,
  showSessionBreaks: false,
  timezone: 'UTC',
  scalePosition: 'right',
  showVolumeInMainPane: true,
};

export const LIGHT_VISUAL_SETTINGS: ChartVisualSettings = {
  upColor: '#089981',
  downColor: '#F23645',
  borderUpColor: '#089981',
  borderDownColor: '#F23645',
  wickUpColor: '#089981',
  wickDownColor: '#F23645',
  backgroundType: 'solid',
  backgroundColor: '#FFFFFF',
  backgroundGradientBottom: '#F1F5F9',
  gridVertColor: '#F1F5F9',
  gridHorzColor: '#F1F5F9',
  showGridLines: true,
  showWatermark: true,
  showSessionBreaks: false,
  timezone: 'UTC',
  scalePosition: 'right',
  showVolumeInMainPane: true,
};

const DEFAULT_WATCHLISTS: Watchlist[] = [
  {
    id: 'wl_crypto_core',
    name: 'Crypto Majors',
    items: [
      { id: 'sec_majors', kind: 'section', sectionTitle: 'Spot Leaders' },
      { id: 'w_btc', kind: 'symbol', symbol: 'BTCUSDT', displaySymbol: 'BTC/USDT', name: 'Bitcoin', provider: 'binance', assetClass: 'crypto', flag: 'orange' },
      { id: 'w_eth', kind: 'symbol', symbol: 'ETHUSDT', displaySymbol: 'ETH/USDT', name: 'Ethereum', provider: 'binance', assetClass: 'crypto', flag: 'blue' },
      { id: 'w_sol', kind: 'symbol', symbol: 'SOLUSDT', displaySymbol: 'SOL/USDT', name: 'Solana', provider: 'binance', assetClass: 'crypto', flag: 'purple' },
      { id: 'w_bnb', kind: 'symbol', symbol: 'BNBUSDT', displaySymbol: 'BNB/USDT', name: 'BNB', provider: 'binance', assetClass: 'crypto', flag: 'none' },
      { id: 'w_xrp', kind: 'symbol', symbol: 'XRPUSDT', displaySymbol: 'XRP/USDT', name: 'XRP', provider: 'binance', assetClass: 'crypto', flag: 'none' },
      { id: 'sec_alt', kind: 'section', sectionTitle: 'Layer 1 & DeFi' },
      { id: 'w_avax', kind: 'symbol', symbol: 'AVAXUSDT', displaySymbol: 'AVAX/USDT', name: 'Avalanche', provider: 'binance', assetClass: 'crypto', flag: 'red' },
      { id: 'w_link', kind: 'symbol', symbol: 'LINKUSDT', displaySymbol: 'LINK/USDT', name: 'Chainlink', provider: 'binance', assetClass: 'crypto', flag: 'blue' },
      { id: 'w_ada', kind: 'symbol', symbol: 'ADAUSDT', displaySymbol: 'ADA/USDT', name: 'Cardano', provider: 'binance', assetClass: 'crypto', flag: 'none' },
      { id: 'w_doge', kind: 'symbol', symbol: 'DOGEUSDT', displaySymbol: 'DOGE/USDT', name: 'Dogecoin', provider: 'binance', assetClass: 'crypto', flag: 'none' },
      { id: 'w_sui', kind: 'symbol', symbol: 'SUIUSDT', displaySymbol: 'SUI/USDT', name: 'Sui', provider: 'binance', assetClass: 'crypto', flag: 'green' },
    ],
  },
  {
    id: 'wl_equities',
    name: 'Equities & FX',
    items: [
      { id: 'sec_eq', kind: 'section', sectionTitle: 'US Tech (API Key)' },
      { id: 'w_aapl', kind: 'symbol', symbol: 'AAPL', displaySymbol: 'AAPL', name: 'Apple Inc.', provider: 'twelvedata', assetClass: 'stock', flag: 'none' },
      { id: 'w_nvda', kind: 'symbol', symbol: 'NVDA', displaySymbol: 'NVDA', name: 'NVIDIA', provider: 'twelvedata', assetClass: 'stock', flag: 'green' },
      { id: 'w_eur', kind: 'symbol', symbol: 'EUR/USD', displaySymbol: 'EUR/USD', name: 'Euro / USD', provider: 'twelvedata', assetClass: 'forex', flag: 'blue' },
      { id: 'w_xau', kind: 'symbol', symbol: 'XAU/USD', displaySymbol: 'XAU/USD', name: 'Gold Spot', provider: 'twelvedata', assetClass: 'commodity', flag: 'orange' },
    ],
  },
];

function createDefaultPane(id: string, symbol: SymbolInfo = DEFAULT_SYMBOL, timeframe: Timeframe = '1m'): ChartPaneInstance {
  return {
    id,
    symbol,
    timeframe,
    chartType: 'candlestick',
    scaleMode: 'normal',
    autoScale: true,
    indicators: [],
  };
}

function getInitialUrlOverrides(): { symbol?: string; interval?: Timeframe; layout?: ChartLayoutId } {
  if (typeof window === 'undefined') return {};
  try {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get('symbol')?.trim().toUpperCase() || undefined;
    const interval = (params.get('interval')?.trim() as Timeframe) || undefined;
    const layout = (params.get('layout')?.trim() as ChartLayoutId) || undefined;
    return { symbol, interval, layout };
  } catch {
    return {};
  }
}

const urlInit = getInitialUrlOverrides();
const initialTheme = readStorage<ThemeMode>(STORAGE_KEYS.theme, 'dark');
const initialVisualSettings = readStorage<ChartVisualSettings>(
  STORAGE_KEYS.chartSettings,
  initialTheme === 'dark' ? DARK_VISUAL_SETTINGS : LIGHT_VISUAL_SETTINGS
);

const initialSymbol: SymbolInfo = urlInit.symbol
  ? {
      symbol: urlInit.symbol,
      displaySymbol: urlInit.symbol.endsWith('USDT')
        ? `${urlInit.symbol.slice(0, -4)}/USDT`
        : urlInit.symbol,
      name: urlInit.symbol,
      exchange: 'BINANCE',
      assetClass: 'crypto',
      provider: 'binance',
    }
  : DEFAULT_SYMBOL;

const initialTimeframe: Timeframe = urlInit.interval || '1m';
const initialLayout: ChartLayoutId = urlInit.layout && ['1', '2v', '2h', '3', '4', '6'].includes(urlInit.layout)
  ? urlInit.layout
  : '1';

function buildPanesForLayout(
  layout: ChartLayoutId,
  existing: ChartPaneInstance[]
): ChartPaneInstance[] {
  const countMap: Record<ChartLayoutId, number> = {
    '1': 1,
    '2v': 2,
    '2h': 2,
    '3': 3,
    '4': 4,
    '6': 6,
  };
  const targetCount = countMap[layout];
  const fallbackSymbols: SymbolInfo[] = [
    initialSymbol,
    { symbol: 'ETHUSDT', displaySymbol: 'ETH/USDT', name: 'Ethereum', exchange: 'BINANCE', assetClass: 'crypto', provider: 'binance' },
    { symbol: 'SOLUSDT', displaySymbol: 'SOL/USDT', name: 'Solana', exchange: 'BINANCE', assetClass: 'crypto', provider: 'binance' },
    { symbol: 'BNBUSDT', displaySymbol: 'BNB/USDT', name: 'BNB', exchange: 'BINANCE', assetClass: 'crypto', provider: 'binance' },
    { symbol: 'XRPUSDT', displaySymbol: 'XRP/USDT', name: 'XRP', exchange: 'BINANCE', assetClass: 'crypto', provider: 'binance' },
    { symbol: 'AVAXUSDT', displaySymbol: 'AVAX/USDT', name: 'Avalanche', exchange: 'BINANCE', assetClass: 'crypto', provider: 'binance' },
  ];
  const result: ChartPaneInstance[] = [];
  for (let i = 0; i < targetCount; i++) {
    if (existing[i]) {
      result.push(existing[i]);
    } else {
      result.push(
        createDefaultPane(
          `pane_${i + 1}`,
          fallbackSymbols[i % fallbackSymbols.length],
          initialTimeframe
        )
      );
    }
  }
  return result;
}

interface TerminalState {
  theme: ThemeMode;
  layoutId: ChartLayoutId;
  panes: ChartPaneInstance[];
  activePaneId: string;
  sync: LayoutSyncOptions;

  // Connection & active chart data refs
  connectionStatusByPane: Record<string, ConnectionStatus>;
  errorByPane: Record<string, string | null>;
  candlesByPane: Record<string, Candle[]>;
  crosshairByPane: Record<string, CrosshairData>;
  syncedCrosshairTime: number | null;
  syncedVisibleLogicalRange: { from: number; to: number } | null;

  // Tooling & drawing state
  activeTool: DrawingToolId;
  magnetMode: MagnetMode;
  stayInDrawing: boolean;
  lockAllDrawings: boolean;
  hideAllDrawings: boolean;
  selectedDrawingId: string | null;
  copiedDrawing: DrawingObject | null;
  drawingsBySymbol: Record<string, DrawingObject[]>;
  undoStackBySymbol: Record<string, DrawingObject[][]>;
  redoStackBySymbol: Record<string, DrawingObject[][]>;

  // Favorites & UI chrome
  favoriteTimeframes: Timeframe[];
  favoriteIndicators: IndicatorId[];
  rightPanelOpen: boolean;
  rightPanelTab: 'watchlist' | 'alerts' | 'objects' | 'data';
  leftToolbarCollapsed: boolean;
  chartSettings: ChartVisualSettings;

  // Watchlist
  watchlists: Watchlist[];
  activeWatchlistId: string;
  tickers: Record<string, WatchlistTicker>;

  // Alerts
  alerts: AlertItem[];
  alertLogs: AlertLogEntry[];
  toasts: ToastNotice[];

  // Layouts & templates
  savedLayouts: SavedLayout[];
  indicatorTemplates: IndicatorTemplate[];
  drawingTemplates: DrawingTemplate[];

  // Bar Replay
  replay: ReplayState;

  // Modals
  symbolSearchOpen: boolean;
  indicatorsModalOpen: boolean;
  settingsModalOpen: boolean;
  settingsModalTab: 'chart' | 'providers';
  alertsModalOpen: boolean;
  alertsModalInitialPrice: number | null;
  alertsModalDrawingId: string | null;
  layoutsModalOpen: boolean;
  editingIndicatorId: string | null;
  editingDrawingTextId: string | null;

  // Actions
  toggleTheme: () => void;
  setLayout: (layout: ChartLayoutId) => void;
  setActivePane: (paneId: string) => void;
  setSyncOption: (key: keyof LayoutSyncOptions, value: boolean) => void;
  setPaneSymbol: (paneId: string, symbol: SymbolInfo) => void;
  setPaneTimeframe: (paneId: string, tf: Timeframe) => void;
  setPaneChartType: (paneId: string, ct: ChartType) => void;
  setPaneScaleMode: (paneId: string, mode: ScaleMode) => void;
  setPaneAutoScale: (paneId: string, auto: boolean) => void;
  toggleFavoriteTimeframe: (tf: Timeframe) => void;
  toggleFavoriteIndicator: (id: IndicatorId) => void;

  // Data & crosshairs
  setPaneConnectionStatus: (paneId: string, status: ConnectionStatus, error?: string | null) => void;
  setPaneCandles: (paneId: string, candles: Candle[]) => void;
  setPaneCrosshair: (paneId: string, data: CrosshairData) => void;
  setSyncedCrosshairTime: (time: number | null) => void;

  // Indicators
  addIndicator: (paneId: string, type: IndicatorId) => void;
  updateIndicator: (paneId: string, indicatorId: string, patch: Partial<IndicatorConfig>) => void;
  removeIndicator: (paneId: string, indicatorId: string) => void;
  applyIndicatorTemplate: (paneId: string, tpl: IndicatorTemplate) => void;
  saveIndicatorTemplate: (name: string, indicators: IndicatorConfig[]) => void;
  deleteIndicatorTemplate: (id: string) => void;

  // Drawings + Undo/Redo
  setActiveTool: (tool: DrawingToolId) => void;
  setMagnetMode: (mode: MagnetMode) => void;
  setStayInDrawing: (val: boolean) => void;
  setLockAllDrawings: (val: boolean) => void;
  setHideAllDrawings: (val: boolean) => void;
  setSelectedDrawingId: (id: string | null) => void;
  addDrawing: (symbol: string, drawing: DrawingObject) => void;
  updateDrawing: (symbol: string, drawingId: string, patch: Partial<DrawingObject>, recordUndo?: boolean) => void;
  commitDrawingSnapshot: (symbol: string, beforeSnapshot: DrawingObject[]) => void;
  removeDrawing: (symbol: string, drawingId: string) => void;
  removeAllDrawings: (symbol: string) => void;
  cloneDrawing: (symbol: string, drawingId: string) => void;
  copySelectedDrawing: () => void;
  pasteCopiedDrawing: (symbol: string) => void;
  bringToFront: (symbol: string, drawingId: string) => void;
  sendToBack: (symbol: string, drawingId: string) => void;
  undoDrawing: (symbol: string) => void;
  redoDrawing: (symbol: string) => void;
  saveDrawingTemplate: (name: string, drawing: DrawingObject) => void;
  applyDrawingTemplate: (symbol: string, drawingId: string, tpl: DrawingTemplate) => void;
  deleteDrawingTemplate: (id: string) => void;

  // Watchlist
  setActiveWatchlist: (id: string) => void;
  createWatchlist: (name: string) => void;
  renameWatchlist: (id: string, name: string) => void;
  deleteWatchlist: (id: string) => void;
  addSymbolToWatchlist: (watchlistId: string, symbol: SymbolInfo) => void;
  addSectionToWatchlist: (watchlistId: string, title: string) => void;
  removeWatchlistItem: (watchlistId: string, itemId: string) => void;
  reorderWatchlistItems: (watchlistId: string, fromIndex: number, toIndex: number) => void;
  setWatchlistItemFlag: (watchlistId: string, itemId: string, flag: FlagColor) => void;
  upsertTickers: (updates: WatchlistTicker[]) => void;

  // Alerts
  createAlert: (input: {
    symbol: string;
    provider: SymbolInfo['provider'];
    condition: AlertCondition;
    targetPrice: number;
    drawingId?: string;
    drawingLabel?: string;
    message: string;
    oncePerTrigger: boolean;
    playSound: boolean;
    browserNotify: boolean;
  }) => void;
  toggleAlertActive: (id: string) => void;
  deleteAlert: (id: string) => void;
  clearAlertLogs: () => void;
  evaluateAlertsForPrice: (symbol: string, prevPrice: number, newPrice: number, prevTime?: number, newTime?: number) => void;
  pushToast: (toast: Omit<ToastNotice, 'id' | 'createdAt'>) => void;
  dismissToast: (id: string) => void;

  // Visual Settings & Panels
  updateChartSettings: (patch: Partial<ChartVisualSettings>) => void;
  resetChartSettings: () => void;
  setRightPanelOpen: (open: boolean) => void;
  setRightPanelTab: (tab: 'watchlist' | 'alerts' | 'objects' | 'data') => void;
  setLeftToolbarCollapsed: (collapsed: boolean) => void;

  // Layouts
  saveCurrentLayout: (name: string) => void;
  loadSavedLayout: (id: string) => void;
  renameSavedLayout: (id: string, name: string) => void;
  deleteSavedLayout: (id: string) => void;

  // Replay
  startReplaySelection: () => void;
  enterReplayAtIndex: (fullCandles: Candle[], index: number) => void;
  toggleReplayPlay: () => void;
  stepReplayForward: () => void;
  setReplaySpeed: (speed: 1 | 2 | 5 | 10) => void;
  exitReplay: () => void;

  // Modals
  setSymbolSearchOpen: (open: boolean) => void;
  setIndicatorsModalOpen: (open: boolean) => void;
  setSettingsModalOpen: (open: boolean, tab?: 'chart' | 'providers') => void;
  setAlertsModalOpen: (open: boolean, initialPrice?: number | null, drawingId?: string | null) => void;
  setLayoutsModalOpen: (open: boolean) => void;
  setEditingIndicatorId: (id: string | null) => void;
  setEditingDrawingTextId: (id: string | null) => void;
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  theme: initialTheme,
  layoutId: initialLayout,
  panes: buildPanesForLayout(initialLayout, [createDefaultPane('pane_1', initialSymbol, initialTimeframe)]),
  activePaneId: 'pane_1',
  sync: {
    symbol: false,
    interval: false,
    crosshair: true,
    time: false,
  },

  connectionStatusByPane: {},
  errorByPane: {},
  candlesByPane: {},
  crosshairByPane: {},
  syncedCrosshairTime: null,
  syncedVisibleLogicalRange: null,

  activeTool: 'cross',
  magnetMode: 'off',
  stayInDrawing: false,
  lockAllDrawings: false,
  hideAllDrawings: false,
  selectedDrawingId: null,
  copiedDrawing: null,
  drawingsBySymbol: readStorage<Record<string, DrawingObject[]>>(STORAGE_KEYS.drawings, {}),
  undoStackBySymbol: {},
  redoStackBySymbol: {},

  favoriteTimeframes: readStorage<Timeframe[]>(STORAGE_KEYS.favTimeframes, ['1m', '5m', '15m', '1h', '4h', '1D']),
  favoriteIndicators: readStorage<IndicatorId[]>(STORAGE_KEYS.favIndicators, ['EMA', 'RSI', 'MACD', 'BB']),
  rightPanelOpen: typeof window !== 'undefined' ? window.innerWidth >= 768 : true,
  rightPanelTab: 'watchlist',
  leftToolbarCollapsed: false,
  chartSettings: initialVisualSettings,

  watchlists: readStorage<Watchlist[]>(STORAGE_KEYS.watchlists, DEFAULT_WATCHLISTS),
  activeWatchlistId: readStorage<Watchlist[]>(STORAGE_KEYS.watchlists, DEFAULT_WATCHLISTS)[0]?.id || 'wl_crypto_core',
  tickers: {},

  alerts: readStorage<AlertItem[]>(STORAGE_KEYS.alerts, []),
  alertLogs: readStorage<AlertLogEntry[]>(STORAGE_KEYS.alertLogs, []),
  toasts: [],

  savedLayouts: readStorage<SavedLayout[]>(STORAGE_KEYS.layouts, []),
  indicatorTemplates: readStorage<IndicatorTemplate[]>(STORAGE_KEYS.indicatorTemplates, []),
  drawingTemplates: readStorage<DrawingTemplate[]>(STORAGE_KEYS.drawingTemplates, []),

  replay: {
    active: false,
    selectingStart: false,
    playing: false,
    speed: 2,
    currentIndex: 0,
    fullCandles: [],
  },

  symbolSearchOpen: false,
  indicatorsModalOpen: false,
  settingsModalOpen: false,
  settingsModalTab: 'chart',
  alertsModalOpen: false,
  alertsModalInitialPrice: null,
  alertsModalDrawingId: null,
  layoutsModalOpen: false,
  editingIndicatorId: null,
  editingDrawingTextId: null,

  toggleTheme: () => {
    const nextTheme: ThemeMode = get().theme === 'dark' ? 'light' : 'dark';
    const baseSettings = nextTheme === 'dark' ? DARK_VISUAL_SETTINGS : LIGHT_VISUAL_SETTINGS;
    const prev = get().chartSettings;
    const nextSettings: ChartVisualSettings = {
      ...prev,
      backgroundColor: baseSettings.backgroundColor,
      backgroundGradientBottom: baseSettings.backgroundGradientBottom,
      gridVertColor: baseSettings.gridVertColor,
      gridHorzColor: baseSettings.gridHorzColor,
      upColor: baseSettings.upColor,
      downColor: baseSettings.downColor,
      borderUpColor: baseSettings.borderUpColor,
      borderDownColor: baseSettings.borderDownColor,
      wickUpColor: baseSettings.wickUpColor,
      wickDownColor: baseSettings.wickDownColor,
    };
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', nextTheme === 'dark');
    }
    writeStorage(STORAGE_KEYS.theme, nextTheme);
    writeStorage(STORAGE_KEYS.chartSettings, nextSettings);
    set({ theme: nextTheme, chartSettings: nextSettings });
  },

  setLayout: (layoutId) => {
    const currentPanes = get().panes;
    const nextPanes = buildPanesForLayout(layoutId, currentPanes);
    const activeExists = nextPanes.some((p) => p.id === get().activePaneId);
    set({
      layoutId,
      panes: nextPanes,
      activePaneId: activeExists ? get().activePaneId : nextPanes[0].id,
    });
  },

  setActivePane: (paneId) => set({ activePaneId: paneId }),

  setSyncOption: (key, value) =>
    set((s) => ({ sync: { ...s.sync, [key]: value } })),

  setPaneSymbol: (paneId, symbol) => {
    const { sync, panes } = get();
    const updated = panes.map((p) =>
      sync.symbol || p.id === paneId ? { ...p, symbol } : p
    );
    set({ panes: updated, selectedDrawingId: null });
  },

  setPaneTimeframe: (paneId, timeframe) => {
    const { sync, panes } = get();
    const updated = panes.map((p) =>
      sync.interval || p.id === paneId ? { ...p, timeframe } : p
    );
    set({ panes: updated });
  },

  setPaneChartType: (paneId, chartType) =>
    set((s) => ({
      panes: s.panes.map((p) => (p.id === paneId ? { ...p, chartType } : p)),
    })),

  setPaneScaleMode: (paneId, scaleMode) =>
    set((s) => ({
      panes: s.panes.map((p) => (p.id === paneId ? { ...p, scaleMode } : p)),
    })),

  setPaneAutoScale: (paneId, autoScale) =>
    set((s) => ({
      panes: s.panes.map((p) => (p.id === paneId ? { ...p, autoScale } : p)),
    })),

  toggleFavoriteTimeframe: (tf) => {
    const current = get().favoriteTimeframes;
    const next = current.includes(tf) ? current.filter((x) => x !== tf) : [...current, tf];
    writeStorage(STORAGE_KEYS.favTimeframes, next);
    set({ favoriteTimeframes: next });
  },

  toggleFavoriteIndicator: (id) => {
    const current = get().favoriteIndicators;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    writeStorage(STORAGE_KEYS.favIndicators, next);
    set({ favoriteIndicators: next });
  },

  setPaneConnectionStatus: (paneId, status, error = null) =>
    set((s) => ({
      connectionStatusByPane: { ...s.connectionStatusByPane, [paneId]: status },
      errorByPane: { ...s.errorByPane, [paneId]: error },
    })),

  setPaneCandles: (paneId, candles) =>
    set((s) => ({
      candlesByPane: { ...s.candlesByPane, [paneId]: candles },
    })),

  setPaneCrosshair: (paneId, data) =>
    set((s) => ({
      crosshairByPane: { ...s.crosshairByPane, [paneId]: data },
    })),

  setSyncedCrosshairTime: (time) => set({ syncedCrosshairTime: time }),

  addIndicator: (paneId, type) => {
    set((s) => {
      const panes = s.panes.map((p) => {
        if (p.id !== paneId) return p;
        const maxPaneIdx = p.indicators.reduce((acc, ind) => Math.max(acc, ind.paneIndex), 0);
        const inst = createIndicatorInstance(type, maxPaneIdx + 1);
        return { ...p, indicators: [...p.indicators, inst] };
      });
      return { panes };
    });
  },

  updateIndicator: (paneId, indicatorId, patch) => {
    set((s) => ({
      panes: s.panes.map((p) =>
        p.id !== paneId
          ? p
          : {
              ...p,
              indicators: p.indicators.map((ind) =>
                ind.id === indicatorId ? { ...ind, ...patch } : ind
              ),
            }
      ),
    }));
  },

  removeIndicator: (paneId, indicatorId) => {
    set((s) => ({
      panes: s.panes.map((p) => {
        if (p.id !== paneId) return p;
        const filtered = p.indicators.filter((ind) => ind.id !== indicatorId);
        // Compact oscillator paneIndex cleanly so no empty panes remain
        const usedOwnPanes = Array.from(
          new Set(filtered.filter((i) => i.paneIndex > 0).map((i) => i.paneIndex))
        ).sort((a, b) => a - b);
        const remap = new Map<number, number>();
        usedOwnPanes.forEach((oldIdx, idx) => remap.set(oldIdx, idx + 1));
        const compacted = filtered.map((i) =>
          i.paneIndex > 0 ? { ...i, paneIndex: remap.get(i.paneIndex) || 1 } : i
        );
        return { ...p, indicators: compacted };
      }),
    }));
  },

  applyIndicatorTemplate: (paneId, tpl) => {
    set((s) => ({
      panes: s.panes.map((p) =>
        p.id === paneId
          ? {
              ...p,
              indicators: tpl.indicators.map((ind) => ({
                ...ind,
                id: `${ind.type}_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              })),
            }
          : p
      ),
    }));
  },

  saveIndicatorTemplate: (name, indicators) => {
    const next: IndicatorTemplate[] = [
      ...get().indicatorTemplates,
      {
        id: `indtpl_${Date.now()}`,
        name: name.trim() || 'Indicator Template',
        indicators: JSON.parse(JSON.stringify(indicators)),
        createdAt: Date.now(),
      },
    ];
    writeStorage(STORAGE_KEYS.indicatorTemplates, next);
    set({ indicatorTemplates: next });
  },

  deleteIndicatorTemplate: (id) => {
    const next = get().indicatorTemplates.filter((t) => t.id !== id);
    writeStorage(STORAGE_KEYS.indicatorTemplates, next);
    set({ indicatorTemplates: next });
  },

  setActiveTool: (tool) => set({ activeTool: tool }),
  setMagnetMode: (magnetMode) => set({ magnetMode }),
  setStayInDrawing: (stayInDrawing) => set({ stayInDrawing }),
  setLockAllDrawings: (lockAllDrawings) => set({ lockAllDrawings }),
  setHideAllDrawings: (hideAllDrawings) => set({ hideAllDrawings }),
  setSelectedDrawingId: (selectedDrawingId) => set({ selectedDrawingId }),

  addDrawing: (symbol, drawing) => {
    const current = get().drawingsBySymbol[symbol] || [];
    const undo = get().undoStackBySymbol[symbol] || [];
    const nextDrawings = [...current, drawing];
    const nextMap = { ...get().drawingsBySymbol, [symbol]: nextDrawings };
    writeStorage(STORAGE_KEYS.drawings, nextMap);
    set({
      drawingsBySymbol: nextMap,
      undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: [...undo.slice(-49), current] },
      redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: [] },
      selectedDrawingId: drawing.id,
      activeTool: get().stayInDrawing ? get().activeTool : 'cross',
    });
  },

  updateDrawing: (symbol, drawingId, patch, recordUndo = true) => {
    const current = get().drawingsBySymbol[symbol] || [];
    const nextDrawings = current.map((d) => (d.id === drawingId ? { ...d, ...patch } : d));
    const nextMap = { ...get().drawingsBySymbol, [symbol]: nextDrawings };
    writeStorage(STORAGE_KEYS.drawings, nextMap);
    if (recordUndo) {
      const undo = get().undoStackBySymbol[symbol] || [];
      set({
        drawingsBySymbol: nextMap,
        undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: [...undo.slice(-49), current] },
        redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: [] },
      });
    } else {
      set({ drawingsBySymbol: nextMap });
    }
  },

  commitDrawingSnapshot: (symbol, beforeSnapshot) => {
    const undo = get().undoStackBySymbol[symbol] || [];
    const current = get().drawingsBySymbol[symbol] || [];
    writeStorage(STORAGE_KEYS.drawings, get().drawingsBySymbol);
    if (JSON.stringify(beforeSnapshot) !== JSON.stringify(current)) {
      set({
        undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: [...undo.slice(-49), beforeSnapshot] },
        redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: [] },
      });
    }
  },

  removeDrawing: (symbol, drawingId) => {
    const current = get().drawingsBySymbol[symbol] || [];
    const nextDrawings = current.filter((d) => d.id !== drawingId);
    const undo = get().undoStackBySymbol[symbol] || [];
    const nextMap = { ...get().drawingsBySymbol, [symbol]: nextDrawings };
    writeStorage(STORAGE_KEYS.drawings, nextMap);
    set({
      drawingsBySymbol: nextMap,
      undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: [...undo.slice(-49), current] },
      redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: [] },
      selectedDrawingId: get().selectedDrawingId === drawingId ? null : get().selectedDrawingId,
    });
  },

  removeAllDrawings: (symbol) => {
    const current = get().drawingsBySymbol[symbol] || [];
    if (current.length === 0) return;
    const undo = get().undoStackBySymbol[symbol] || [];
    const nextMap = { ...get().drawingsBySymbol, [symbol]: [] };
    writeStorage(STORAGE_KEYS.drawings, nextMap);
    set({
      drawingsBySymbol: nextMap,
      undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: [...undo.slice(-49), current] },
      redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: [] },
      selectedDrawingId: null,
    });
  },

  cloneDrawing: (symbol, drawingId) => {
    const current = get().drawingsBySymbol[symbol] || [];
    const source = current.find((d) => d.id === drawingId);
    if (!source) return;
    const maxZ = current.reduce((m, d) => Math.max(m, d.zIndex), 0);
    const cloned: DrawingObject = {
      ...JSON.parse(JSON.stringify(source)),
      id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      anchors: source.anchors.map((a) => ({ time: a.time, price: a.price * 1.002 })),
      zIndex: maxZ + 1,
      locked: false,
      createdAt: Date.now(),
    };
    get().addDrawing(symbol, cloned);
  },

  copySelectedDrawing: () => {
    const { activePaneId, panes, drawingsBySymbol, selectedDrawingId } = get();
    if (!selectedDrawingId) return;
    const activePane = panes.find((p) => p.id === activePaneId);
    if (!activePane) return;
    const list = drawingsBySymbol[activePane.symbol.symbol] || [];
    const found = list.find((d) => d.id === selectedDrawingId);
    if (found) {
      set({ copiedDrawing: JSON.parse(JSON.stringify(found)) });
      get().pushToast({ title: 'Drawing Copied', message: 'Press Ctrl+V to paste on chart.', tone: 'info' });
    }
  },

  pasteCopiedDrawing: (symbol) => {
    const copied = get().copiedDrawing;
    if (!copied) return;
    const current = get().drawingsBySymbol[symbol] || [];
    const maxZ = current.reduce((m, d) => Math.max(m, d.zIndex), 0);
    const pasted: DrawingObject = {
      ...JSON.parse(JSON.stringify(copied)),
      id: `drv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      symbol,
      anchors: copied.anchors.map((a) => ({ time: a.time, price: a.price * 1.003 })),
      zIndex: maxZ + 1,
      createdAt: Date.now(),
    };
    get().addDrawing(symbol, pasted);
  },

  bringToFront: (symbol, drawingId) => {
    const current = get().drawingsBySymbol[symbol] || [];
    const maxZ = current.reduce((m, d) => Math.max(m, d.zIndex), 0);
    get().updateDrawing(symbol, drawingId, { zIndex: maxZ + 1 });
  },

  sendToBack: (symbol, drawingId) => {
    const current = get().drawingsBySymbol[symbol] || [];
    const minZ = current.reduce((m, d) => Math.min(m, d.zIndex), 0);
    get().updateDrawing(symbol, drawingId, { zIndex: minZ - 1 });
  },

  undoDrawing: (symbol) => {
    const undo = get().undoStackBySymbol[symbol] || [];
    if (undo.length === 0) return;
    const previous = undo[undo.length - 1];
    const current = get().drawingsBySymbol[symbol] || [];
    const redo = get().redoStackBySymbol[symbol] || [];
    const nextMap = { ...get().drawingsBySymbol, [symbol]: previous };
    writeStorage(STORAGE_KEYS.drawings, nextMap);
    set({
      drawingsBySymbol: nextMap,
      undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: undo.slice(0, -1) },
      redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: [...redo, current] },
      selectedDrawingId: null,
    });
  },

  redoDrawing: (symbol) => {
    const redo = get().redoStackBySymbol[symbol] || [];
    if (redo.length === 0) return;
    const nextState = redo[redo.length - 1];
    const current = get().drawingsBySymbol[symbol] || [];
    const undo = get().undoStackBySymbol[symbol] || [];
    const nextMap = { ...get().drawingsBySymbol, [symbol]: nextState };
    writeStorage(STORAGE_KEYS.drawings, nextMap);
    set({
      drawingsBySymbol: nextMap,
      undoStackBySymbol: { ...get().undoStackBySymbol, [symbol]: [...undo, current] },
      redoStackBySymbol: { ...get().redoStackBySymbol, [symbol]: redo.slice(0, -1) },
      selectedDrawingId: null,
    });
  },

  saveDrawingTemplate: (name, drawing) => {
    const next: DrawingTemplate[] = [
      ...get().drawingTemplates,
      {
        id: `drvtpl_${Date.now()}`,
        name: name.trim() || `${drawing.tool} Style`,
        tool: drawing.tool,
        style: { ...drawing.style },
        createdAt: Date.now(),
      },
    ];
    writeStorage(STORAGE_KEYS.drawingTemplates, next);
    set({ drawingTemplates: next });
  },

  applyDrawingTemplate: (symbol, drawingId, tpl) => {
    get().updateDrawing(symbol, drawingId, { style: { ...tpl.style } });
  },

  deleteDrawingTemplate: (id) => {
    const next = get().drawingTemplates.filter((t) => t.id !== id);
    writeStorage(STORAGE_KEYS.drawingTemplates, next);
    set({ drawingTemplates: next });
  },

  setActiveWatchlist: (id) => set({ activeWatchlistId: id }),

  createWatchlist: (name) => {
    const wl: Watchlist = {
      id: `wl_${Date.now()}`,
      name: name.trim() || 'Watchlist',
      items: [],
    };
    const next = [...get().watchlists, wl];
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next, activeWatchlistId: wl.id });
  },

  renameWatchlist: (id, name) => {
    const next = get().watchlists.map((w) => (w.id === id ? { ...w, name: name.trim() || w.name } : w));
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next });
  },

  deleteWatchlist: (id) => {
    const current = get().watchlists;
    if (current.length <= 1) return;
    const next = current.filter((w) => w.id !== id);
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({
      watchlists: next,
      activeWatchlistId: get().activeWatchlistId === id ? next[0].id : get().activeWatchlistId,
    });
  },

  addSymbolToWatchlist: (watchlistId, sym) => {
    const next = get().watchlists.map((w) => {
      if (w.id !== watchlistId) return w;
      if (w.items.some((i) => i.kind === 'symbol' && i.symbol === sym.symbol && i.provider === sym.provider)) {
        return w;
      }
      const entry: WatchlistEntry = {
        id: `w_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        kind: 'symbol',
        symbol: sym.symbol,
        displaySymbol: sym.displaySymbol,
        name: sym.name,
        provider: sym.provider,
        assetClass: sym.assetClass,
        flag: 'none',
      };
      return { ...w, items: [...w.items, entry] };
    });
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next });
  },

  addSectionToWatchlist: (watchlistId, title) => {
    const next = get().watchlists.map((w) => {
      if (w.id !== watchlistId) return w;
      const entry: WatchlistEntry = {
        id: `sec_${Date.now()}`,
        kind: 'section',
        sectionTitle: title.trim() || 'Section',
      };
      return { ...w, items: [...w.items, entry] };
    });
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next });
  },

  removeWatchlistItem: (watchlistId, itemId) => {
    const next = get().watchlists.map((w) =>
      w.id === watchlistId ? { ...w, items: w.items.filter((i) => i.id !== itemId) } : w
    );
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next });
  },

  reorderWatchlistItems: (watchlistId, fromIndex, toIndex) => {
    const next = get().watchlists.map((w) => {
      if (w.id !== watchlistId) return w;
      const items = [...w.items];
      if (fromIndex < 0 || fromIndex >= items.length || toIndex < 0 || toIndex >= items.length) return w;
      const [moved] = items.splice(fromIndex, 1);
      items.splice(toIndex, 0, moved);
      return { ...w, items };
    });
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next });
  },

  setWatchlistItemFlag: (watchlistId, itemId, flag) => {
    const next = get().watchlists.map((w) =>
      w.id === watchlistId
        ? { ...w, items: w.items.map((i) => (i.id === itemId ? { ...i, flag } : i)) }
        : w
    );
    writeStorage(STORAGE_KEYS.watchlists, next);
    set({ watchlists: next });
  },

  upsertTickers: (updates) => {
    if (updates.length === 0) return;
    set((s) => {
      const next = { ...s.tickers };
      for (const u of updates) {
        next[u.symbol] = u;
      }
      return { tickers: next };
    });
  },

  createAlert: (input) => {
    const alert: AlertItem = {
      id: `alt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      ...input,
      active: true,
      triggeredCount: 0,
      createdAt: Date.now(),
    };
    const next = [alert, ...get().alerts];
    writeStorage(STORAGE_KEYS.alerts, next);
    set({ alerts: next });
    get().pushToast({
      title: `Alert Created · ${input.symbol}`,
      message: `${input.condition} ${formatPrice(input.targetPrice)}`,
      tone: 'success',
    });
  },

  toggleAlertActive: (id) => {
    const next = get().alerts.map((a) => (a.id === id ? { ...a, active: !a.active } : a));
    writeStorage(STORAGE_KEYS.alerts, next);
    set({ alerts: next });
  },

  deleteAlert: (id) => {
    const next = get().alerts.filter((a) => a.id !== id);
    writeStorage(STORAGE_KEYS.alerts, next);
    set({ alerts: next });
  },

  clearAlertLogs: () => {
    writeStorage(STORAGE_KEYS.alertLogs, []);
    set({ alertLogs: [] });
  },

  evaluateAlertsForPrice: (symbol, prevPrice, newPrice, prevTime, newTime) => {
    const { alerts, drawingsBySymbol } = get();
    const matching = alerts.filter((a) => a.active && a.symbol === symbol);
    if (matching.length === 0) return;

    const now = Date.now();
    const triggeredIds = new Set<string>();
    const newLogs: AlertLogEntry[] = [];

    for (const a of matching) {
      let target = a.targetPrice;

      // Support dynamic drawing-based alert (e.g. TrendLine or HorizontalLine)
      if (a.condition === 'crossingDrawing' && a.drawingId) {
        const drawings = drawingsBySymbol[symbol] || [];
        const drv = drawings.find((d) => d.id === a.drawingId);
        if (!drv || drv.anchors.length === 0) continue;
        if (drv.tool === 'horizontalLine' || drv.tool === 'horizontalRay') {
          target = drv.anchors[0].price;
        } else if (drv.anchors.length >= 2 && newTime) {
          const [p1, p2] = drv.anchors;
          const dt = p2.time - p1.time;
          target = dt === 0 ? p1.price : p1.price + ((p2.price - p1.price) * (newTime - p1.time)) / dt;
        }
      }

      let hit = false;
      const crossedUp = prevPrice < target && newPrice >= target;
      const crossedDown = prevPrice > target && newPrice <= target;

      if (a.condition === 'crossing' || a.condition === 'crossingDrawing') {
        hit = crossedUp || crossedDown || (prevPrice !== newPrice && newPrice === target);
      } else if (a.condition === 'crossingUp') {
        hit = crossedUp;
      } else if (a.condition === 'crossingDown') {
        hit = crossedDown;
      } else if (a.condition === 'greaterThan') {
        hit = newPrice > target && prevPrice <= target;
      } else if (a.condition === 'lessThan') {
        hit = newPrice < target && prevPrice >= target;
      }

      // Avoid spamming within 5 seconds on repeat triggers
      if (hit && (!a.lastTriggeredAt || now - a.lastTriggeredAt > 5000)) {
        triggeredIds.add(a.id);
        const msg = a.message || `${symbol} hit ${formatPrice(newPrice)} (target ${formatPrice(target)})`;
        newLogs.push({
          id: `log_${now}_${Math.random().toString(36).slice(2, 6)}`,
          alertId: a.id,
          symbol,
          message: msg,
          price: newPrice,
          triggeredAt: now,
        });
        if (a.playSound) playAlertChime();
        if (a.browserNotify) sendBrowserNotification(`K-CHART VIEW · ${symbol}`, msg);
        get().pushToast({
          title: `Alert Triggered · ${symbol}`,
          message: msg,
          tone: 'warning',
        });
      }
    }

    if (triggeredIds.size > 0) {
      const nextAlerts = get().alerts.map((a) => {
        if (!triggeredIds.has(a.id)) return a;
        return {
          ...a,
          triggeredCount: a.triggeredCount + 1,
          lastTriggeredAt: now,
          active: a.oncePerTrigger ? false : a.active,
        };
      });
      const nextLogs = [...newLogs, ...get().alertLogs].slice(0, 100);
      writeStorage(STORAGE_KEYS.alerts, nextAlerts);
      writeStorage(STORAGE_KEYS.alertLogs, nextLogs);
      set({ alerts: nextAlerts, alertLogs: nextLogs });
    }
  },

  pushToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    set((s) => ({
      toasts: [...s.toasts.slice(-3), { ...toast, id, createdAt: Date.now() }],
    }));
    setTimeout(() => {
      get().dismissToast(id);
    }, 5500);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  updateChartSettings: (patch) => {
    const next = { ...get().chartSettings, ...patch };
    writeStorage(STORAGE_KEYS.chartSettings, next);
    set({ chartSettings: next });
  },

  resetChartSettings: () => {
    const base = get().theme === 'dark' ? DARK_VISUAL_SETTINGS : LIGHT_VISUAL_SETTINGS;
    writeStorage(STORAGE_KEYS.chartSettings, base);
    set({ chartSettings: base });
  },

  setRightPanelOpen: (rightPanelOpen) => set({ rightPanelOpen }),
  setRightPanelTab: (rightPanelTab) => set({ rightPanelTab, rightPanelOpen: true }),
  setLeftToolbarCollapsed: (leftToolbarCollapsed) => set({ leftToolbarCollapsed }),

  saveCurrentLayout: (name) => {
    const { layoutId, panes, activePaneId, sync, chartSettings, savedLayouts } = get();
    const layout: SavedLayout = {
      id: `lay_${Date.now()}`,
      name: name.trim() || `Layout ${savedLayouts.length + 1}`,
      layoutId,
      panes: JSON.parse(JSON.stringify(panes)),
      activePaneId,
      sync: { ...sync },
      settings: { ...chartSettings },
      savedAt: Date.now(),
    };
    const next = [layout, ...savedLayouts];
    writeStorage(STORAGE_KEYS.layouts, next);
    set({ savedLayouts: next });
  },

  loadSavedLayout: (id) => {
    const found = get().savedLayouts.find((l) => l.id === id);
    if (!found) return;
    writeStorage(STORAGE_KEYS.chartSettings, found.settings);
    set({
      layoutId: found.layoutId,
      panes: JSON.parse(JSON.stringify(found.panes)),
      activePaneId: found.activePaneId,
      sync: { ...found.sync },
      chartSettings: { ...found.settings },
      layoutsModalOpen: false,
    });
  },

  renameSavedLayout: (id, name) => {
    const next = get().savedLayouts.map((l) => (l.id === id ? { ...l, name: name.trim() || l.name } : l));
    writeStorage(STORAGE_KEYS.layouts, next);
    set({ savedLayouts: next });
  },

  deleteSavedLayout: (id) => {
    const next = get().savedLayouts.filter((l) => l.id !== id);
    writeStorage(STORAGE_KEYS.layouts, next);
    set({ savedLayouts: next });
  },

  startReplaySelection: () => {
    set({
      replay: {
        active: false,
        selectingStart: true,
        playing: false,
        speed: get().replay.speed,
        currentIndex: 0,
        fullCandles: [],
      },
    });
    get().pushToast({
      title: 'Bar Replay',
      message: 'Click any candle on the active chart to begin replay from that bar.',
      tone: 'info',
    });
  },

  enterReplayAtIndex: (fullCandles, index) => {
    const clamped = Math.max(10, Math.min(index, fullCandles.length - 1));
    set({
      replay: {
        active: true,
        selectingStart: false,
        playing: false,
        speed: get().replay.speed,
        currentIndex: clamped,
        fullCandles,
      },
    });
  },

  toggleReplayPlay: () =>
    set((s) => ({ replay: { ...s.replay, playing: !s.replay.playing } })),

  stepReplayForward: () => {
    const r = get().replay;
    if (!r.active) return;
    if (r.currentIndex >= r.fullCandles.length - 1) {
      set({ replay: { ...r, playing: false } });
      return;
    }
    set({ replay: { ...r, currentIndex: r.currentIndex + 1 } });
  },

  setReplaySpeed: (speed) =>
    set((s) => ({ replay: { ...s.replay, speed } })),

  exitReplay: () =>
    set({
      replay: {
        active: false,
        selectingStart: false,
        playing: false,
        speed: get().replay.speed,
        currentIndex: 0,
        fullCandles: [],
      },
    }),

  setSymbolSearchOpen: (symbolSearchOpen) => set({ symbolSearchOpen }),
  setIndicatorsModalOpen: (indicatorsModalOpen) => set({ indicatorsModalOpen }),
  setSettingsModalOpen: (settingsModalOpen, tab = 'chart') =>
    set({ settingsModalOpen, settingsModalTab: tab }),
  setAlertsModalOpen: (alertsModalOpen, initialPrice = null, drawingId = null) =>
    set({
      alertsModalOpen,
      alertsModalInitialPrice: initialPrice,
      alertsModalDrawingId: drawingId,
    }),
  setLayoutsModalOpen: (layoutsModalOpen) => set({ layoutsModalOpen }),
  setEditingIndicatorId: (editingIndicatorId) => set({ editingIndicatorId }),
  setEditingDrawingTextId: (editingDrawingTextId) => set({ editingDrawingTextId }),
}));
