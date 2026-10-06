import { Path } from "scripting";
import type { ChineseLayoutId } from "../../contracts/preferences";

type RimeSchemeFamily = "wanxiang" | "rime_ice";
export type RimeSchemeDescriptor = {
  id: string;
  name: string;
  family: RimeSchemeFamily;
  layout: ChineseLayoutId;
};

export type RuntimeSchemaLike = {
  id?: string | null;
  name?: string | null;
};

const AUX_WANXIANG_SUFFIX = /(?:_mixedcode|_reverse|_english|_charset|_symbols|_people|_abbrev|_phrase)$/;

function parseSchemaMeta(text: string): { id: string; name: string } {
  const source = String(text ?? "");
  const id = source.match(/^\s*schema_id:\s*["']?([^"'\s#]+)["']?/m)?.[1]?.trim() ?? "";
  const name = source.match(/^\s*name:\s*["']?([^"'\n#]+)["']?/m)?.[1]?.trim() ?? "";
  return { id, name: name || id };
}

function classifySchema(id: string, text = ""): Omit<RimeSchemeDescriptor, "name"> | null {
  if (id.startsWith("wanxiang")) {
    if (AUX_WANXIANG_SUFFIX.test(id)) return null;
    return {
      id,
      family: "wanxiang",
      layout: id === "wanxiang_t9" || id === "wanxiang_t9i" ? "t9" : "qwerty"
    };
  }
  if (id === "rime_ice") {
    return { id, family: "rime_ice", layout: "qwerty" };
  }
  if (id === "t9" && /^__include:\s*rime_ice\.schema\.yaml:\/\s*$/m.test(text)) {
    return { id, family: "rime_ice", layout: "t9" };
  }
  return null;
}

/**
 * Current clean-input runtime compatibility boundary.
 * T9 was accepted on-device only against ordinary wanxiang_t9 + T9Bridge.
 * Do not expose wanxiang_t9i/Rime-Ice T9 as usable until their input contract is
 * independently implemented and accepted.
 */
export function isKeyboardCompatibleScheme(scheme: RimeSchemeDescriptor): boolean {
  return scheme.layout === "qwerty" || scheme.id === "wanxiang_t9";
}

export function sharedRimeDataDir(): string {
  const rime = (globalThis as any).Rime;
  const direct = String(rime?.sharedDataDir ?? "").trim();
  if (direct) return direct;

  const fm = (globalThis as any).FileManager;
  const appGroupDocumentsDirectory = String(fm?.appGroupDocumentsDirectory ?? "").trim();
  if (!appGroupDocumentsDirectory) return "";
  const appGroupRoot = String(Path.dirname(appGroupDocumentsDirectory)).trim();
  return String(Path.join(appGroupRoot, "Rime", "shared")).trim();
}

async function readDirectory(path: string): Promise<string[]> {
  const fm = (globalThis as any).FileManager;
  if (!fm || !path) return [];
  try {
    if (typeof fm.readDirectorySync === "function") {
      return (fm.readDirectorySync(path, false) ?? []).map((item: unknown) => String(item));
    }
    if (typeof fm.readDirectory === "function") {
      return (await fm.readDirectory(path, false) ?? []).map((item: unknown) => String(item));
    }
  } catch {}
  return [];
}

async function readText(path: string): Promise<string> {
  const fm = (globalThis as any).FileManager;
  if (!fm || !path) return "";
  try {
    if (typeof fm.readAsStringSync === "function") {
      return String(fm.readAsStringSync(path, "utf-8") ?? "");
    }
    if (typeof fm.readAsString === "function") {
      return String(await fm.readAsString(path, "utf-8") ?? "");
    }
  } catch {}
  return "";
}

export function listRuntimeSupportedRimeSchemes(
  runtimeSchemas: readonly RuntimeSchemaLike[]
): RimeSchemeDescriptor[] {
  const result: RimeSchemeDescriptor[] = [];
  for (const schema of runtimeSchemas) {
    const id = String(schema?.id ?? "").trim();
    if (!id) continue;
    const classified = classifySchema(id);
    if (!classified) continue;
    const descriptor = { ...classified, name: String(schema?.name ?? "").trim() || id };
    if (isKeyboardCompatibleScheme(descriptor)) result.push(descriptor);
  }
  return result;
}

