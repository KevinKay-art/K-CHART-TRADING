import { Candle, IndicatorConfig, PriceSource } from '../types/chart';

export interface IndicatorPoint {
  time: number;
  value: number;
  color?: string;
}

export interface ComputedIndicatorOutput {
  lines: Record<string, IndicatorPoint[]>;
  histograms: Record<string, IndicatorPoint[]>;
  latestValues: Record<string, number | null>;
}

export function extractSourceSeries(candles: Candle[], source: PriceSource): number[] {
  switch (source) {
    case 'open':
      return candles.map((c) => c.open);
    case 'high':
      return candles.map((c) => c.high);
    case 'low':
      return candles.map((c) => c.low);
    case 'hl2':
      return candles.map((c) => (c.high + c.low) / 2);
    case 'hlc3':
      return candles.map((c) => (c.high + c.low + c.close) / 3);
    case 'ohlc4':
      return candles.map((c) => (c.open + c.high + c.low + c.close) / 4);
    case 'close':
    default:
      return candles.map((c) => c.close);
  }
}

export function calcSMA(values: number[], period: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n < period) return out;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function calcEMA(values: number[], period: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n < period) return out;
  const k = 2 / (period + 1);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += values[i];
  let ema = sum / period;
  out[period - 1] = ema;
  for (let i = period; i < n; i++) {
    ema = values[i] * k + ema * (1 - k);
    out[i] = ema;
  }
  return out;
}

export function calcWMA(values: number[], period: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n < period) return out;
  const denom = (period * (period + 1)) / 2;
  for (let i = period - 1; i < n; i++) {
    let acc = 0;
    for (let j = 0; j < period; j++) {
      acc += values[i - period + 1 + j] * (j + 1);
    }
    out[i] = acc / denom;
  }
  return out;
}

export function calcBollingerBands(
  values: number[],
  period: number,
  mult: number
): { basis: Array<number | null>; upper: Array<number | null>; lower: Array<number | null> } {
  const n = values.length;
  const basis = calcSMA(values, period);
  const upper: Array<number | null> = new Array(n).fill(null);
  const lower: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n < period) return { basis, upper, lower };

  for (let i = period - 1; i < n; i++) {
    const mean = basis[i];
    if (mean === null) continue;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) {
      const diff = values[j] - mean;
      sq += diff * diff;
    }
    const std = Math.sqrt(sq / period);
    upper[i] = mean + mult * std;
    lower[i] = mean - mult * std;
  }
  return { basis, upper, lower };
}

export function calcRSI(values: number[], period = 14): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n <= period) return out;

  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum -= diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < n; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

export function calcMACD(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9
): {
  macd: Array<number | null>;
  signal: Array<number | null>;
  histogram: Array<number | null>;
} {
  const n = values.length;
  const emaFast = calcEMA(values, fast);
  const emaSlow = calcEMA(values, slow);
  const macd: Array<number | null> = new Array(n).fill(null);
  const macdNonNull: number[] = [];
  const macdNonNullIndices: number[] = [];

  for (let i = 0; i < n; i++) {
    const f = emaFast[i];
    const s = emaSlow[i];
    if (f !== null && s !== null) {
      const m = f - s;
      macd[i] = m;
      macdNonNull.push(m);
      macdNonNullIndices.push(i);
    }
  }

  const sigRaw = calcEMA(macdNonNull, signalPeriod);
  const signal: Array<number | null> = new Array(n).fill(null);
  const histogram: Array<number | null> = new Array(n).fill(null);

  for (let k = 0; k < sigRaw.length; k++) {
    const idx = macdNonNullIndices[k];
    const s = sigRaw[k];
    const m = macd[idx];
    if (s !== null && m !== null) {
      signal[idx] = s;
      histogram[idx] = m - s;
    }
  }

  return { macd, signal, histogram };
}

