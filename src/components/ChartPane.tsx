import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  createChart,
  createTextWatermark,
  CrosshairMode,
  HistogramSeries,
  IChartApi,
  ISeriesApi,
  ITextWatermarkPluginApi,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  SeriesType,
  Time,
} from 'lightweight-charts';
import { Eye, EyeOff, Settings, X } from 'lucide-react';
import { DrawingManagerPrimitive } from '../drawings/DrawingPrimitive';
import {
  anchorToPixel,
  constrainAnglePoint,
  hitTestDrawings,
  PixelPoint,
  pixelToAnchor,
  xToTime,
} from '../drawings/geometry';
import { createDefaultDrawingObject, getToolMeta } from '../drawings/toolMeta';
import { VolumeProfilePrimitive } from '../drawings/VolumeProfilePrimitive';
import { IncrementalIndicatorCache } from '../indicators/math';
import { getDataProvider } from '../services/dataProviders';
import { useTerminalStore } from '../store/useTerminalStore';
import {
  AnchorPoint,
  Candle,
  ChartPaneInstance,
  ChartType,
  DrawingObject,
  ScaleMode,
} from '../types/chart';
import { registerChartPane, unregisterChartPane } from '../utils/chartRegistry';
import {
  computeHeikinAshi,
  formatPercent,
  formatPrice,
  formatVolume,
  getCandleCountdown,
  getPricePrecision,
  TIMEFRAME_SECONDS,
} from '../utils/format';

interface ChartPaneProps {
  pane: ChartPaneInstance;
  isActive: boolean;
  totalPanes: number;
}

const SCALE_MODE_MAP: Record<ScaleMode, PriceScaleMode> = {
  normal: PriceScaleMode.Normal,
  logarithmic: PriceScaleMode.Logarithmic,
  percentage: PriceScaleMode.Percentage,
  indexedTo100: PriceScaleMode.IndexedTo100,
};

function mapLineStyle(style: 'solid' | 'dashed' | 'dotted'): LineStyle {
  if (style === 'dashed') return LineStyle.Dashed;
  if (style === 'dotted') return LineStyle.Dotted;
  return LineStyle.Solid;
}

