import type { RimeSnapshot } from "../../core/rime/RimeEngine";

export type HostMarkedTextPort = {
  setMarkedText(text: string, location: number, length: number): void;
  unmarkText(): void;
};

export type ApplyRimeHostTextOptions = {
  snapshot: RimeSnapshot;
  visiblePreedit: string;
  cursor: number;
  markedTextActive: boolean;
  insertCommittedText: (text: string) => void;
  host: HostMarkedTextPort;
};

/**
 * Owns the host-side transaction between Rime commit/preedit and iOS marked text.
 *
 * When a marked range is active, commit through setMarkedText() + unmarkText()
 * instead of relying on insertText() to replace that range. Some host text
 * implementations append insertText() after marked text instead of replacing it.
 * setMarkedText() has the stronger contract: it replaces the existing marked range.
 */
export function applyRimeHostText(options: ApplyRimeHostTextOptions): boolean {
  const {
    snapshot,
    visiblePreedit,
    cursor,
    markedTextActive,
    insertCommittedText,
    host
  } = options;

  const commit = snapshot.commit ?? "";

  if (commit) {
    if (markedTextActive) {
      // Replace the whole active marked range with the committed text, then
      // explicitly finalize it. This avoids host-specific insertText() behavior
      // that can otherwise leave raw preedit behind (for example: wo -> wo我).
      host.setMarkedText(commit, commit.length, 0);
      host.unmarkText();
    } else {
      insertCommittedText(commit);
    }
  }

  if (visiblePreedit) {
    host.setMarkedText(
      visiblePreedit,
      Math.max(0, Math.min(cursor, visiblePreedit.length)),
      0
    );
    return true;
  }

  // Clearing an uncommitted composition must remove our marked text before
  // unmarking; otherwise the last raw preedit character can leak into host text.
  if (!commit && markedTextActive) {
    host.setMarkedText("", 0, 0);
    host.unmarkText();
  }

  return false;
}