export function calcATR(candles: Candle[], period = 14): Array<number | null> {
  const n = candles.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (period <= 0 || n === 0) return out;
  const tr: number[] = new Array(n).fill(0);
  tr[0] = candles[0].high - candles[0].low;
  for (let i = 1; i < n; i++) {
    const c = candles[i];
    const prevClose = candles[i - 1].close;
    tr[i] = Math.max(
      c.high - c.low,
      Math.abs(c.high - prevClose),
      Math.abs(c.low - prevClose)
    );
  }
  if (n < period) return out;
  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  let atr = sum / period;
  out[period - 1] = atr;
  for (let i = period; i < n; i++) {
    atr = (atr * (period - 1) + tr[i]) / period;
    out[i] = atr;
  }
  return out;
}

export function calcStochastic(
  candles: Candle[],
  kPeriod = 14,
  smoothK = 3,
  dPeriod = 3
): { k: Array<number | null>; d: Array<number | null> } {
  const n = candles.length;
  const rawK: Array<number | null> = new Array(n).fill(null);
  for (let i = kPeriod - 1; i < n; i++) {
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > highest) highest = candles[j].high;
      if (candles[j].low < lowest) lowest = candles[j].low;
    }
    const span = highest - lowest;
    rawK[i] = span === 0 ? 50 : ((candles[i].close - lowest) / span) * 100;
  }

  const kValues: number[] = [];
  const kIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (rawK[i] !== null) {
      kValues.push(rawK[i]!);
      kIndices.push(i);
    }
  }

  const smoothedK = calcSMA(kValues, Math.max(1, smoothK));
  const k: Array<number | null> = new Array(n).fill(null);
  const dSource: number[] = [];
  const dIndices: number[] = [];
  for (let i = 0; i < smoothedK.length; i++) {
    const val = smoothedK[i];
    if (val !== null) {
      k[kIndices[i]] = val;
      dSource.push(val);
      dIndices.push(kIndices[i]);
    }
  }

  const dSmoothed = calcSMA(dSource, Math.max(1, dPeriod));
  const d: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < dSmoothed.length; i++) {
    if (dSmoothed[i] !== null) d[dIndices[i]] = dSmoothed[i];
  }
  return { k, d };
}

function toPoints(candles: Candle[], values: Array<number | null>): IndicatorPoint[] {
  const pts: IndicatorPoint[] = [];
  for (let i = 0; i < candles.length; i++) {
    const v = values[i];
    if (v !== null && Number.isFinite(v)) {
      pts.push({ time: candles[i].time, value: v });
    }
  }
  return pts;
}

function getLatest(values: Array<number | null>): number | null {
  for (let i = values.length - 1; i >= 0; i--) {
    if (values[i] !== null && Number.isFinite(values[i])) return values[i];
  }
  return null;
}

