export type ThemeMode = 'dark' | 'light';

export type DataProviderId = 'binance' | 'twelvedata' | 'finnhub' | 'polygon';

export type AssetClass = 'crypto' | 'stock' | 'forex' | 'index' | 'commodity';

export type ConnectionStatus = 'live' | 'reconnecting' | 'offline';

export type Timeframe =
  | '1s'
  | '1m'
  | '3m'
  | '5m'
  | '15m'
  | '30m'
  | '1h'
  | '2h'
  | '4h'
  | '1D'
  | '1W'
  | '1M';

export type ChartType =
  | 'candlestick'
  | 'hollow'
  | 'bar'
  | 'line'
  | 'lineMarkers'
  | 'area'
  | 'baseline'
  | 'heikinAshi'
  | 'histogram';

export type ScaleMode = 'normal' | 'logarithmic' | 'percentage' | 'indexedTo100';

export type ChartLayoutId = '1' | '2v' | '2h' | '3' | '4' | '6';

export type CursorMode = 'cross' | 'dot' | 'arrow' | 'eraser';

export type DrawingToolId =
  | 'cross'
  | 'dot'
  | 'arrowCursor'
  | 'eraser'
  | 'zoomIn'
  | 'trendLine'
  | 'ray'
  | 'extendedLine'
  | 'horizontalLine'
  | 'horizontalRay'
  | 'verticalLine'
  | 'crossLine'
  | 'parallelChannel'
  | 'infoLine'
  | 'fibRetracement'
  | 'fibExtension'
  | 'fibChannel'
  | 'fibTimeZones'
  | 'rectangle'
  | 'rotatedRectangle'
  | 'circle'
  | 'ellipse'
  | 'triangle'
  | 'polyline'
  | 'brush'
  | 'arrow'
  | 'arc'
  | 'longPosition'
  | 'shortPosition'
  | 'priceRange'
  | 'dateRange'
  | 'datePriceRange'
  | 'text'
  | 'note'
  | 'callout'
  | 'priceLabel'
  | 'flag'
  | 'emoji'
  | 'pitchfork'
  | 'andrewsPitchfork'
  | 'gannFan'
  | 'anchoredVwap';

export type MagnetMode = 'off' | 'weak' | 'strong';

export type LineStyleType = 'solid' | 'dashed' | 'dotted';

export interface Candle {
  time: number; // UTC unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SymbolInfo {
  symbol: string;
  displaySymbol: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
  provider: DataProviderId;
  baseAsset?: string;
  quoteAsset?: string;
  pricePrecision?: number;
}

export interface AnchorPoint {
  time: number; // UTC unix timestamp in seconds
  price: number;
}

export interface FibLevel {
  ratio: number;
  color: string;
  visible: boolean;
}

export interface PositionConfig {
  accountSize: number;
  riskPercent: number;
}

export interface DrawingStyle {
  color: string;
  fillColor: string;
  fillOpacity: number;
  opacity: number;
  lineWidth: number;
  lineStyle: LineStyleType;
  extendLeft: boolean;
  extendRight: boolean;
  showLabels: boolean;
  fontSize: number;
}

export interface DrawingObject {
  id: string;
  tool: DrawingToolId;
  symbol: string;
  anchors: AnchorPoint[];
  style: DrawingStyle;
  locked: boolean;
  visible: boolean;
  zIndex: number;
  text?: string;
  emoji?: string;
  fibLevels?: FibLevel[];
  positionConfig?: PositionConfig;
  createdAt: number;
}

export type IndicatorId =
  | 'SMA'
  | 'EMA'
  | 'WMA'
  | 'VWAP'
  | 'BB'
  | 'ICHIMOKU'
  | 'PSAR'
  | 'SUPERTREND'
  | 'DONCHIAN'
  | 'KELTNER'
  | 'RSI'
  | 'MACD'
  | 'STOCH'
  | 'STOCHRSI'
  | 'CCI'
  | 'WILLR'
  | 'ATR'
  | 'ADX'
  | 'MOM'
  | 'ROC'
  | 'MFI'
  | 'OBV'
  | 'AO'
  | 'VOL'
  | 'VOL_MA'
  | 'VOL_PROFILE';

