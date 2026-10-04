/**
 * Project Rime's raw composition cursor into the text actually displayed as
 * marked preedit. Wanxiang may append a bracketed hint suffix such as
 * `ni〔提示〕`; the document cursor must not move inside that display-only tip.
 *
 * This changes display projection only. Rime context/input/cursor remain the
 * authoritative composition state.
 */
export function displayedPreeditCursor(preedit: string, cursor: number): number {
  const safeCursor = Math.min(preedit.length, Math.max(0, cursor));
  const tipStart = preedit.indexOf("〔");
  if (tipStart > 0 && preedit.indexOf("〕", tipStart + 1) > tipStart) {
    return Math.min(safeCursor, tipStart);
  }
  return safeCursor;
}
