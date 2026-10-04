import type { TouchTranslation } from "./TouchIntentMachine";

export type SpaceDragMode = "cursor" | "candidate";

export type SpaceDragUpdate = {
  consumed: boolean;
  steps: number;
};

export const SPACE_CURSOR_DRAG_STEP = 18;
export const SPACE_CANDIDATE_DRAG_STEP = 24;
export const SPACE_DRAG_MAX_CATCH_UP_STEPS = 8;

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clampSteps(value: number): number {
  if (value > SPACE_DRAG_MAX_CATCH_UP_STEPS) return SPACE_DRAG_MAX_CATCH_UP_STEPS;
  if (value < -SPACE_DRAG_MAX_CATCH_UP_STEPS) return -SPACE_DRAG_MAX_CATCH_UP_STEPS;
  return value;
}

export function stepSizeForSpaceDragMode(mode: SpaceDragMode): number {
  return mode === "candidate" ? SPACE_CANDIDATE_DRAG_STEP : SPACE_CURSOR_DRAG_STEP;
}

/**
 * Horizontal space-drag quantizer.
 *
 * The anchor advances by the exact number of consumed cells rather than being
 * recomputed from the gesture origin. This preserves the frozen keyboard's
 * stable reversal feel and prevents accumulated floating-point drift.
 *
 * Unlike the frozen implementation, one callback may catch up multiple cells
 * when the gesture sampler skips intermediate positions. Catch-up is bounded so
 * a single event can never flood the host or Rime with unbounded work.
 */
export function createSpaceDragController() {
  let active = false;
  let consumed = false;
  let anchorX = 0;

  function begin() {
    active = true;
    consumed = false;
    anchorX = 0;
  }

  function reset() {
    active = false;
    consumed = false;
    anchorX = 0;
  }

  function update(translation: TouchTranslation, stepSize: number): SpaceDragUpdate {
    if (!active) begin();
    const dx = finite(translation.dx);
    const dy = finite(translation.dy);
    const safeStep = Math.max(1, Math.abs(finite(stepSize)));

    if (!consumed) {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (absDx < safeStep || absDx < absDy) {
        return { consumed: false, steps: 0 };
      }
      consumed = true;
    }

    const delta = dx - anchorX;
    const rawSteps = Math.trunc(delta / safeStep);
    if (rawSteps === 0) return { consumed: true, steps: 0 };

    const steps = clampSteps(rawSteps);
    anchorX += steps * safeStep;
    return { consumed: true, steps };
  }

  function isConsumed() {
    return consumed;
  }

  return { begin, update, reset, isConsumed };
}
