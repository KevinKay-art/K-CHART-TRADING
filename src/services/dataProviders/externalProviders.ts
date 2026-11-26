import { Candle, DataProviderId, SymbolInfo, Timeframe } from '../../types/chart';
import { DataProvider, HistoryRequestParams, SubscribeCallbacks } from './types';

class ProxyMarketDataProvider implements DataProvider {
  readonly id: DataProviderId;
  readonly name: string;
  readonly requiresApiKey = true;

  constructor(id: DataProviderId, name: string) {
    this.id = id;
    this.name = name;
  }

  async getHistory(params: HistoryRequestParams): Promise<Candle[]> {
    const url = new URL('/api/market/history', window.location.origin);
    url.searchParams.set('provider', this.id);
    url.searchParams.set('symbol', params.symbol);
    url.searchParams.set('interval', params.interval);
    if (params.limit) url.searchParams.set('limit', String(params.limit));
    if (params.endTimeMs) url.searchParams.set('endTime', String(Math.floor(params.endTimeMs)));

    const res = await fetch(url.toString());
    const data = (await res.json()) as { candles?: Candle[]; error?: string };
    if (!res.ok) {
      throw new Error(data.error || `${this.name} error (${res.status})`);
    }
    const byTime = new Map<number, Candle>();
    for (const c of data.candles || []) {
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

  subscribe(symbol: string, interval: Timeframe, callbacks: SubscribeCallbacks): () => void {
    let cancelled = false;
    let lastCandle: Candle | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleNext = (delayMs: number) => {
      if (cancelled) return;
      timer = setTimeout(poll, delayMs);
    };

    // Poll quote via backend proxy every 20s (stays within Twelve Data 8 credits/min free tier)
    const poll = async () => {
      if (cancelled) return;
      let nextDelay = 20000;
      try {
        const url = new URL('/api/market/quote', window.location.origin);
        url.searchParams.set('provider', this.id);
        url.searchParams.set('symbol', symbol);
        const res = await fetch(url.toString());
        if (!res.ok) {
          if (res.status === 429) {
            callbacks.onStatus('reconnecting');
            nextDelay = 60000;
          } else {
            callbacks.onStatus('offline');
          }
          scheduleNext(nextDelay);
          return;
        }
        const quote = (await res.json()) as {
          price: number;
          open: number;
          high: number;
          low: number;
          volume: number;
        };
        if (!quote.price || cancelled) {
          scheduleNext(nextDelay);
          return;
        }
        callbacks.onStatus('live');
        const nowSec = Math.floor(Date.now() / 1000);
        const bucket = this.alignBucket(nowSec, interval);
        if (!lastCandle || lastCandle.time !== bucket) {
          lastCandle = {
            time: bucket,
            open: quote.price,
            high: quote.price,
            low: quote.price,
            close: quote.price,
            volume: quote.volume || 0,
          };
        } else {
          lastCandle = {
            ...lastCandle,
            high: Math.max(lastCandle.high, quote.price),
            low: Math.min(lastCandle.low, quote.price),
            close: quote.price,
            volume: quote.volume || lastCandle.volume,
          };
        }
        callbacks.onCandle(lastCandle, false);
      } catch {
        if (!cancelled) callbacks.onStatus('reconnecting');
      }
      scheduleNext(nextDelay);
    };

    scheduleNext(5000);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      callbacks.onStatus('offline');
    };
  }

  private alignBucket(nowSec: number, interval: Timeframe): number {
    const map: Record<Timeframe, number> = {
      '1s': 1,
      '1m': 60,
      '3m': 180,
      '5m': 300,
      '15m': 900,
      '30m': 1800,
      '1h': 3600,
      '2h': 7200,
      '4h': 14400,
      '1D': 86400,
      '1W': 604800,
      '1M': 2592000,
    };
    const sec = map[interval] || 60;
    return Math.floor(nowSec / sec) * sec;
  }

  async searchSymbols(query: string): Promise<SymbolInfo[]> {
    const trimmed = query.trim();
    if (trimmed.length < 2) return [];
    const url = new URL('/api/market/search', window.location.origin);
    url.searchParams.set('provider', this.id);
    url.searchParams.set('q', trimmed);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: SymbolInfo[] };
    return data.results || [];
  }
}

export const twelveDataProvider = new ProxyMarketDataProvider('twelvedata', 'Twelve Data');
export const finnhubProvider = new ProxyMarketDataProvider('finnhub', 'Finnhub');
export const polygonProvider = new ProxyMarketDataProvider('polygon', 'Polygon.io');
