import { useEffect, useState } from "scripting";
import { CandidateBar } from "./CandidateBar";
import type { CandidateViewStore } from "../runtime/CandidateViewStore";

type Props = Omit<Parameters<typeof CandidateBar>[0], "candidates" | "highlightedIndex"> & {
  store: CandidateViewStore;
};

/** Candidate-only subscription; native hit geometry stays in frozen CandidateBar. */
export function CandidateBarSubscriber({ store, ...props }: Props) {
  const [snapshot, setSnapshot] = useState(() => store.getSnapshot());

  useEffect(() => {
    const unsubscribe = store.subscribe(setSnapshot);
    // A fast Rime startup may publish before this effect subscribes.
    setSnapshot(store.getSnapshot());
    return unsubscribe;
  }, [store]);

  return (
    <CandidateBar
      {...props}
      candidates={snapshot.candidates}
      highlightedIndex={snapshot.highlightedIndex}
    />
  );
}
