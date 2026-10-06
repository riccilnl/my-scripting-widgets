import { Path, fetch } from "scripting";
import { sharedRimeDataDir } from "../../core/rime/SchemeCatalog";
import {
  readWanxiangUpdaterMetadata,
  wanxiangAssetMark,
  writeWanxiangUpdaterMetadata,
  type WanxiangRemoteAsset,
  type WanxiangUpdaterMetadata
} from "./WanxiangRelease";

function manager(): any {
  const value = (globalThis as any).FileManager;
  if (!value) throw new Error("FileManager API 不可用");
  return value;
}

async function exists(path: string): Promise<boolean> {
  try { return await manager().exists(path); } catch { return false; }
}

async function removeIfExists(path: string): Promise<void> {
  try {
    if (await exists(path)) await manager().remove(path);
  } catch {}
}

async function ensureDirectory(path: string): Promise<void> {
  const fm = manager();
  if (await exists(path)) {
    try {
      if (await fm.isDirectory(path)) return;
    } catch {}
    await fm.remove(path);
  }
  await fm.createDirectory(path, true);
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

async function fetchDownload(asset: WanxiangRemoteAsset, destination: string): Promise<void> {
  const response = await fetch(asset.url, {
    headers: { "User-Agent": "Scripting-Rime-Wanxiang-Updater" }
  } as any);
  if (!response.ok) throw new Error(`下载失败：HTTP ${response.status}`);
  await manager().writeAsBytes(destination, new Uint8Array(await response.arrayBuffer()));
}

async function downloadAsset(
  asset: WanxiangRemoteAsset,
  onProgress?: (value: number) => void
): Promise<string> {
  const fm = manager();
  const destination = String(Path.join(
    fm.temporaryDirectory,
    `wanxiang-${Date.now()}-${safeName(asset.name)}`
  ));
  await removeIfExists(destination);

  const background = (globalThis as any).BackgroundURLSession;
  if (background && typeof background.startDownload === "function") {
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const task = background.startDownload({
        url: asset.url,
        destination,
        headers: { "User-Agent": "Scripting-Rime-Wanxiang-Updater" }
      });
      task.onProgress = (detail: any) => {
        const value = Number(detail?.progress);
        if (Number.isFinite(value)) onProgress?.(Math.max(0, Math.min(1, value)));
      };
      task.onFinishDownload = (error: any) => {
        if (finished) return;
        finished = true;
        if (error) reject(new Error(String(error?.message ?? error)));
        else resolve();
      };
      try {
        task.resume();
      } catch (error) {
        if (!finished) {
          finished = true;
          reject(error);
        }
      }
    });
  } else {
    await fetchDownload(asset, destination);
  }

  const stat = await fm.stat(destination);
  const actual = Number(stat?.size ?? 0);
  if (actual <= 0) {
    await removeIfExists(destination);
    throw new Error("下载结果为空文件");
  }
  if (asset.size > 0 && actual !== asset.size) {
    await removeIfExists(destination);
    throw new Error(`下载大小不匹配：远端 ${asset.size} bytes，本地 ${actual} bytes`);
  }
  onProgress?.(1);
  return destination;
}

const SCHEME_FILES_STORAGE_KEY = "rime_input_method_wanxiang_scheme_files_v1";

function readManagedSchemeFiles(): string[] {
  const storage = (globalThis as any).Storage;
  if (!storage) return [];
  try {
    const raw = typeof storage.get === "function"
      ? storage.get(SCHEME_FILES_STORAGE_KEY)
      : typeof storage.getString === "function"
      ? storage.getString(SCHEME_FILES_STORAGE_KEY)
      : null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed)
      ? parsed.filter((item: unknown): item is string => typeof item === "string" && item.length > 0)
      : [];
  } catch {
    return [];
  }
}

function writeManagedSchemeFiles(files: readonly string[]): void {
  const storage = (globalThis as any).Storage;
  if (!storage) return;
  const value = Array.from(new Set(files.map((item) => String(item).trim()).filter(Boolean))).sort();
  if (typeof storage.set === "function") storage.set(SCHEME_FILES_STORAGE_KEY, value);
  else if (typeof storage.setString === "function") storage.setString(SCHEME_FILES_STORAGE_KEY, JSON.stringify(value));
}

function relativePath(root: string, entry: string): string {
  const normalizedRoot = root.replace(/\\/g, "/").replace(/\/+$/, "");
  const value = String(entry).replace(/\\/g, "/");
  if (value === normalizedRoot) return "";
  if (value.startsWith(`${normalizedRoot}/`)) return value.slice(normalizedRoot.length + 1);
  return value.replace(/^\/+/, "");
}

