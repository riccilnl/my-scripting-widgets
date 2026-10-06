import {
  COMMON_PHRASES_STORAGE_KEY,
  DEFAULT_COMMON_PHRASE_SYMBOL,
  normalizeCommonPhraseCategoriesValue,
  visibleCommonPhraseCategoriesValue,
  type CommonPhraseCategory,
  type CommonPhraseItem
} from "../contracts/auxiliary";
export { COMMON_PHRASES_STORAGE_KEY, DEFAULT_COMMON_PHRASE_SYMBOL };
export type { CommonPhraseCategory, CommonPhraseItem } from "../contracts/auxiliary";

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
}

export function createCommonPhraseId(prefix: "category" | "phrase"): string {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${random}`;
}

export function normalizeCommonPhraseCategories(value: unknown): CommonPhraseCategory[] {
  return normalizeCommonPhraseCategoriesValue(value);
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
    return normalizeCommonPhraseCategoriesValue(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return [];
  }
}

export function saveCommonPhraseCategories(value: unknown): CommonPhraseCategory[] | null {
  const normalized = normalizeCommonPhraseCategoriesValue(value);
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
  return visibleCommonPhraseCategoriesValue(categories);
}
