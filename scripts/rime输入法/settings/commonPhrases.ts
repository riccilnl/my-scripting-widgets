import {
  COMMON_PHRASES_STORAGE_KEY,
  DEFAULT_COMMON_PHRASE_SYMBOL,
  type CommonPhraseCategory,
  type CommonPhraseItem
} from "../contracts/auxiliary";
export { COMMON_PHRASES_STORAGE_KEY, DEFAULT_COMMON_PHRASE_SYMBOL };
export type { CommonPhraseCategory, CommonPhraseItem } from "../contracts/auxiliary";

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
}

function stableFallbackId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

export function createCommonPhraseId(prefix: "category" | "phrase"): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${random}`;
}

export function normalizeCommonPhraseCategories(value: unknown): CommonPhraseCategory[] {
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

    const symbol = typeof source.symbol === "string"
      ? source.symbol
      : DEFAULT_COMMON_PHRASE_SYMBOL;
    categories.push({
      id,
      symbol,
      title: typeof source.title === "string" ? source.title : "",
      phrases
    });
  }

  return categories;
}

export function loadCommonPhraseCategories(): CommonPhraseCategory[] {
  const storage = storageApi();
  if (!storage) return [];
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(COMMON_PHRASES_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(COMMON_PHRASES_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : null;
    if (raw == null) return [];
    return normalizeCommonPhraseCategories(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return [];
  }
}

export function saveCommonPhraseCategories(value: unknown): CommonPhraseCategory[] | null {
  const normalized = normalizeCommonPhraseCategories(value);
  const storage = storageApi();
  if (!storage) return null;
  try {
    if (typeof storage.set === "function") {
      if (storage.set(COMMON_PHRASES_STORAGE_KEY, normalized, SHARED_STORAGE_OPTIONS) === false) return null;
      return normalized;
    }
    if (typeof storage.setString === "function") {
      storage.setString(COMMON_PHRASES_STORAGE_KEY, JSON.stringify(normalized), SHARED_STORAGE_OPTIONS);
      return normalized;
    }
  } catch {}
  return null;
}

export function visibleCommonPhraseCategories(
  categories: readonly CommonPhraseCategory[]
): CommonPhraseCategory[] {
  return categories
    .map((category) => ({
      ...category,
      phrases: category.phrases.filter((phrase) => phrase.text.trim().length > 0)
    }))
    .filter((category) => category.phrases.length > 0);
}