function isProtected(relative: string): boolean {
  const normalized = relative.replace(/\\/g, "/");
  const base = normalized.split("/").pop() ?? "";
  return base.endsWith(".custom.yaml") ||
    base === "custom_phrase.txt" ||
    base === "custom_phrase.dict.yaml" ||
    base === "installation.yaml" ||
    base === "user.yaml";
}

type ProtectedFile = { relative: string; bytes: Uint8Array };

async function captureProtected(root: string): Promise<ProtectedFile[]> {
  const fm = manager();
  if (!(await exists(root))) return [];
  const entries: string[] = await fm.readDirectory(root, true);
  const result: ProtectedFile[] = [];
  for (const entry of entries) {
    const relative = relativePath(root, entry);
    if (!relative || !isProtected(relative)) continue;
    const absolute = String(Path.join(root, relative));
    try {
      if (await fm.isFile(absolute)) {
        result.push({ relative, bytes: await fm.readAsBytes(absolute) });
      }
    } catch {}
  }
  return result;
}

async function restoreProtected(root: string, files: readonly ProtectedFile[]): Promise<void> {
  const fm = manager();
  for (const item of files) {
    const destination = String(Path.join(root, item.relative));
    await ensureDirectory(String(Path.dirname(destination)));
    await fm.writeAsBytes(destination, item.bytes);
  }
}

async function removeManagedSchemeFiles(root: string): Promise<number> {
  const fm = manager();
  let removed = 0;
  for (const relative of readManagedSchemeFiles()) {
    if (!relative || isProtected(relative)) continue;
    const destination = String(Path.join(root, relative));
    try {
      if (!(await exists(destination)) || !(await fm.isFile(destination))) continue;
      await fm.remove(destination);
      removed += 1;
    } catch {}
  }
  return removed;
}

async function mergeWanxiangSchemeDirectory(
  sourceRoot: string,
  destinationRoot: string
): Promise<string[]> {
  const fm = manager();
  const entries: string[] = await fm.readDirectory(sourceRoot, true);
  const copied: string[] = [];

  for (const entry of entries) {
    const relative = relativePath(sourceRoot, entry);
    if (!relative || isProtected(relative)) continue;

    const source = String(Path.join(sourceRoot, relative));
    if (!(await fm.isFile(source))) continue;

    const destination = String(Path.join(destinationRoot, relative));
    await ensureDirectory(String(Path.dirname(destination)));

    if (await exists(destination)) {
      await fm.remove(destination);
    }
    await fm.copyFile(source, destination);
    copied.push(relative);
  }

  return copied;
}

async function installScheme(
  asset: WanxiangRemoteAsset,
  onStage?: (value: string) => void,
  onProgress?: (value: number) => void
): Promise<void> {
  const root = sharedRimeDataDir();
  if (!root) throw new Error("无法定位 Scripting Rime/shared");
  const fm = manager();
  await ensureDirectory(root);

  onStage?.("保护自定义配置…");
  const protectedFiles = await captureProtected(root);
  onStage?.("下载万象 Lite 方案…");
  const archive = await downloadAsset(asset, onProgress);
  const extracted = String(Path.join(fm.temporaryDirectory, `wanxiang-scheme-${Date.now()}`));
  await removeIfExists(extracted);
  await ensureDirectory(extracted);

  try {
    onStage?.("解压方案…");
    await fm.unzip(archive, extracted);

    const removed = await removeManagedSchemeFiles(root);
    if (removed > 0) onStage?.(`已清理旧方案文件：${removed} 个`);

    onStage?.("合并并覆盖方案文件…");
    const copied = await mergeWanxiangSchemeDirectory(extracted, root);
    writeManagedSchemeFiles(copied);
  } finally {
    try {
      await restoreProtected(root, protectedFiles);
    } finally {
      await removeIfExists(archive);
      await removeIfExists(extracted);
    }
  }
}

function dictRelative(relative: string, commonPrefix: string): string {
  let value = relative.replace(/\\/g, "/").replace(/^\/+/, "");
  if (commonPrefix && value.startsWith(`${commonPrefix}/`)) {
    value = value.slice(commonPrefix.length + 1);
  }
  const parts = value.split("/").filter(Boolean);
  const index = parts.findIndex((part) => /^dicts?$/i.test(part));
  return (index >= 0 ? parts.slice(index + 1) : parts).join("/");
}

