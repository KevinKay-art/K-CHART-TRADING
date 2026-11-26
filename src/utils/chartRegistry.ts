import { Candle, Timeframe } from '../types/chart';

export interface ChartPaneActions {
  takeScreenshot: () => HTMLCanvasElement | null;
  getCandles: () => Candle[];
  getSymbol: () => string;
  getTimeframe: () => Timeframe;
  applyRangeSeconds: (seconds: number | 'YTD' | 'ALL') => void;
  resetView: () => void;
}

const registry = new Map<string, ChartPaneActions>();

export function registerChartPane(paneId: string, actions: ChartPaneActions): void {
  registry.set(paneId, actions);
}

export function unregisterChartPane(paneId: string): void {
  registry.delete(paneId);
}

export function getChartPaneActions(paneId: string): ChartPaneActions | undefined {
  return registry.get(paneId);
}
