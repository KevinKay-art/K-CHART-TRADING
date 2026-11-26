import { describe, expect, it } from 'vitest';
import { Candle, IndicatorConfig } from '../types/chart';
import {
  calcATR,
  calcBollingerBands,
  calcEMA,
  calcMACD,
  calcRSI,
  calcSMA,
  calcStochastic,
  calcWMA,
  computeIndicator,
} from './math';

function makeCandles(closes: number[]): Candle[] {
  return closes.map((c, idx) => ({
    time: 1700000000 + idx * 60,
    open: c - 0.5,
    high: c + 1,
    low: c - 1,
    close: c,
    volume: 100 + idx * 10,
  }));
}

describe('Indicator Math Engine', () => {
  it('computes SMA accurately', () => {
    const res = calcSMA([10, 20, 30, 40, 50], 3);
    expect(res).toEqual([null, null, 20, 30, 40]);
  });

  it('computes EMA accurately with SMA seed', () => {
    const res = calcEMA([10, 12, 14, 16, 18], 3);
    expect(res[0]).toBeNull();
    expect(res[1]).toBeNull();
    expect(res[2]).toBeCloseTo(12, 6);
    // k = 2 / (3 + 1) = 0.5 -> next = 16*0.5 + 12*0.5 = 14
    expect(res[3]).toBeCloseTo(14, 6);
    // next = 18*0.5 + 14*0.5 = 16
    expect(res[4]).toBeCloseTo(16, 6);
  });

  it('computes WMA accurately', () => {
    const res = calcWMA([10, 20, 30, 40], 3);
    expect(res[0]).toBeNull();
    expect(res[1]).toBeNull();
    // (10*1 + 20*2 + 30*3) / 6 = 140 / 6 = 23.333333
    expect(res[2]).toBeCloseTo(140 / 6, 5);
    // (20*1 + 30*2 + 40*3) / 6 = 200 / 6 = 33.333333
    expect(res[3]).toBeCloseTo(200 / 6, 5);
  });

  it('computes Bollinger Bands accurately', () => {
    const values = [10, 12, 14, 16, 18];
    const { basis, upper, lower } = calcBollingerBands(values, 3, 2);
    expect(basis[2]).toBeCloseTo(12, 6);
    // std of [10, 12, 14] = sqrt((4 + 0 + 4)/3) = sqrt(8/3)
    const expectedStd = Math.sqrt(8 / 3);
    expect(upper[2]).toBeCloseTo(12 + 2 * expectedStd, 6);
    expect(lower[2]).toBeCloseTo(12 - 2 * expectedStd, 6);
  });

  it('computes RSI bounded in [0, 100] and handles monotonic uptrend', () => {
    const upSeries = Array.from({ length: 30 }, (_, i) => 100 + i * 2);
    const rsiUp = calcRSI(upSeries, 14);
    expect(rsiUp[13]).toBeNull();
    expect(rsiUp[14]).toBeCloseTo(100, 6);
    expect(rsiUp[29]).toBeCloseTo(100, 6);

    const mixed = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64];
    const rsiMixed = calcRSI(mixed, 14);
    expect(rsiMixed[14]).toBeGreaterThan(50);
    expect(rsiMixed[14]).toBeLessThan(85);
  });

  it('computes MACD line, signal, and histogram consistently', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 4) * 5 + i * 0.3);
    const { macd, signal, histogram } = calcMACD(closes, 12, 26, 9);
    expect(macd[24]).toBeNull();
    expect(macd[25]).not.toBeNull();
    // Signal becomes available after 9 MACD points (index 25 + 8 = 33)
    expect(signal[32]).toBeNull();
    expect(signal[33]).not.toBeNull();
    expect(histogram[33]).toBeCloseTo(macd[33]! - signal[33]!, 8);
  });

  it('computes ATR and Stochastic cleanly', () => {
    const candles = makeCandles(Array.from({ length: 30 }, (_, i) => 50 + (i % 5)));
    const atr = calcATR(candles, 14);
    expect(atr[13]).toBeGreaterThan(0);
    const stoch = calcStochastic(candles, 14, 3, 3);
    const lastK = stoch.k[29];
    const lastD = stoch.d[29];
    expect(lastK).not.toBeNull();
    expect(lastD).not.toBeNull();
    expect(lastK!).toBeGreaterThanOrEqual(0);
    expect(lastK!).toBeLessThanOrEqual(100);
  });

  it('computes full IndicatorConfig outputs via computeIndicator', () => {
    const candles = makeCandles(Array.from({ length: 60 }, (_, i) => 100 + i));
    const macdCfg: IndicatorConfig = {
      id: 'macd_1',
      type: 'MACD',
      name: 'MACD',
      category: 'oscillator',
      paneIndex: 1,
      visible: true,
      source: 'close',
      params: { fast: 12, slow: 26, signal: 9 },
      colors: { macd: '#2962FF', signal: '#FF6D00', histUp: '#26A69A', histDown: '#EF5350' },
      lineWidth: 2,
      timeframeVisibility: 'all',
    };
    const out = computeIndicator(candles, macdCfg);
    expect(out.lines.macd.length).toBe(60 - 25);
    expect(out.lines.signal.length).toBeGreaterThan(20);
    expect(out.histograms.histogram.length).toBe(out.lines.signal.length);
    expect(out.latestValues.macd).not.toBeNull();
  });
});
