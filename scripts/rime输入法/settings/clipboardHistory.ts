import {
  CLIPBOARD_HISTORY_LIMIT,
  CLIPBOARD_HISTORY_STORAGE_KEY,
  normalizeClipboardHistoryValue,
  prependClipboardHistoryValue,
  removeClipboardHistoryItemValue
} from "../contracts/auxiliary";
export { CLIPBOARD_HISTORY_LIMIT, CLIPBOARD_HISTORY_STORAGE_KEY };

const SHARED_STORAGE_OPTIONS = { shared: true } as const;

function storageApi(): any {
  return (globalThis as any).Storage;
}

export function normalizeClipboardHistory(value: unknown): string[] {
  return normalizeClipboardHistoryValue(value);
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
    return normalizeClipboardHistoryValue(typeof raw === "string" ? JSON.parse(raw) : raw);
  } catch {
    return [];
  }
}

export function saveClipboardHistory(value: unknown): string[] | null {
  const normalized = normalizeClipboardHistoryValue(value);
  const storage = storageApi();
  if (!storage) return null;
  try {
    if (typeof storage.set === "function") {
      if (storage.set(CLIPBOARD_HISTORY_STORAGE_KEY, normalized, SHARED_STORAGE_OPTIONS) === false) return null;
      return normalized;
    }
    if (typeof storage.setString === "function") {
      storage.setString(CLIPBOARD_HISTORY_STORAGE_KEY, JSON.stringify(normalized), SHARED_STORAGE_OPTIONS);
      return normalized;
    }
  } catch {}
  return null;
}

export function prependClipboardHistory(items: readonly string[], text: string): string[] {
  return prependClipboardHistoryValue(items, text);
}

export function removeClipboardHistoryItem(items: readonly string[], text: string): string[] {
  return removeClipboardHistoryItemValue(items, text);
}
