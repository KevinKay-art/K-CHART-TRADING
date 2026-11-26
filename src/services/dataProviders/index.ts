import { DataProviderId, SymbolInfo } from '../../types/chart';
import { binanceProvider } from './binanceProvider';
import { finnhubProvider, polygonProvider, twelveDataProvider } from './externalProviders';
import { DataProvider } from './types';

export const DEFAULT_SYMBOL: SymbolInfo = {
  symbol: 'BTCUSDT',
  displaySymbol: 'BTC/USDT',
  name: 'Bitcoin / TetherUS Spot',
  exchange: 'BINANCE',
  assetClass: 'crypto',
  provider: 'binance',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
};

export const PRESET_EQUITY_FOREX_SYMBOLS: SymbolInfo[] = [
  { symbol: 'AAPL', displaySymbol: 'AAPL', name: 'Apple Inc.', exchange: 'NASDAQ', assetClass: 'stock', provider: 'twelvedata' },
  { symbol: 'NVDA', displaySymbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'NASDAQ', assetClass: 'stock', provider: 'twelvedata' },
  { symbol: 'MSFT', displaySymbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'NASDAQ', assetClass: 'stock', provider: 'twelvedata' },
  { symbol: 'TSLA', displaySymbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'NASDAQ', assetClass: 'stock', provider: 'twelvedata' },
  { symbol: 'EUR/USD', displaySymbol: 'EUR/USD', name: 'Euro / US Dollar', exchange: 'FX', assetClass: 'forex', provider: 'twelvedata' },
  { symbol: 'GBP/USD', displaySymbol: 'GBP/USD', name: 'British Pound / US Dollar', exchange: 'FX', assetClass: 'forex', provider: 'twelvedata' },
  { symbol: 'USD/JPY', displaySymbol: 'USD/JPY', name: 'US Dollar / Japanese Yen', exchange: 'FX', assetClass: 'forex', provider: 'twelvedata' },
  { symbol: 'XAU/USD', displaySymbol: 'XAU/USD', name: 'Gold Spot / US Dollar', exchange: 'COMMODITY', assetClass: 'commodity', provider: 'twelvedata' },
  { symbol: 'SPX', displaySymbol: 'SPX', name: 'S&P 500 Index', exchange: 'INDEX', assetClass: 'index', provider: 'twelvedata' },
  { symbol: 'SPY', displaySymbol: 'SPY', name: 'SPDR S&P 500 ETF', exchange: 'NYSE', assetClass: 'index', provider: 'finnhub' },
  { symbol: 'QQQ', displaySymbol: 'QQQ', name: 'Invesco QQQ Trust', exchange: 'NASDAQ', assetClass: 'index', provider: 'polygon' },
];

export const DATA_PROVIDERS: Record<DataProviderId, DataProvider> = {
  binance: binanceProvider,
  twelvedata: twelveDataProvider,
  finnhub: finnhubProvider,
  polygon: polygonProvider,
};

export function getDataProvider(id: DataProviderId): DataProvider {
  return DATA_PROVIDERS[id] || binanceProvider;
}

export async function searchAllSymbols(
  query: string,
  activeProviderFilter: DataProviderId | 'all' = 'all'
): Promise<SymbolInfo[]> {
  const tasks: Promise<SymbolInfo[]>[] = [];

  if (activeProviderFilter === 'all' || activeProviderFilter === 'binance') {
    tasks.push(binanceProvider.searchSymbols(query).catch(() => []));
  }
  if (activeProviderFilter === 'all' || activeProviderFilter === 'twelvedata') {
    tasks.push(twelveDataProvider.searchSymbols(query).catch(() => []));
  }
  if (activeProviderFilter === 'all' || activeProviderFilter === 'finnhub') {
    tasks.push(finnhubProvider.searchSymbols(query).catch(() => []));
  }
  if (activeProviderFilter === 'all' || activeProviderFilter === 'polygon') {
    tasks.push(polygonProvider.searchSymbols(query).catch(() => []));
  }

  const results = (await Promise.all(tasks)).flat();

  // Include matching preset non-crypto symbols so users see stocks/forex/indices even before configuring keys
  const q = query.trim().toUpperCase();
  const qNoSlash = q.replace(/\//g, '');
  const presetMatches = PRESET_EQUITY_FOREX_SYMBOLS.filter((item) => {
    if (activeProviderFilter !== 'all' && item.provider !== activeProviderFilter) return false;
    if (!q) return true;
    const symUpper = item.symbol.toUpperCase();
    return (
      symUpper.includes(q) ||
      symUpper.replace(/\//g, '').includes(qNoSlash) ||
      item.name.toUpperCase().includes(q) ||
      item.assetClass.toUpperCase().includes(q)
    );
  });

  const seen = new Set<string>();
  const merged: SymbolInfo[] = [];
  for (const s of [...results, ...presetMatches]) {
    const key = `${s.provider}:${s.symbol}`;
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(s);
    }
  }
  return merged.slice(0, 80);
}
