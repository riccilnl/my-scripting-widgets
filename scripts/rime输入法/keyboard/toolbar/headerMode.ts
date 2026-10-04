export type KeyboardHeaderMode = "status" | "candidate" | "toolbar";

export function resolveKeyboardHeaderMode(options: {
  ready: boolean;
  error: string | null;
  compositionActive: boolean;
  candidateCount: number;
}): KeyboardHeaderMode {
  if (!options.ready || options.error) return "status";
  if (options.compositionActive || options.candidateCount > 0) return "candidate";
  return "toolbar";
}
