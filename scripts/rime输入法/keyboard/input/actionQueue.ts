type KeyboardAction = () => void | Promise<void>;

const queuedActions: KeyboardAction[] = [];
let head = 0;
let executing = false;
let draining = false;
let microtaskScheduled = false;
let generation = 0;

function pendingCount() {
  return queuedActions.length - head;
}

function resetConsumed() {
  queuedActions.length = 0;
  head = 0;
}

function scheduleDrain() {
  if (microtaskScheduled || executing || draining || pendingCount() === 0) return;
  const scheduledGeneration = generation;
  microtaskScheduled = true;
  void Promise.resolve().then(() => {
    if (scheduledGeneration !== generation) return;
    microtaskScheduled = false;
    drainQueuedActions();
  });
}

function execute(action: KeyboardAction) {
  const startedGeneration = generation;
  executing = true;
  let result: void | Promise<void>;
  try {
    result = action();
  } catch (error) {
    console.error("Keyboard action failed", error);
    executing = false;
    return;
  }
  if (result && typeof (result as Promise<void>).then === "function") {
    void Promise.resolve(result).then(
      () => complete(),
      (error) => { console.error("Keyboard action failed", error); complete(); }
    );
    return;
  }
  executing = false;

  function complete() {
    if (generation !== startedGeneration) return;
    executing = false;
    scheduleDrain();
  }
}

function drainQueuedActions() {
  if (executing || draining) return;
  draining = true;
  try {
    while (!executing && pendingCount() > 0) {
      const action = queuedActions[head++];
      execute(action);
    }
    if (pendingCount() === 0) resetConsumed();
  } finally {
    draining = false;
  }
}

/**
 * Normal key taps execute synchronously when idle. Reentrant taps and
 * asynchronous host actions are serialized FIFO. Clearing on unmount also
 * invalidates callbacks from the previous queue generation.
 */
export function dispatchKeyboardAction(action: KeyboardAction) {
  if (!executing && !draining && !microtaskScheduled && pendingCount() === 0) {
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
  draining = false;
  resetConsumed();
}
