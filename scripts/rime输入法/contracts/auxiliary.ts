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
