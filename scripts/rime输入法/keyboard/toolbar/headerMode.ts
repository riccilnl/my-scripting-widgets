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


/**
 * Keep status/candidates visible regardless of the toolbar switch.
 * Suppress only the idle toolbar while preserving its reserved geometry.
 */
export function shouldRenderKeyboardHeader(options: {
  showToolbar: boolean;
  ready: boolean;
  error: string | null;
  compositionActive: boolean;
  candidateCount: number;
}): boolean {
  return options.showToolbar || resolveKeyboardHeaderMode(options) !== "toolbar";
}
