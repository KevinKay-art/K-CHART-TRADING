import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitiveHoveredItem,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { Candle, DrawingObject, LineStyleType, Timeframe } from '../types/chart';
import { formatDuration, formatPercent, formatPrice } from '../utils/format';
import { anchorToPixel, hitTestDrawings, PixelPoint } from './geometry';

export interface DrawingPrimitiveState {
  drawings: DrawingObject[];
  draftDrawing: DrawingObject | null;
  zoomBox: { start: PixelPoint; end: PixelPoint } | null;
  selectedId: string | null;
  hoveredId: string | null;
  hideAll: boolean;
  candles: Candle[];
  timeframe: Timeframe;
  theme: 'dark' | 'light';
}

function getLineDash(style: LineStyleType): number[] {
  if (style === 'dashed') return [6, 5];
  if (style === 'dotted') return [2, 4];
  return [];
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

function drawHandle(ctx: CanvasRenderingContext2D, p: PixelPoint, color: string, active: boolean): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, active ? 5.5 : 4.5, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.restore();
}

function drawBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  lines: string[],
  bgColor: string,
  textColor = '#FFFFFF'
): void {
  if (lines.length === 0) return;
  ctx.save();
  ctx.font = '500 11px "JetBrains Mono", monospace';
  const paddingX = 8;
  const paddingY = 5;
  const lineH = 15;
  const maxW = Math.max(...lines.map((l) => ctx.measureText(l).width));
  const boxW = maxW + paddingX * 2;
  const boxH = lines.length * lineH + paddingY * 2;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, 4);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => {
    ctx.fillText(line, x + paddingX, y + paddingY + i * lineH);
  });
  ctx.restore();
}

function extendLinePoints(
  p0: PixelPoint,
  p1: PixelPoint,
  w: number,
  h: number,
  left: boolean,
  right: boolean
): { a: PixelPoint; b: PixelPoint } {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  if (dx === 0 && dy === 0) return { a: p0, b: p1 };
  const scale = Math.max(w, h) * 4;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  const a = left ? { x: p0.x - ux * scale, y: p0.y - uy * scale } : p0;
  const b = right ? { x: p1.x + ux * scale, y: p1.y + uy * scale } : p1;
  return { a, b };
}

