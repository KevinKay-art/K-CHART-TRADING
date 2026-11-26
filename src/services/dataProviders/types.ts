import { Candle, ConnectionStatus, DataProviderId, SymbolInfo, Timeframe } from '../../types/chart';

export interface HistoryRequestParams {
  symbol: string;
  interval: Timeframe;
  limit?: number;
  endTimeMs?: number;
}

export interface SubscribeCallbacks {
  onCandle: (candle: Candle, isClosed: boolean) => void;
  onStatus: (status: ConnectionStatus, errorMessage?: string) => void;
}

export interface DataProvider {
  readonly id: DataProviderId;
  readonly name: string;
  readonly requiresApiKey: boolean;
  getHistory(params: HistoryRequestParams): Promise<Candle[]>;
  subscribe(
    symbol: string,
    interval: Timeframe,
    callbacks: SubscribeCallbacks
  ): () => void;
  searchSymbols(query: string): Promise<SymbolInfo[]>;
}
