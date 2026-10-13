/** Opt-in, single-write keyboard startup trace. No user text or schema names.
 * Exactly one shared Storage read per launch, and no recording when disabled.
 */
export const STARTUP_TRACE_ENABLED_KEY = "rime_keyboard_startup_trace_enabled_v1";
export const STARTUP_TRACE_LAST_KEY = "rime_keyboard_startup_trace_last_v1";

const SHARED = { shared: true } as const;
const MAX_MARKS = 48;
export type StartupOutcome = "ready" | "error" | "cancelled";
export type StartupLayout = "t9" | "qwerty";

export type StartupMark = {
  phase: string;
  elapsedMs: number;
};

export type StartupTraceReport = {
  version: 1;
  recordedAt: number;
  layout: StartupLayout;
  outcome: StartupOutcome;
  marks: StartupMark[];
};

type StartupStorage = {
  get?: (key: string, options: typeof SHARED) => unknown;
  getString?: (key: string, options: typeof SHARED) => unknown;
  set?: (key: string, value: unknown, options: typeof SHARED) => boolean | void;
  setString?: (key: string, value: string, options: typeof SHARED) => void;
};

function storage(): StartupStorage | null {
  return (globalThis as any).Storage ?? null;
}

function readShared(key: string): unknown {
  try {
    const api = storage();
    const raw = typeof api?.get === "function"
      ? api.get(key, SHARED)
      : typeof api?.getString === "function"
      ? api.getString(key, SHARED)
      : null;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

function writeShared(key: string, value: unknown): boolean {
  try {
    const api = storage();
    if (typeof api?.set === "function") return api.set(key, value, SHARED) !== false;
    if (typeof api?.setString === "function") {
      api.setString(key, JSON.stringify(value), SHARED);
      return true;
    }
  } catch {}
  return false;
}

export function isStartupTraceEnabled(): boolean {
  return readShared(STARTUP_TRACE_ENABLED_KEY) === true;
}

export function setStartupTraceEnabled(enabled: boolean): boolean {
  return writeShared(STARTUP_TRACE_ENABLED_KEY, enabled);
}

export function readLastStartupTrace(): StartupTraceReport | null {
  const data = readShared(STARTUP_TRACE_LAST_KEY) as any;
  if (!data || data.version !== 1 || !Array.isArray(data.marks) ||
      !Number.isFinite(data.recordedAt) || data.marks.length > MAX_MARKS ||
      !["ready", "error", "cancelled"].includes(data.outcome) ||
      !["t9", "qwerty"].includes(data.layout)) return null;
  if (!data.marks.every((x: any) => typeof x?.phase === "string" &&
      x.phase.length <= 64 && Number.isFinite(x.elapsedMs) &&
      x.elapsedMs >= 0)) return null;
  return data as StartupTraceReport;
}

export function clearLastStartupTrace(): boolean {
  return writeShared(STARTUP_TRACE_LAST_KEY, null);
}

function monotonicNow(): number {
  try {
    const perf = (globalThis as any).performance;
    if (typeof perf?.now === "function") return perf.now();
  } catch {}
  return Date.now();
}

export class StartupTrace {
  private readonly origin = monotonicNow();
  private readonly recordedAt = Date.now();
  private readonly marks: StartupMark[] = [];
  private completed = false;
  private layout: StartupLayout = "t9";

  setLayout(layout: StartupLayout): void {
    this.layout = layout;
  }

  mark(phase: string): void {
    if (this.completed || this.marks.length >= MAX_MARKS) return;
    // Phases are authored constants. Never pass input text or file names here.
    const elapsed = Math.max(0, monotonicNow() - this.origin);
    this.marks.push({ phase, elapsedMs: Math.round(elapsed * 10) / 10 });
  }

  finish(outcome: StartupOutcome): void {
    if (this.completed) return;
    this.mark("startup." + outcome);
    this.completed = true;
    writeShared(STARTUP_TRACE_LAST_KEY, {
      version: 1,
      recordedAt: this.recordedAt,
      layout: this.layout,
      outcome,
      marks: this.marks.slice()
    } satisfies StartupTraceReport);
  }
}

export function createStartupTrace(): StartupTrace | null {
  return isStartupTraceEnabled() ? new StartupTrace() : null;
}
