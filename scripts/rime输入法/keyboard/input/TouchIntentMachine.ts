import type { KeyGesture } from "../../contracts/action";

export type SwipeGesture =
  | "swipeUp"
  | "swipeDown"
  | "swipeLeft"
  | "swipeRight";

export type TouchIntentState =
  | "idle"
  | "pending"
  | "swipeLocked"
  | "longPressLocked";

export type TouchTranslation = {
  dx: number;
  dy: number;
};

export type TouchIntentResolution =
  | { type: "gesture"; gesture: KeyGesture }
  | { type: "consumed" }
  | { type: "none" };

export type TouchIntentSnapshot = {
  state: TouchIntentState;
  lockedSwipe: SwipeGesture | null;
  longPressEligible: boolean;
  exceededSwipeThreshold: boolean;
};

export const SWIPE_TRIGGER_DISTANCE = 50;
export const SWIPE_TANGENT_THRESHOLD = 0.577;
export const LONG_PRESS_DURATION = 520;
export const LONG_PRESS_CANCEL_DISTANCE = 4;

const NONE: TouchIntentResolution = { type: "none" };

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function normalizedTranslation(translation: TouchTranslation): TouchTranslation {
  return {
    dx: finite(translation.dx),
    dy: finite(translation.dy)
  };
}

export function swipeGestureForTranslation(
  translation: TouchTranslation
): SwipeGesture | null {
  const { dx, dy } = normalizedTranslation(translation);
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);
  if (absDx < SWIPE_TRIGGER_DISTANCE && absDy < SWIPE_TRIGGER_DISTANCE) {
    return null;
  }

  if (absDy >= absDx) {
    if (absDy <= 0 || absDx / absDy > SWIPE_TANGENT_THRESHOLD) return null;
    return dy < 0 ? "swipeUp" : "swipeDown";
  }
  if (absDx <= 0 || absDy / absDx > SWIPE_TANGENT_THRESHOLD) return null;
  return dx < 0 ? "swipeLeft" : "swipeRight";
}

export function createTouchIntentMachine() {
  let state: TouchIntentState = "idle";
  let lockedSwipe: SwipeGesture | null = null;
  let longPressEligible = false;
  let exceededSwipeThreshold = false;

  function reset() {
    state = "idle";
    lockedSwipe = null;
    longPressEligible = false;
    exceededSwipeThreshold = false;
  }

  function observe(translation: TouchTranslation) {
    if (state !== "pending") return;
    const { dx, dy } = normalizedTranslation(translation);
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx >= LONG_PRESS_CANCEL_DISTANCE || absDy >= LONG_PRESS_CANCEL_DISTANCE) {
      longPressEligible = false;
    }
    if (absDx >= SWIPE_TRIGGER_DISTANCE || absDy >= SWIPE_TRIGGER_DISTANCE) {
      exceededSwipeThreshold = true;
    }

    const swipe = swipeGestureForTranslation({ dx, dy });
    if (!swipe) return;
    lockedSwipe = swipe;
    longPressEligible = false;
    state = "swipeLocked";
  }

  return {
    snapshot(): TouchIntentSnapshot {
      return {
        state,
        lockedSwipe,
        longPressEligible,
        exceededSwipeThreshold
      };
    },

    begin(): boolean {
      if (state !== "idle") return false;
      state = "pending";
      lockedSwipe = null;
      longPressEligible = true;
      exceededSwipeThreshold = false;
      return true;
    },

    update(translation: TouchTranslation): void {
      observe(translation);
    },

    longPressElapsed(): TouchIntentResolution {
      if (state !== "pending" || !longPressEligible || exceededSwipeThreshold) {
        return NONE;
      }
      state = "longPressLocked";
      return { type: "gesture", gesture: "longPress" };
    },

    end(translation: TouchTranslation = { dx: 0, dy: 0 }): TouchIntentResolution {
      if (state === "idle") return NONE;
      if (state === "pending") observe(translation);

      if (state === "swipeLocked") {
        const gesture = lockedSwipe;
        reset();
        return gesture ? { type: "gesture", gesture } : { type: "consumed" };
      }
      if (state === "longPressLocked") {
        reset();
        return NONE;
      }
      if (state === "pending") {
        const resolution: TouchIntentResolution = exceededSwipeThreshold
          ? { type: "consumed" }
          : { type: "gesture", gesture: "tap" };
        reset();
        return resolution;
      }

      reset();
      return NONE;
    },

    cancel(): boolean {
      const active = state !== "idle";
      reset();
      return active;
    }
  };
}
