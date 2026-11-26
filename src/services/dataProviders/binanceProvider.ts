import { Candle, ConnectionStatus, SymbolInfo, Timeframe, WatchlistTicker } from '../../types/chart';
import { DataProvider, HistoryRequestParams, SubscribeCallbacks } from './types';

const TIMEFRAME_TO_BINANCE: Record<Timeframe, string> = {
  '1s': '1s',
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '2h',
  '4h': '4h',
  '1D': '1d',
  '1W': '1w',
  '1M': '1M',
};

const POPULAR_PRIORITY = [
  'BTCUSDT',
  'ETHUSDT',
  'SOLUSDT',
  'BNBUSDT',
  'XRPUSDT',
  'DOGEUSDT',
  'ADAUSDT',
  'AVAXUSDT',
  'LINKUSDT',
  'DOTUSDT',
  'SUIUSDT',
  'LTCUSDT',
  'UNIUSDT',
  'NEARUSDT',
  'APTUSDT',
  'OPUSDT',
  'ARBUSDT',
  'AAVEUSDT',
];

let cachedBinanceSymbols: SymbolInfo[] | null = null;
let loadingSymbolsPromise: Promise<SymbolInfo[]> | null = null;

type RawKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

function parseKlines(rows: RawKline[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const r of rows) {
    const c: Candle = {
      time: Math.floor(r[0] / 1000),
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[5]),
    };
    if (
      Number.isFinite(c.time) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close)
    ) {
      byTime.set(c.time, {
        ...c,
        volume: Number.isFinite(c.volume) ? c.volume : 0,
      });
    }
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

async function fetchBinanceWithProxyFallback<T>(directUrl: string, proxyUrl: string): Promise<T> {
  try {
    const res = await fetch(directUrl);
    if (res.ok) {
      return (await res.json()) as T;
    }
    if (res.status === 429) {
      throw new Error('Rate limited by Binance, retrying…');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rate limited')) {
      throw err;
    }
    // Fall through to backend proxy (handles geo-blocks/CORS)
  }

  const proxyRes = await fetch(proxyUrl);
  if (proxyRes.status === 429) {
    throw new Error('Rate limited by Binance, retrying…');
  }
  if (!proxyRes.ok) {
    const text = await proxyRes.text().catch(() => '');
    throw new Error(`Binance request failed (${proxyRes.status})${text ? `: ${text.slice(0, 120)}` : ''}`);
  }
  return (await proxyRes.json()) as T;
}

export async function loadAllBinanceSymbols(): Promise<SymbolInfo[]> {
  if (cachedBinanceSymbols) return cachedBinanceSymbols;
  if (loadingSymbolsPromise) return loadingSymbolsPromise;

  loadingSymbolsPromise = (async () => {
    try {
      const data = await fetchBinanceWithProxyFallback<{
        symbols?: Array<{
          symbol: string;
          baseAsset: string;
          quoteAsset: string;
          status: string;
        }>;
      }>(
        'https://api.binance.com/api/v3/exchangeInfo?permissions=SPOT',
        '/api/market/binance/exchangeInfo'
      );

      const list: SymbolInfo[] = (data.symbols || [])
        .filter((s) => s.status === 'TRADING')
        .map((s) => ({
          symbol: s.symbol,
          displaySymbol: `${s.baseAsset}/${s.quoteAsset}`,
          name: `${s.baseAsset} / ${s.quoteAsset} Spot`,
          exchange: 'BINANCE',
          assetClass: 'crypto' as const,
          provider: 'binance' as const,
          baseAsset: s.baseAsset,
          quoteAsset: s.quoteAsset,
        }));

      list.sort((a, b) => {
        const ia = POPULAR_PRIORITY.indexOf(a.symbol);
        const ib = POPULAR_PRIORITY.indexOf(b.symbol);
        if (ia !== -1 && ib !== -1) return ia - ib;
        if (ia !== -1) return -1;
        if (ib !== -1) return 1;
        if (a.quoteAsset === 'USDT' && b.quoteAsset !== 'USDT') return -1;
        if (b.quoteAsset === 'USDT' && a.quoteAsset !== 'USDT') return 1;
        return a.symbol.localeCompare(b.symbol);
      });

      cachedBinanceSymbols = list;
      return list;
    } finally {
      loadingSymbolsPromise = null;
    }
  })();

  return loadingSymbolsPromise;
}

export async function fetchBinance24hTickers(symbols: string[]): Promise<Record<string, WatchlistTicker>> {
  if (symbols.length === 0) return {};
  const clean = symbols.map((s) => s.toUpperCase());
  const encoded = encodeURIComponent(JSON.stringify(clean));
  const direct = `https://api.binance.com/api/v3/ticker/24hr?symbols=${encoded}`;
  const proxy = `/api/market/binance/ticker24hr?symbols=${encodeURIComponent(clean.join(','))}`;

  const rows = await fetchBinanceWithProxyFallback<
    Array<{
      symbol: string;
      lastPrice: string;
      priceChange: string;
      priceChangePercent: string;
      quoteVolume: string;
    }>
  >(direct, proxy);

  const result: Record<string, WatchlistTicker> = {};
  for (const row of rows) {
    const price = Number(row.lastPrice);
    const change = Number(row.priceChange);
    const changePercent = Number(row.priceChangePercent);
    const volume = Number(row.quoteVolume);
    result[row.symbol] = {
      symbol: row.symbol,
      price,
      change,
      changePercent,
      volume,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat',
      updatedAt: Date.now(),
    };
  }
  return result;
}

