type HapticPlayerPool = {
  players: any[];
  nextIndex: number;
};

const PLAYER_POOL_SIZE = 3;
const INTENSITY = 0.56;
const SHARPNESS = 0.56;

let engine: any = null;
let startPromise: Promise<void> | null = null;
let ready = false;
let generation = 0;
let pool: HapticPlayerPool | null = null;

function globals() {
  const scope = globalThis as any;
  return {
    HapticEngine: scope.HapticEngine,
    HapticPattern: scope.HapticPattern,
    HapticEvent: scope.HapticEvent,
    HapticEventParameter: scope.HapticEventParameter,
    Haptics: scope.Haptics
  };
}

function clearPreparedState() {
  generation += 1;
  ready = false;
  startPromise = null;
  pool = null;
}

function convenienceTransient() {
  try {
    const { Haptics } = globals();
    if (Haptics?.transient && Haptics.supportsHaptics !== false) {
      void Haptics.transient(INTENSITY, SHARPNESS);
      return true;
    }
  } catch {}
  return false;
}

function makePlayer() {
  if (!engine) return null;
  if (pool?.players.length) {
    const player = pool.players[pool.nextIndex];
    pool.nextIndex = (pool.nextIndex + 1) % pool.players.length;
    return player;
  }

  const { HapticPattern, HapticEvent, HapticEventParameter } = globals();
  if (!HapticPattern || !HapticEvent || !HapticEventParameter) return null;
  const pattern = new HapticPattern([
    new HapticEvent("hapticTransient", [
      new HapticEventParameter("hapticIntensity", INTENSITY),
      new HapticEventParameter("hapticSharpness", SHARPNESS)
    ], 0)
  ]);
  const players = Array.from({ length: PLAYER_POOL_SIZE }, () => engine.makePlayer(pattern));
  pool = { players, nextIndex: players.length > 1 ? 1 : 0 };
  return players[0] ?? null;
}

export function disposeKeyboardHaptics() {
  const old = engine;
  engine = null;
  clearPreparedState();
  if (!old) return;
  try { void old.stop?.(); } catch {}
  try { old.dispose?.(); } catch {}
}

export function prepareKeyboardHaptics(enabled: boolean) {
  if (!enabled || ready || startPromise) return;
  const { HapticEngine } = globals();
  if (!HapticEngine || HapticEngine.supportsHaptics === false) return;

  try {
    if (!engine) {
      engine = new HapticEngine();
      try { engine.autoShutdownEnabled = false; } catch {}
      try { engine.playsHapticsOnly = true; } catch {}
      const ownedEngine = engine;
      ownedEngine.onStopped = () => {
        if (engine !== ownedEngine) return;
        clearPreparedState();
      };
      ownedEngine.onReset = () => {
        if (engine !== ownedEngine) return;
        clearPreparedState();
        prepareKeyboardHaptics(true);
      };
    }

    const ownedEngine = engine;
    const ownedGeneration = generation;
    const result = ownedEngine.startAsync ? ownedEngine.startAsync() : ownedEngine.start?.();
    let pending: Promise<void>;
    pending = Promise.resolve(result)
      .then(() => {
        if (engine !== ownedEngine || generation !== ownedGeneration) return;
        ready = true;
        if (startPromise === pending) startPromise = null;
        makePlayer();
      })
      .catch(() => {
        if (engine === ownedEngine) disposeKeyboardHaptics();
      });
    startPromise = pending;
  } catch {
    disposeKeyboardHaptics();
  }
}

export function playKeyboardHaptic(enabled: boolean) {
  if (!enabled) return;
  const { HapticEngine } = globals();
  if (!HapticEngine || HapticEngine.supportsHaptics === false) {
    convenienceTransient();
    return;
  }

  if (!ready || !engine) {
    prepareKeyboardHaptics(true);
    convenienceTransient();
    return;
  }

  try {
    makePlayer()?.start?.(0);
  } catch {
    disposeKeyboardHaptics();
    convenienceTransient();
  }
}
