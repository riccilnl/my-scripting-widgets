import { Path } from "scripting";
import { T9_BRIDGE_LUA } from "./T9BridgeAsset";

const TARGET_SCHEMA_ID = "wanxiang_t9";
const BRIDGE_FILENAME = "t9_bridge.lua";
const PROCESSOR_COMPONENT = "lua_processor@*t9_bridge*processor";
const FILTER_COMPONENT = "lua_filter@*t9_bridge*filter";
const PROCESSOR_PATCH_PREFIX = "engine/processors/@before ";
const FILTER_PATCH_PREFIX = "engine/filters/@before ";

type RimePaths = {
  rootDir: string;
  sharedDataDir: string;
  userDataDir: string;
};

function rimePaths(): RimePaths {
  const fm = (globalThis as any).FileManager;
  const rime = (globalThis as any).Rime;
  const sharedDataDir = String(rime?.sharedDataDir ?? "").trim();
  const userDataDir = String(rime?.userDataDir ?? "").trim();
  if (sharedDataDir || userDataDir) {
    const rootDir = String(Path.dirname(sharedDataDir || userDataDir)).trim();
    return {
      rootDir,
      sharedDataDir: sharedDataDir || String(Path.join(rootDir, "shared")).trim(),
      userDataDir: userDataDir || String(Path.join(rootDir, "user")).trim(),
    };
  }

  const appGroupDocumentsDirectory = String(fm?.appGroupDocumentsDirectory ?? "").trim();
  if (!appGroupDocumentsDirectory) return { rootDir: "", sharedDataDir: "", userDataDir: "" };
  const appGroupRoot = String(Path.dirname(appGroupDocumentsDirectory)).trim();
  const rootDir = String(Path.join(appGroupRoot, "Rime")).trim();
  return {
    rootDir,
    sharedDataDir: String(Path.join(rootDir, "shared")).trim(),
    userDataDir: String(Path.join(rootDir, "user")).trim(),
  };
}

async function exists(fm: any, path: string): Promise<boolean> {
  try {
    if (typeof fm.existsSync === "function") return Boolean(fm.existsSync(path));
    if (typeof fm.fileExists === "function") return Boolean(fm.fileExists(path));
    if (typeof fm.exists === "function") return Boolean(await fm.exists(path));
  } catch {}
  return false;
}

async function mkdir(fm: any, path: string): Promise<boolean> {
  try {
    if (await exists(fm, path)) return true;
    if (typeof fm.createDirectorySync === "function") {
      fm.createDirectorySync(path);
      return true;
    }
    if (typeof fm.createDirectory === "function") {
      await fm.createDirectory(path);
      return true;
    }
  } catch {}
  return await exists(fm, path);
}

async function readText(fm: any, path: string): Promise<string> {
  try {
    if (!(await exists(fm, path))) return "";
    if (typeof fm.readAsStringSync === "function") return String(fm.readAsStringSync(path, "utf-8") ?? "");
    if (typeof fm.readAsString === "function") return String(await fm.readAsString(path, "utf-8") ?? "");
  } catch {}
  return "";
}

async function writeText(fm: any, path: string, value: string): Promise<boolean> {
  try {
    if (typeof fm.writeAsStringSync === "function") {
      fm.writeAsStringSync(path, value);
      return true;
    }
    if (typeof fm.writeAsString === "function") {
      await fm.writeAsString(path, value);
      return true;
    }
    if (typeof fm.writeString === "function") {
      await fm.writeString(path, value);
      return true;
    }
  } catch {}
  return false;
}

function hasComponent(text: string, component: string): boolean {
  return String(text ?? "").split("\n").some((line) => {
    const trimmed = line.trim();
    return !trimmed.startsWith("#") && trimmed.includes(component);
  });
}

function nextPatchIndex(text: string, section: "processors" | "filters"): number {
  const used = new Set<number>();
  const pattern = section === "processors"
    ? /engine\/processors\/@before\s+(\d+)/
    : /engine\/filters\/@before\s+(\d+)/;
  for (const line of String(text ?? "").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue;
    const match = trimmed.match(pattern);
    if (match) used.add(Number(match[1]));
  }
  let index = 0;
  while (used.has(index)) index += 1;
  return index;
}

function ensureRegistration(customText: string): { changed: boolean; text: string } {
  const normalized = String(customText ?? "").replace(/\r\n?/g, "\n");
  if (/^[ \t]*patch:[ \t]*\S+/m.test(normalized)) {
    throw new Error("wanxiang_t9.custom.yaml 使用了行内 patch，无法安全注册九键输入桥");
  }

  const additions: string[] = [];
  if (!hasComponent(normalized, PROCESSOR_COMPONENT)) {
    additions.push(`  "${PROCESSOR_PATCH_PREFIX}${nextPatchIndex(normalized, "processors")}": ${PROCESSOR_COMPONENT}`);
  }
  if (!hasComponent(normalized, FILTER_COMPONENT)) {
    additions.push(`  "${FILTER_PATCH_PREFIX}${nextPatchIndex(normalized, "filters")}": ${FILTER_COMPONENT}`);
  }
  if (additions.length === 0) return { changed: false, text: normalized };

  if (/^patch:[ \t]*$/m.test(normalized)) {
    return {
      changed: true,
      text: normalized.replace(/^patch:[ \t]*$/m, (header) => `${header}\n${additions.join("\n")}`),
    };
  }

  const prefix = normalized.trimEnd();
  return {
    changed: true,
    text: `${prefix}${prefix ? "\n\n" : ""}patch:\n${additions.join("\n")}\n`,
  };
}

export async function prepareT9BridgeRuntime(): Promise<boolean> {
  const fm = (globalThis as any).FileManager;
  const rime = (globalThis as any).Rime;
  if (!fm || !rime) return false;

  const paths = rimePaths();
  if (!paths.userDataDir || !paths.sharedDataDir) return false;

  const luaDir = String(Path.join(paths.userDataDir, "lua")).trim();
  const luaPath = String(Path.join(luaDir, BRIDGE_FILENAME)).trim();
  const customPath = String(Path.join(paths.sharedDataDir, `${TARGET_SCHEMA_ID}.custom.yaml`)).trim();

  if (!(await mkdir(fm, paths.userDataDir)) || !(await mkdir(fm, luaDir)) || !(await mkdir(fm, paths.sharedDataDir))) {
    return false;
  }

  let luaChanged = false;
  if (await readText(fm, luaPath) !== T9_BRIDGE_LUA) {
    if (!(await writeText(fm, luaPath, T9_BRIDGE_LUA))) return false;
    luaChanged = true;
  }

  const before = await readText(fm, customPath);
  const registration = ensureRegistration(before);
  if (registration.changed && !(await writeText(fm, customPath, registration.text))) {
    return false;
  }

  const changed = luaChanged || registration.changed;
  if (changed) {
    if (typeof rime.deploy !== "function") throw new Error("当前 Scripting Rime API 不支持 deploy，无法启用九键输入桥");
    await rime.deploy();
  }

  return true;
}
