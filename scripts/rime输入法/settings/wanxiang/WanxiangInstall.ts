import { Crypto, Path, fetch } from "scripting";
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
  if (asset.digest) {
    try {
      if (!/^[a-f0-9]{64}$/i.test(asset.digest)) throw new Error("远端 SHA256 摘要无效");
      const actualDigest = Crypto.sha256(await fm.readAsData(destination)).toHexString().toLowerCase();
      if (actualDigest !== asset.digest.toLowerCase()) throw new Error("下载文件 SHA256 校验失败");
    } catch (error) {
      await removeIfExists(destination);
      throw error;
    }
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

export type ManagedUpdate = { relative: string; source?: string };

function safeManagedRelative(value: string): string {
  const relative = String(value).replace(/\\/g, "/");
  if (!relative || relative.startsWith("/") || /^[a-zA-Z]:/.test(relative) ||
      relative.split("/").some((part) => !part || part === "." || part === "..") ||
      relative.split("/").some((part) => part.startsWith(".wanxiang-update-backup"))) {
    throw new Error("不安全的万象更新路径：" + value);
  }
  if (isProtected(relative)) throw new Error("禁止覆盖自定义配置：" + relative);
  return relative;
}

/** Preserve originals until every copy succeeds. A power loss still requires
 * manual recovery; failed rollback preserves the backup directory. */
export async function applyManagedUpdates(root: string, operations: readonly ManagedUpdate[]): Promise<void> {
  if (operations.length === 0) return;
  const fm = manager();
  const seen = new Set<string>();
  const validated = operations.map((operation) => {
    const relative = safeManagedRelative(operation.relative);
    if (seen.has(relative)) throw new Error("重复更新路径：" + relative);
    seen.add(relative);
    if (operation.source != null && !operation.source) throw new Error("更新源文件为空");
    return { relative, source: operation.source };
  });
  const backup = String(Path.join(
    root, ".wanxiang-update-backup-" + Date.now() + "-" + Math.random().toString(36).slice(2)
  ));
  await ensureDirectory(backup);
  const moved: string[] = [];
  const written: string[] = [];
  let success = false;

  try {
    for (const item of validated) {
      const destination = String(Path.join(root, item.relative));
      if (!(await exists(destination))) continue;
      if (!(await fm.isFile(destination))) throw new Error("目标不是普通文件：" + item.relative);
      const parked = String(Path.join(backup, item.relative));
      await ensureDirectory(String(Path.dirname(parked)));
      await fm.rename(destination, parked);
      moved.push(item.relative);
    }
    for (const item of validated) {
      if (item.source == null) continue;
      const destination = String(Path.join(root, item.relative));
      await ensureDirectory(String(Path.dirname(destination)));
      written.push(item.relative);
      await fm.copyFile(item.source, destination);
    }
    success = true;
  } catch (error) {
    let rollbackFailed = false;
    for (const relative of written.reverse()) {
      const destination = String(Path.join(root, relative));
      try { if (await exists(destination)) await fm.remove(destination); }
      catch { rollbackFailed = true; }
    }
    for (const relative of moved.reverse()) {
      const destination = String(Path.join(root, relative));
      const parked = String(Path.join(backup, relative));
      try {
        if (await exists(destination)) await fm.remove(destination);
        await ensureDirectory(String(Path.dirname(destination)));
        await fm.rename(parked, destination);
      } catch { rollbackFailed = true; }
    }
    if (!rollbackFailed) await removeIfExists(backup);
    if (rollbackFailed) {
      throw new Error("更新回滚不完整；原文件备份：" + backup + "；错误：" + String(error));
    }
    throw error;
  } finally {
    if (success) await removeIfExists(backup);
  }
}

async function schemeOperations(sourceRoot: string): Promise<{
  operations: ManagedUpdate[]; copied: string[]; removed: number;
}> {
  const fm = manager();
  const entries: string[] = await fm.readDirectory(sourceRoot, true);
  const replacements: ManagedUpdate[] = [];
  const copied: string[] = [];
  for (const entry of entries) {
    const relative = relativePath(sourceRoot, entry);
    if (!relative || isProtected(relative)) continue;
    const source = String(Path.join(sourceRoot, relative));
    if (!(await fm.isFile(source))) continue;
    safeManagedRelative(relative);
    replacements.push({ relative, source });
    copied.push(relative);
  }
  const nextFiles = new Set(copied);
  const removals: ManagedUpdate[] = [];
  for (const file of readManagedSchemeFiles()) {
    if (isProtected(file)) continue;
    safeManagedRelative(file);
    if (!nextFiles.has(file)) removals.push({ relative: file });
  }
  return { operations: [...removals, ...replacements], copied, removed: removals.length };
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

  onStage?.("下载万象 Lite 方案…");
  const archive = await downloadAsset(asset, onProgress);
  const extracted = String(Path.join(fm.temporaryDirectory, "wanxiang-scheme-" + Date.now()));
  try {
    await removeIfExists(extracted);
    await ensureDirectory(extracted);
    onStage?.("解压方案…");
    await fm.unzip(archive, extracted);

    const update = await schemeOperations(extracted);
    onStage?.("事务更新方案文件…");
    await applyManagedUpdates(root, update.operations);
    writeManagedSchemeFiles(update.copied);
    if (update.removed) onStage?.("已清理旧方案文件：" + update.removed + " 个");
  } finally {
    await removeIfExists(archive);
    await removeIfExists(extracted);
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
  const extracted = String(Path.join(fm.temporaryDirectory, "wanxiang-dicts-" + Date.now()));
  try {
    await removeIfExists(extracted);
    await ensureDirectory(extracted);
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

    const operations: ManagedUpdate[] = files.map((item) => ({
      relative: dictRelative(item.relative, commonPrefix),
      source: item.absolute
    })).filter((item) => item.relative.length > 0 && item.relative !== ".DS_Store");
    onStage?.("事务更新词库…");
    await applyManagedUpdates(dictRoot, operations);
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
  try {
    onStage?.("事务更新语法模型…");
    await applyManagedUpdates(root, [{ relative: asset.name, source }]);
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
