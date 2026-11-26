import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);

const BINANCE_BASES = [
  'https://api.binance.com',
  'https://data-api.binance.vision',
];

const SAFE_SYMBOL_RE = /^[A-Za-z0-9._:/^-]{1,32}$/;
const SAFE_INTERVAL_RE = /^[A-Za-z0-9]{1,8}$/;

interface ExchangeCache {
  expiresAt: number;
  data: unknown;
}

let exchangeInfoCache: ExchangeCache | null = null;
const marketResponseCache = new Map<string, ExchangeCache>();

function getCachedResponse<T>(key: string): T | null {
  const entry = marketResponseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    marketResponseCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCachedResponse(key: string, data: unknown, ttlMs: number): void {
  if (marketResponseCache.size > 500) {
    const oldestKey = marketResponseCache.keys().next().value;
    if (oldestKey) marketResponseCache.delete(oldestKey);
  }
  marketResponseCache.set(key, { expiresAt: Date.now() + ttlMs, data });
}

const KNOWN_TD_PAIRS = new Set([
  'XAUUSD', 'XAGUSD', 'XPTUSD', 'XPDUSD',
  'EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD',
  'EURGBP', 'EURJPY', 'GBPJPY', 'EURCHF', 'AUDJPY', 'EURAUD', 'CADJPY',
]);

function normalizeTwelveDataSymbol(symbol: string): string {
  const upper = symbol.trim().toUpperCase();
  if (!upper.includes('/') && upper.length === 6 && KNOWN_TD_PAIRS.has(upper)) {
    return `${upper.slice(0, 3)}/${upper.slice(3)}`;
  }
  return symbol.trim();
}

function sanitizeParam(value: unknown, regex: RegExp, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return regex.test(trimmed) ? trimmed : fallback;
}

function getProviderKey(provider: string): string {
  if (provider === 'twelvedata') return process.env.TWELVEDATA_API_KEY || '';
  if (provider === 'finnhub') return process.env.FINNHUB_API_KEY || '';
  if (provider === 'polygon') return process.env.POLYGON_API_KEY || '';
  return '';
}

async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBinanceJson(pathnameAndQuery: string): Promise<{ status: number; data: unknown }> {
  let lastStatus = 502;
  let lastBody: unknown = { error: 'Binance upstream unavailable' };

  for (const base of BINANCE_BASES) {
    try {
      const targetUrl = new URL(pathnameAndQuery, base);
      const res = await fetchWithTimeout(targetUrl.toString(), 9000);
      const text = await res.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = { raw: text };
      }
      if (res.ok) {
        return { status: 200, data: parsed };
      }
      lastStatus = res.status;
      lastBody = parsed;
      // Retry on geo-block / rate-limit / server errors with alternate mirror
      if (res.status === 451 || res.status === 403 || res.status >= 500) {
        continue;
      }
      return { status: res.status, data: parsed };
    } catch {
      continue;
    }
  }
  return { status: lastStatus, data: lastBody };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, serverTime: Date.now() });
});

app.get('/api/providers/status', (_req, res) => {
  res.json({
    binance: true,
    twelvedata: Boolean(process.env.TWELVEDATA_API_KEY),
    finnhub: Boolean(process.env.FINNHUB_API_KEY),
    polygon: Boolean(process.env.POLYGON_API_KEY),
  });
});

app.get('/api/market/binance/klines', async (req, res) => {
  const symbol = sanitizeParam(req.query.symbol, SAFE_SYMBOL_RE, 'BTCUSDT').toUpperCase();
  const interval = sanitizeParam(req.query.interval, SAFE_INTERVAL_RE, '1m');
  const limitRaw = Number(req.query.limit || 1000);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 1000) : 1000;

  const params = new URLSearchParams({
    symbol,
    interval,
    limit: String(limit),
  });

  if (typeof req.query.endTime === 'string' && /^\d+$/.test(req.query.endTime)) {
    params.set('endTime', req.query.endTime);
  }
  if (typeof req.query.startTime === 'string' && /^\d+$/.test(req.query.startTime)) {
    params.set('startTime', req.query.startTime);
  }

  const result = await fetchBinanceJson(`/api/v3/klines?${params.toString()}`);
  res.status(result.status).json(result.data);
});

