import type { CandidateEntry } from "../../core/rime/CandidateView";

export type CandidateViewSnapshot = {
  candidates: CandidateEntry[];
  highlightedIndex: number;
};

const EMPTY_SNAPSHOT: CandidateViewSnapshot = {
  candidates: [],
  highlightedIndex: 0
};

function sameDisplayedCandidates(left: readonly CandidateEntry[], right: readonly CandidateEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) =>
    entry.originalIndex === right[index]?.originalIndex &&
    entry.candidate.text === right[index]?.candidate.text
  );
}

/** Candidate-only state, never persists input or owns the Rime Session. */
export class CandidateViewStore {
  private current: CandidateViewSnapshot = EMPTY_SNAPSHOT;
  private readonly listeners = new Set<(snapshot: CandidateViewSnapshot) => void>();
  private disposed = false;

  getSnapshot(): CandidateViewSnapshot {
    return this.current;
  }

  publish(candidates: CandidateEntry[], highlightedIndex: number): boolean {
    if (this.disposed) return false;
    const previous = this.current;
    const sameCandidates = sameDisplayedCandidates(previous.candidates, candidates);
    const index = Math.max(0, highlightedIndex);
    if (sameCandidates && previous.highlightedIndex === index) return false;
    const snapshot = {
      candidates: sameCandidates ? previous.candidates : candidates,
      highlightedIndex: index
    };
    this.current = snapshot;
    for (const listener of this.listeners) listener(snapshot);
    return true;
  }

  subscribe(listener: (snapshot: CandidateViewSnapshot) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.current = EMPTY_SNAPSHOT;
  }
}
