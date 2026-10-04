import { CLIPBOARD_HISTORY_LIMIT, CLIPBOARD_HISTORY_STORAGE_KEY } from "../contracts/auxiliary";
export { CLIPBOARD_HISTORY_LIMIT, CLIPBOARD_HISTORY_STORAGE_KEY };

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
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
  const storage = storageApi();
  if (!storage) return [];
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(CLIPBOARD_HISTORY_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : typeof storage.getString === "function"
      ? storage.getString(CLIPBOARD_HISTORY_STORAGE_KEY, SHARED_STORAGE_OPTIONS)
      : null;
    if (raw == null) return [];
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return normalizeClipboardHistory(value);
  } catch {
    return [];
  }
}

export function saveClipboardHistory(value: unknown): string[] | null {
  const normalized = normalizeClipboardHistory(value);
  const storage = storageApi();
  if (!storage) return null;
  try {
    if (typeof storage.set === "function") {
      if (storage.set(CLIPBOARD_HISTORY_STORAGE_KEY, normalized, SHARED_STORAGE_OPTIONS) === false) return null;
      return normalized;
    }
    if (typeof storage.setString === "function") {
      storage.setString(
        CLIPBOARD_HISTORY_STORAGE_KEY,
        JSON.stringify(normalized),
        SHARED_STORAGE_OPTIONS
      );
      return normalized;
    }
  } catch {}
  return null;
}

export function prependClipboardHistory(items: readonly string[], text: string): string[] {
  if (!text.trim()) return normalizeClipboardHistory(items);
  return normalizeClipboardHistory([text, ...items.filter((item) => item !== text)]);
}

export function removeClipboardHistoryItem(items: readonly string[], text: string): string[] {
  if (!text) return normalizeClipboardHistory(items);
  return normalizeClipboardHistory(items.filter((item) => item !== text));
}
