type KeyboardAction = () => void;

const queuedActions: KeyboardAction[] = [];
let head = 0;
let executing = false;
let microtaskScheduled = false;
let generation = 0;

function pendingCount() {
  return queuedActions.length - head;
}

function resetConsumed() {
  queuedActions.length = 0;
  head = 0;
}

function execute(action: KeyboardAction) {
  executing = true;
  try {
    action();
  } catch (error) {
    console.error("Keyboard action failed", error);
  } finally {
    executing = false;
  }
}

function drainQueuedActions() {
  microtaskScheduled = false;
  while (head < queuedActions.length) {
    const action = queuedActions[head++];
    execute(action);
  }
  resetConsumed();
}

function scheduleDrain() {
  if (microtaskScheduled || executing || pendingCount() === 0) return;
  const scheduledGeneration = generation;
  microtaskScheduled = true;
  void Promise.resolve().then(() => {
    if (scheduledGeneration !== generation) return;
    drainQueuedActions();
  });
}

/**
 * Preserve the frozen keyboard's important delivery contract without bringing
 * back the frozen gesture infrastructure: normal taps execute immediately;
 * only re-entrant actions are serialized FIFO instead of entering the input
 * transaction while it is already running.
 */
export function dispatchKeyboardAction(action: KeyboardAction) {
  if (!executing && !microtaskScheduled && pendingCount() === 0) {
    execute(action);
    scheduleDrain();
    return;
  }
  queuedActions.push(action);
  scheduleDrain();
}

export function clearKeyboardActionQueue() {
  generation += 1;
  microtaskScheduled = false;
  executing = false;
  resetConsumed();
}
