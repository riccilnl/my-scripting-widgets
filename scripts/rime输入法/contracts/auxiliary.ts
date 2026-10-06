export const CLIPBOARD_HISTORY_STORAGE_KEY = "rime_input_method_clipboard_history_v1";
export const CLIPBOARD_HISTORY_LIMIT = 50;

export type CommonPhraseItem = {
  id: string;
  text: string;
};

export type CommonPhraseCategory = {
  id: string;
  symbol: string;
  title: string;
  phrases: CommonPhraseItem[];
};

export const COMMON_PHRASES_STORAGE_KEY = "rime_input_method_common_phrases_v1";
export const DEFAULT_COMMON_PHRASE_SYMBOL = "star.fill";

export function normalizeClipboardHistoryValue(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string" || !item.trim() || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= CLIPBOARD_HISTORY_LIMIT) break;
  }
  return result;
}

export function prependClipboardHistoryValue(items: readonly string[], text: string): string[] {
  if (!text.trim()) return normalizeClipboardHistoryValue(items);
  return normalizeClipboardHistoryValue([text, ...items.filter((item) => item !== text)]);
}

export function removeClipboardHistoryItemValue(items: readonly string[], text: string): string[] {
  return text
    ? normalizeClipboardHistoryValue(items.filter((item) => item !== text))
    : normalizeClipboardHistoryValue(items);
}

function stableFallbackId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

export function normalizeCommonPhraseCategoriesValue(value: unknown): CommonPhraseCategory[] {
  if (!Array.isArray(value)) return [];
  const categories: CommonPhraseCategory[] = [];
  const categoryIds = new Set<string>();

  for (let categoryIndex = 0; categoryIndex < value.length; categoryIndex += 1) {
    const rawCategory = value[categoryIndex];
    if (!rawCategory || typeof rawCategory !== "object") continue;
    const source = rawCategory as Record<string, unknown>;
    let id = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : stableFallbackId("category", categoryIndex);
    if (categoryIds.has(id)) id = `${id}-${categoryIndex + 1}`;
    categoryIds.add(id);

    const rawPhrases = Array.isArray(source.phrases) ? source.phrases : [];
    const phrases: CommonPhraseItem[] = [];
    const phraseIds = new Set<string>();
    for (let phraseIndex = 0; phraseIndex < rawPhrases.length; phraseIndex += 1) {
      const rawPhrase = rawPhrases[phraseIndex];
      const phraseSource: Record<string, unknown> = rawPhrase && typeof rawPhrase === "object"
        ? rawPhrase as Record<string, unknown>
        : { text: rawPhrase };
      let phraseId = typeof phraseSource.id === "string" && phraseSource.id.trim()
        ? phraseSource.id.trim()
        : stableFallbackId(`${id}-phrase`, phraseIndex);
      if (phraseIds.has(phraseId)) phraseId = `${phraseId}-${phraseIndex + 1}`;
      phraseIds.add(phraseId);
      phrases.push({
        id: phraseId,
        text: typeof phraseSource.text === "string" ? phraseSource.text : ""
      });
    }

    categories.push({
      id,
      symbol: typeof source.symbol === "string" && source.symbol.trim()
        ? source.symbol
        : DEFAULT_COMMON_PHRASE_SYMBOL,
      title: typeof source.title === "string" ? source.title : "",
      phrases
    });
  }

  return categories;
}

export function visibleCommonPhraseCategoriesValue(
  categories: readonly CommonPhraseCategory[]
): CommonPhraseCategory[] {
  return categories
    .map((category) => ({
      ...category,
      phrases: category.phrases.filter((phrase) => phrase.text.trim().length > 0)
    }))
    .filter((category) => category.phrases.length > 0);
}
