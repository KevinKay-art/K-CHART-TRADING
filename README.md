# K-CHART VIEW

K-CHART VIEW is a professional, real-time financial charting terminal built with React, TypeScript, Vite, Tailwind CSS, Zustand, and TradingView's `lightweight-charts` v5.

## Features

- **Live Market Data**:
  - **Crypto (Default, zero API key)**: Real-time Binance Spot candlesticks via REST (`/api/v3/klines`, `/api/v3/exchangeInfo`) and WebSocket (`wss://stream.binance.com:9443/ws/<symbol>@kline_<interval>` and `!miniTicker@arr`) with exponential backoff auto-reconnect and lazy-loaded historical candles on scroll.
  - **Stocks, Forex, Indices, Commodities**: Pluggable `DataProvider` interface with Twelve Data, Finnhub, and Polygon.io adapters routed securely through `/api/market/*` backend proxy endpoints.
- **Chart Types & Interaction**:
  - Candlesticks, Hollow Candles, Bars (OHLC), Line, Line with Markers, Area, Baseline, Heikin Ashi, Histogram, plus bottom Volume histogram.
  - Normal, Logarithmic, Percentage, and Indexed-to-100 price scales; left/right scale positioning; draggable pane dividers; live price tag with candle-close countdown.
- **35+ Interactive Drawing Tools** (via `lightweight-charts` v5 `ISeriesPrimitive`):
  - Lines & Channels (Trend Line, Ray, Extended Line, Horizontal Line/Ray, Vertical Line, Cross Line, Parallel Channel, Info Line)
  - Fibonacci (Retracement with editable levels, Trend-Based Extension, Channel, Time Zones)
  - Shapes (Rectangle, Rotated Rectangle, Circle, Ellipse, Triangle, Polyline, Brush, Arrow, Arc)
  - Position & Measurement (Long/Short Position with R:R & risk sizing, Price/Date/Date+Price Range)
  - Annotations & Gann/VWAP (Text, Note, Callout, Price Label, Flag, Emoji, Pitchfork, Andrews' Pitchfork, Gann Fan, Anchored VWAP)
  - Magnet Mode (Weak/Strong OHLC snap), Shift angle constraint, full Undo/Redo, Copy/Paste, and per-symbol `localStorage` persistence.
- **26 Live Client-Side Indicators**:
  - Overlays: SMA, EMA, WMA, VWAP, Bollinger Bands, Ichimoku Cloud, Parabolic SAR, Supertrend, Donchian Channels, Keltner Channels
  - Oscillators: RSI, MACD, Stochastic, Stochastic RSI, CCI, Williams %R, ATR, ADX/DMI, Momentum, ROC, MFI, OBV, Awesome Oscillator
  - Volume: Volume, Volume MA, Visible Range Volume Profile (VPVR)
- **Watchlist, Alerts, Multi-Chart Layouts & Bar Replay**:
  - Multi-watchlist manager with drag reorder, sections, color flags, and live tick flashes.
  - Price & drawing-line alerts with Web Audio chime, browser notifications, and alert log.
  - 1, 2V, 2H, 3, 4, and 6-pane grids with independent Symbol, Interval, Crosshair, and Time sync.
  - Bar Replay mode, PNG screenshot/clipboard export, CSV export, saved layouts, and shareable URLs.

## Setup & Development

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and optionally add market data API keys:
   ```bash
   cp .env.example .env
   ```
   Environment variables:
   - `TWELVEDATA_API_KEY` — Optional API key for Twelve Data (stocks, forex, indices, commodities)
   - `FINNHUB_API_KEY` — Optional API key for Finnhub
   - `POLYGON_API_KEY` — Optional API key for Polygon.io
3. Run the development server (Express + Vite middleware on port 3000):
   ```bash
   npm run dev
   ```
4. Run unit tests (indicator math):
   ```bash
   npm test
   ```
5. Build for production:
   ```bash
   npm run build
   npm start
   ```

## Architecture

- `/server.ts` — Express proxy for external API keys (`/api/market/*`, `/api/providers/status`) and Vite/static serving
- `/src/services/dataProviders/` — `DataProvider` interface, `binanceProvider.ts`, `externalProviders.ts`
- `/src/indicators/` — Indicator catalog, incremental math engine (`math.ts`), and Vitest tests (`math.test.ts`)
- `/src/drawings/` — `ISeriesPrimitive` canvas renderers (`DrawingPrimitive.ts`, `VolumeProfilePrimitive.ts`), geometry/hit-testing (`geometry.ts`), and tool metadata (`toolMeta.ts`)
- `/src/store/` — Zustand state store (`useTerminalStore.ts`)
- `/src/components/` — `ChartPane.tsx`, `TopToolbar.tsx`, `LeftDrawingToolbar.tsx`, `FloatingDrawingToolbar.tsx`, `RightSidebar.tsx`, `BottomBar.tsx`, `Modals.tsx`

## Extending K-CHART VIEW

### Adding a New Data Provider
1. Implement the `DataProvider` interface in `/src/services/dataProviders/`:
   ```ts
   export interface DataProvider {
     readonly id: DataProviderId;
     readonly name: string;
     readonly requiresApiKey: boolean;
     getHistory(params: HistoryRequestParams): Promise<Candle[]>;
     subscribe(symbol: string, interval: Timeframe, callbacks: SubscribeCallbacks): () => void;
     searchSymbols(query: string): Promise<SymbolInfo[]>;
   }
   ```
2. Add proxy routes in `/server.ts` reading the provider key from `process.env`.
3. Register the instance in `/src/services/dataProviders/index.ts`.

### Adding a New Drawing Tool
1. Add the tool ID to `DrawingToolId` in `/src/types/chart.ts`.
2. Register its label, group, and anchor count in `/src/drawings/toolMeta.ts`.
3. Implement hit-testing in `/src/drawings/geometry.ts` (`hitTestDrawings`) and canvas rendering in `/src/drawings/DrawingPrimitive.ts` (`renderDrawing`).

---
K-CHART VIEW. Market data provided by Binance and third-party providers. Not financial advice.