export function subscribeBinanceMiniTickers(
  watchedSymbols: () => Set<string>,
  onBatchTickers: (updates: Array<{ symbol: string; price: number; open: number; volume: number }>) => void,
  onStatus?: (status: ConnectionStatus) => void
): () => void {
  let ws: WebSocket | null = null;
  let closedByClient = false;
  let retryAttempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let pendingUpdates = new Map<string, { symbol: string; price: number; open: number; volume: number }>();
  let rafId: number | null = null;

  const flush = () => {
    rafId = null;
    if (pendingUpdates.size === 0) return;
    const arr = Array.from(pendingUpdates.values());
    pendingUpdates.clear();
    onBatchTickers(arr);
  };

  const connect = () => {
    if (closedByClient) return;
    onStatus?.(retryAttempt > 0 ? 'reconnecting' : 'live');
    try {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
    } catch {
      scheduleReconnect();
      return;
    }

    ws.onopen = () => {
      retryAttempt = 0;
      onStatus?.('live');
    };

    ws.onmessage = (event) => {
      try {
        const list = JSON.parse(event.data as string) as Array<{
          s: string;
          c: string;
          o: string;
          q: string;
        }>;
        if (!Array.isArray(list)) return;
        const targets = watchedSymbols();
        let matched = false;
        for (const item of list) {
          if (targets.has(item.s)) {
            pendingUpdates.set(item.s, {
              symbol: item.s,
              price: Number(item.c),
              open: Number(item.o),
              volume: Number(item.q),
            });
            matched = true;
          }
        }
        if (matched && rafId === null) {
          rafId = requestAnimationFrame(flush);
        }
      } catch {
        // ignore malformed frame
      }
    };

    ws.onerror = () => {
      onStatus?.('reconnecting');
    };

    ws.onclose = () => {
      if (closedByClient) {
        onStatus?.('offline');
        return;
      }
      scheduleReconnect();
    };
  };

  const scheduleReconnect = () => {
    if (closedByClient) return;
    retryAttempt += 1;
    onStatus?.('reconnecting');
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(retryAttempt - 1, 5)));
    retryTimer = setTimeout(connect, delay);
  };

  connect();

  return () => {
    closedByClient = true;
    if (retryTimer) clearTimeout(retryTimer);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      ws.close();
    }
  };
}

export class BinanceDataProvider implements DataProvider {
  readonly id = 'binance' as const;
  readonly name = 'Binance Spot';
  readonly requiresApiKey = false;

  async getHistory(params: HistoryRequestParams): Promise<Candle[]> {
    const binanceInterval = TIMEFRAME_TO_BINANCE[params.interval] || '1m';
    const limit = Math.min(Math.max(params.limit ?? 1000, 1), 1000);
    const search = new URLSearchParams({
      symbol: params.symbol.toUpperCase(),
      interval: binanceInterval,
      limit: String(limit),
    });
    if (params.endTimeMs) {
      search.set('endTime', String(Math.floor(params.endTimeMs)));
    }
    const directUrl = `https://api.binance.com/api/v3/klines?${search.toString()}`;
    const proxyUrl = `/api/market/binance/klines?${search.toString()}`;
    const raw = await fetchBinanceWithProxyFallback<RawKline[]>(directUrl, proxyUrl);
    return parseKlines(raw);
  }

  subscribe(symbol: string, interval: Timeframe, callbacks: SubscribeCallbacks): () => void {
    const binanceInterval = TIMEFRAME_TO_BINANCE[interval] || '1m';
    const streamName = `${symbol.toLowerCase()}@kline_${binanceInterval}`;
    const wsUrl = `wss://stream.binance.com:9443/ws/${streamName}`;

    let ws: WebSocket | null = null;
    let closedByClient = false;
    let retryAttempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (closedByClient) return;
      callbacks.onStatus(retryAttempt > 0 ? 'reconnecting' : 'reconnecting');

      try {
        ws = new WebSocket(wsUrl);
      } catch {
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        retryAttempt = 0;
        callbacks.onStatus('live');
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            k?: {
              t: number;
              o: string;
              h: string;
              l: string;
              c: string;
              v: string;
              x: boolean;
            };
          };
          if (!msg.k) return;
          const k = msg.k;
          callbacks.onCandle(
            {
              time: Math.floor(k.t / 1000),
              open: Number(k.o),
              high: Number(k.h),
              low: Number(k.l),
              close: Number(k.c),
              volume: Number(k.v),
            },
            Boolean(k.x)
          );
        } catch {
          // ignore invalid JSON
        }
      };

      ws.onerror = () => {
        callbacks.onStatus('reconnecting');
      };

      ws.onclose = () => {
        if (closedByClient) {
          callbacks.onStatus('offline');
          return;
        }
        scheduleReconnect();
      };
    };

    const scheduleReconnect = () => {
      if (closedByClient) return;
      retryAttempt += 1;
      callbacks.onStatus('reconnecting', `Reconnecting (attempt ${retryAttempt})…`);
      const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(retryAttempt - 1, 5)));
      retryTimer = setTimeout(connect, delay);
    };

    connect();

    return () => {
      closedByClient = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
      callbacks.onStatus('offline');
    };
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const all = await loadAllBinanceSymbols();
    const q = query.trim().toUpperCase();
    if (!q) return all.slice(0, 60);
    return all
      .filter(
        (s) =>
          s.symbol.includes(q) ||
          s.displaySymbol.toUpperCase().includes(q) ||
          s.name.toUpperCase().includes(q)
      )
      .slice(0, 60);
  }
}

export const binanceProvider = new BinanceDataProvider();