function hasAsciiMode(text: string, descriptor: RimeSchemeDescriptor): boolean {
  // YAML switch declarations commonly carry end-of-line comments, e.g.
  // `- name: ascii_mode  # 中英输入状态`. The comment is metadata and must
  // not make a real main schema look incompatible.
  if (/^\s*-\s*name:\s*ascii_mode(?:\s+#.*)?\s*$/m.test(text) || /^\s*name:\s*ascii_mode(?:\s+#.*)?\s*$/m.test(text)) {
    return true;
  }
  // Rime-Ice T9 inherits its switch list from rime_ice; retain it in installed
  // discovery so the settings layer can classify it, even though the current
  // T9 runtime intentionally marks it incompatible.
  return descriptor.family === "rime_ice" && descriptor.layout === "t9";
}

export async function listInstalledRimeSchemes(): Promise<RimeSchemeDescriptor[]> {
  const root = sharedRimeDataDir();
  const names = await readDirectory(root);
  if (!names.length) return [];

  const result: RimeSchemeDescriptor[] = [];
  for (const file of names.filter((name) => name.endsWith(".schema.yaml")).sort()) {
    const text = await readText(String(Path.join(root, file)));
    const meta = parseSchemaMeta(text);
    if (!meta.id) continue;
    const classified = classifySchema(meta.id, text);
    if (!classified) continue;
    const descriptor: RimeSchemeDescriptor = { ...classified, name: meta.name || meta.id };
    if (!hasAsciiMode(text, descriptor)) continue;
    result.push(descriptor);
  }
  return result;
}

/**
 * Runtime selectable schemes = installed main schemes ∩ Rime.listSchemas(),
 * then narrowed to schemes the clean keyboard core currently supports.
 */
export async function listSupportedRimeSchemes(
  runtimeSchemas: readonly RuntimeSchemaLike[]
): Promise<RimeSchemeDescriptor[]> {
  const runtimeById = new Map<string, RuntimeSchemaLike>();
  for (const schema of runtimeSchemas) {
    const id = String(schema?.id ?? "").trim();
    if (id) runtimeById.set(id, schema);
  }

  const installed = await listInstalledRimeSchemes();
  if (!installed.length) return listRuntimeSupportedRimeSchemes(runtimeSchemas);
  return installed
    .filter((scheme) => runtimeById.has(scheme.id) && isKeyboardCompatibleScheme(scheme))
    .map((scheme) => ({
      ...scheme,
      name: scheme.name || String(runtimeById.get(scheme.id)?.name ?? "").trim() || scheme.id
    }));
}

export function resolveSchemaForChineseLayout(
  schemes: readonly RimeSchemeDescriptor[],
  currentSchemaId: string | null | undefined,
  layout: ChineseLayoutId,
  preferredSchemaId = ""
): RimeSchemeDescriptor | null {
  const candidates = schemes.filter((scheme) =>
    scheme.layout === layout && isKeyboardCompatibleScheme(scheme)
  );
  if (!candidates.length) return null;

  const preferred = preferredSchemaId
    ? candidates.find((scheme) => scheme.id === preferredSchemaId) ?? null
    : null;
  if (preferred) return preferred;

  const current = candidates.find((scheme) => scheme.id === currentSchemaId) ?? null;
  if (current) return current;

  if (layout === "t9") {
    return candidates.find((scheme) => scheme.id === "wanxiang_t9") ?? null;
  }

  const wanxiangLite = candidates.find((scheme) => scheme.id === "wanxiang_lite");
  if (wanxiangLite) return wanxiangLite;
  const wanxiang = candidates.find((scheme) => scheme.id === "wanxiang");
  if (wanxiang) return wanxiang;
  return candidates[0] ?? null;
}

export function describeSchemes(schemes: readonly RimeSchemeDescriptor[]): string {
  return schemes.map((scheme) => `${scheme.name} (${scheme.id}, ${scheme.layout})`).join(", ");
}
