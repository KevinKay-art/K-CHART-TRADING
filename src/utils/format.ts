import { Candle, Timeframe } from '../types/chart';

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
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

export const ALL_TIMEFRAMES: Timeframe[] = [
  '1s',
  '1m',
  '3m',
  '5m',
  '15m',
  '30m',
  '1h',
  '2h',
  '4h',
  '1D',
  '1W',
  '1M',
];

export function getPricePrecision(price: number): number {
  if (!Number.isFinite(price) || price === 0) return 2;
  const abs = Math.abs(price);
  if (abs >= 1000) return 2;
  if (abs >= 10) return 2;
  if (abs >= 1) return 4;
  if (abs >= 0.01) return 5;
  if (abs >= 0.0001) return 6;
  return 8;
}

export function formatPrice(price: number | null | undefined, precision?: number): string {
  if (price === null || price === undefined || !Number.isFinite(price)) return '—';
  const p = precision ?? getPricePrecision(price);
  return price.toLocaleString('en-US', {
    minimumFractionDigits: p,
    maximumFractionDigits: p,
  });
}

export function formatVolume(vol: number | null | undefined): string {
  if (vol === null || vol === undefined || !Number.isFinite(vol)) return '—';
  const abs = Math.abs(vol);
  if (abs >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  return vol.toFixed(2);
}

export function formatPercent(pct: number | null | undefined): string {
  if (pct === null || pct === undefined || !Number.isFinite(pct)) return '—';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatTimestamp(unixSec: number, timezone: string): string {
  try {
    const date = new Date(unixSec * 1000);
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone === 'UTC' ? 'UTC' : timezone,
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  } catch {
    return new Date(unixSec * 1000).toISOString().slice(0, 16).replace('T', ' ');
  }
}

export function formatDuration(seconds: number): string {
  const abs = Math.abs(Math.round(seconds));
  const days = Math.floor(abs / 86400);
  const hours = Math.floor((abs % 86400) / 3600);
  const mins = Math.floor((abs % 3600) / 60);
  const secs = abs % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export function getCandleCountdown(lastCandleTimeSec: number | undefined, timeframe: Timeframe): string {
  if (!lastCandleTimeSec) return '--:--';
  const duration = TIMEFRAME_SECONDS[timeframe];
  const nowSec = Math.floor(Date.now() / 1000);
  const closeTime = lastCandleTimeSec + duration;
  const remaining = Math.max(0, closeTime - nowSec);
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const mins = Math.floor((remaining % 3600) / 60);
  const secs = remaining % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  if (days > 0) return `${days}d ${pad(hours)}:${pad(mins)}`;
  if (hours > 0) return `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

export function computeHeikinAshi(candles: Candle[]): Candle[] {
  if (candles.length === 0) return [];
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const haClose = (c.open + c.high + c.low + c.close) / 4;
    const prev = i > 0 ? result[i - 1] : null;
    const haOpen = prev ? (prev.open + prev.close) / 2 : (c.open + c.close) / 2;
    const haHigh = Math.max(c.high, haOpen, haClose);
    const haLow = Math.min(c.low, haOpen, haClose);
    result.push({
      time: c.time,
      open: haOpen,
      high: haHigh,
      low: haLow,
      close: haClose,
      volume: c.volume,
    });
  }
  return result;
}

export function exportCandlesToCsv(symbol: string, timeframe: Timeframe, candles: Candle[]): string {
  const header = 'time_utc,open,high,low,close,volume';
  const rows = candles.map((c) => {
    const iso = new Date(c.time * 1000).toISOString();
    return `${iso},${c.open},${c.high},${c.low},${c.close},${c.volume}`;
  });
  return `${header}\n${rows.join('\n')}`;
}
