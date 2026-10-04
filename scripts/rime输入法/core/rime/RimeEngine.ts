import { KEY_DOWN, KEY_ESCAPE, KEY_PAGE_DOWN, KEY_PAGE_UP, KEY_UP } from "./keys";
import { T9_SCHEMA_ID } from "./schema";

export type RimeSnapshot = {
  context: Rime.Context | null;
  commit: string | null;
};

export type RimeProcessResult = RimeSnapshot & {
  consumed: boolean;
};

type IndexedRimeCandidate = {
  candidate: Rime.Candidate;
  originalIndex: number;
};

const T9_BRIDGE_PROBE_KEY = 0xffd4;
const T9_BRIDGE_APPLY_SELECTION_KEY = 0xffd5;
const T9_BRIDGE_PREPARE_CANDIDATE_KEY = 0xffd6;
const T9_BRIDGE_FINALIZE_CANDIDATE_KEY = 0xffd7;
const T9_BRIDGE_READY_PROPERTY = "t9_bridge_ready";
const T9_BRIDGE_OPTIONS_PROPERTY = "t9_bridge_options";
const T9_BRIDGE_SELECTION_REQUEST_PROPERTY = "t9_bridge_selection_request";
const T9_BRIDGE_CANDIDATE_INDEX_PROPERTY = "t9_bridge_candidate_index";
const T9_BRIDGE_TARGET_SCHEMA_ID = T9_SCHEMA_ID;

function parseBridgeOptions(value: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of String(value ?? "").split(";")) {
    const label = item.trim().toLowerCase();
    if (!/^[a-zv]+$/.test(label) || seen.has(label)) continue;
    seen.add(label);
    result.push(label);
  }
  return result;
}

export class RimeEngine {
  constructor(readonly session: Rime.Session) {}

  /**
   * Passive state observation. Never reads session.commit because that property
   * drains Rime's pending commit. State checks must be side-effect free.
   */
  peek(): RimeSnapshot {
    return {
      context: this.session.context,
      commit: null
    };
  }

  /**
   * Capture the result of a Rime mutation. This is the only path that may drain
   * session.commit, so each commit has one explicit owner.
   */
  private captureMutation(): RimeSnapshot {
    return {
      context: this.session.context,
      commit: this.session.commit ?? null
    };
  }

  hasComposition(): boolean {
    return Boolean(this.session.context?.preedit ?? "");
  }

  processKey(keyCode: number, modifiers?: number): RimeProcessResult {
    const consumed = Boolean(this.session.processKey(keyCode, modifiers));
    return {
      ...this.captureMutation(),
      consumed
    };
  }

  private prepareT9CandidateSelection(absoluteIndex: number): void {
    if (!this.isT9BridgeTargetSchema()) return;
    try {
      this.session.setProperty(
        T9_BRIDGE_CANDIDATE_INDEX_PROPERTY,
        String(Math.max(0, Math.floor(absoluteIndex)))
      );
      this.session.processKey(T9_BRIDGE_PREPARE_CANDIDATE_KEY);
    } catch {}
  }

  private finalizeT9CandidateSelection(): void {
    if (!this.isT9BridgeTargetSchema()) return;
    try {
      this.session.processKey(T9_BRIDGE_FINALIZE_CANDIDATE_KEY);
    } catch {}
  }

  selectCandidate(index: number): RimeSnapshot {
    this.prepareT9CandidateSelection(index);
    const changed = Boolean(this.session.selectCandidate(index));
    if (changed) this.finalizeT9CandidateSelection();
    return this.captureMutation();
  }

  selectCandidateOnCurrentPage(index: number): RimeSnapshot {
    const menu = this.session.context?.menu;
    const pageNo = Math.max(0, menu?.pageNo ?? 0);
    const pageSize = Math.max(1, menu?.pageSize ?? 1);
    this.prepareT9CandidateSelection(pageNo * pageSize + index);
    const changed = Boolean(this.session.selectCandidateOnCurrentPage(index));
    if (changed) this.finalizeT9CandidateSelection();
    return this.captureMutation();
  }

  moveHighlightedCandidate(steps: number): {
    snapshot: RimeSnapshot;
    movedSteps: number;
  } {
    const requested = Math.trunc(steps);
    if (requested === 0) return { snapshot: this.peek(), movedSteps: 0 };

    const direction = requested < 0 ? -1 : 1;
    const count = Math.min(8, Math.abs(requested));
    const key = direction < 0 ? KEY_UP : KEY_DOWN;
    let movedSteps = 0;

    for (let index = 0; index < count; index += 1) {
      const before = this.session.context?.menu;
      const beforePage = before?.pageNo ?? 0;
      const beforeIndex = before?.highlightedIndex ?? 0;
      if (!this.session.processKey(key)) break;
      const after = this.session.context?.menu;
      if (!after) break;
      if ((after.pageNo ?? 0) === beforePage && (after.highlightedIndex ?? 0) === beforeIndex) break;
      movedSteps += direction;
    }

    return { snapshot: this.peek(), movedSteps };
  }

