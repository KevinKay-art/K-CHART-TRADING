import { IChartApi, ISeriesApi, SeriesType, Time } from 'lightweight-charts';
import { AnchorPoint, Candle, DrawingObject, MagnetMode, Timeframe } from '../types/chart';
import { TIMEFRAME_SECONDS } from '../utils/format';

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Converts a timestamp (seconds) to an X pixel coordinate even if the timestamp
 * is beyond the last candle (future whitespace) or before the first candle.
 */
export function timeToX(
  chart: IChartApi,
  candles: Candle[],
  timeSec: number,
  timeframe: Timeframe
): number | null {
  const ts = chart.timeScale();
  const direct = ts.timeToCoordinate(timeSec as Time);
  if (direct !== null && Number.isFinite(direct)) return direct;
  if (candles.length === 0) return null;

  const first = candles[0];
  const last = candles[candles.length - 1];
  const intervalSec = TIMEFRAME_SECONDS[timeframe] || 60;

  // Estimate bar spacing using logical coordinates
  const lastLogical = candles.length - 1;
  const lastCoord = ts.logicalToCoordinate(lastLogical as unknown as Parameters<typeof ts.logicalToCoordinate>[0]);
  const prevCoord = candles.length > 1
    ? ts.logicalToCoordinate((lastLogical - 1) as unknown as Parameters<typeof ts.logicalToCoordinate>[0])
    : null;

  let barSpacing = 6;
  if (lastCoord !== null && prevCoord !== null && lastCoord !== prevCoord) {
    barSpacing = Math.abs(lastCoord - prevCoord);
  } else {
    barSpacing = ts.options().barSpacing || 6;
  }

  if (timeSec >= last.time && lastCoord !== null) {
    const barsAhead = (timeSec - last.time) / intervalSec;
    return lastCoord + barsAhead * barSpacing;
  }

  const firstCoord = ts.logicalToCoordinate(0 as unknown as Parameters<typeof ts.logicalToCoordinate>[0]);
  if (timeSec <= first.time && firstCoord !== null) {
    const barsBehind = (first.time - timeSec) / intervalSec;
    return firstCoord - barsBehind * barSpacing;
  }

  // Binary search nearest candle
  let lo = 0;
  let hi = candles.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time === timeSec) {
      return ts.logicalToCoordinate(mid as unknown as Parameters<typeof ts.logicalToCoordinate>[0]);
    }
    if (candles[mid].time < timeSec) lo = mid + 1;
    else hi = mid - 1;
  }
  const idx = Math.max(0, Math.min(candles.length - 1, lo));
  const cCoord = ts.logicalToCoordinate(idx as unknown as Parameters<typeof ts.logicalToCoordinate>[0]);
  if (cCoord === null) return null;
  const offsetBars = (timeSec - candles[idx].time) / intervalSec;
  return cCoord + offsetBars * barSpacing;
}

/**
 * Converts an X pixel coordinate back to a UTC unix timestamp (seconds),
 * extrapolating cleanly into future whitespace if x is past the last bar.
 */
export function xToTime(
  chart: IChartApi,
  candles: Candle[],
  x: number,
  timeframe: Timeframe
): number | null {
  const ts = chart.timeScale();
  const direct = ts.coordinateToTime(x);
  if (typeof direct === 'number' && Number.isFinite(direct)) return direct;
  if (candles.length === 0) return null;

  const logical = ts.coordinateToLogical(x);
  const intervalSec = TIMEFRAME_SECONDS[timeframe] || 60;
  if (logical !== null && Number.isFinite(logical)) {
    const idx = Math.round(logical);
    if (idx >= 0 && idx < candles.length) {
      return candles[idx].time;
    }
    if (idx >= candles.length) {
      const last = candles[candles.length - 1];
      return Math.round(last.time + (logical - (candles.length - 1)) * intervalSec);
    }
    const first = candles[0];
    return Math.round(first.time + logical * intervalSec);
  }
  return candles[candles.length - 1].time;
}

