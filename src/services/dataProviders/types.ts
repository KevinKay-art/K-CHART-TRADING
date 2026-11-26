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

const PROVIDER_KEYS_STORAGE = 'kchart_provider_keys_v1';

export type ProviderKeyMap = Partial<Record<DataProviderId, string>>;

export function loadLocalProviderKeys(): ProviderKeyMap {
  try {
    const raw = localStorage.getItem(PROVIDER_KEYS_STORAGE);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: ProviderKeyMap = {};
    for (const k of ['twelvedata', 'finnhub', 'polygon'] as DataProviderId[]) {
      if (typeof parsed[k] === 'string' && parsed[k]) {
        out[k] = parsed[k] as string;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function saveLocalProviderKeys(keys: ProviderKeyMap): void {
  try {
    localStorage.setItem(PROVIDER_KEYS_STORAGE, JSON.stringify(keys));
  } catch {
    // ignore storage errors
  }
}