app.get('/api/market/binance/exchangeInfo', async (_req, res) => {
  if (exchangeInfoCache && exchangeInfoCache.expiresAt > Date.now()) {
    res.json(exchangeInfoCache.data);
    return;
  }
  const result = await fetchBinanceJson('/api/v3/exchangeInfo?permissions=SPOT');
  if (result.status === 200 && result.data && typeof result.data === 'object') {
    const raw = result.data as { symbols?: Array<Record<string, unknown>> };
    const slimSymbols = Array.isArray(raw.symbols)
      ? raw.symbols
          .filter((s) => s.status === 'TRADING')
          .map((s) => ({
            symbol: s.symbol,
            baseAsset: s.baseAsset,
            quoteAsset: s.quoteAsset,
            status: s.status,
          }))
      : [];
    const payload = { symbols: slimSymbols };
    exchangeInfoCache = {
      expiresAt: Date.now() + 10 * 60 * 1000,
      data: payload,
    };
    res.json(payload);
    return;
  }
  res.status(result.status).json(result.data);
});

app.get('/api/market/binance/ticker24hr', async (req, res) => {
  const symbolsParam = typeof req.query.symbols === 'string' ? req.query.symbols : '';
  if (symbolsParam) {
    const list = symbolsParam
      .split(',')
      .map((s) => sanitizeParam(s, SAFE_SYMBOL_RE).toUpperCase())
      .filter(Boolean)
      .slice(0, 60);
    if (list.length > 0) {
      const encoded = encodeURIComponent(JSON.stringify(list));
      const result = await fetchBinanceJson(`/api/v3/ticker/24hr?symbols=${encoded}`);
      res.status(result.status).json(result.data);
      return;
    }
  }
  const result = await fetchBinanceJson('/api/v3/ticker/24hr');
  res.status(result.status).json(result.data);
});

function mapIntervalToTwelveData(interval: string): string {
  const map: Record<string, string> = {
    '1s': '1min',
    '1m': '1min',
    '3m': '5min',
    '5m': '5min',
    '15m': '15min',
    '30m': '30min',
    '1h': '1h',
    '2h': '2h',
    '4h': '4h',
    '1D': '1day',
    '1W': '1week',
    '1M': '1month',
  };
  return map[interval] || '1h';
}

function mapIntervalToFinnhub(interval: string): { resolution: string; secondsBack: number } {
  const map: Record<string, { resolution: string; secondsBack: number }> = {
    '1s': { resolution: '1', secondsBack: 86400 },
    '1m': { resolution: '1', secondsBack: 86400 * 3 },
    '3m': { resolution: '5', secondsBack: 86400 * 7 },
    '5m': { resolution: '5', secondsBack: 86400 * 10 },
    '15m': { resolution: '15', secondsBack: 86400 * 20 },
    '30m': { resolution: '30', secondsBack: 86400 * 35 },
    '1h': { resolution: '60', secondsBack: 86400 * 90 },
    '2h': { resolution: '60', secondsBack: 86400 * 120 },
    '4h': { resolution: '60', secondsBack: 86400 * 180 },
    '1D': { resolution: 'D', secondsBack: 86400 * 730 },
    '1W': { resolution: 'W', secondsBack: 86400 * 1825 },
    '1M': { resolution: 'M', secondsBack: 86400 * 3650 },
  };
  return map[interval] || { resolution: 'D', secondsBack: 86400 * 365 };
}

