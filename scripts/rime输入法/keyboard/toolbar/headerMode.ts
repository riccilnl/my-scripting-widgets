export type KeyboardHeaderMode = "status" | "candidate" | "toolbar";

export function resolveKeyboardHeaderMode(options: {
  ready: boolean;
  error: string | null;
  compositionActive: boolean;
  candidateCount: number;
}): KeyboardHeaderMode {
  if (!options.ready || options.error) return "status";
  if (options.candidateCount > 0) return "candidate";
  if (options.compositionActive) return "status";
  return "toolbar";
}