  collectCandidateBatch(limit = 96): {
    items: IndexedRimeCandidate[];
    hasMore: boolean;
  } {
    const initial = this.session.context?.menu;
    if (!initial || limit <= 0) {
      return { items: [], hasMore: false };
    }

    const originalPage = Math.max(0, initial.pageNo ?? 0);
    const items: IndexedRimeCandidate[] = [];
    let hasMore = false;
    let guard = 0;

    try {
      while (items.length < limit && guard < 256) {
        const menu = this.session.context?.menu;
        if (!menu) break;
        const pageSize = Math.max(1, menu.pageSize ?? 1);
        const pageCandidates = menu.candidates ?? [];
        const base = Math.max(0, menu.pageNo ?? 0) * pageSize;
        let consumedFromPage = 0;
        for (let index = 0; index < pageCandidates.length && items.length < limit; index += 1) {
          items.push({
            candidate: pageCandidates[index],
            originalIndex: base + index
          });
          consumedFromPage += 1;
        }
        if (items.length >= limit) {
          hasMore = consumedFromPage < pageCandidates.length || !menu.isLastPage;
          break;
        }
        if (menu.isLastPage) break;
        if (!this.session.processKey(KEY_PAGE_DOWN)) break;
        guard += 1;
      }
      if (!hasMore) hasMore = !(this.session.context?.menu?.isLastPage ?? true);
    } finally {
      let menu = this.session.context?.menu;
      let restoreGuard = 0;
      while (menu && (menu.pageNo ?? 0) > originalPage && restoreGuard < 256) {
        if (!this.session.processKey(KEY_PAGE_UP)) break;
        menu = this.session.context?.menu;
        restoreGuard += 1;
      }
      while (menu && (menu.pageNo ?? 0) < originalPage && restoreGuard < 512) {
        if (!this.session.processKey(KEY_PAGE_DOWN)) break;
        menu = this.session.context?.menu;
        restoreGuard += 1;
      }
    }

    return {
      items,
      hasMore
    };
  }

  selectSchema(id: string): boolean {
    if (this.session.currentSchema?.id === id) return true;
    this.session.clearComposition();
    return Boolean(this.session.selectSchema(id));
  }

  get currentSchemaId(): string | null {
    return this.session.currentSchema?.id ?? null;
  }

  isT9BridgeTargetSchema(): boolean {
    return this.session.currentSchema?.id === T9_BRIDGE_TARGET_SCHEMA_ID;
  }

  enforceWanxiangT9RuntimeContract(): void {
    if (!this.isT9BridgeTargetSchema()) return;
    // Scripting T9 owns these session-only display/source options. Keep both
    // option groups explicit so persisted scheme defaults cannot create a
    // second runtime controller for bridge comments or visible preedit.
    this.session.setOption("comment_off", false);
    this.session.setOption("tone_hint", false);
    this.session.setOption("toneless_hint", true);
    this.session.setOption("raw_input", false);
    this.session.setOption("tone_display", false);
    this.session.setOption("full_pinyin", true);
  }

  probeT9Bridge(): boolean {
    if (!this.isT9BridgeTargetSchema()) return false;
    try {
      this.session.setProperty(T9_BRIDGE_READY_PROPERTY, "");
      const consumed = Boolean(this.session.processKey(T9_BRIDGE_PROBE_KEY));
      const ready = this.session.getProperty(T9_BRIDGE_READY_PROPERTY) === "1";
      this.session.setProperty(T9_BRIDGE_READY_PROPERTY, "");
      return consumed && ready;
    } catch {
      return false;
    }
  }

  queryT9PinyinOptions(): string[] {
    if (!this.isT9BridgeTargetSchema()) return [];
    try {
      this.session.processKey(T9_BRIDGE_PROBE_KEY);
      return parseBridgeOptions(
        String(this.session.getProperty(T9_BRIDGE_OPTIONS_PROPERTY) ?? "")
      );
    } catch {
      return [];
    }
  }

  selectT9Pinyin(label: string): RimeProcessResult {
    if (!this.isT9BridgeTargetSchema()) return { ...this.peek(), consumed: false };
    const normalized = label.trim().toLowerCase();
    if (!/^[a-zv]+$/.test(normalized)) return { ...this.peek(), consumed: false };
    this.session.setProperty(T9_BRIDGE_SELECTION_REQUEST_PROPERTY, normalized);
    return this.processKey(T9_BRIDGE_APPLY_SELECTION_KEY);
  }

  clearComposition(): RimeSnapshot {
    try {
      this.session.clearComposition();
      this.session.processKey(KEY_ESCAPE);
    } catch {}
    return this.peek();
  }

  toggleAsciiMode(): RimeSnapshot {
    const current = Boolean(this.session.getOption("ascii_mode"));
    this.session.setOption("ascii_mode", !current);
    return this.peek();
  }

  get asciiMode(): boolean {
    return Boolean(this.session.getOption("ascii_mode"));
  }

  close() {
    this.session.close();
  }
}