class DrawingPaneRenderer implements IPrimitivePaneRenderer {
  private chart: IChartApi;
  private series: ISeriesApi<SeriesType, Time>;
  private state: DrawingPrimitiveState;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType, Time>,
    state: DrawingPrimitiveState
  ) {
    this.chart = chart;
    this.series = series;
    this.state = state;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const { width: w, height: h } = mediaSize;
      const { drawings, draftDrawing, zoomBox, selectedId, hoveredId, hideAll, candles, timeframe, theme } =
        this.state;

      if (!hideAll) {
        const sorted = [...drawings]
          .filter((d) => d.visible)
          .sort((a, b) => a.zIndex - b.zIndex);

        for (const d of sorted) {
          this.renderDrawing(ctx, d, w, h, candles, timeframe, d.id === selectedId, d.id === hoveredId, theme);
        }
      }

      if (draftDrawing) {
        this.renderDrawing(ctx, draftDrawing, w, h, candles, timeframe, true, false, theme);
      }

      if (zoomBox) {
        ctx.save();
        const x = Math.min(zoomBox.start.x, zoomBox.end.x);
        const y = Math.min(zoomBox.start.y, zoomBox.end.y);
        const bw = Math.abs(zoomBox.end.x - zoomBox.start.x);
        const bh = Math.abs(zoomBox.end.y - zoomBox.start.y);
        ctx.fillStyle = 'rgba(41, 98, 255, 0.16)';
        ctx.strokeStyle = '#2962FF';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 3]);
        ctx.fillRect(x, y, bw, bh);
        ctx.strokeRect(x, y, bw, bh);
        ctx.restore();
      }
    });
  }

  private renderDrawing(
    ctx: CanvasRenderingContext2D,
    d: DrawingObject,
    w: number,
    h: number,
    candles: Candle[],
    timeframe: Timeframe,
    isSelected: boolean,
    isHovered: boolean,
    theme: 'dark' | 'light'
  ): void {
    const px: PixelPoint[] = [];
    for (const a of d.anchors) {
      const pt = anchorToPixel(this.chart, this.series, candles, a, timeframe);
      if (!pt) return;
      px.push(pt);
    }
    if (px.length === 0) return;

    const p0 = px[0];
    const p1 = px[1];
    const p2 = px[2];
    const color = d.style.color;
    const fillColor = hexToRgba(d.style.fillColor || color, d.style.fillOpacity ?? 0.14);

    ctx.save();
    ctx.globalAlpha = d.style.opacity ?? 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = d.style.lineWidth || 2;
    ctx.setLineDash(getLineDash(d.style.lineStyle));

    switch (d.tool) {
      case 'horizontalLine': {
        ctx.beginPath();
        ctx.moveTo(0, p0.y);
        ctx.lineTo(w, p0.y);
        ctx.stroke();
        if (d.style.showLabels) {
          drawBadge(ctx, w - 92, p0.y - 22, [formatPrice(d.anchors[0].price)], color);
        }
        break;
      }

      case 'horizontalRay': {
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(w, p0.y);
        ctx.stroke();
        if (d.style.showLabels) {
          drawBadge(ctx, p0.x + 8, p0.y - 22, [formatPrice(d.anchors[0].price)], color);
        }
        break;
      }

      case 'verticalLine': {
        ctx.beginPath();
        ctx.moveTo(p0.x, 0);
        ctx.lineTo(p0.x, h);
        ctx.stroke();
        break;
      }

      case 'crossLine': {
        ctx.beginPath();
        ctx.moveTo(0, p0.y);
        ctx.lineTo(w, p0.y);
        ctx.moveTo(p0.x, 0);
        ctx.lineTo(p0.x, h);
        ctx.stroke();
        break;
      }

      case 'trendLine':
      case 'ray':
      case 'extendedLine': {
        if (!p1) break;
        const left = d.tool === 'extendedLine' || d.style.extendLeft;
        const right = d.tool === 'ray' || d.tool === 'extendedLine' || d.style.extendRight;
        const { a, b } = extendLinePoints(p0, p1, w, h, left, right);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        break;
      }

      case 'infoLine': {
        if (!p1) break;
        const { a, b } = extendLinePoints(p0, p1, w, h, d.style.extendLeft, d.style.extendRight);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        const dp = d.anchors[1].price - d.anchors[0].price;
        const pct = d.anchors[0].price !== 0 ? (dp / d.anchors[0].price) * 100 : 0;
        const distPx = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        const angle = (-Math.atan2(p1.y - p0.y, p1.x - p0.x) * 180) / Math.PI;
        drawBadge(
          ctx,
          (p0.x + p1.x) / 2 + 8,
          (p0.y + p1.y) / 2 - 20,
          [
            `${dp >= 0 ? '+' : ''}${formatPrice(dp)} (${formatPercent(pct)})`,
            `${Math.round(distPx)}px · ${angle.toFixed(1)}°`,
          ],
          'rgba(19, 23, 34, 0.9)'
        );
        break;
      }

      case 'arrow': {
        if (!p1) break;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        const headLen = 12;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - headLen * Math.cos(angle - Math.PI / 6), p1.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x - headLen * Math.cos(angle + Math.PI / 6), p1.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      }

      case 'parallelChannel': {
        if (!p1) break;
        const offsetP2 = p2 || { x: p1.x, y: p1.y + 40 };
        const dx = offsetP2.x - p1.x;
        const dy = offsetP2.y - p1.y;
        const q0 = { x: p0.x + dx, y: p0.y + dy };
        const q1 = { x: p1.x + dx, y: p1.y + dy };
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(q1.x, q1.y);
        ctx.lineTo(q0.x, q0.y);
        ctx.closePath();
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.moveTo(q0.x, q0.y);
        ctx.lineTo(q1.x, q1.y);
        ctx.stroke();
        // Midline dashed
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo((p0.x + q0.x) / 2, (p0.y + q0.y) / 2);
        ctx.lineTo((p1.x + q1.x) / 2, (p1.y + q1.y) / 2);
        ctx.stroke();
        break;
      }

      case 'fibRetracement': {
        if (!p1) break;
        const levels = (d.fibLevels || []).filter((l) => l.visible);
        const startPrice = d.anchors[0].price;
        const endPrice = d.anchors[1].price;
        const spanPrice = endPrice - startPrice;
        const leftX = d.style.extendLeft ? 0 : Math.min(p0.x, p1.x);
        const rightX = d.style.extendRight ? w : Math.max(p0.x, p1.x);
        const minX = Math.min(leftX, rightX);
        const maxX = Math.max(leftX, rightX);

        // Diagonal anchor line
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(120, 123, 134, 0.7)';
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
        ctx.restore();

        const sortedLvls = [...levels].sort((a, b) => a.ratio - b.ratio);
        let prevY: number | null = null;
        for (const lvl of sortedLvls) {
          const priceAtLevel = endPrice - spanPrice * lvl.ratio;
          const y = this.series.priceToCoordinate(priceAtLevel);
          if (y === null) continue;
          if (prevY !== null) {
            ctx.fillStyle = hexToRgba(lvl.color, 0.08);
            ctx.fillRect(minX, Math.min(prevY, y), maxX - minX, Math.abs(y - prevY));
          }
          ctx.strokeStyle = lvl.color;
          ctx.lineWidth = d.style.lineWidth || 1.5;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(minX, y);
          ctx.lineTo(maxX, y);
          ctx.stroke();

          if (d.style.showLabels) {
            ctx.fillStyle = lvl.color;
            ctx.font = '500 11px "JetBrains Mono", monospace';
            ctx.textBaseline = 'bottom';
            ctx.fillText(
              `${lvl.ratio} (${formatPrice(priceAtLevel)})`,
              minX + 6,
              y - 2
            );
          }
          prevY = y;
        }
        break;
      }

      case 'fibExtension': {
        if (!p1) break;
        const anchorC = d.anchors[2] || d.anchors[1];
        const pc = p2 || p1;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.stroke();
        ctx.restore();

        const move = d.anchors[1].price - d.anchors[0].price;
        const levels = (d.fibLevels || []).filter((l) => l.visible);
        const startX = Math.min(p0.x, pc.x);
        const endX = d.style.extendRight ? w : Math.max(pc.x + 180, p1.x + 120);
        for (const lvl of levels) {
          const lvlPrice = anchorC.price + move * lvl.ratio;
          const y = this.series.priceToCoordinate(lvlPrice);
          if (y === null) continue;
          ctx.strokeStyle = lvl.color;
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(startX, y);
          ctx.lineTo(endX, y);
          ctx.stroke();
          if (d.style.showLabels) {
            ctx.fillStyle = lvl.color;
            ctx.font = '500 11px "JetBrains Mono", monospace';
            ctx.fillText(`${lvl.ratio} (${formatPrice(lvlPrice)})`, startX + 6, y - 3);
          }
        }
        break;
      }

      case 'fibChannel': {
        if (!p1) break;
        const pc = p2 || { x: p1.x, y: p1.y + 45 };
        const dx = pc.x - p1.x;
        const dy = pc.y - p1.y;
        const ratios = [0, 0.236, 0.382, 0.5, 0.618, 1, 1.618];
        for (const r of ratios) {
          ctx.strokeStyle = r === 0 || r === 1 ? color : '#26A69A';
          ctx.setLineDash(r === 0 || r === 1 ? [] : [4, 3]);
          ctx.beginPath();
          ctx.moveTo(p0.x + dx * r, p0.y + dy * r);
          ctx.lineTo(p1.x + dx * r, p1.y + dy * r);
          ctx.stroke();
        }
        break;
      }

      case 'fibTimeZones': {
        if (!p1) break;
        const unit = p1.x - p0.x;
        if (Math.abs(unit) < 1) break;
        const fibs = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89];
        ctx.font = '500 11px "JetBrains Mono", monospace';
        for (const f of fibs) {
          const x = p0.x + unit * f;
          if (x < 0 || x > w) continue;
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
          ctx.stroke();
          ctx.fillStyle = color;
          ctx.fillText(String(f), x + 4, 16);
        }
        break;
      }

      case 'rectangle': {
        if (!p1) break;
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x);
        const rh = Math.abs(p1.y - p0.y);
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, rw, rh);
        ctx.strokeRect(x, y, rw, rh);
        break;
      }

      case 'rotatedRectangle': {
        if (!p1) break;
        const pc = p2 || { x: p1.x, y: p1.y + 40 };
        const vx = p1.x - p0.x;
        const vy = p1.y - p0.y;
        const len = Math.hypot(vx, vy) || 1;
        const nx = -vy / len;
        const ny = vx / len;
        const proj = (pc.x - p0.x) * nx + (pc.y - p0.y) * ny;
        const c2 = { x: p1.x + nx * proj, y: p1.y + ny * proj };
        const c3 = { x: p0.x + nx * proj, y: p0.y + ny * proj };
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(c2.x, c2.y);
        ctx.lineTo(c3.x, c3.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'circle': {
        if (!p1) break;
        const r = Math.hypot(p1.x - p0.x, p1.y - p0.y);
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.arc(p0.x, p0.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'ellipse': {
        if (!p1) break;
        const pc = p2 || { x: (p0.x + p1.x) / 2, y: p0.y + 30 };
        const cx = (p0.x + p1.x) / 2;
        const cy = (p0.y + p1.y) / 2;
        const rx = Math.max(4, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 2);
        const ry = Math.max(4, Math.hypot(pc.x - cx, pc.y - cy));
        const rot = Math.atan2(p1.y - p0.y, p1.x - p0.x);
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'triangle': {
        if (!p1) break;
        const pc = p2 || { x: (p0.x + p1.x) / 2, y: p0.y - 50 };
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.lineTo(pc.x, pc.y);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'arc': {
        if (!p1) break;
        const pc = p2 || { x: (p0.x + p1.x) / 2, y: Math.min(p0.y, p1.y) - 40 };
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(pc.x, pc.y, p1.x, p1.y);
        ctx.stroke();
        break;
      }

      case 'polyline':
      case 'brush': {
        if (px.length < 2) break;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        ctx.moveTo(px[0].x, px[0].y);
        for (let i = 1; i < px.length; i++) {
          ctx.lineTo(px[i].x, px[i].y);
        }
        ctx.stroke();
        break;
      }

      case 'longPosition':
      case 'shortPosition': {
        if (!p1 || !p2) break;
        const isLong = d.tool === 'longPosition';
        const entry = d.anchors[0].price;
        const target = d.anchors[1].price;
        const stop = d.anchors[2].price;
        const rightX = Math.max(p0.x + 150, p1.x, p2.x);
        const boxW = Math.max(80, rightX - p0.x);

        // Profit zone
        const profitTop = Math.min(p0.y, p1.y);
        const profitH = Math.abs(p1.y - p0.y);
        ctx.fillStyle = 'rgba(38, 166, 154, 0.22)';
        ctx.fillRect(p0.x, profitTop, boxW, profitH);
        ctx.strokeStyle = '#26A69A';
        ctx.setLineDash([]);
        ctx.strokeRect(p0.x, profitTop, boxW, profitH);

        // Loss zone
        const lossTop = Math.min(p0.y, p2.y);
        const lossH = Math.abs(p2.y - p0.y);
        ctx.fillStyle = 'rgba(239, 83, 80, 0.22)';
        ctx.fillRect(p0.x, lossTop, boxW, lossH);
        ctx.strokeStyle = '#EF5350';
        ctx.strokeRect(p0.x, lossTop, boxW, lossH);

        // Entry midline
        ctx.strokeStyle = '#D1D4DC';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p0.x + boxW, p0.y);
        ctx.stroke();

        const rewardDist = isLong ? target - entry : entry - target;
        const riskDist = isLong ? entry - stop : stop - entry;
        const rr = riskDist > 0 ? rewardDist / riskDist : 0;
        const targetPct = entry !== 0 ? (rewardDist / entry) * 100 : 0;
        const stopPct = entry !== 0 ? (riskDist / entry) * 100 : 0;
        const acct = d.positionConfig?.accountSize ?? 10000;
        const riskPct = d.positionConfig?.riskPercent ?? 1;
        const dollarRisk = acct * (riskPct / 100);
        const qty = riskDist > 0 ? dollarRisk / riskDist : 0;
        const dollarReward = qty * rewardDist;

        drawBadge(
          ctx,
          p0.x + 6,
          p0.y - 18,
          [
            `${isLong ? 'LONG' : 'SHORT'} · R:R ${rr.toFixed(2)} · Qty ${qty.toFixed(4)}`,
            `Target: ${rewardDist >= 0 ? '+' : ''}${formatPrice(rewardDist)} (${formatPercent(targetPct)}) | $${dollarReward.toFixed(0)}`,
            `Stop: -${formatPrice(Math.abs(riskDist))} (${formatPercent(-Math.abs(stopPct))}) | -$${dollarRisk.toFixed(0)}`,
          ],
          'rgba(19, 23, 34, 0.92)'
        );
        break;
      }

      case 'priceRange':
      case 'dateRange':
      case 'datePriceRange': {
        if (!p1) break;
        const x = Math.min(p0.x, p1.x);
        const y = Math.min(p0.y, p1.y);
        const rw = Math.abs(p1.x - p0.x);
        const rh = Math.abs(p1.y - p0.y);
        ctx.fillStyle = fillColor;
        ctx.fillRect(x, y, rw, rh);
        ctx.strokeRect(x, y, rw, rh);

        const dp = d.anchors[1].price - d.anchors[0].price;
        const pct = d.anchors[0].price !== 0 ? (dp / d.anchors[0].price) * 100 : 0;
        const dt = Math.abs(d.anchors[1].time - d.anchors[0].time);
        const t1 = Math.min(d.anchors[0].time, d.anchors[1].time);
        const t2 = Math.max(d.anchors[0].time, d.anchors[1].time);
        const bars = candles.filter((c) => c.time >= t1 && c.time <= t2).length;

        const lines: string[] = [];
        if (d.tool !== 'dateRange') {
          lines.push(`${dp >= 0 ? '+' : ''}${formatPrice(dp)} (${formatPercent(pct)})`);
        }
        if (d.tool !== 'priceRange') {
          lines.push(`${bars} bars · ${formatDuration(dt)}`);
        }
        drawBadge(ctx, x + rw / 2 - 55, y + rh + 6, lines, dp >= 0 ? '#26A69A' : '#EF5350');
        break;
      }

      case 'text':
      case 'note':
      case 'flag': {
        const label = d.text || (d.tool === 'flag' ? '⚑ Flag' : 'Text');
        const fontSize = d.style.fontSize || 13;
        ctx.font = `600 ${fontSize}px "Plus Jakarta Sans", sans-serif`;
        if (d.tool === 'note' || d.tool === 'flag') {
          drawBadge(ctx, p0.x, p0.y - 12, [d.tool === 'flag' ? `⚑ ${label}` : label], color);
        } else {
          ctx.fillStyle = color;
          ctx.textBaseline = 'middle';
          ctx.fillText(label, p0.x, p0.y);
        }
        break;
      }

      case 'callout': {
        const target = p1 || { x: p0.x + 60, y: p0.y - 45 };
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(target.x, target.y);
        ctx.stroke();
        drawBadge(ctx, target.x, target.y - 14, [d.text || 'Callout'], color);
        break;
      }

      case 'priceLabel': {
        const label = formatPrice(d.anchors[0].price);
        drawBadge(ctx, p0.x + 12, p0.y - 12, [label], color);
        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p0.x + 12, p0.y);
        ctx.stroke();
        break;
      }

      case 'emoji': {
        ctx.font = `${Math.max(18, d.style.fontSize + 8)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(d.emoji || '🎯', p0.x, p0.y);
        break;
      }

      case 'andrewsPitchfork':
      case 'pitchfork': {
        if (!p1 || !p2) break;
        const origin =
          d.tool === 'pitchfork'
            ? { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 } // Schiff midpoint
            : p0;
        const midBC = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const median = extendLinePoints(origin, midBC, w, h, false, true);
        const dx = median.b.x - origin.x;
        const dy = median.b.y - origin.y;

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.moveTo(origin.x, origin.y);
        ctx.lineTo(median.b.x, median.b.y);
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p1.x + dx, p1.y + dy);
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x + dx, p2.y + dy);
        ctx.stroke();
        break;
      }

      case 'gannFan': {
        if (!p1) break;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const ratios = [8, 4, 3, 2, 1, 0.5, 1 / 3, 0.25, 0.125];
        for (const r of ratios) {
          const targetPt = { x: p0.x + dx, y: p0.y + dy * r };
          const ext = extendLinePoints(p0, targetPt, w, h, false, true);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(ext.b.x, ext.b.y);
          ctx.stroke();
        }
        break;
      }

      case 'anchoredVwap': {
        const anchorTime = d.anchors[0].time;
        let cumPV = 0;
        let cumV = 0;
        const pts: PixelPoint[] = [];
        for (const c of candles) {
          if (c.time < anchorTime) continue;
          const typical = (c.high + c.low + c.close) / 3;
          const vol = Math.max(c.volume, 1e-8);
          cumPV += typical * vol;
          cumV += vol;
          const vwap = cumPV / cumV;
          const pt = anchorToPixel(this.chart, this.series, candles, { time: c.time, price: vwap }, timeframe);
          if (pt) pts.push(pt);
        }
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(p0.x, p0.y, 4, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }
        break;
      }
    }

    // Selection/hover handles
    if ((isSelected || isHovered) && d.tool !== 'brush') {
      const ringColor = theme === 'dark' ? color : '#2962FF';
      for (const pt of px) {
        drawHandle(ctx, pt, ringColor, isSelected);
      }
    }

    ctx.restore();
  }
}

class DrawingPaneView implements IPrimitivePaneView {
  private rendererImpl: DrawingPaneRenderer;
  constructor(renderer: DrawingPaneRenderer) {
    this.rendererImpl = renderer;
  }
  zOrder(): PrimitivePaneViewZOrder {
    return 'top';
  }
  renderer(): IPrimitivePaneRenderer | null {
    return this.rendererImpl;
  }
}

export class DrawingManagerPrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private state: DrawingPrimitiveState;
  private paneView: DrawingPaneView | null = null;

  constructor(initialState: DrawingPrimitiveState) {
    this.state = initialState;
  }

  attached(param: SeriesAttachedParameter<Time, SeriesType>): void {
    this.chart = param.chart;
    this.series = param.series;
    this.requestUpdate = param.requestUpdate;
    this.updateAllViews();
  }

  detached(): void {
    this.chart = null;
    this.series = null;
    this.requestUpdate = null;
    this.paneView = null;
  }

  setState(next: DrawingPrimitiveState): void {
    this.state = next;
    this.updateAllViews();
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    if (!this.chart || !this.series) return;
    this.paneView = new DrawingPaneView(
      new DrawingPaneRenderer(this.chart, this.series, this.state)
    );
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.paneView ? [this.paneView] : [];
  }

  hitTest(x: number, y: number): PrimitiveHoveredItem | null {
    if (!this.chart || !this.series || this.state.hideAll) return null;
    const hit = hitTestDrawings(
      this.state.drawings,
      { x, y },
      this.chart,
      this.series,
      this.state.candles,
      this.state.timeframe,
      2000,
      2000
    );
    if (!hit) return null;
    return {
      externalId: hit.drawingId,
      zOrder: 'top',
      cursorStyle: hit.part === 'handle' ? 'grab' : 'move',
    };
  }
}
