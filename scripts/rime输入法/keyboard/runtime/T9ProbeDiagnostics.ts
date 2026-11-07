/**
 * Opt-in diagnostic of the nine-key F23 probe only.
 * Stores aggregate timings; no key values, pinyin, candidate text or schema.
 * Disabled mode allocates no recorder and adds no timing calls to Rime.
 */
export const T9_PROBE_ENABLED_KEY = "rime_keyboard_f23_probe_enabled_v1";
export const T9_PROBE_LAST_KEY = "rime_keyboard_f23_probe_last_v1";
const SHARED = { shared: true } as const;
const SLOW_THRESHOLD_MS = 8;

export type T9ProbeTiming = {
  processMs: number;
  propertyMs: number;
  parseMs: number;
  totalMs: number;
  failed: boolean;
};
export type T9ProbeReport = {
  version: 1;
  recordedAt: number;
  count: number;
  totalMs: number;
  processMs: number;
  propertyMs: number;
  parseMs: number;
  maxMs: number;
  slowCount: number;
  failures: number;
};

function storage(): any { return (globalThis as any).Storage; }
function read(key: string): unknown {
  try {
    const api = storage();
    const value = typeof api?.get === "function"
      ? api.get(key, SHARED)
      : typeof api?.getString === "function"
      ? api.getString(key, SHARED) : null;
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch { return null; }
}
function write(key: string, value: unknown): boolean {
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
export function isT9ProbeEnabled(): boolean {
  return read(T9_PROBE_ENABLED_KEY) === true;
}
export function setT9ProbeEnabled(enabled: boolean): boolean {
  return write(T9_PROBE_ENABLED_KEY, enabled);
}
export function clearT9ProbeReport(): boolean {
  return write(T9_PROBE_LAST_KEY, null);
}
export function readT9ProbeReport(): T9ProbeReport | null {
  const value = read(T9_PROBE_LAST_KEY) as T9ProbeReport | null;
  if (!value || value.version !== 1 ||
      !["recordedAt","count","totalMs","processMs","propertyMs","parseMs",
        "maxMs","slowCount","failures"].every((name) =>
        Number.isFinite((value as any)[name]) && (value as any)[name] >= 0)) return null;
  return value;
}
export function t9ProbeNow(): number {
  const perf = (globalThis as any).performance;
  return typeof perf?.now === "function" ? perf.now() : Date.now();
}
export class T9ProbeDiagnostics {
  private report: T9ProbeReport = {
    version: 1, recordedAt: Date.now(), count: 0, totalMs: 0,
    processMs: 0, propertyMs: 0, parseMs: 0, maxMs: 0,
    slowCount: 0, failures: 0
  };
  record(timing: T9ProbeTiming): void {
    const total = Math.max(0, timing.totalMs);
    this.report.count++;
    this.report.totalMs += total;
    this.report.processMs += Math.max(0, timing.processMs);
    this.report.propertyMs += Math.max(0, timing.propertyMs);
    this.report.parseMs += Math.max(0, timing.parseMs);
    this.report.maxMs = Math.max(this.report.maxMs, total);
    if (total >= SLOW_THRESHOLD_MS) this.report.slowCount++;
    if (timing.failed) this.report.failures++;
    // Periodic checkpoint survives keyboard termination without a per-key write.
    if (this.report.count % 32 === 0) this.flush();
  }
  flush(): boolean {
    if (this.report.count === 0) return true;
    return write(T9_PROBE_LAST_KEY, { ...this.report });
  }
}
export function createT9ProbeDiagnostics(): T9ProbeDiagnostics | null {
  return isT9ProbeEnabled() ? new T9ProbeDiagnostics() : null;
}