function mapIntervalToPolygon(interval: string): { multiplier: number; timespan: string; daysBack: number } {
  const map: Record<string, { multiplier: number; timespan: string; daysBack: number }> = {
    '1s': { multiplier: 1, timespan: 'minute', daysBack: 2 },
    '1m': { multiplier: 1, timespan: 'minute', daysBack: 4 },
    '3m': { multiplier: 3, timespan: 'minute', daysBack: 7 },
    '5m': { multiplier: 5, timespan: 'minute', daysBack: 14 },
    '15m': { multiplier: 15, timespan: 'minute', daysBack: 30 },
    '30m': { multiplier: 30, timespan: 'minute', daysBack: 45 },
    '1h': { multiplier: 1, timespan: 'hour', daysBack: 120 },
    '2h': { multiplier: 2, timespan: 'hour', daysBack: 180 },
    '4h': { multiplier: 4, timespan: 'hour', daysBack: 240 },
    '1D': { multiplier: 1, timespan: 'day', daysBack: 1095 },
    '1W': { multiplier: 1, timespan: 'week', daysBack: 2555 },
    '1M': { multiplier: 1, timespan: 'month', daysBack: 3650 },
  };
  return map[interval] || { multiplier: 1, timespan: 'day', daysBack: 730 };
}

app.get('/api/market/history', async (req, res) => {
  const provider = sanitizeParam(req.query.provider, /^[a-z]+$/);
  const symbol = sanitizeParam(req.query.symbol, SAFE_SYMBOL_RE);
  const interval = sanitizeParam(req.query.interval, SAFE_INTERVAL_RE, '1D');
  const limitRaw = Number(req.query.limit || 500);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 5000) : 500;
  const endTimeSec = typeof req.query.endTime === 'string' && /^\d+$/.test(req.query.endTime)
    ? Math.floor(Number(req.query.endTime) / 1000)
    : Math.floor(Date.now() / 1000);

  if (!provider || !symbol) {
    res.status(400).json({ error: 'Missing or invalid provider/symbol parameter' });
    return;
  }

  const apiKey = getProviderKey(provider);
  if (!apiKey) {
    res.status(401).json({
      error: `Market data provider '${provider}' is not configured on the server.`,
      code: 'MISSING_API_KEY',
    });
    return;
  }

  const cacheKey = `history:${provider}:${symbol.toUpperCase()}:${interval}:${limit}:${req.query.endTime || 'latest'}`;
  const cached = getCachedResponse<{ candles: unknown[] }>(cacheKey);
  if (cached) {
    res.json(cached);
    return;
  }

  try {
    if (provider === 'twelvedata') {
      const tdSymbol = normalizeTwelveDataSymbol(symbol);
      const tdInterval = mapIntervalToTwelveData(interval);
      const url = new URL('https://api.twelvedata.com/time_series');
      url.searchParams.set('symbol', tdSymbol);
      url.searchParams.set('interval', tdInterval);
      url.searchParams.set('outputsize', String(Math.min(limit, 5000)));
      url.searchParams.set('apikey', apiKey);
      if (req.query.endTime) {
        url.searchParams.set('end_date', new Date(endTimeSec * 1000).toISOString());
      }
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        status?: string;
        message?: string;
        code?: number;
        values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
      };
      if (!upstream.ok || data.status === 'error') {
        res.status(data.code === 429 || upstream.status === 429 ? 429 : 400).json({
          error: data.message || 'Twelve Data request failed',
        });
        return;
      }
      const candles = (data.values || [])
        .map((v) => ({
          time: Math.floor(new Date(v.datetime.includes('T') ? v.datetime : `${v.datetime.replace(' ', 'T')}Z`).getTime() / 1000),
          open: Number(v.open),
          high: Number(v.high),
          low: Number(v.low),
          close: Number(v.close),
          volume: Number(v.volume || 0),
        }))
        .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
        .reverse();
      const payload = { candles };
      setCachedResponse(cacheKey, payload, req.query.endTime ? 300_000 : 25_000);
      res.json(payload);
      return;
    }

    if (provider === 'finnhub') {
      const { resolution, secondsBack } = mapIntervalToFinnhub(interval);
      const from = endTimeSec - secondsBack;
      const url = new URL('https://finnhub.io/api/v1/stock/candle');
      url.searchParams.set('symbol', symbol.toUpperCase());
      url.searchParams.set('resolution', resolution);
      url.searchParams.set('from', String(from));
      url.searchParams.set('to', String(endTimeSec));
      url.searchParams.set('token', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        s?: string;
        t?: number[];
        o?: number[];
        h?: number[];
        l?: number[];
        c?: number[];
        v?: number[];
        error?: string;
      };
      if (!upstream.ok || data.error) {
        // Finnhub free keys restrict /stock/candle; fall back to Polygon or Twelve Data if configured
        const polyKey = getProviderKey('polygon');
        if (polyKey) {
          const { multiplier, timespan, daysBack } = mapIntervalToPolygon(interval);
          const toDate = new Date(endTimeSec * 1000).toISOString().slice(0, 10);
          const fromDate = new Date((endTimeSec - daysBack * 86400) * 1000).toISOString().slice(0, 10);
          const polyUrl = new URL(`https://api.polygon.io/v2/aggs/ticker/${encodeURIComponent(symbol.toUpperCase())}/range/${multiplier}/${timespan}/${fromDate}/${toDate}`);
          polyUrl.searchParams.set('adjusted', 'true');
          polyUrl.searchParams.set('sort', 'asc');
          polyUrl.searchParams.set('limit', String(Math.min(limit, 5000)));
          polyUrl.searchParams.set('apiKey', polyKey);
          const polyRes = await fetchWithTimeout(polyUrl.toString());
          const polyData = (await polyRes.json()) as {
            status?: string;
            results?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
          };
          if (polyRes.ok && polyData.status !== 'ERROR' && Array.isArray(polyData.results)) {
            const candles = polyData.results.map((r) => ({
              time: Math.floor(r.t / 1000),
              open: r.o,
              high: r.h,
              low: r.l,
              close: r.c,
              volume: r.v ?? 0,
            }));
            const payload = { candles };
            setCachedResponse(cacheKey, payload, 25_000);
            res.json(payload);
            return;
          }
        }
        const tdKey = getProviderKey('twelvedata');
        if (tdKey) {
          const tdUrl = new URL('https://api.twelvedata.com/time_series');
          tdUrl.searchParams.set('symbol', normalizeTwelveDataSymbol(symbol));
          tdUrl.searchParams.set('interval', mapIntervalToTwelveData(interval));
          tdUrl.searchParams.set('outputsize', String(Math.min(limit, 5000)));
          tdUrl.searchParams.set('apikey', tdKey);
          const tdRes = await fetchWithTimeout(tdUrl.toString());
          const tdData = (await tdRes.json()) as {
            status?: string;
            values?: Array<{ datetime: string; open: string; high: string; low: string; close: string; volume?: string }>;
          };
          if (tdRes.ok && tdData.status !== 'error' && Array.isArray(tdData.values)) {
            const candles = tdData.values
              .map((v) => ({
                time: Math.floor(new Date(v.datetime.includes('T') ? v.datetime : `${v.datetime.replace(' ', 'T')}Z`).getTime() / 1000),
                open: Number(v.open),
                high: Number(v.high),
                low: Number(v.low),
                close: Number(v.close),
                volume: Number(v.volume || 0),
              }))
              .filter((c) => Number.isFinite(c.time) && Number.isFinite(c.close))
              .reverse();
            const payload = { candles };
            setCachedResponse(cacheKey, payload, 25_000);
            res.json(payload);
            return;
          }
        }
        res.status(upstream.status || 400).json({ error: data.error || 'Finnhub request failed' });
        return;
      }
      if (data.s !== 'ok' || !Array.isArray(data.t)) {
        res.json({ candles: [] });
        return;
      }
      const candles = data.t.map((t, idx) => ({
        time: t,
        open: data.o?.[idx] ?? 0,
        high: data.h?.[idx] ?? 0,
        low: data.l?.[idx] ?? 0,
        close: data.c?.[idx] ?? 0,
        volume: data.v?.[idx] ?? 0,
      }));
      const payload = { candles };
      setCachedResponse(cacheKey, payload, 25_000);
      res.json(payload);
      return;
    }

    if (provider === 'polygon') {
      const { multiplier, timespan, daysBack } = mapIntervalToPolygon(interval);
      const toDate = new Date(endTimeSec * 1000).toISOString().slice(0, 10);
      const fromDate = new Date((endTimeSec - daysBack * 86400) * 1000).toISOString().slice(0, 10);
      const cleanTicker = encodeURIComponent(symbol.toUpperCase());
      const url = new URL(`https://api.polygon.io/v2/aggs/ticker/${cleanTicker}/range/${multiplier}/${timespan}/${fromDate}/${toDate}`);
      url.searchParams.set('adjusted', 'true');
      url.searchParams.set('sort', 'asc');
      url.searchParams.set('limit', String(Math.min(limit, 5000)));
      url.searchParams.set('apiKey', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        status?: string;
        error?: string;
        results?: Array<{ t: number; o: number; h: number; l: number; c: number; v?: number }>;
      };
      if (!upstream.ok || data.status === 'ERROR') {
        res.status(upstream.status || 400).json({ error: data.error || 'Polygon.io request failed' });
        return;
      }
      const candles = (data.results || []).map((r) => ({
        time: Math.floor(r.t / 1000),
        open: r.o,
        high: r.h,
        low: r.l,
        close: r.c,
        volume: r.v ?? 0,
      }));
      res.json({ candles });
      return;
    }

    res.status(400).json({ error: `Unsupported provider: ${provider}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upstream provider error';
    res.status(502).json({ error: message });
  }
});

app.get('/api/market/search', async (req, res) => {
  const provider = sanitizeParam(req.query.provider, /^[a-z]+$/);
  const query = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 64) : '';

  if (!provider || !query) {
    res.json({ results: [] });
    return;
  }

  const apiKey = getProviderKey(provider);
  if (!apiKey) {
    res.status(401).json({ error: 'Provider not configured on server', code: 'MISSING_API_KEY' });
    return;
  }

  const searchCacheKey = `search:${provider}:${query.toLowerCase()}`;
  const cachedSearch = getCachedResponse<{ results: unknown[] }>(searchCacheKey);
  if (cachedSearch) {
    res.json(cachedSearch);
    return;
  }

  try {
    if (provider === 'twelvedata') {
      const url = new URL('https://api.twelvedata.com/symbol_search');
      url.searchParams.set('symbol', normalizeTwelveDataSymbol(query));
      url.searchParams.set('outputsize', '25');
      url.searchParams.set('apikey', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        status?: string;
        data?: Array<{ symbol: string; instrument_name: string; exchange: string; instrument_type: string }>;
      };
      const results = (data.data || []).map((item) => ({
        symbol: item.symbol,
        displaySymbol: item.symbol,
        name: item.instrument_name,
        exchange: item.exchange,
        assetClass: item.instrument_type?.toLowerCase().includes('forex')
          ? 'forex'
          : item.instrument_type?.toLowerCase().includes('index')
          ? 'index'
          : item.instrument_type?.toLowerCase().includes('commodity')
          ? 'commodity'
          : 'stock',
        provider: 'twelvedata',
      }));
      const payload = { results };
      if (upstream.ok && data.status !== 'error') {
        setCachedResponse(searchCacheKey, payload, 300_000);
      }
      res.json(payload);
      return;
    }

    if (provider === 'finnhub') {
      const url = new URL('https://finnhub.io/api/v1/search');
      url.searchParams.set('q', query);
      url.searchParams.set('token', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        result?: Array<{ symbol: string; displaySymbol: string; description: string; type: string }>;
      };
      const results = (data.result || []).slice(0, 25).map((item) => ({
        symbol: item.symbol,
        displaySymbol: item.displaySymbol || item.symbol,
        name: item.description || item.symbol,
        exchange: 'FINNHUB',
        assetClass: item.type?.toLowerCase().includes('forex') ? 'forex' : 'stock',
        provider: 'finnhub',
      }));
      res.json({ results });
      return;
    }

    if (provider === 'polygon') {
      const url = new URL('https://api.polygon.io/v3/reference/tickers');
      url.searchParams.set('search', query);
      url.searchParams.set('active', 'true');
      url.searchParams.set('limit', '25');
      url.searchParams.set('apiKey', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        results?: Array<{ ticker: string; name: string; primary_exchange?: string; market?: string }>;
      };
      const results = (data.results || []).map((item) => ({
        symbol: item.ticker,
        displaySymbol: item.ticker,
        name: item.name,
        exchange: item.primary_exchange || 'POLYGON',
        assetClass: item.market === 'fx' ? 'forex' : item.market === 'indices' ? 'index' : 'stock',
        provider: 'polygon',
      }));
      res.json({ results });
      return;
    }

    res.status(400).json({ error: `Unsupported provider: ${provider}` });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Search request failed';
    res.status(502).json({ error: message });
  }
});

app.get('/api/market/quote', async (req, res) => {
  const provider = sanitizeParam(req.query.provider, /^[a-z]+$/);
  const symbol = sanitizeParam(req.query.symbol, SAFE_SYMBOL_RE);
  if (!provider || !symbol) {
    res.status(400).json({ error: 'Missing provider or symbol' });
    return;
  }
  const apiKey = getProviderKey(provider);
  if (!apiKey) {
    res.status(401).json({ error: 'Provider not configured on server', code: 'MISSING_API_KEY' });
    return;
  }

  const quoteCacheKey = `quote:${provider}:${symbol.toUpperCase()}`;
  const cachedQuote = getCachedResponse<Record<string, unknown>>(quoteCacheKey);
  if (cachedQuote) {
    res.json(cachedQuote);
    return;
  }

  try {
    if (provider === 'twelvedata') {
      const url = new URL('https://api.twelvedata.com/quote');
      url.searchParams.set('symbol', normalizeTwelveDataSymbol(symbol));
      url.searchParams.set('apikey', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        status?: string;
        code?: number;
        message?: string;
        close?: string;
        open?: string;
        high?: string;
        low?: string;
        volume?: string;
        change?: string;
        percent_change?: string;
      };
      if (!upstream.ok || data.status === 'error') {
        res.status(data.code === 429 || upstream.status === 429 ? 429 : 400).json({
          error: data.message || 'Twelve Data quote failed',
        });
        return;
      }
      const payload = {
        price: Number(data.close || 0),
        open: Number(data.open || 0),
        high: Number(data.high || 0),
        low: Number(data.low || 0),
        volume: Number(data.volume || 0),
        change: Number(data.change || 0),
        changePercent: Number(data.percent_change || 0),
      };
      setCachedResponse(quoteCacheKey, payload, 15_000);
      res.json(payload);
      return;
    }

    if (provider === 'finnhub') {
      const url = new URL('https://finnhub.io/api/v1/quote');
      url.searchParams.set('symbol', symbol.toUpperCase());
      url.searchParams.set('token', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        c?: number;
        o?: number;
        h?: number;
        l?: number;
        d?: number;
        dp?: number;
      };
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: 'Finnhub quote failed' });
        return;
      }
      const payload = {
        price: data.c || 0,
        open: data.o || 0,
        high: data.h || 0,
        low: data.l || 0,
        volume: 0,
        change: data.d || 0,
        changePercent: data.dp || 0,
      };
      setCachedResponse(quoteCacheKey, payload, 15_000);
      res.json(payload);
      return;
    }

    if (provider === 'polygon') {
      const cleanTicker = encodeURIComponent(symbol.toUpperCase());
      const url = new URL(`https://api.polygon.io/v2/aggs/ticker/${cleanTicker}/prev`);
      url.searchParams.set('adjusted', 'true');
      url.searchParams.set('apiKey', apiKey);
      const upstream = await fetchWithTimeout(url.toString());
      const data = (await upstream.json()) as {
        results?: Array<{ c: number; o: number; h: number; l: number; v: number }>;
      };
      const row = data.results?.[0];
      const price = row?.c || 0;
      const open = row?.o || price;
      res.json({
        price,
        open,
        high: row?.h || price,
        low: row?.l || price,
        volume: row?.v || 0,
        change: price - open,
        changePercent: open ? ((price - open) / open) * 100 : 0,
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported provider' });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Quote error';
    res.status(502).json({ error: message });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`K-CHART VIEW server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
