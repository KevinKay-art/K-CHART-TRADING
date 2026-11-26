import { CanvasRenderingTarget2D } from 'fancy-canvas';
import {
  IChartApi,
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesApi,
  ISeriesPrimitive,
  PrimitivePaneViewZOrder,
  SeriesAttachedParameter,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { Candle } from '../types/chart';

export interface VolumeProfileConfig {
  enabled: boolean;
  rows: number;
  barColor: string;
  pocColor: string;
  candles: Candle[];
}

class VolumeProfileRenderer implements IPrimitivePaneRenderer {
  private chart: IChartApi;
  private series: ISeriesApi<SeriesType, Time>;
  private config: VolumeProfileConfig;

  constructor(
    chart: IChartApi,
    series: ISeriesApi<SeriesType, Time>,
    config: VolumeProfileConfig
  ) {
    this.chart = chart;
    this.series = series;
    this.config = config;
  }

  draw(target: CanvasRenderingTarget2D): void {
    if (!this.config.enabled || this.config.candles.length === 0) return;

    const range = this.chart.timeScale().getVisibleLogicalRange();
    if (!range) return;

    const startIdx = Math.max(0, Math.floor(range.from));
    const endIdx = Math.min(this.config.candles.length - 1, Math.ceil(range.to));
    if (endIdx <= startIdx) return;

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (let i = startIdx; i <= endIdx; i++) {
      const c = this.config.candles[i];
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }
    if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) return;

    const rows = Math.max(8, Math.min(60, this.config.rows || 24));
    const step = (maxPrice - minPrice) / rows;
    const bins = new Array<number>(rows).fill(0);

    for (let i = startIdx; i <= endIdx; i++) {
      const c = this.config.candles[i];
      const typical = (c.high + c.low + c.close) / 3;
      const bin = Math.min(rows - 1, Math.max(0, Math.floor((typical - minPrice) / step)));
      bins[bin] += c.volume;
    }

    let maxVol = 0;
    let pocBin = 0;
    for (let b = 0; b < rows; b++) {
      if (bins[b] > maxVol) {
        maxVol = bins[b];
        pocBin = b;
      }
    }
    if (maxVol <= 0) return;

    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const maxBarWidth = Math.min(140, mediaSize.width * 0.22);
      ctx.save();
      for (let b = 0; b < rows; b++) {
        const lowP = minPrice + b * step;
        const highP = lowP + step;
        const y1 = this.series.priceToCoordinate(highP);
        const y2 = this.series.priceToCoordinate(lowP);
        if (y1 === null || y2 === null) continue;
        const top = Math.min(y1, y2);
        const bh = Math.max(1, Math.abs(y2 - y1) - 1);
        const bw = (bins[b] / maxVol) * maxBarWidth;
        const isPoc = b === pocBin;

        ctx.fillStyle = isPoc ? this.config.pocColor : this.config.barColor;
        ctx.globalAlpha = isPoc ? 0.55 : 0.28;
        ctx.fillRect(mediaSize.width - bw, top, bw, bh);

        if (isPoc) {
          ctx.globalAlpha = 0.75;
          ctx.strokeStyle = this.config.pocColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, top + bh / 2);
          ctx.lineTo(mediaSize.width, top + bh / 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }
}

class VolumeProfilePaneView implements IPrimitivePaneView {
  private r: VolumeProfileRenderer;
  constructor(r: VolumeProfileRenderer) {
    this.r = r;
  }
  zOrder(): PrimitivePaneViewZOrder {
    return 'bottom';
  }
  renderer(): IPrimitivePaneRenderer | null {
    return this.r;
  }
}

export class VolumeProfilePrimitive implements ISeriesPrimitive<Time> {
  private chart: IChartApi | null = null;
  private series: ISeriesApi<SeriesType, Time> | null = null;
  private requestUpdate: (() => void) | null = null;
  private config: VolumeProfileConfig;
  private view: VolumeProfilePaneView | null = null;

  constructor(config: VolumeProfileConfig) {
    this.config = config;
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
    this.view = null;
  }

  setConfig(next: VolumeProfileConfig): void {
    this.config = next;
    this.updateAllViews();
    this.requestUpdate?.();
  }

  updateAllViews(): void {
    if (!this.chart || !this.series) return;
    this.view = new VolumeProfilePaneView(
      new VolumeProfileRenderer(this.chart, this.series, this.config)
    );
  }

  paneViews(): readonly IPrimitivePaneView[] {
    return this.view ? [this.view] : [];
  }
}
