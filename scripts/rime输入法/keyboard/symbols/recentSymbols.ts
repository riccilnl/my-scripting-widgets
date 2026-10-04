const MAX_RECENT_SYMBOLS = 26;

export function rememberRecentSymbol(
  history: readonly string[],
  symbol: string
): string[] {
  return [symbol, ...history.filter((item) => item !== symbol)].slice(
    0,
    MAX_RECENT_SYMBOLS
  );
}

export function projectRecentSymbols(
  history: readonly string[],
  fallback: readonly string[]
): string[] {
  if (history.length === 0) {
    return [...fallback].slice(0, MAX_RECENT_SYMBOLS);
  }
  return [
    ...history,
    ...fallback.filter((item) => !history.includes(item))
  ].slice(0, MAX_RECENT_SYMBOLS);
}
