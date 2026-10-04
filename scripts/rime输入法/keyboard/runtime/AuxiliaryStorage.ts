import {
  CLIPBOARD_HISTORY_LIMIT,
  CLIPBOARD_HISTORY_STORAGE_KEY,
  COMMON_PHRASES_STORAGE_KEY,
  DEFAULT_COMMON_PHRASE_SYMBOL,
  type CommonPhraseCategory,
  type CommonPhraseItem
} from "../../contracts/auxiliary";

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
}

function readShared(key: string): unknown {
  const storage = storageApi();
  if (!storage) return null;
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(key, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(key, SHARED_STORAGE_OPTIONS)
      : null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function writeShared(key: string, value: unknown): boolean {
  const storage = storageApi();
  if (!storage) return false;
  try {
    if (typeof storage.set === "function") {
      return storage.set(key, value, SHARED_STORAGE_OPTIONS) !== false;
    }
    if (typeof storage.setString === "function") {
      storage.setString(key, JSON.stringify(value), SHARED_STORAGE_OPTIONS);
      return true;
    }
  } catch {}
  return false;
}

export function normalizeClipboardHistory(value: unknown): string[] {
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

export function loadClipboardHistory(): string[] {
  return normalizeClipboardHistory(readShared(CLIPBOARD_HISTORY_STORAGE_KEY));
}

export function saveClipboardHistory(value: readonly string[]): string[] | null {
  const normalized = normalizeClipboardHistory(value);
  return writeShared(CLIPBOARD_HISTORY_STORAGE_KEY, normalized) ? normalized : null;
}

export function prependClipboardHistory(items: readonly string[], text: string): string[] {
  if (!text.trim()) return normalizeClipboardHistory(items);
  return normalizeClipboardHistory([text, ...items.filter((item) => item !== text)]);
}

export function removeClipboardHistoryItem(items: readonly string[], text: string): string[] {
  return text ? normalizeClipboardHistory(items.filter((item) => item !== text)) : normalizeClipboardHistory(items);
}

function runtimePhrase(raw: unknown, fallbackId: string): CommonPhraseItem | null {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : { text: raw };
  const text = typeof source.text === "string" ? source.text : "";
  if (!text.trim()) return null;
  return {
    id: typeof source.id === "string" && source.id.trim() ? source.id.trim() : fallbackId,
    text
  };
}

export function loadVisibleCommonPhraseCategories(): CommonPhraseCategory[] {
  const value = readShared(COMMON_PHRASES_STORAGE_KEY);
  if (!Array.isArray(value)) return [];
  const result: CommonPhraseCategory[] = [];
  for (let categoryIndex = 0; categoryIndex < value.length; categoryIndex += 1) {
    const raw = value[categoryIndex];
    if (!raw || typeof raw !== "object") continue;
    const source = raw as Record<string, unknown>;
    const id = typeof source.id === "string" && source.id.trim()
      ? source.id.trim()
      : `category-${categoryIndex + 1}`;
    const rawPhrases = Array.isArray(source.phrases) ? source.phrases : [];
    const phrases: CommonPhraseItem[] = [];
    for (let phraseIndex = 0; phraseIndex < rawPhrases.length; phraseIndex += 1) {
      const phrase = runtimePhrase(rawPhrases[phraseIndex], `${id}-phrase-${phraseIndex + 1}`);
      if (phrase) phrases.push(phrase);
    }
    if (phrases.length === 0) continue;
    result.push({
      id,
      symbol: typeof source.symbol === "string" && source.symbol.trim()
        ? source.symbol
        : DEFAULT_COMMON_PHRASE_SYMBOL,
      title: typeof source.title === "string" ? source.title : "",
      phrases
    });
  }
  return result;
}

export function recordClipboardText(text: string): string[] | null {
  if (!text.trim()) return loadClipboardHistory();
  return saveClipboardHistory(prependClipboardHistory(loadClipboardHistory(), text));
}