export function computeIndicator(
  candles: Candle[],
  config: IndicatorConfig
): ComputedIndicatorOutput {
  const n = candles.length;
  const src = extractSourceSeries(candles, config.source || 'close');
  const p = config.params;

  if (n === 0) {
    return { lines: {}, histograms: {}, latestValues: {} };
  }

  switch (config.type) {
    case 'SMA': {
      const vals = calcSMA(src, Math.max(1, p.period ?? 20));
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'EMA': {
      const vals = calcEMA(src, Math.max(1, p.period ?? 21));
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'WMA': {
      const vals = calcWMA(src, Math.max(1, p.period ?? 20));
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'VWAP': {
      const vals: Array<number | null> = new Array(n).fill(null);
      let cumPV = 0;
      let cumV = 0;
      let lastDay = -1;
      for (let i = 0; i < n; i++) {
        const day = Math.floor(candles[i].time / 86400);
        if (day !== lastDay) {
          cumPV = 0;
          cumV = 0;
          lastDay = day;
        }
        const typical = (candles[i].high + candles[i].low + candles[i].close) / 3;
        const vol = Math.max(candles[i].volume, 1e-8);
        cumPV += typical * vol;
        cumV += vol;
        vals[i] = cumPV / cumV;
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'BB': {
      const { basis, upper, lower } = calcBollingerBands(
        src,
        Math.max(2, p.period ?? 20),
        p.mult ?? 2
      );
      return {
        lines: {
          basis: toPoints(candles, basis),
          upper: toPoints(candles, upper),
          lower: toPoints(candles, lower),
        },
        histograms: {},
        latestValues: {
          upper: getLatest(upper),
          basis: getLatest(basis),
          lower: getLatest(lower),
        },
      };
    }

    case 'ICHIMOKU': {
      const tLen = Math.max(1, p.tenkan ?? 9);
      const kLen = Math.max(1, p.kijun ?? 26);
      const bLen = Math.max(1, p.senkouB ?? 52);
      const midpoint = (idx: number, len: number): number | null => {
        if (idx < len - 1) return null;
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = idx - len + 1; j <= idx; j++) {
          if (candles[j].high > hi) hi = candles[j].high;
          if (candles[j].low < lo) lo = candles[j].low;
        }
        return (hi + lo) / 2;
      };
      const tenkan: Array<number | null> = new Array(n).fill(null);
      const kijun: Array<number | null> = new Array(n).fill(null);
      const spanA: Array<number | null> = new Array(n).fill(null);
      const spanB: Array<number | null> = new Array(n).fill(null);
      const chikou: Array<number | null> = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        tenkan[i] = midpoint(i, tLen);
        kijun[i] = midpoint(i, kLen);
        if (i >= kLen && tenkan[i - kLen] !== null && kijun[i - kLen] !== null) {
          spanA[i] = (tenkan[i - kLen]! + kijun[i - kLen]!) / 2;
        }
        if (i >= kLen) {
          spanB[i] = midpoint(i - kLen, bLen);
        }
        if (i + kLen < n) {
          chikou[i] = candles[i + kLen].close;
        }
      }
      return {
        lines: {
          tenkan: toPoints(candles, tenkan),
          kijun: toPoints(candles, kijun),
          spanA: toPoints(candles, spanA),
          spanB: toPoints(candles, spanB),
          chikou: toPoints(candles, chikou),
        },
        histograms: {},
        latestValues: {
          tenkan: getLatest(tenkan),
          kijun: getLatest(kijun),
          spanA: getLatest(spanA),
          spanB: getLatest(spanB),
        },
      };
    }

    case 'PSAR': {
      const step = p.step ?? 0.02;
      const maxAf = p.max ?? 0.2;
      const vals: Array<number | null> = new Array(n).fill(null);
      if (n >= 2) {
        let isLong = candles[1].close >= candles[0].close;
        let sar = isLong ? candles[0].low : candles[0].high;
        let ep = isLong ? candles[1].high : candles[1].low;
        let af = step;
        vals[0] = sar;
        for (let i = 1; i < n; i++) {
          const c = candles[i];
          sar = sar + af * (ep - sar);
          if (isLong) {
            if (i >= 2) sar = Math.min(sar, candles[i - 1].low, candles[i - 2].low);
            if (c.low < sar) {
              isLong = false;
              sar = ep;
              ep = c.low;
              af = step;
            } else if (c.high > ep) {
              ep = c.high;
              af = Math.min(maxAf, af + step);
            }
          } else {
            if (i >= 2) sar = Math.max(sar, candles[i - 1].high, candles[i - 2].high);
            if (c.high > sar) {
              isLong = true;
              sar = ep;
              ep = c.high;
              af = step;
            } else if (c.low < ep) {
              ep = c.low;
              af = Math.min(maxAf, af + step);
            }
          }
          vals[i] = sar;
        }
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'SUPERTREND': {
      const period = Math.max(1, p.period ?? 10);
      const mult = p.mult ?? 3;
      const atr = calcATR(candles, period);
      const upPts: IndicatorPoint[] = [];
      const downPts: IndicatorPoint[] = [];
      let upperBand = 0;
      let lowerBand = 0;
      let dir = 1;
      let latest: number | null = null;
      for (let i = 0; i < n; i++) {
        const a = atr[i];
        if (a === null) continue;
        const hl2 = (candles[i].high + candles[i].low) / 2;
        const basicUpper = hl2 + mult * a;
        const basicLower = hl2 - mult * a;
        if (i === period - 1) {
          upperBand = basicUpper;
          lowerBand = basicLower;
          dir = candles[i].close >= hl2 ? 1 : -1;
        } else {
          upperBand =
            basicUpper < upperBand || candles[i - 1].close > upperBand ? basicUpper : upperBand;
          lowerBand =
            basicLower > lowerBand || candles[i - 1].close < lowerBand ? basicLower : lowerBand;
          if (dir === 1 && candles[i].close < lowerBand) dir = -1;
          else if (dir === -1 && candles[i].close > upperBand) dir = 1;
        }
        const val = dir === 1 ? lowerBand : upperBand;
        latest = val;
        if (dir === 1) {
          upPts.push({ time: candles[i].time, value: val });
        } else {
          downPts.push({ time: candles[i].time, value: val });
        }
      }
      return {
        lines: { up: upPts, down: downPts },
        histograms: {},
        latestValues: { main: latest },
      };
    }

    case 'DONCHIAN': {
      const period = Math.max(1, p.period ?? 20);
      const upper: Array<number | null> = new Array(n).fill(null);
      const lower: Array<number | null> = new Array(n).fill(null);
      const basis: Array<number | null> = new Array(n).fill(null);
      for (let i = period - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j++) {
          if (candles[j].high > hi) hi = candles[j].high;
          if (candles[j].low < lo) lo = candles[j].low;
        }
        upper[i] = hi;
        lower[i] = lo;
        basis[i] = (hi + lo) / 2;
      }
      return {
        lines: {
          upper: toPoints(candles, upper),
          basis: toPoints(candles, basis),
          lower: toPoints(candles, lower),
        },
        histograms: {},
        latestValues: {
          upper: getLatest(upper),
          basis: getLatest(basis),
          lower: getLatest(lower),
        },
      };
    }

    case 'KELTNER': {
      const period = Math.max(1, p.period ?? 20);
      const mult = p.mult ?? 2;
      const basis = calcEMA(src, period);
      const atr = calcATR(candles, period);
      const upper: Array<number | null> = new Array(n).fill(null);
      const lower: Array<number | null> = new Array(n).fill(null);
      for (let i = 0; i < n; i++) {
        if (basis[i] !== null && atr[i] !== null) {
          upper[i] = basis[i]! + mult * atr[i]!;
          lower[i] = basis[i]! - mult * atr[i]!;
        }
      }
      return {
        lines: {
          upper: toPoints(candles, upper),
          basis: toPoints(candles, basis),
          lower: toPoints(candles, lower),
        },
        histograms: {},
        latestValues: {
          upper: getLatest(upper),
          basis: getLatest(basis),
          lower: getLatest(lower),
        },
      };
    }

    case 'RSI': {
      const vals = calcRSI(src, Math.max(2, p.period ?? 14));
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'MACD': {
      const { macd, signal, histogram } = calcMACD(
        src,
        Math.max(1, p.fast ?? 12),
        Math.max(2, p.slow ?? 26),
        Math.max(1, p.signal ?? 9)
      );
      const histPts: IndicatorPoint[] = [];
      const upColor = config.colors.histUp || '#26A69A';
      const downColor = config.colors.histDown || '#EF5350';
      for (let i = 0; i < n; i++) {
        const v = histogram[i];
        if (v !== null && Number.isFinite(v)) {
          histPts.push({
            time: candles[i].time,
            value: v,
            color: v >= 0 ? upColor : downColor,
          });
        }
      }
      return {
        lines: {
          macd: toPoints(candles, macd),
          signal: toPoints(candles, signal),
        },
        histograms: { histogram: histPts },
        latestValues: {
          macd: getLatest(macd),
          signal: getLatest(signal),
          hist: getLatest(histogram),
        },
      };
    }

    case 'STOCH': {
      const { k, d } = calcStochastic(
        candles,
        Math.max(1, p.kPeriod ?? 14),
        Math.max(1, p.smoothK ?? 3),
        Math.max(1, p.dPeriod ?? 3)
      );
      return {
        lines: { k: toPoints(candles, k), d: toPoints(candles, d) },
        histograms: {},
        latestValues: { k: getLatest(k), d: getLatest(d) },
      };
    }

    case 'STOCHRSI': {
      const rsiPeriod = Math.max(2, p.rsiPeriod ?? 14);
      const stochPeriod = Math.max(2, p.stochPeriod ?? 14);
      const kSmooth = Math.max(1, p.kSmooth ?? 3);
      const dSmooth = Math.max(1, p.dSmooth ?? 3);
      const rsi = calcRSI(src, rsiPeriod);
      const rawK: Array<number | null> = new Array(n).fill(null);
      for (let i = stochPeriod - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        let valid = true;
        for (let j = i - stochPeriod + 1; j <= i; j++) {
          const r = rsi[j];
          if (r === null) {
            valid = false;
            break;
          }
          if (r > hi) hi = r;
          if (r < lo) lo = r;
        }
        if (valid && rsi[i] !== null) {
          rawK[i] = hi === lo ? 50 : ((rsi[i]! - lo) / (hi - lo)) * 100;
        }
      }
      const vals: number[] = [];
      const idxs: number[] = [];
      for (let i = 0; i < n; i++) {
        if (rawK[i] !== null) {
          vals.push(rawK[i]!);
          idxs.push(i);
        }
      }
      const kS = calcSMA(vals, kSmooth);
      const k: Array<number | null> = new Array(n).fill(null);
      const dIn: number[] = [];
      const dIdxs: number[] = [];
      for (let i = 0; i < kS.length; i++) {
        if (kS[i] !== null) {
          k[idxs[i]] = kS[i];
          dIn.push(kS[i]!);
          dIdxs.push(idxs[i]);
        }
      }
      const dS = calcSMA(dIn, dSmooth);
      const d: Array<number | null> = new Array(n).fill(null);
      for (let i = 0; i < dS.length; i++) {
        if (dS[i] !== null) d[dIdxs[i]] = dS[i];
      }
      return {
        lines: { k: toPoints(candles, k), d: toPoints(candles, d) },
        histograms: {},
        latestValues: { k: getLatest(k), d: getLatest(d) },
      };
    }

    case 'CCI': {
      const period = Math.max(1, p.period ?? 20);
      const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
      const sma = calcSMA(tp, period);
      const vals: Array<number | null> = new Array(n).fill(null);
      for (let i = period - 1; i < n; i++) {
        const mean = sma[i];
        if (mean === null) continue;
        let md = 0;
        for (let j = i - period + 1; j <= i; j++) md += Math.abs(tp[j] - mean);
        md /= period;
        vals[i] = md === 0 ? 0 : (tp[i] - mean) / (0.015 * md);
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'WILLR': {
      const period = Math.max(1, p.period ?? 14);
      const vals: Array<number | null> = new Array(n).fill(null);
      for (let i = period - 1; i < n; i++) {
        let hi = -Infinity;
        let lo = Infinity;
        for (let j = i - period + 1; j <= i; j++) {
          if (candles[j].high > hi) hi = candles[j].high;
          if (candles[j].low < lo) lo = candles[j].low;
        }
        vals[i] = hi === lo ? -50 : ((hi - candles[i].close) / (hi - lo)) * -100;
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'ATR': {
      const vals = calcATR(candles, Math.max(1, p.period ?? 14));
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'ADX': {
      const period = Math.max(2, p.period ?? 14);
      const tr: number[] = new Array(n).fill(0);
      const plusDM: number[] = new Array(n).fill(0);
      const minusDM: number[] = new Array(n).fill(0);
      for (let i = 1; i < n; i++) {
        const upMove = candles[i].high - candles[i - 1].high;
        const downMove = candles[i - 1].low - candles[i].low;
        plusDM[i] = upMove > downMove && upMove > 0 ? upMove : 0;
        minusDM[i] = downMove > upMove && downMove > 0 ? downMove : 0;
        tr[i] = Math.max(
          candles[i].high - candles[i].low,
          Math.abs(candles[i].high - candles[i - 1].close),
          Math.abs(candles[i].low - candles[i - 1].close)
        );
      }
      const adx: Array<number | null> = new Array(n).fill(null);
      const diPlus: Array<number | null> = new Array(n).fill(null);
      const diMinus: Array<number | null> = new Array(n).fill(null);
      if (n > period * 2) {
        let sTR = 0;
        let sPlus = 0;
        let sMinus = 0;
        for (let i = 1; i <= period; i++) {
          sTR += tr[i];
          sPlus += plusDM[i];
          sMinus += minusDM[i];
        }
        const dxArr: number[] = [];
        for (let i = period; i < n; i++) {
          if (i > period) {
            sTR = sTR - sTR / period + tr[i];
            sPlus = sPlus - sPlus / period + plusDM[i];
            sMinus = sMinus - sMinus / period + minusDM[i];
          }
          const pdi = sTR === 0 ? 0 : (sPlus / sTR) * 100;
          const mdi = sTR === 0 ? 0 : (sMinus / sTR) * 100;
          diPlus[i] = pdi;
          diMinus[i] = mdi;
          const sumDI = pdi + mdi;
          const dx = sumDI === 0 ? 0 : (Math.abs(pdi - mdi) / sumDI) * 100;
          dxArr.push(dx);
          if (dxArr.length === period) {
            adx[i] = dxArr.reduce((a, b) => a + b, 0) / period;
          } else if (dxArr.length > period && adx[i - 1] !== null) {
            adx[i] = (adx[i - 1]! * (period - 1) + dx) / period;
          }
        }
      }
      return {
        lines: {
          adx: toPoints(candles, adx),
          diPlus: toPoints(candles, diPlus),
          diMinus: toPoints(candles, diMinus),
        },
        histograms: {},
        latestValues: {
          adx: getLatest(adx),
          diPlus: getLatest(diPlus),
          diMinus: getLatest(diMinus),
        },
      };
    }

    case 'MOM': {
      const period = Math.max(1, p.period ?? 10);
      const vals: Array<number | null> = new Array(n).fill(null);
      for (let i = period; i < n; i++) {
        vals[i] = src[i] - src[i - period];
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'ROC': {
      const period = Math.max(1, p.period ?? 9);
      const vals: Array<number | null> = new Array(n).fill(null);
      for (let i = period; i < n; i++) {
        const prev = src[i - period];
        vals[i] = prev === 0 ? 0 : ((src[i] - prev) / prev) * 100;
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'MFI': {
      const period = Math.max(1, p.period ?? 14);
      const vals: Array<number | null> = new Array(n).fill(null);
      const tp = candles.map((c) => (c.high + c.low + c.close) / 3);
      const posFlow: number[] = new Array(n).fill(0);
      const negFlow: number[] = new Array(n).fill(0);
      for (let i = 1; i < n; i++) {
        const rmf = tp[i] * candles[i].volume;
        if (tp[i] > tp[i - 1]) posFlow[i] = rmf;
        else if (tp[i] < tp[i - 1]) negFlow[i] = rmf;
      }
      for (let i = period; i < n; i++) {
        let pSum = 0;
        let nSum = 0;
        for (let j = i - period + 1; j <= i; j++) {
          pSum += posFlow[j];
          nSum += negFlow[j];
        }
        vals[i] = nSum === 0 ? 100 : 100 - 100 / (1 + pSum / nSum);
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'OBV': {
      const vals: Array<number | null> = new Array(n).fill(null);
      let obv = 0;
      vals[0] = 0;
      for (let i = 1; i < n; i++) {
        if (candles[i].close > candles[i - 1].close) obv += candles[i].volume;
        else if (candles[i].close < candles[i - 1].close) obv -= candles[i].volume;
        vals[i] = obv;
      }
      return {
        lines: { main: toPoints(candles, vals) },
        histograms: {},
        latestValues: { main: getLatest(vals) },
      };
    }

    case 'AO': {
      const fast = Math.max(1, p.fast ?? 5);
      const slow = Math.max(2, p.slow ?? 34);
      const median = candles.map((c) => (c.high + c.low) / 2);
      const smaF = calcSMA(median, fast);
      const smaS = calcSMA(median, slow);
      const upColor = config.colors.up || '#26A69A';
      const downColor = config.colors.down || '#EF5350';
      const histPts: IndicatorPoint[] = [];
      let prevAo = 0;
      let latest: number | null = null;
      for (let i = 0; i < n; i++) {
        if (smaF[i] !== null && smaS[i] !== null) {
          const ao = smaF[i]! - smaS[i]!;
          histPts.push({
            time: candles[i].time,
            value: ao,
            color: ao >= prevAo ? upColor : downColor,
          });
          prevAo = ao;
          latest = ao;
        }
      }
      return {
        lines: {},
        histograms: { main: histPts },
        latestValues: { main: latest },
      };
    }

    case 'VOL':
    case 'VOL_MA': {
      const upColor = config.colors.up || 'rgba(38, 166, 154, 0.7)';
      const downColor = config.colors.down || 'rgba(239, 83, 80, 0.7)';
      const histPts: IndicatorPoint[] = candles.map((c) => ({
        time: c.time,
        value: c.volume,
        color: c.close >= c.open ? upColor : downColor,
      }));
      const lines: Record<string, IndicatorPoint[]> = {};
      const latestValues: Record<string, number | null> = {
        vol: candles[n - 1]?.volume ?? null,
      };
      if (config.type === 'VOL_MA') {
        const maVals = calcSMA(
          candles.map((c) => c.volume),
          Math.max(1, p.period ?? 20)
        );
        lines.ma = toPoints(candles, maVals);
        latestValues.ma = getLatest(maVals);
      }
      return {
        lines,
        histograms: { vol: histPts },
        latestValues,
      };
    }

    case 'VOL_PROFILE': {
      // Rendered directly as a series primitive over visible range
      return {
        lines: {},
        histograms: {},
        latestValues: {},
      };
    }
  }
}

/**
 * Incremental memoization cache so live tick updates on the last bar
 * do not recompute stationary prefix arrays needlessly when candles haven't grown.
 */
export class IncrementalIndicatorCache {
  private cache = new Map<
    string,
    {
      signature: string;
      lastTime: number;
      lastClose: number;
      lastVolume: number;
      length: number;
      output: ComputedIndicatorOutput;
    }
  >();

  getOrCompute(candles: Candle[], config: IndicatorConfig): ComputedIndicatorOutput {
    const sig = JSON.stringify({
      type: config.type,
      source: config.source,
      params: config.params,
      colors: config.colors,
    });
    const len = candles.length;
    const last = candles[len - 1];
    const existing = this.cache.get(config.id);
    if (
      existing &&
      existing.signature === sig &&
      existing.length === len &&
      last &&
      existing.lastTime === last.time &&
      existing.lastClose === last.close &&
      existing.lastVolume === last.volume
    ) {
      return existing.output;
    }

    const output = computeIndicator(candles, config);
    this.cache.set(config.id, {
      signature: sig,
      lastTime: last?.time ?? 0,
      lastClose: last?.close ?? 0,
      lastVolume: last?.volume ?? 0,
      length: len,
      output,
    });
    return output;
  }

  clear(): void {
    this.cache.clear();
  }
}