function normalizeCandles(list: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const c of list) {
    if (
      !c ||
      !Number.isFinite(c.time) ||
      !Number.isFinite(c.open) ||
      !Number.isFinite(c.high) ||
      !Number.isFinite(c.low) ||
      !Number.isFinite(c.close)
    ) {
      continue;
    }
    byTime.set(c.time, {
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: Number.isFinite(c.volume) ? c.volume : 0,
    });
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

export const ChartPane: React.FC<ChartPaneProps> = ({ pane, isActive, totalPanes }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainSeriesRef = useRef<ISeriesApi<SeriesType, Time> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram', Time> | null>(null);
  const watermarkRef = useRef<ITextWatermarkPluginApi<Time> | null>(null);
  const drawingPrimitiveRef = useRef<DrawingManagerPrimitive | null>(null);
  const vpPrimitiveRef = useRef<VolumeProfilePrimitive | null>(null);
  const indicatorSeriesMapRef = useRef<Map<string, ISeriesApi<SeriesType, Time>[]>>(new Map());
  const indicatorCacheRef = useRef<IncrementalIndicatorCache>(new IncrementalIndicatorCache());

  const candlesRef = useRef<Candle[]>([]);
  const loadingOlderRef = useRef(false);
  const noMoreOlderRef = useRef(false);
  const rafTickRef = useRef<number | null>(null);
  const pendingTickRef = useRef<{ candle: Candle; isClosed: boolean } | null>(null);

  // Drawing interaction state
  const draftDrawingRef = useRef<DrawingObject | null>(null);
  const brushPointsRef = useRef<AnchorPoint[]>([]);
  const isDrawingBrushRef = useRef(false);
  const dragStateRef = useRef<{
    mode: 'handle' | 'body' | 'zoom';
    drawingId?: string;
    handleIndex?: number;
    startPx: PixelPoint;
    startAnchor: AnchorPoint;
    originalAnchors?: AnchorPoint[];
    beforeSnapshot?: DrawingObject[];
  } | null>(null);
  const zoomBoxRef = useRef<{ start: PixelPoint; end: PixelPoint } | null>(null);
  const hoveredDrawingIdRef = useRef<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<string>('--:--');
  const [lastPriceY, setLastPriceY] = useState<number | null>(null);
  const [hoveredCandle, setHoveredCandle] = useState<{
    candle: Candle;
    prevClose: number | null;
    indValues: Record<string, Record<string, number | null>>;
  } | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    price: number;
  } | null>(null);
  const [paneHeights, setPaneHeights] = useState<number[]>([]);

  const theme = useTerminalStore((s) => s.theme);
  const chartSettings = useTerminalStore((s) => s.chartSettings);
  const activeTool = useTerminalStore((s) => s.activeTool);
  const magnetMode = useTerminalStore((s) => s.magnetMode);
  const lockAllDrawings = useTerminalStore((s) => s.lockAllDrawings);
  const hideAllDrawings = useTerminalStore((s) => s.hideAllDrawings);
  const selectedDrawingId = useTerminalStore((s) => s.selectedDrawingId);
  const drawingsBySymbol = useTerminalStore((s) => s.drawingsBySymbol);
  const sync = useTerminalStore((s) => s.sync);
  const syncedCrosshairTime = useTerminalStore((s) => s.syncedCrosshairTime);
  const replay = useTerminalStore((s) => s.replay);
  const connectionStatus = useTerminalStore((s) => s.connectionStatusByPane[pane.id] || 'offline');

  const setActivePane = useTerminalStore((s) => s.setActivePane);
  const setPaneConnectionStatus = useTerminalStore((s) => s.setPaneConnectionStatus);
  const setPaneCandles = useTerminalStore((s) => s.setPaneCandles);
  const setPaneCrosshair = useTerminalStore((s) => s.setPaneCrosshair);
  const setSyncedCrosshairTime = useTerminalStore((s) => s.setSyncedCrosshairTime);
  const setSelectedDrawingId = useTerminalStore((s) => s.setSelectedDrawingId);
  const addDrawing = useTerminalStore((s) => s.addDrawing);
  const updateDrawing = useTerminalStore((s) => s.updateDrawing);
  const commitDrawingSnapshot = useTerminalStore((s) => s.commitDrawingSnapshot);
  const removeDrawing = useTerminalStore((s) => s.removeDrawing);
  const updateIndicator = useTerminalStore((s) => s.updateIndicator);
  const removeIndicator = useTerminalStore((s) => s.removeIndicator);
  const setEditingIndicatorId = useTerminalStore((s) => s.setEditingIndicatorId);
  const setEditingDrawingTextId = useTerminalStore((s) => s.setEditingDrawingTextId);
  const setAlertsModalOpen = useTerminalStore((s) => s.setAlertsModalOpen);
  const setSettingsModalOpen = useTerminalStore((s) => s.setSettingsModalOpen);
  const setActiveTool = useTerminalStore((s) => s.setActiveTool);
  const evaluateAlertsForPrice = useTerminalStore((s) => s.evaluateAlertsForPrice);
  const enterReplayAtIndex = useTerminalStore((s) => s.enterReplayAtIndex);
  const pushToast = useTerminalStore((s) => s.pushToast);

  const symbolKey = pane.symbol.symbol;
  const drawings = useMemo(
    () => drawingsBySymbol[symbolKey] || [],
    [drawingsBySymbol, symbolKey]
  );

  const chartTypeRef = useRef(pane.chartType);
  chartTypeRef.current = pane.chartType;
  const chartSettingsRef = useRef(chartSettings);
  chartSettingsRef.current = chartSettings;
  const indicatorsRef = useRef(pane.indicators);
  indicatorsRef.current = pane.indicators;

  // Active candles considering Bar Replay mode on the active pane
  const getVisibleCandles = (): Candle[] => {
    if (isActive && replay.active && replay.fullCandles.length > 0) {
      return replay.fullCandles.slice(0, replay.currentIndex + 1);
    }
    return candlesRef.current;
  };

  // Helper to sync drawing primitive state immediately
  const syncDrawingPrimitive = () => {
    const prim = drawingPrimitiveRef.current;
    if (!prim) return;
    prim.setState({
      drawings: useTerminalStore.getState().drawingsBySymbol[symbolKey] || [],
      draftDrawing: draftDrawingRef.current,
      zoomBox: zoomBoxRef.current,
      selectedId: useTerminalStore.getState().selectedDrawingId,
      hoveredId: hoveredDrawingIdRef.current,
      hideAll: useTerminalStore.getState().hideAllDrawings,
      candles: getVisibleCandles(),
      timeframe: pane.timeframe,
      theme: useTerminalStore.getState().theme,
    });
  };

  // Helper to compute all series data from candles + current chartType
  const pushSeriesData = (candles: Candle[], chartType: ChartType) => {
    const main = mainSeriesRef.current;
    const vol = volumeSeriesRef.current;
    if (!main || candles.length === 0) return;

    const precision = getPricePrecision(candles[candles.length - 1].close);
    main.applyOptions({
      priceFormat: {
        type: 'price',
        precision,
        minMove: Number((1 / Math.pow(10, precision)).toFixed(precision)),
      },
    });

    const sourceCandles = chartType === 'heikinAshi' ? computeHeikinAshi(candles) : candles;

    if (
      chartType === 'candlestick' ||
      chartType === 'hollow' ||
      chartType === 'bar' ||
      chartType === 'heikinAshi'
    ) {
      main.setData(
        sourceCandles.map((c) => ({
          time: c.time as Time,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else if (chartType === 'histogram') {
      main.setData(
        sourceCandles.map((c) => ({
          time: c.time as Time,
          value: c.close,
          color:
            c.close >= c.open ? chartSettings.upColor : chartSettings.downColor,
        }))
      );
    } else {
      main.setData(
        sourceCandles.map((c) => ({
          time: c.time as Time,
          value: c.close,
        }))
      );
    }

    if (vol) {
      if (chartSettings.showVolumeInMainPane) {
        vol.setData(
          candles.map((c) => ({
            time: c.time as Time,
            value: c.volume,
            color:
              c.close >= c.open
                ? `${chartSettings.upColor}66`
                : `${chartSettings.downColor}66`,
          }))
        );
      } else {
        vol.setData([]);
      }
    }

    // Update last price line color based on latest bar direction
    const last = candles[candles.length - 1];
    if (last) {
      const isUp = last.close >= last.open;
      main.applyOptions({
        priceLineColor: isUp ? chartSettings.upColor : chartSettings.downColor,
      });
      const py = main.priceToCoordinate(last.close);
      setLastPriceY(py);
    }
  };

  // Recompute and sync all indicator series
  const syncIndicators = (candles: Candle[]) => {
    const chart = chartRef.current;
    if (!chart) return;

    const activeIndicators = indicatorsRef.current.filter((ind) => {
      if (!ind.visible) return false;
      if (ind.timeframeVisibility !== 'all' && !ind.timeframeVisibility.includes(pane.timeframe)) {
        return false;
      }
      return true;
    });

    // Volume Profile primitive
    const vpInd = activeIndicators.find((i) => i.type === 'VOL_PROFILE');
    if (vpPrimitiveRef.current) {
      vpPrimitiveRef.current.setConfig({
        enabled: Boolean(vpInd),
        rows: vpInd?.params.rows ?? 24,
        barColor: vpInd?.colors.bar ?? '#2962FF',
        pocColor: vpInd?.colors.poc ?? '#FF9800',
        candles,
      });
    }

    // Remove series for deleted/hidden indicators
    const activeIds = new Set(activeIndicators.map((i) => i.id));
    for (const [indId, seriesArr] of indicatorSeriesMapRef.current.entries()) {
      if (!activeIds.has(indId)) {
        for (const s of seriesArr) {
          try {
            chart.removeSeries(s);
          } catch {
            // ignore already removed
          }
        }
        indicatorSeriesMapRef.current.delete(indId);
      }
    }

    // Ensure required panes exist
    const neededMaxPane = activeIndicators.reduce((m, i) => Math.max(m, i.paneIndex), 0);
    while (chart.panes().length <= neededMaxPane) {
      chart.addPane();
    }
    while (chart.panes().length > neededMaxPane + 1) {
      chart.removePane(chart.panes().length - 1);
    }

    // Balance pane heights nicely when panes are added
    const allPanes = chart.panes();
    if (allPanes.length > 1) {
      allPanes[0].setStretchFactor(3);
      for (let i = 1; i < allPanes.length; i++) {
        allPanes[i].setStretchFactor(1);
      }
    }

    // Update each active indicator
    for (const ind of activeIndicators) {
      if (ind.type === 'VOL_PROFILE') continue;
      const computed = indicatorCacheRef.current.getOrCompute(candles, ind);
      const lineKeys = Object.keys(computed.lines);
      const histKeys = Object.keys(computed.histograms);
      const totalSubSeries = lineKeys.length + histKeys.length;

      let existing = indicatorSeriesMapRef.current.get(ind.id);
      if (!existing || existing.length !== totalSubSeries) {
        if (existing) {
          for (const s of existing) {
            try {
              chart.removeSeries(s);
            } catch {
              // ignore
            }
          }
        }
        existing = [];
        for (const k of lineKeys) {
          const isDots = ind.type === 'PSAR';
          const s = chart.addSeries(
            LineSeries,
            {
              color: ind.colors[k] || ind.colors.main || '#2962FF',
              lineWidth: (Math.min(4, Math.max(1, ind.lineWidth)) as 1 | 2 | 3 | 4),
              lineVisible: !isDots,
              pointMarkersVisible: isDots,
              pointMarkersRadius: isDots ? 2 : 0,
              priceLineVisible: false,
              lastValueVisible: ind.paneIndex > 0,
              crosshairMarkerVisible: false,
            },
            ind.paneIndex
          );
          existing.push(s as ISeriesApi<SeriesType, Time>);
        }
        for (const k of histKeys) {
          const s = chart.addSeries(
            HistogramSeries,
            {
              color: ind.colors[k] || ind.colors.up || '#26A69A',
              priceLineVisible: false,
              lastValueVisible: false,
              priceFormat: ind.type === 'VOL' || ind.type === 'VOL_MA' ? { type: 'volume' } : undefined,
            },
            ind.paneIndex
          );
          existing.push(s as ISeriesApi<SeriesType, Time>);
        }
        indicatorSeriesMapRef.current.set(ind.id, existing);
      }

      // Push data to each sub-series
      let ptr = 0;
      for (const k of lineKeys) {
        const s = existing[ptr++] as ISeriesApi<'Line', Time>;
        s.applyOptions({
          color: ind.colors[k] || ind.colors.main || '#2962FF',
          lineWidth: (Math.min(4, Math.max(1, ind.lineWidth)) as 1 | 2 | 3 | 4),
        });
        s.setData(
          computed.lines[k].map((pt) => ({ time: pt.time as Time, value: pt.value }))
        );
      }
      for (const k of histKeys) {
        const s = existing[ptr++] as ISeriesApi<'Histogram', Time>;
        s.setData(
          computed.histograms[k].map((pt) => ({
            time: pt.time as Time,
            value: pt.value,
            color: pt.color,
          }))
        );
      }
    }

    setPaneHeights(chart.panes().map((p) => p.getHeight()));
  };

  // Initialize Chart instance and main series when pane.id, chartType, or scalePosition changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isDark = theme === 'dark';
    const textColor = isDark ? '#9CA3AF' : '#475569';
    const borderColor = isDark ? '#2A2E39' : '#E2E8F0';

    const chart = createChart(container, {
      autoSize: true,
      layout: {
        background:
          chartSettings.backgroundType === 'gradient'
            ? {
                type: ColorType.VerticalGradient,
                topColor: chartSettings.backgroundColor,
                bottomColor: chartSettings.backgroundGradientBottom,
              }
            : {
                type: ColorType.Solid,
                color: chartSettings.backgroundColor,
              },
        textColor,
        fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
        fontSize: 11,
        panes: {
          enableResize: true,
          separatorColor: borderColor,
          separatorHoverColor: 'rgba(41, 98, 255, 0.45)',
        },
      },
      grid: {
        vertLines: {
          color: chartSettings.gridVertColor,
          visible: chartSettings.showGridLines,
        },
        horzLines: {
          color: chartSettings.gridHorzColor,
          visible: chartSettings.showGridLines,
        },
      },
      crosshair: {
        mode:
          activeTool === 'cross' && magnetMode !== 'off'
            ? CrosshairMode.MagnetOHLC
            : activeTool === 'cross' || activeTool === 'dot' || activeTool === 'arrowCursor'
            ? CrosshairMode.Normal
            : CrosshairMode.Normal,
        vertLine: {
          color: isDark ? 'rgba(209, 212, 220, 0.35)' : 'rgba(15, 23, 42, 0.3)',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2962FF',
        },
        horzLine: {
          color: isDark ? 'rgba(209, 212, 220, 0.35)' : 'rgba(15, 23, 42, 0.3)',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#2962FF',
        },
      },
      leftPriceScale: {
        visible: chartSettings.scalePosition === 'left',
        borderColor,
        mode: SCALE_MODE_MAP[pane.scaleMode],
        autoScale: pane.autoScale,
      },
      rightPriceScale: {
        visible: chartSettings.scalePosition === 'right',
        borderColor,
        mode: SCALE_MODE_MAP[pane.scaleMode],
        autoScale: pane.autoScale,
      },
      timeScale: {
        borderColor,
        timeVisible: true,
        secondsVisible: pane.timeframe === '1s',
        rightOffset: 10,
        barSpacing: 7,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: true,
        pinch: true,
      },
    });

    chartRef.current = chart;

    // Create Main Series for selected chartType
    const priceScaleId = chartSettings.scalePosition;
    let mainSeries: ISeriesApi<SeriesType, Time>;

    switch (pane.chartType) {
      case 'hollow':
        mainSeries = chart.addSeries(CandlestickSeries, {
          priceScaleId,
          upColor: 'transparent',
          downColor: chartSettings.downColor,
          borderVisible: true,
          borderUpColor: chartSettings.borderUpColor,
          borderDownColor: chartSettings.borderDownColor,
          wickUpColor: chartSettings.wickUpColor,
          wickDownColor: chartSettings.wickDownColor,
        });
        break;
      case 'bar':
        mainSeries = chart.addSeries(BarSeries, {
          priceScaleId,
          upColor: chartSettings.upColor,
          downColor: chartSettings.downColor,
        });
        break;
      case 'line':
      case 'lineMarkers':
        mainSeries = chart.addSeries(LineSeries, {
          priceScaleId,
          color: '#2962FF',
          lineWidth: 2,
          pointMarkersVisible: pane.chartType === 'lineMarkers',
          pointMarkersRadius: pane.chartType === 'lineMarkers' ? 3 : 0,
        });
        break;
      case 'area':
        mainSeries = chart.addSeries(AreaSeries, {
          priceScaleId,
          lineColor: '#2962FF',
          topColor: 'rgba(41, 98, 255, 0.32)',
          bottomColor: 'rgba(41, 98, 255, 0.02)',
          lineWidth: 2,
        });
        break;
      case 'baseline': {
        const mid =
          candlesRef.current.length > 0
            ? candlesRef.current[Math.floor(candlesRef.current.length / 2)].close
            : 0;
        mainSeries = chart.addSeries(BaselineSeries, {
          priceScaleId,
          baseValue: { type: 'price', price: mid },
          topLineColor: chartSettings.upColor,
          topFillColor1: `${chartSettings.upColor}44`,
          topFillColor2: `${chartSettings.upColor}08`,
          bottomLineColor: chartSettings.downColor,
          bottomFillColor1: `${chartSettings.downColor}08`,
          bottomFillColor2: `${chartSettings.downColor}44`,
        });
        break;
      }
      case 'histogram':
        mainSeries = chart.addSeries(HistogramSeries, {
          priceScaleId,
          color: chartSettings.upColor,
        });
        break;
      case 'candlestick':
      case 'heikinAshi':
      default:
        mainSeries = chart.addSeries(CandlestickSeries, {
          priceScaleId,
          upColor: chartSettings.upColor,
          downColor: chartSettings.downColor,
          borderVisible: true,
          borderUpColor: chartSettings.borderUpColor,
          borderDownColor: chartSettings.borderDownColor,
          wickUpColor: chartSettings.wickUpColor,
          wickDownColor: chartSettings.wickDownColor,
        });
        break;
    }

    mainSeriesRef.current = mainSeries;

    // Volume overlay series in bottom 18% of main pane
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        lastValueVisible: false,
        priceLineVisible: false,
      },
      0
    );
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    // Watermark
    const watermark = createTextWatermark(chart.panes()[0], {
      horzAlign: 'center',
      vertAlign: 'center',
      lines: chartSettings.showWatermark
        ? [
            {
              text: `${pane.symbol.displaySymbol} · ${pane.timeframe}`,
              color: isDark ? 'rgba(209, 212, 220, 0.05)' : 'rgba(15, 23, 42, 0.05)',
              fontSize: 42,
              fontFamily: '"Plus Jakarta Sans", sans-serif',
              fontStyle: 'bold',
            },
          ]
        : [],
    });
    watermarkRef.current = watermark;

    // Attach custom primitives (Drawings + Volume Profile)
    const drawingPrim = new DrawingManagerPrimitive({
      drawings: useTerminalStore.getState().drawingsBySymbol[symbolKey] || [],
      draftDrawing: null,
      zoomBox: null,
      selectedId: useTerminalStore.getState().selectedDrawingId,
      hoveredId: null,
      hideAll: useTerminalStore.getState().hideAllDrawings,
      candles: getVisibleCandles(),
      timeframe: pane.timeframe,
      theme,
    });
    mainSeries.attachPrimitive(drawingPrim);
    drawingPrimitiveRef.current = drawingPrim;

    const vpPrim = new VolumeProfilePrimitive({
      enabled: false,
      rows: 24,
      barColor: '#2962FF',
      pocColor: '#FF9800',
      candles: getVisibleCandles(),
    });
    mainSeries.attachPrimitive(vpPrim);
    vpPrimitiveRef.current = vpPrim;

    // Crosshair move handler: updates OHLC legend, Data Window, and synced crosshairs
    chart.subscribeCrosshairMove((param) => {
      const candles = getVisibleCandles();
      if (!param.time || typeof param.time !== 'number') {
        setHoveredCandle(null);
        if (useTerminalStore.getState().sync.crosshair) {
          setSyncedCrosshairTime(null);
        }
        return;
      }
      const t = param.time;
      const idx = candles.findIndex((c) => c.time === t);
      if (idx !== -1) {
        const candle = candles[idx];
        const prevClose = idx > 0 ? candles[idx - 1].close : null;
        const indValues: Record<string, Record<string, number | null>> = {};
        for (const ind of pane.indicators) {
          const out = indicatorCacheRef.current.getOrCompute(candles, ind);
          const valsAtTime: Record<string, number | null> = {};
          for (const [k, pts] of Object.entries(out.lines)) {
            const found = pts.find((p) => p.time === t);
            valsAtTime[k] = found ? found.value : null;
          }
          for (const [k, pts] of Object.entries(out.histograms)) {
            const found = pts.find((p) => p.time === t);
            valsAtTime[k] = found ? found.value : null;
          }
          indValues[ind.name] = valsAtTime;
        }
        setHoveredCandle({ candle, prevClose, indValues });
        setPaneCrosshair(pane.id, { time: t, candle, prevClose, indicatorValues: indValues });
      }
      if (useTerminalStore.getState().sync.crosshair) {
        setSyncedCrosshairTime(t);
      }
    });

    // Click handler for Bar Replay start point selection
    chart.subscribeClick((param) => {
      const store = useTerminalStore.getState();
      if (store.replay.selectingStart && param.time && typeof param.time === 'number') {
        const idx = candlesRef.current.findIndex((c) => c.time === param.time);
        if (idx !== -1) {
          enterReplayAtIndex([...candlesRef.current], idx);
        }
      }
    });

    // Lazy-load older historical candles when scrolling left
    chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range) return;
      if (
        range.from < 20 &&
        !loadingOlderRef.current &&
        !noMoreOlderRef.current &&
        candlesRef.current.length > 0 &&
        !useTerminalStore.getState().replay.active
      ) {
        loadingOlderRef.current = true;
        const oldest = candlesRef.current[0];
        const provider = getDataProvider(pane.symbol.provider);
        provider
          .getHistory({
            symbol: pane.symbol.symbol,
            interval: pane.timeframe,
            limit: 500,
            endTimeMs: oldest.time * 1000 - 1,
          })
          .then((older) => {
            if (!older || older.length === 0) {
              noMoreOlderRef.current = true;
              return;
            }
            const existingTimes = new Set(candlesRef.current.map((c) => c.time));
            const uniqueOlder = older.filter((c) => !existingTimes.has(c.time));
            if (uniqueOlder.length === 0) {
              noMoreOlderRef.current = true;
              return;
            }
            const merged = normalizeCandles([...uniqueOlder, ...candlesRef.current]);
            candlesRef.current = merged;
            setPaneCandles(pane.id, merged);
            pushSeriesData(merged, chartTypeRef.current);
            syncIndicators(merged);
            syncDrawingPrimitive();
          })
          .catch(() => {
            // ignore transient lazy-load error
          })
          .finally(() => {
            loadingOlderRef.current = false;
          });
      }

      // Update countdown label position
      const last = candlesRef.current[candlesRef.current.length - 1];
      if (last && mainSeriesRef.current) {
        setLastPriceY(mainSeriesRef.current.priceToCoordinate(last.close));
      }
    });

    // Register pane actions for screenshots, CSV export, range presets
    registerChartPane(pane.id, {
      takeScreenshot: () => chart.takeScreenshot(),
      getCandles: () => getVisibleCandles(),
      getSymbol: () => pane.symbol.symbol,
      getTimeframe: () => pane.timeframe,
      applyRangeSeconds: (rangeVal) => {
        const list = getVisibleCandles();
        if (list.length === 0) return;
        if (rangeVal === 'ALL') {
          chart.timeScale().fitContent();
          return;
        }
        const lastT = list[list.length - 1].time;
        let fromT: number;
        if (rangeVal === 'YTD') {
          const nowDate = new Date(lastT * 1000);
          fromT = Math.floor(Date.UTC(nowDate.getUTCFullYear(), 0, 1) / 1000);
        } else {
          fromT = lastT - rangeVal;
        }
        chart.timeScale().setVisibleRange({
          from: Math.max(list[0].time, fromT) as Time,
          to: lastT as Time,
        });
      },
      resetView: () => {
        chart.timeScale().fitContent();
        chart.priceScale(priceScaleId).applyOptions({ autoScale: true });
      },
    });

    // Push existing candles immediately if switching chart type without reloading data
    const visible = getVisibleCandles();
    if (visible.length > 0) {
      pushSeriesData(visible, pane.chartType);
      syncIndicators(visible);
      syncDrawingPrimitive();
    }

    const ro = new ResizeObserver(() => {
      if (chartRef.current) {
        setPaneHeights(chartRef.current.panes().map((p) => p.getHeight()));
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      unregisterChartPane(pane.id);
      indicatorSeriesMapRef.current.clear();
      chart.remove();
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
      drawingPrimitiveRef.current = null;
      vpPrimitiveRef.current = null;
      watermarkRef.current = null;
    };
  }, [pane.id, pane.chartType, chartSettings.scalePosition]);

  // Apply dynamic visual settings without recreating the chart
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main) return;
    const isDark = theme === 'dark';
    const textColor = isDark ? '#9CA3AF' : '#475569';
    const borderColor = isDark ? '#2A2E39' : '#E2E8F0';

    chart.applyOptions({
      layout: {
        background:
          chartSettings.backgroundType === 'gradient'
            ? {
                type: ColorType.VerticalGradient,
                topColor: chartSettings.backgroundColor,
                bottomColor: chartSettings.backgroundGradientBottom,
              }
            : {
                type: ColorType.Solid,
                color: chartSettings.backgroundColor,
              },
        textColor,
      },
      grid: {
        vertLines: {
          color: chartSettings.gridVertColor,
          visible: chartSettings.showGridLines,
        },
        horzLines: {
          color: chartSettings.gridHorzColor,
          visible: chartSettings.showGridLines,
        },
      },
      crosshair: {
        mode:
          magnetMode !== 'off'
            ? CrosshairMode.MagnetOHLC
            : CrosshairMode.Normal,
      },
      leftPriceScale: {
        visible: chartSettings.scalePosition === 'left',
        borderColor,
        mode: SCALE_MODE_MAP[pane.scaleMode],
        autoScale: pane.autoScale,
      },
      rightPriceScale: {
        visible: chartSettings.scalePosition === 'right',
        borderColor,
        mode: SCALE_MODE_MAP[pane.scaleMode],
        autoScale: pane.autoScale,
      },
      timeScale: {
        borderColor,
        secondsVisible: pane.timeframe === '1s',
      },
    });

    if (
      pane.chartType === 'candlestick' ||
      pane.chartType === 'heikinAshi' ||
      pane.chartType === 'hollow'
    ) {
      main.applyOptions({
        upColor: pane.chartType === 'hollow' ? 'transparent' : chartSettings.upColor,
        downColor: chartSettings.downColor,
        borderUpColor: chartSettings.borderUpColor,
        borderDownColor: chartSettings.borderDownColor,
        wickUpColor: chartSettings.wickUpColor,
        wickDownColor: chartSettings.wickDownColor,
      });
    }

    if (watermarkRef.current) {
      watermarkRef.current.applyOptions({
        lines: chartSettings.showWatermark
          ? [
              {
                text: `${pane.symbol.displaySymbol} · ${pane.timeframe}`,
                color: isDark ? 'rgba(209, 212, 220, 0.05)' : 'rgba(15, 23, 42, 0.05)',
                fontSize: 42,
                fontFamily: '"Plus Jakarta Sans", sans-serif',
                fontStyle: 'bold',
              },
            ]
          : [],
      });
    }

    const visible = getVisibleCandles();
    if (visible.length > 0) {
      pushSeriesData(visible, pane.chartType);
    }
    syncDrawingPrimitive();
  }, [theme, chartSettings, pane.scaleMode, pane.autoScale, pane.timeframe, pane.symbol.displaySymbol, magnetMode]);

  // Load history + subscribe to real-time WebSocket when symbol or timeframe changes
  useEffect(() => {
    let cancelled = false;
    let unsubscribe = () => {};

    candlesRef.current = [];
    noMoreOlderRef.current = false;
    loadingOlderRef.current = false;
    indicatorCacheRef.current.clear();
    setIsLoading(true);
    setLoadError(null);
    setPaneConnectionStatus(pane.id, 'reconnecting', null);

    const provider = getDataProvider(pane.symbol.provider);

    provider
      .getHistory({
        symbol: pane.symbol.symbol,
        interval: pane.timeframe,
        limit: 1000,
      })
      .then((rawHistory) => {
        if (cancelled) return;
        const history = normalizeCandles(rawHistory);
        candlesRef.current = history;
        setPaneCandles(pane.id, history);
        pushSeriesData(history, chartTypeRef.current);
        syncIndicators(history);
        syncDrawingPrimitive();
        if (chartRef.current && history.length > 0) {
          const bars = Math.min(history.length, 160);
          chartRef.current.timeScale().setVisibleLogicalRange({
            from: history.length - bars,
            to: history.length + 8,
          });
        }
        setIsLoading(false);

        // Start real-time WebSocket subscription
        unsubscribe = provider.subscribe(pane.symbol.symbol, pane.timeframe, {
          onStatus: (status, msg) => {
            if (!cancelled) {
              setPaneConnectionStatus(pane.id, status, msg ?? null);
            }
          },
          onCandle: (incoming, isClosed) => {
            if (cancelled) return;
            // Pause live pushes while Bar Replay is active on this pane
            if (isActive && useTerminalStore.getState().replay.active) return;

            pendingTickRef.current = { candle: incoming, isClosed };
            if (rafTickRef.current === null) {
              rafTickRef.current = requestAnimationFrame(() => {
                rafTickRef.current = null;
                const tick = pendingTickRef.current;
                pendingTickRef.current = null;
                if (!tick || cancelled) return;

                const incomingCandle = tick.candle;
                if (
                  !Number.isFinite(incomingCandle.time) ||
                  !Number.isFinite(incomingCandle.open) ||
                  !Number.isFinite(incomingCandle.high) ||
                  !Number.isFinite(incomingCandle.low) ||
                  !Number.isFinite(incomingCandle.close)
                ) {
                  return;
                }

                const arr = candlesRef.current;
                const last = arr[arr.length - 1];
                // Never update with a candle older than the latest bar (lightweight-charts rejects time < last.time)
                if (last && incomingCandle.time < last.time) {
                  return;
                }

                const prevPrice = last ? last.close : incomingCandle.open;
                const prevTime = last ? last.time : incomingCandle.time;
                const wasEmpty = arr.length === 0;

                const sanitizedCandle: Candle = {
                  ...incomingCandle,
                  volume: Number.isFinite(incomingCandle.volume) ? incomingCandle.volume : 0,
                };

                if (!last || sanitizedCandle.time > last.time) {
                  arr.push(sanitizedCandle);
                } else {
                  arr[arr.length - 1] = sanitizedCandle;
                }

                const activeChartType = chartTypeRef.current;
                const activeSettings = chartSettingsRef.current;

                // Update chart incrementally via series.update() for 60fps performance
                const main = mainSeriesRef.current;
                const vol = volumeSeriesRef.current;
                if (main) {
                  if (wasEmpty) {
                    pushSeriesData(arr, activeChartType);
                  } else {
                    try {
                      if (
                        activeChartType === 'candlestick' ||
                        activeChartType === 'hollow' ||
                        activeChartType === 'bar'
                      ) {
                        main.update({
                          time: sanitizedCandle.time as Time,
                          open: sanitizedCandle.open,
                          high: sanitizedCandle.high,
                          low: sanitizedCandle.low,
                          close: sanitizedCandle.close,
                        });
                      } else if (activeChartType === 'heikinAshi') {
                        const ha = computeHeikinAshi(arr);
                        const lastHa = ha[ha.length - 1];
                        if (lastHa) {
                          main.update({
                            time: lastHa.time as Time,
                            open: lastHa.open,
                            high: lastHa.high,
                            low: lastHa.low,
                            close: lastHa.close,
                          });
                        }
                      } else if (activeChartType === 'histogram') {
                        main.update({
                          time: sanitizedCandle.time as Time,
                          value: sanitizedCandle.close,
                          color:
                            sanitizedCandle.close >= sanitizedCandle.open
                              ? activeSettings.upColor
                              : activeSettings.downColor,
                        });
                      } else {
                        main.update({
                          time: sanitizedCandle.time as Time,
                          value: sanitizedCandle.close,
                        });
                      }

                      if (vol && activeSettings.showVolumeInMainPane) {
                        vol.update({
                          time: sanitizedCandle.time as Time,
                          value: sanitizedCandle.volume,
                          color:
                            sanitizedCandle.close >= sanitizedCandle.open
                              ? `${activeSettings.upColor}66`
                              : `${activeSettings.downColor}66`,
                        });
                      }
                    } catch {
                      // Fallback to full series sync if series state was reset
                      pushSeriesData(arr, activeChartType);
                    }
                  }

                  const isUp = sanitizedCandle.close >= sanitizedCandle.open;
                  main.applyOptions({
                    priceLineColor: isUp ? activeSettings.upColor : activeSettings.downColor,
                  });
                  setLastPriceY(main.priceToCoordinate(sanitizedCandle.close));
                }

                setPaneCandles(pane.id, arr);
                syncIndicators(arr);
                syncDrawingPrimitive();
                evaluateAlertsForPrice(
                  pane.symbol.symbol,
                  prevPrice,
                  sanitizedCandle.close,
                  prevTime,
                  sanitizedCandle.time
                );
              });
            }
          },
        });
      })
      .catch((err) => {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Failed to load market data';
        setLoadError(msg);
        setIsLoading(false);
        setPaneConnectionStatus(pane.id, 'offline', msg);
      });

    return () => {
      cancelled = true;
      if (rafTickRef.current !== null) {
        cancelAnimationFrame(rafTickRef.current);
        rafTickRef.current = null;
      }
      unsubscribe();
    };
  }, [pane.id, pane.symbol.symbol, pane.symbol.provider, pane.timeframe]);

  // Sync indicators whenever indicator list/config changes
  useEffect(() => {
    const visible = getVisibleCandles();
    if (visible.length > 0) {
      syncIndicators(visible);
    }
  }, [pane.indicators]);

  // Sync Replay slice when Bar Replay advances
  useEffect(() => {
    if (!isActive) return;
    if (replay.active && replay.fullCandles.length > 0) {
      const sliced = replay.fullCandles.slice(0, replay.currentIndex + 1);
      pushSeriesData(sliced, pane.chartType);
      syncIndicators(sliced);
      syncDrawingPrimitive();
    } else if (!replay.active && candlesRef.current.length > 0) {
      pushSeriesData(candlesRef.current, pane.chartType);
      syncIndicators(candlesRef.current);
      syncDrawingPrimitive();
    }
  }, [isActive, replay.active, replay.currentIndex]);

  // Sync drawings primitive whenever drawings / selection / visibility / theme change
  useEffect(() => {
    syncDrawingPrimitive();
  }, [drawings, selectedDrawingId, hideAllDrawings, theme]);

  // Sync crosshair across panes when another pane moves
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainSeriesRef.current;
    if (!chart || !main || !sync.crosshair) return;
    if (isActive) return; // Active pane drives the crosshair
    if (syncedCrosshairTime === null) {
      chart.clearCrosshairPosition();
      return;
    }
    const candles = candlesRef.current;
    const match = candles.find((c) => c.time === syncedCrosshairTime);
    if (match) {
      try {
        chart.setCrosshairPosition(match.close, match.time as Time, main);
      } catch {
        // ignore if time not in scale range
      }
    }
  }, [syncedCrosshairTime, sync.crosshair, isActive]);

  // Live 1-second candle close countdown timer
  useEffect(() => {
    const updateTimer = () => {
      const visible = getVisibleCandles();
      const last = visible[visible.length - 1];
      setCountdown(getCandleCountdown(last?.time, pane.timeframe));
    };
    updateTimer();
    const id = setInterval(updateTimer, 1000);
    return () => clearInterval(id);
  }, [pane.timeframe, replay.active, replay.currentIndex]);

  // Interactive Drawing & Zoom-box Mouse Handlers
  const getRelativePoint = (e: React.PointerEvent<HTMLDivElement>): PixelPoint => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setActivePane(pane.id);
    setContextMenu(null);
    if (e.button !== 0) return;

    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    // Ignore clicks in the price scale or time scale gutters
    const rect = e.currentTarget.getBoundingClientRect();
    const px = getRelativePoint(e);
    const rightAxisW = chart.priceScale('right').width();
    const leftAxisW = chart.priceScale('left').width();
    if (px.x < leftAxisW || px.x > rect.width - rightAxisW || px.y > rect.height - 28) {
      return;
    }

    const candles = getVisibleCandles();
    if (candles.length === 0) return;

    if (replay.selectingStart) return;

    const tool = activeTool;

    // 1. Eraser tool
    if (tool === 'eraser') {
      const hit = hitTestDrawings(
        drawings,
        px,
        chart,
        series,
        candles,
        pane.timeframe,
        rect.width,
        rect.height
      );
      if (hit) {
        removeDrawing(symbolKey, hit.drawingId);
      }
      return;
    }

    // 2. Zoom-in box tool
    if (tool === 'zoomIn') {
      chart.applyOptions({ handleScroll: false, handleScale: false });
      zoomBoxRef.current = { start: px, end: px };
      dragStateRef.current = {
        mode: 'zoom',
        startPx: px,
        startAnchor: { time: 0, price: 0 },
      };
      syncDrawingPrimitive();
      return;
    }

    // 3. Selection / Dragging mode (cross / dot / arrowCursor)
    if (tool === 'cross' || tool === 'dot' || tool === 'arrowCursor') {
      const hit = hitTestDrawings(
        drawings,
        px,
        chart,
        series,
        candles,
        pane.timeframe,
        rect.width,
        rect.height
      );

      if (hit) {
        setSelectedDrawingId(hit.drawingId);
        const drv = drawings.find((d) => d.id === hit.drawingId);
        if (drv && !drv.locked && !lockAllDrawings) {
          const anchor = pixelToAnchor(chart, series, candles, px.x, px.y, pane.timeframe, 'off');
          if (anchor) {
            chart.applyOptions({ handleScroll: false, handleScale: false });
            dragStateRef.current = {
              mode: hit.part,
              drawingId: drv.id,
              handleIndex: hit.handleIndex,
              startPx: px,
              startAnchor: anchor,
              originalAnchors: drv.anchors.map((a) => ({ ...a })),
              beforeSnapshot: JSON.parse(JSON.stringify(drawings)),
            };
          }
        }
      } else {
        setSelectedDrawingId(null);
      }
      return;
    }

    // 4. Drawing creation mode
    const anchor = pixelToAnchor(chart, series, candles, px.x, px.y, pane.timeframe, magnetMode);
    if (!anchor) return;

    const meta = getToolMeta(tool);
    const maxZ = drawings.reduce((m, d) => Math.max(m, d.zIndex), 0);

    // Freehand Brush
    if (tool === 'brush') {
      chart.applyOptions({ handleScroll: false, handleScale: false });
      isDrawingBrushRef.current = true;
      brushPointsRef.current = [anchor];
      draftDrawingRef.current = createDefaultDrawingObject(tool, symbolKey, [anchor], maxZ + 1);
      syncDrawingPrimitive();
      return;
    }

    // Multi-point Polyline
    if (tool === 'polyline') {
      if (!draftDrawingRef.current) {
        draftDrawingRef.current = createDefaultDrawingObject(tool, symbolKey, [anchor, anchor], maxZ + 1);
      } else {
        const nextAnchors = [...draftDrawingRef.current.anchors.slice(0, -1), anchor, anchor];
        draftDrawingRef.current = { ...draftDrawingRef.current, anchors: nextAnchors };
      }
      syncDrawingPrimitive();
      return;
    }

    // 1-anchor tools (including smart Long/Short Position with 3 draggable handles!)
    if (meta.anchors === 1) {
      if (tool === 'longPosition' || tool === 'shortPosition') {
        const isLong = tool === 'longPosition';
        const barSec = TIMEFRAME_SECONDS[pane.timeframe] || 60;
        const endT = anchor.time + barSec * 18;
        const tp = isLong ? anchor.price * 1.02 : anchor.price * 0.98;
        const sl = isLong ? anchor.price * 0.99 : anchor.price * 1.01;
        const created = createDefaultDrawingObject(
          tool,
          symbolKey,
          [
            anchor,
            { time: endT, price: tp },
            { time: endT, price: sl },
          ],
          maxZ + 1
        );
        addDrawing(symbolKey, created);
      } else {
        const created = createDefaultDrawingObject(tool, symbolKey, [anchor], maxZ + 1);
        addDrawing(symbolKey, created);
        if (tool === 'text' || tool === 'note' || tool === 'flag') {
          setEditingDrawingTextId(created.id);
        }
      }
      return;
    }

    // 2-anchor or 3-anchor tools
    if (!draftDrawingRef.current) {
      draftDrawingRef.current = createDefaultDrawingObject(
        tool,
        symbolKey,
        [anchor, anchor],
        maxZ + 1
      );
      syncDrawingPrimitive();
      return;
    }

    const currentDraft = draftDrawingRef.current;
    if (meta.anchors === 2) {
      let finalAnchor = anchor;
      if (e.shiftKey) {
        const p0 = anchorToPixel(chart, series, candles, currentDraft.anchors[0], pane.timeframe);
        if (p0) {
          const snappedPx = constrainAnglePoint(p0, px);
          finalAnchor =
            pixelToAnchor(chart, series, candles, snappedPx.x, snappedPx.y, pane.timeframe, magnetMode) ||
            anchor;
        }
      }
      const finalized: DrawingObject = {
        ...currentDraft,
        anchors: [currentDraft.anchors[0], finalAnchor],
      };
      draftDrawingRef.current = null;
      addDrawing(symbolKey, finalized);
      if (tool === 'callout') {
        setEditingDrawingTextId(finalized.id);
      }
      return;
    }

    // 3-anchor tools
    if (meta.anchors === 3) {
      if (currentDraft.anchors.length === 2) {
        draftDrawingRef.current = {
          ...currentDraft,
          anchors: [currentDraft.anchors[0], anchor, anchor],
        };
        syncDrawingPrimitive();
      } else {
        const finalized: DrawingObject = {
          ...currentDraft,
          anchors: [currentDraft.anchors[0], currentDraft.anchors[1], anchor],
        };
        draftDrawingRef.current = null;
        addDrawing(symbolKey, finalized);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;
    const px = getRelativePoint(e);
    const candles = getVisibleCandles();
    const rect = e.currentTarget.getBoundingClientRect();

    // Dragging zoom box
    if (dragStateRef.current?.mode === 'zoom' && zoomBoxRef.current) {
      zoomBoxRef.current = { ...zoomBoxRef.current, end: px };
      syncDrawingPrimitive();
      return;
    }

    // Dragging an existing drawing handle or body
    if (dragStateRef.current && dragStateRef.current.drawingId && dragStateRef.current.originalAnchors) {
      const st = dragStateRef.current;
      const drawingId = st.drawingId!;
      const originalAnchors = st.originalAnchors!;
      const curAnchor = pixelToAnchor(
        chart,
        series,
        candles,
        px.x,
        px.y,
        pane.timeframe,
        st.mode === 'handle' ? magnetMode : 'off'
      );
      if (!curAnchor) return;

      let nextAnchors: AnchorPoint[];
      if (st.mode === 'handle' && st.handleIndex !== undefined && st.handleIndex >= 0) {
        nextAnchors = originalAnchors.map((a, idx) =>
          idx === st.handleIndex ? curAnchor : a
        );
      } else {
        const dt = curAnchor.time - st.startAnchor.time;
        const dp = curAnchor.price - st.startAnchor.price;
        nextAnchors = originalAnchors.map((a) => ({
          time: a.time + dt,
          price: a.price + dp,
        }));
      }
      updateDrawing(symbolKey, drawingId, { anchors: nextAnchors }, false);
      return;
    }

    // Drawing brush freehand
    if (isDrawingBrushRef.current && draftDrawingRef.current) {
      const anchor = pixelToAnchor(chart, series, candles, px.x, px.y, pane.timeframe, 'off');
      if (anchor) {
        brushPointsRef.current.push(anchor);
        draftDrawingRef.current = {
          ...draftDrawingRef.current,
          anchors: [...brushPointsRef.current],
        };
        syncDrawingPrimitive();
      }
      return;
    }

    // Live preview of draft anchor
    if (draftDrawingRef.current) {
      let anchor = pixelToAnchor(chart, series, candles, px.x, px.y, pane.timeframe, magnetMode);
      if (!anchor) return;
      const anchors = [...draftDrawingRef.current.anchors];
      if (e.shiftKey && anchors.length >= 2) {
        const p0 = anchorToPixel(chart, series, candles, anchors[anchors.length - 2], pane.timeframe);
        if (p0) {
          const snappedPx = constrainAnglePoint(p0, px);
          anchor =
            pixelToAnchor(chart, series, candles, snappedPx.x, snappedPx.y, pane.timeframe, magnetMode) ||
            anchor;
        }
      }
      anchors[anchors.length - 1] = anchor;
      draftDrawingRef.current = { ...draftDrawingRef.current, anchors };
      syncDrawingPrimitive();
      return;
    }

    // Hover highlight for existing drawings
    if (activeTool === 'cross' || activeTool === 'dot' || activeTool === 'arrowCursor' || activeTool === 'eraser') {
      const hit = hitTestDrawings(
        drawings,
        px,
        chart,
        series,
        candles,
        pane.timeframe,
        rect.width,
        rect.height
      );
      const nextHovered = hit ? hit.drawingId : null;
      if (nextHovered !== hoveredDrawingIdRef.current) {
        hoveredDrawingIdRef.current = nextHovered;
        syncDrawingPrimitive();
      }
    }
  };

  const handlePointerUp = () => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;

    if (dragStateRef.current?.mode === 'zoom' && zoomBoxRef.current && chart && series) {
      const { start, end } = zoomBoxRef.current;
      zoomBoxRef.current = null;
      dragStateRef.current = null;
      chart.applyOptions({ handleScroll: true, handleScale: true });
      const candles = getVisibleCandles();
      if (Math.abs(end.x - start.x) > 12 && Math.abs(end.y - start.y) > 12) {
        const t1 = xToTime(chart, candles, Math.min(start.x, end.x), pane.timeframe);
        const t2 = xToTime(chart, candles, Math.max(start.x, end.x), pane.timeframe);
        const p1 = series.coordinateToPrice(Math.max(start.y, end.y));
        const p2 = series.coordinateToPrice(Math.min(start.y, end.y));
        if (t1 !== null && t2 !== null && t2 > t1) {
          chart.timeScale().setVisibleRange({ from: t1 as Time, to: t2 as Time });
        }
        if (p1 !== null && p2 !== null && p2 > p1) {
          const ps = chart.priceScale(chartSettings.scalePosition);
          ps.setAutoScale(false);
          ps.setVisibleRange({ from: p1, to: p2 });
        }
      }
      setActiveTool('cross');
      syncDrawingPrimitive();
      return;
    }

    if (dragStateRef.current) {
      if (dragStateRef.current.beforeSnapshot) {
        commitDrawingSnapshot(symbolKey, dragStateRef.current.beforeSnapshot);
      }
      dragStateRef.current = null;
      chart?.applyOptions({ handleScroll: true, handleScale: true });
      return;
    }

    if (isDrawingBrushRef.current && draftDrawingRef.current) {
      isDrawingBrushRef.current = false;
      chart?.applyOptions({ handleScroll: true, handleScale: true });
      const finalized = {
        ...draftDrawingRef.current,
        anchors: [...brushPointsRef.current],
      };
      draftDrawingRef.current = null;
      brushPointsRef.current = [];
      if (finalized.anchors.length >= 2) {
        addDrawing(symbolKey, finalized);
      }
      syncDrawingPrimitive();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const chart = chartRef.current;
    const series = mainSeriesRef.current;
    if (!chart || !series) return;

    // Finish polyline on double-click
    if (activeTool === 'polyline' && draftDrawingRef.current) {
      const anchors = draftDrawingRef.current.anchors.slice(0, -1);
      const finalized = { ...draftDrawingRef.current, anchors };
      draftDrawingRef.current = null;
      if (anchors.length >= 2) {
        addDrawing(symbolKey, finalized);
      }
      syncDrawingPrimitive();
      return;
    }

    // Edit text/note/callout/flag/emoji on double-click
    const rect = e.currentTarget.getBoundingClientRect();
    const px = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    const hit = hitTestDrawings(
      drawings,
      px,
      chart,
      series,
      getVisibleCandles(),
      pane.timeframe,
      rect.width,
      rect.height
    );
    if (hit) {
      const drv = drawings.find((d) => d.id === hit.drawingId);
      if (
        drv &&
        (drv.tool === 'text' ||
          drv.tool === 'note' ||
          drv.tool === 'callout' ||
          drv.tool === 'flag' ||
          drv.tool === 'emoji')
      ) {
        setEditingDrawingTextId(drv.id);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setActivePane(pane.id);
    const series = mainSeriesRef.current;
    if (!series) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const y = e.clientY - rect.top;
    const price = series.coordinateToPrice(y);
    if (price === null || !Number.isFinite(price)) return;
    setContextMenu({
      x: Math.min(rect.width - 210, e.clientX - rect.left),
      y: Math.min(rect.height - 190, y),
      price,
    });
  };

  // Cancel draft on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && draftDrawingRef.current) {
        draftDrawingRef.current = null;
        isDrawingBrushRef.current = false;
        syncDrawingPrimitive();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const visibleCandles = getVisibleCandles();
  const latestCandle = visibleCandles[visibleCandles.length - 1] || null;
  const displayCandle = hoveredCandle?.candle || latestCandle;
  const displayPrevClose = hoveredCandle
    ? hoveredCandle.prevClose
    : visibleCandles.length > 1
    ? visibleCandles[visibleCandles.length - 2].close
    : null;
  const priceChange =
    displayCandle && displayPrevClose !== null
      ? displayCandle.close - displayPrevClose
      : displayCandle
      ? displayCandle.close - displayCandle.open
      : 0;
  const priceChangePct =
    displayCandle && displayPrevClose
      ? (priceChange / displayPrevClose) * 100
      : displayCandle && displayCandle.open
      ? (priceChange / displayCandle.open) * 100
      : 0;
  const isBarUp = displayCandle ? displayCandle.close >= displayCandle.open : true;
  const precision = displayCandle ? getPricePrecision(displayCandle.close) : 2;

  const cursorClass =
    activeTool === 'cross'
      ? 'cursor-crosshair'
      : activeTool === 'dot'
      ? 'cursor-cell'
      : activeTool === 'arrowCursor'
      ? 'cursor-default'
      : activeTool === 'eraser'
      ? 'cursor-not-allowed'
      : 'cursor-crosshair';

  // Group indicators by paneIndex for top-left legends
  const mainIndicators = pane.indicators.filter((i) => i.paneIndex === 0);
  const oscillatorPanes = Array.from(
    new Set(pane.indicators.filter((i) => i.paneIndex > 0).map((i) => i.paneIndex))
  ).sort((a, b) => a - b);

  const paneOffsetTop = (targetPaneIdx: number): number => {
    let top = 8;
    for (let i = 0; i < targetPaneIdx; i++) {
      top += paneHeights[i] || 0;
    }
    return top;
  };

  return (
    <div
      onClick={() => {
        setActivePane(pane.id);
        setContextMenu(null);
      }}
      onContextMenu={handleContextMenu}
      className={`relative w-full h-full overflow-hidden select-none transition-colors ${
        totalPanes > 1 && isActive
          ? 'ring-1 ring-inset ring-[#2962FF]'
          : 'border border-slate-200 dark:border-[#2A2E39]'
      }`}
    >
      {/* TradingView Lightweight Charts Canvas */}
      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onDoubleClick={handleDoubleClick}
        className={`w-full h-full ${cursorClass}`}
      />

      {/* Top-Left OHLCV & Main Overlay Legend */}
      <div className="pointer-events-none absolute top-2 left-2.5 z-10 flex flex-col gap-1 max-w-[82%]">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs bg-white/80 dark:bg-[#131722]/80 backdrop-blur-xs px-2 py-1 rounded">
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-[#F8FAFC]">
            <span>{pane.symbol.displaySymbol}</span>
            <span className="text-slate-400 font-normal">·</span>
            <span className="text-slate-500 dark:text-[#787B86] font-medium">{pane.timeframe}</span>
            <span className="text-slate-400 font-normal">·</span>
            <span className="text-[11px] text-slate-500 dark:text-[#787B86]">{pane.symbol.exchange}</span>
            <span
              title={`Stream: ${connectionStatus}`}
              className={`inline-block w-2 h-2 rounded-full ml-1 ${
                connectionStatus === 'live'
                  ? 'bg-[#26A69A]'
                  : connectionStatus === 'reconnecting'
                  ? 'bg-amber-400 animate-pulse'
                  : 'bg-[#EF5350]'
              }`}
            />
          </div>

          {displayCandle && (
            <div className="flex flex-wrap items-center gap-x-2 font-mono-num text-[11px]">
              <span className="text-slate-500 dark:text-[#787B86]">
                O <span className={isBarUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}>{formatPrice(displayCandle.open, precision)}</span>
              </span>
              <span className="text-slate-500 dark:text-[#787B86]">
                H <span className={isBarUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}>{formatPrice(displayCandle.high, precision)}</span>
              </span>
              <span className="text-slate-500 dark:text-[#787B86]">
                L <span className={isBarUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}>{formatPrice(displayCandle.low, precision)}</span>
              </span>
              <span className="text-slate-500 dark:text-[#787B86]">
                C <span className={isBarUp ? 'text-[#26A69A]' : 'text-[#EF5350]'}>{formatPrice(displayCandle.close, precision)}</span>
              </span>
              <span className={priceChange >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'}>
                {priceChange >= 0 ? '+' : ''}
                {formatPrice(priceChange, precision)} ({formatPercent(priceChangePct)})
              </span>
              <span className="text-slate-500 dark:text-[#787B86]">
                Vol <span className="text-slate-700 dark:text-[#D1D4DC]">{formatVolume(displayCandle.volume)}</span>
              </span>
            </div>
          )}
        </div>

        {/* Main Pane Overlay Indicator Legends */}
        {mainIndicators.map((ind) => {
          const vals =
            hoveredCandle?.indValues[ind.name] ||
            indicatorCacheRef.current.getOrCompute(visibleCandles, ind).latestValues;
          return (
            <div
              key={ind.id}
              className="pointer-events-auto inline-flex items-center gap-2 self-start px-2 py-0.5 rounded bg-white/80 dark:bg-[#131722]/80 text-[11px] text-slate-700 dark:text-[#D1D4DC]"
            >
              <span className={`font-medium ${!ind.visible ? 'opacity-45 line-through' : ''}`}>
                {ind.name} ({Object.values(ind.params).join(', ') || 'Auto'})
              </span>
              <span className="font-mono-num text-[11px] flex items-center gap-1.5">
                {Object.entries(vals).map(([k, v]) => (
                  <span key={k} style={{ color: ind.colors[k] || ind.colors.main || '#2962FF' }}>
                    {v !== null ? formatPrice(v, precision) : '—'}
                  </span>
                ))}
              </span>
              <div className="flex items-center gap-1 ml-1 text-slate-400">
                <button
                  type="button"
                  title={ind.visible ? 'Hide' : 'Show'}
                  onClick={(e) => {
                    e.stopPropagation();
                    updateIndicator(pane.id, ind.id, { visible: !ind.visible });
                  }}
                  className="hover:text-white p-0.5"
                >
                  {ind.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                </button>
                <button
                  type="button"
                  title="Settings"
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingIndicatorId(ind.id);
                  }}
                  className="hover:text-white p-0.5"
                >
                  <Settings className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeIndicator(pane.id, ind.id);
                  }}
                  className="hover:text-[#EF5350] p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Oscillator Pane Top-Left Legends */}
      {oscillatorPanes.map((paneIdx) => {
        const inds = pane.indicators.filter((i) => i.paneIndex === paneIdx);
        if (inds.length === 0) return null;
        const topPx = paneOffsetTop(paneIdx);
        return (
          <div
            key={paneIdx}
            style={{ top: `${topPx}px` }}
            className="pointer-events-none absolute left-2.5 z-10 flex flex-col gap-0.5"
          >
            {inds.map((ind) => {
              const vals =
                hoveredCandle?.indValues[ind.name] ||
                indicatorCacheRef.current.getOrCompute(visibleCandles, ind).latestValues;
              return (
                <div
                  key={ind.id}
                  className="pointer-events-auto inline-flex items-center gap-2 px-2 py-0.5 rounded bg-white/80 dark:bg-[#131722]/80 text-[11px] text-slate-700 dark:text-[#D1D4DC]"
                >
                  <span className={`font-medium ${!ind.visible ? 'opacity-45 line-through' : ''}`}>
                    {ind.name} ({Object.values(ind.params).join(', ') || 'Auto'})
                  </span>
                  <span className="font-mono-num flex items-center gap-1.5">
                    {Object.entries(vals).map(([k, v]) => (
                      <span key={k} style={{ color: ind.colors[k] || ind.colors.main || '#2962FF' }}>
                        {v !== null ? v.toFixed(2) : '—'}
                      </span>
                    ))}
                  </span>
                  <div className="flex items-center gap-1 ml-1 text-slate-400">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        updateIndicator(pane.id, ind.id, { visible: !ind.visible });
                      }}
                      className="hover:text-white p-0.5"
                    >
                      {ind.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingIndicatorId(ind.id);
                      }}
                      className="hover:text-white p-0.5"
                    >
                      <Settings className="w-3 h-3" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeIndicator(pane.id, ind.id);
                      }}
                      className="hover:text-[#EF5350] p-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      {/* Candle Close Countdown Tag aligned below the live price tag */}
      {lastPriceY !== null && !isLoading && !replay.active && (
        <div
          style={{
            top: `${Math.max(24, Math.min((paneHeights[0] || 400) - 24, lastPriceY + 11))}px`,
            ...(chartSettings.scalePosition === 'right' ? { right: 4 } : { left: 4 }),
          }}
          className={`pointer-events-none absolute z-10 px-1.5 py-0.5 rounded text-[10px] font-mono-num font-medium text-white shadow-sm ${
            latestCandle && latestCandle.close >= latestCandle.open
              ? 'bg-[#26A69A]'
              : 'bg-[#EF5350]'
          }`}
        >
          {countdown}
        </div>
      )}

      {/* Replay Start Selection Banner */}
      {isActive && replay.selectingStart && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded bg-[#2962FF] text-white text-xs font-medium shadow-lg">
          Click any bar on the chart to start Bar Replay
        </div>
      )}

      {/* Loading Skeleton Overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/90 dark:bg-[#131722]/90 text-slate-800 dark:text-[#D1D4DC] gap-3">
          <div className="w-8 h-8 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin" />
          <div className="text-xs font-medium tracking-wide">
            Loading {pane.symbol.displaySymbol} ({pane.timeframe})…
          </div>
        </div>
      )}

      {/* Error State Overlay */}
      {loadError && !isLoading && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/95 dark:bg-[#131722]/95 p-6 text-center gap-3">
          <div className="text-sm font-semibold text-[#EF5350]">Market Data Unavailable</div>
          <p className="text-xs text-slate-600 dark:text-[#9CA3AF] max-w-md">{loadError}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                useTerminalStore.getState().setPaneTimeframe(pane.id, pane.timeframe);
              }}
              className="px-3 py-1.5 rounded border border-slate-300 dark:border-[#2A2E39] text-xs font-medium hover:bg-slate-100 dark:hover:bg-[#1E222D]"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {/* Right-Click Context Menu */}
      {contextMenu && (
        <div
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          onClick={(e) => e.stopPropagation()}
          className="absolute z-30 w-52 rounded-md border border-slate-200 dark:border-[#2A2E39] bg-white dark:bg-[#1E222D] shadow-xl py-1 text-xs text-slate-800 dark:text-[#D1D4DC]"
        >
          <div className="px-3 py-1.5 text-[11px] font-mono-num text-slate-500 dark:text-[#787B86] border-b border-slate-200 dark:border-[#2A2E39]">
            Price: {formatPrice(contextMenu.price, precision)}
          </div>
          <button
            type="button"
            onClick={() => {
              setAlertsModalOpen(true, Number(contextMenu.price.toFixed(precision)));
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
          >
            Add Alert at {formatPrice(contextMenu.price, precision)}
          </button>
          <button
            type="button"
            onClick={() => {
              const candles = getVisibleCandles();
              const t = candles[candles.length - 1]?.time || Math.floor(Date.now() / 1000);
              const maxZ = drawings.reduce((m, d) => Math.max(m, d.zIndex), 0);
              addDrawing(
                symbolKey,
                createDefaultDrawingObject(
                  'horizontalLine',
                  symbolKey,
                  [{ time: t, price: contextMenu.price }],
                  maxZ + 1
                )
              );
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
          >
            Add Horizontal Line
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(String(Number(contextMenu.price.toFixed(precision))));
              pushToast({
                title: 'Price Copied',
                message: formatPrice(contextMenu.price, precision),
                tone: 'info',
              });
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
          >
            Copy Price
          </button>
          <div className="my-1 border-t border-slate-200 dark:border-[#2A2E39]" />
          <button
            type="button"
            onClick={() => {
              chartRef.current?.timeScale().fitContent();
              chartRef.current?.priceScale(chartSettings.scalePosition).applyOptions({ autoScale: true });
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
          >
            Reset Chart View
          </button>
          <button
            type="button"
            onClick={() => {
              setSettingsModalOpen(true);
              setContextMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 hover:bg-slate-100 dark:hover:bg-[#2A2E39]"
          >
            Chart Settings…
          </button>
        </div>
      )}
    </div>
  );
};