async function installDictionary(
  asset: WanxiangRemoteAsset,
  onStage?: (value: string) => void,
  onProgress?: (value: number) => void
): Promise<void> {
  const root = sharedRimeDataDir();
  if (!root) throw new Error("无法定位 Scripting Rime/shared");
  const fm = manager();
  const dictRoot = String(Path.join(root, "dicts"));
  await ensureDirectory(dictRoot);

  onStage?.("下载 Lite 词库…");
  const archive = await downloadAsset(asset, onProgress);
  const extracted = String(Path.join(fm.temporaryDirectory, `wanxiang-dicts-${Date.now()}`));
  await removeIfExists(extracted);
  await ensureDirectory(extracted);

  try {
    onStage?.("解压词库…");
    await fm.unzip(archive, extracted);
    const entries: string[] = await fm.readDirectory(extracted, true);
    const files: Array<{ relative: string; absolute: string }> = [];
    for (const entry of entries) {
      const relative = relativePath(extracted, entry);
      if (!relative) continue;
      const absolute = String(Path.join(extracted, relative));
      if (await fm.isFile(absolute)) files.push({ relative, absolute });
    }

    let commonPrefix = "";
    if (files.length) {
      const firstSegments = files.map((item) => item.relative.replace(/\\/g, "/").split("/")[0]);
      const first = firstSegments[0];
      if (first && firstSegments.every((item) => item === first) && /dict/i.test(first)) {
        commonPrefix = first;
      }
    }

    onStage?.("写入词库…");
    for (const item of files) {
      const relative = dictRelative(item.relative, commonPrefix);
      if (!relative || relative === ".DS_Store") continue;
      const destination = String(Path.join(dictRoot, relative));
      await ensureDirectory(String(Path.dirname(destination)));
      if (await exists(destination)) await fm.remove(destination);
      await fm.copyFile(item.absolute, destination);
    }
  } finally {
    await removeIfExists(archive);
    await removeIfExists(extracted);
  }
}

async function installModel(
  asset: WanxiangRemoteAsset,
  onStage?: (value: string) => void,
  onProgress?: (value: number) => void
): Promise<void> {
  const root = sharedRimeDataDir();
  if (!root) throw new Error("无法定位 Scripting Rime/shared");
  await ensureDirectory(root);

  onStage?.("下载语法模型…");
  const source = await downloadAsset(asset, onProgress);
  const destination = String(Path.join(root, asset.name));
  try {
    onStage?.("写入语法模型…");
    if (await exists(destination)) await manager().remove(destination);
    await manager().copyFile(source, destination);
  } finally {
    await removeIfExists(source);
  }
}

export async function deployWanxiangRime(onStage?: (value: string) => void): Promise<void> {
  const rime = (globalThis as any).Rime;
  if (!rime || typeof rime.setup !== "function" || typeof rime.deploy !== "function") {
    throw new Error("当前 Rime API 不支持部署，请到 Scripting 的 Rime 工具手动部署");
  }

  onStage?.("初始化 Rime…");
  await rime.setup({ appName: "rime输入法" });
  onStage?.("部署 Rime…");
  await rime.deploy({ fullCheck: false });
  onStage?.("部署完成");
}

function metadataAfterInstall(asset: WanxiangRemoteAsset): WanxiangUpdaterMetadata {
  const before = readWanxiangUpdaterMetadata();
  const mark = wanxiangAssetMark(asset);
  const next: WanxiangUpdaterMetadata = {
    ...before,
    ...(asset.kind === "scheme" ? { schemeMark: mark } : {}),
    ...(asset.kind === "dict" ? { dictMark: mark } : {}),
    ...(asset.kind === "model" ? { modelMark: mark } : {})
  };
  writeWanxiangUpdaterMetadata(next);
  return next;
}

export async function installWanxiangAsset(
  asset: WanxiangRemoteAsset,
  options?: {
    onStage?: (value: string) => void;
    onProgress?: (value: number) => void;
  }
): Promise<WanxiangUpdaterMetadata> {
  if (asset.kind === "scheme") {
    await installScheme(asset, options?.onStage, options?.onProgress);
  } else if (asset.kind === "dict") {
    await installDictionary(asset, options?.onStage, options?.onProgress);
  } else {
    await installModel(asset, options?.onStage, options?.onProgress);
  }

  const metadata = metadataAfterInstall(asset);
  options?.onStage?.("文件更新完成；需要生效时请执行 Rime 部署。");
  return metadata;
}