export type IndicatorCategory = 'overlay' | 'oscillator' | 'volume';

export type PriceSource = 'close' | 'open' | 'high' | 'low' | 'hl2' | 'hlc3' | 'ohlc4';

export interface IndicatorConfig {
  id: string;
  type: IndicatorId;
  name: string;
  category: IndicatorCategory;
  paneIndex: number; // 0 for main pane, 1+ for oscillator panes
  visible: boolean;
  source: PriceSource;
  params: Record<string, number>;
  colors: Record<string, string>;
  lineWidth: number;
  timeframeVisibility: Timeframe[] | 'all';
}

export type AlertCondition =
  | 'crossing'
  | 'crossingUp'
  | 'crossingDown'
  | 'greaterThan'
  | 'lessThan'
  | 'crossingDrawing';

export interface AlertItem {
  id: string;
  symbol: string;
  provider: DataProviderId;
  condition: AlertCondition;
  targetPrice: number;
  drawingId?: string;
  drawingLabel?: string;
  message: string;
  active: boolean;
  triggeredCount: number;
  oncePerTrigger: boolean;
  playSound: boolean;
  browserNotify: boolean;
  createdAt: number;
  lastTriggeredAt?: number;
}

export interface AlertLogEntry {
  id: string;
  alertId: string;
  symbol: string;
  message: string;
  price: number;
  triggeredAt: number;
}

export type FlagColor = 'none' | 'red' | 'orange' | 'green' | 'blue' | 'purple';

export interface WatchlistEntry {
  id: string;
  kind: 'symbol' | 'section';
  symbol?: string;
  displaySymbol?: string;
  name?: string;
  provider?: DataProviderId;
  assetClass?: AssetClass;
  flag?: FlagColor;
  sectionTitle?: string;
}

export interface Watchlist {
  id: string;
  name: string;
  items: WatchlistEntry[];
}

export interface WatchlistTicker {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  direction: 'up' | 'down' | 'flat';
  updatedAt: number;
}

export interface ChartVisualSettings {
  upColor: string;
  downColor: string;
  borderUpColor: string;
  borderDownColor: string;
  wickUpColor: string;
  wickDownColor: string;
  backgroundType: 'solid' | 'gradient';
  backgroundColor: string;
  backgroundGradientBottom: string;
  gridVertColor: string;
  gridHorzColor: string;
  showGridLines: boolean;
  showWatermark: boolean;
  showSessionBreaks: boolean;
  timezone: string;
  scalePosition: 'right' | 'left';
  showVolumeInMainPane: boolean;
}

export interface ChartPaneInstance {
  id: string;
  symbol: SymbolInfo;
  timeframe: Timeframe;
  chartType: ChartType;
  scaleMode: ScaleMode;
  autoScale: boolean;
  indicators: IndicatorConfig[];
}

export interface LayoutSyncOptions {
  symbol: boolean;
  interval: boolean;
  crosshair: boolean;
  time: boolean;
}

export interface SavedLayout {
  id: string;
  name: string;
  layoutId: ChartLayoutId;
  panes: ChartPaneInstance[];
  activePaneId: string;
  sync: LayoutSyncOptions;
  settings: ChartVisualSettings;
  savedAt: number;
}

export interface IndicatorTemplate {
  id: string;
  name: string;
  indicators: IndicatorConfig[];
  createdAt: number;
}

export interface DrawingTemplate {
  id: string;
  name: string;
  tool: DrawingToolId;
  style: DrawingStyle;
  createdAt: number;
}

export interface ReplayState {
  active: boolean;
  selectingStart: boolean;
  playing: boolean;
  speed: 1 | 2 | 5 | 10;
  currentIndex: number;
  fullCandles: Candle[];
}

export interface CrosshairData {
  time: number | null;
  candle: Candle | null;
  prevClose: number | null;
  indicatorValues: Record<string, Record<string, number | null>>;
}
