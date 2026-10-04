export const BACKSPACE_LONG_PRESS_DURATION = 520;
export const BACKSPACE_REPEAT_INTERVAL = 82;
export const BACKSPACE_REPEAT_SAFETY_DURATION = 4200;
export const BACKSPACE_REPEAT_CANCEL_DISTANCE = 5;
export const BACKSPACE_REPEAT_CANCEL_VELOCITY = 8;

function absoluteNumber(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.abs(number) : 0;
}


export function shouldCancelBackspaceRepeat(details: any): boolean {
  const dx = absoluteNumber(details?.translation?.width);
  const dy = absoluteNumber(details?.translation?.height);
  const vx = absoluteNumber(details?.velocity?.width);
  const vy = absoluteNumber(details?.velocity?.height);
  const predictedDx = absoluteNumber(details?.predictedEndTranslation?.width);
  const predictedDy = absoluteNumber(details?.predictedEndTranslation?.height);
  return (
    dx >= BACKSPACE_REPEAT_CANCEL_DISTANCE ||
    dy >= BACKSPACE_REPEAT_CANCEL_DISTANCE ||
    vx >= BACKSPACE_REPEAT_CANCEL_VELOCITY ||
    vy >= BACKSPACE_REPEAT_CANCEL_VELOCITY ||
    predictedDx >= BACKSPACE_REPEAT_CANCEL_VELOCITY ||
    predictedDy >= BACKSPACE_REPEAT_CANCEL_VELOCITY
  );
}

export function createBackspaceRepeatController() {
  let repeatTimer: any = null;
  let safetyTimer: any = null;
  let token = 0;
  let active = false;

  function stop() {
    token += 1;
    active = false;
    if (repeatTimer != null) clearTimeout(repeatTimer);
    if (safetyTimer != null) clearTimeout(safetyTimer);
    repeatTimer = null;
    safetyTimer = null;
  }

  function start(onStep: () => void, onSafetyStop?: () => void) {
    stop();
    const currentToken = ++token;
    active = true;
    onStep();

    const repeat = () => {
      if (!active || currentToken !== token) return;
      onStep();
      if (!active || currentToken !== token) return;
      repeatTimer = setTimeout(repeat, BACKSPACE_REPEAT_INTERVAL);
    };

    repeatTimer = setTimeout(repeat, BACKSPACE_REPEAT_INTERVAL);
    safetyTimer = setTimeout(() => {
      if (!active || currentToken !== token) return;
      stop();
      onSafetyStop?.();
    }, BACKSPACE_REPEAT_SAFETY_DURATION);
  }

  function isActive() {
    return active;
  }

  return { start, stop, isActive };
}