export function anchorToPixel(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  candles: Candle[],
  anchor: AnchorPoint,
  timeframe: Timeframe
): PixelPoint | null {
  const x = timeToX(chart, candles, anchor.time, timeframe);
  const y = series.priceToCoordinate(anchor.price);
  if (x === null || y === null || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

export function pixelToAnchor(
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  candles: Candle[],
  x: number,
  y: number,
  timeframe: Timeframe,
  magnetMode: MagnetMode
): AnchorPoint | null {
  const time = xToTime(chart, candles, x, timeframe);
  let price: number | null = series.coordinateToPrice(y) as number | null;
  if (time === null || price === null || !Number.isFinite(price)) return null;

  if (magnetMode !== 'off' && candles.length > 0) {
    // Find nearest candle by time
    let nearest = candles[0];
    let bestDt = Math.abs(candles[0].time - time);
    for (let i = 1; i < candles.length; i++) {
      const dt = Math.abs(candles[i].time - time);
      if (dt < bestDt) {
        bestDt = dt;
        nearest = candles[i];
      } else if (candles[i].time > time) {
        break;
      }
    }
    const candidates = [nearest.open, nearest.high, nearest.low, nearest.close];
    let closestPrice = price;
    let minPixelDist = Infinity;
    for (const cand of candidates) {
      const cy = series.priceToCoordinate(cand);
      if (cy !== null) {
        const dist = Math.abs(cy - y);
        if (dist < minPixelDist) {
          minPixelDist = dist;
          closestPrice = cand;
        }
      }
    }
    if (magnetMode === 'strong' || (magnetMode === 'weak' && minPixelDist <= 18)) {
      price = closestPrice;
    }
  }

  return { time, price };
}

export function constrainAnglePoint(
  originPx: PixelPoint,
  currentPx: PixelPoint
): PixelPoint {
  const dx = currentPx.x - originPx.x;
  const dy = currentPx.y - originPx.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 4) return currentPx;
  const angle = Math.atan2(dy, dx);
  const step = Math.PI / 4; // 45-degree increments
  const snapped = Math.round(angle / step) * step;
  return {
    x: originPx.x + Math.cos(snapped) * dist,
    y: originPx.y + Math.sin(snapped) * dist,
  };
}

export function distPointToSegment(p: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const l2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
  if (l2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * (b.x - a.x);
  const projY = a.y + t * (b.y - a.y);
  return Math.hypot(p.x - projX, p.y - projY);
}

export function distPointToLine(p: PixelPoint, a: PixelPoint, b: PixelPoint): number {
  const num = Math.abs((b.y - a.y) * p.x - (b.x - a.x) * p.y + b.x * a.y - b.y * a.x);
  const den = Math.hypot(b.y - a.y, b.x - a.x);
  return den === 0 ? Math.hypot(p.x - a.x, p.y - a.y) : num / den;
}

export interface HitTestResult {
  drawingId: string;
  part: 'handle' | 'body';
  handleIndex: number;
}

export function hitTestDrawings(
  drawings: DrawingObject[],
  point: PixelPoint,
  chart: IChartApi,
  series: ISeriesApi<SeriesType, Time>,
  candles: Candle[],
  timeframe: Timeframe,
  paneWidth: number,
  paneHeight: number
): HitTestResult | null {
  // Check top zIndex first
  const sorted = [...drawings]
    .filter((d) => d.visible)
    .sort((a, b) => b.zIndex - a.zIndex);

  const HANDLE_RADIUS = 9;
  const LINE_TOLERANCE = 7;

  for (const d of sorted) {
    const pxAnchors: PixelPoint[] = [];
    let valid = true;
    for (const a of d.anchors) {
      const p = anchorToPixel(chart, series, candles, a, timeframe);
      if (!p) {
        valid = false;
        break;
      }
      pxAnchors.push(p);
    }
    if (!valid || pxAnchors.length === 0) continue;

    // 1. Test anchor handles first (unless freehand brush with dozens of points)
    if (d.tool !== 'brush') {
      for (let i = 0; i < pxAnchors.length; i++) {
        if (Math.hypot(point.x - pxAnchors[i].x, point.y - pxAnchors[i].y) <= HANDLE_RADIUS) {
          return { drawingId: d.id, part: 'handle', handleIndex: i };
        }
      }
    }

    // 2. Test body geometry
    const p0 = pxAnchors[0];
    const p1 = pxAnchors[1];
    const p2 = pxAnchors[2];

    switch (d.tool) {
      case 'horizontalLine': {
        if (Math.abs(point.y - p0.y) <= LINE_TOLERANCE) {
          return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      case 'horizontalRay': {
        if (point.x >= p0.x - 6 && Math.abs(point.y - p0.y) <= LINE_TOLERANCE) {
          return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      case 'verticalLine': {
        if (Math.abs(point.x - p0.x) <= LINE_TOLERANCE) {
          return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      case 'crossLine': {
        if (Math.abs(point.x - p0.x) <= LINE_TOLERANCE || Math.abs(point.y - p0.y) <= LINE_TOLERANCE) {
          return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      case 'trendLine':
      case 'infoLine':
      case 'arrow': {
        if (p1) {
          const dist = d.style.extendLeft || d.style.extendRight
            ? distPointToLine(point, p0, p1)
            : distPointToSegment(point, p0, p1);
          if (dist <= LINE_TOLERANCE) return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      case 'ray': {
        if (p1) {
          const dot = (point.x - p0.x) * (p1.x - p0.x) + (point.y - p0.y) * (p1.y - p0.y);
          if (dot >= -10 && distPointToLine(point, p0, p1) <= LINE_TOLERANCE) {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
        break;
      }
      case 'extendedLine': {
        if (p1 && distPointToLine(point, p0, p1) <= LINE_TOLERANCE) {
          return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      case 'rectangle':
      case 'priceRange':
      case 'dateRange':
      case 'datePriceRange':
      case 'fibRetracement': {
        if (p1) {
          const minX = Math.min(p0.x, p1.x) - 4;
          const maxX = Math.max(p0.x, p1.x) + 4;
          const minY = Math.min(p0.y, p1.y) - 4;
          const maxY = Math.max(p0.y, p1.y) + 4;
          if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
        break;
      }
      case 'longPosition':
      case 'shortPosition': {
        if (p1 && p2) {
          const minX = Math.min(p0.x, p1.x, p2.x) - 6;
          const maxX = Math.max(p0.x, p1.x, p2.x, p0.x + 140) + 6;
          const minY = Math.min(p0.y, p1.y, p2.y) - 6;
          const maxY = Math.max(p0.y, p1.y, p2.y) + 6;
          if (point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY) {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
        break;
      }
      case 'circle': {
        if (p1) {
          const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
          const dCenter = Math.hypot(point.x - p0.x, point.y - p0.y);
          if (dCenter <= r + 6) {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
        break;
      }
      case 'text':
      case 'note':
      case 'priceLabel':
      case 'flag':
      case 'emoji':
      case 'anchoredVwap': {
        if (Math.hypot(point.x - p0.x, point.y - p0.y) <= 28) {
          return { drawingId: d.id, part: 'body', handleIndex: -1 };
        }
        break;
      }
      default: {
        // Polyline, brush, triangle, parallel channel, fib extensions, etc.
        for (let i = 0; i < pxAnchors.length - 1; i++) {
          if (distPointToSegment(point, pxAnchors[i], pxAnchors[i + 1]) <= LINE_TOLERANCE + 2) {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
        if (pxAnchors.length >= 3) {
          if (
            distPointToSegment(point, pxAnchors[pxAnchors.length - 1], pxAnchors[0]) <=
            LINE_TOLERANCE + 2
          ) {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
        // Fallback bounding check for wide regions
        const xs = pxAnchors.map((p) => p.x);
        const ys = pxAnchors.map((p) => p.y);
        if (
          point.x >= Math.min(...xs) - 6 &&
          point.x <= Math.max(...xs) + 6 &&
          point.y >= Math.min(...ys) - 6 &&
          point.y <= Math.max(...ys) + 6 &&
          Math.max(...xs) - Math.min(...xs) < paneWidth &&
          Math.max(...ys) - Math.min(...ys) < paneHeight
        ) {
          if (d.tool === 'parallelChannel' || d.tool === 'triangle' || d.tool === 'rotatedRectangle' || d.tool === 'ellipse' || d.tool === 'fibChannel') {
            return { drawingId: d.id, part: 'body', handleIndex: -1 };
          }
        }
      }
    }
  }

  return null;
}
