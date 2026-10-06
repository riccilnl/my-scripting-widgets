import { fetch } from "scripting";

const STORAGE_KEY = "rime_input_method_wanxiang_updater_v1";
const OWNER = "amzxyz";
const REPO = "rime_wanxiang";
const SCHEME_ASSET = "rime-wanxiang-lite.zip";
const DICT_TAG = "dict-nightly";
const DICT_ASSET = "lite-dicts.zip";
const MODEL_REPO = "RIME-LMDG";
const MODEL_TAG = "LTS";
const MODEL_ASSET = "wanxiang-lts-zh-hans.gram";

export type WanxiangAssetKind = "scheme" | "dict" | "model";

export type WanxiangRemoteAsset = {
  kind: WanxiangAssetKind;
  name: string;
  url: string;
  tag: string;
  updatedAt: string;
  size: number;
  digest: string;
};

export type WanxiangUpdaterMetadata = {
  schemeMark: string;
  dictMark: string;
  modelMark: string;
  autoDeploy: boolean;
  lastCheckAt: string;
};

export type WanxiangUpdateSnapshot = {
  metadata: WanxiangUpdaterMetadata;
  scheme: WanxiangRemoteAsset;
  dict: WanxiangRemoteAsset;
  model: WanxiangRemoteAsset;
  schemeNeedsUpdate: boolean;
  dictNeedsUpdate: boolean;
  modelNeedsUpdate: boolean;
};

const DEFAULT_METADATA: WanxiangUpdaterMetadata = {
  schemeMark: "",
  dictMark: "",
  modelMark: "",
  autoDeploy: true,
  lastCheckAt: ""
};

function storage(): any {
  return (globalThis as any).Storage;
}

export function readWanxiangUpdaterMetadata(): WanxiangUpdaterMetadata {
  const api = storage();
  if (!api) return { ...DEFAULT_METADATA };
  try {
    const raw = typeof api.get === "function"
      ? api.get(STORAGE_KEY)
      : typeof api.getString === "function"
      ? api.getString(STORAGE_KEY)
      : null;
    if (raw == null) return { ...DEFAULT_METADATA };
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {
      schemeMark: typeof parsed?.schemeMark === "string" ? parsed.schemeMark : "",
      dictMark: typeof parsed?.dictMark === "string" ? parsed.dictMark : "",
      modelMark: typeof parsed?.modelMark === "string" ? parsed.modelMark : "",
      autoDeploy: parsed?.autoDeploy !== false,
      lastCheckAt: typeof parsed?.lastCheckAt === "string" ? parsed.lastCheckAt : ""
    };
  } catch {
    return { ...DEFAULT_METADATA };
  }
}

export function writeWanxiangUpdaterMetadata(value: WanxiangUpdaterMetadata): void {
  const api = storage();
  if (!api) return;
  if (typeof api.set === "function") api.set(STORAGE_KEY, value);
  else if (typeof api.setString === "function") api.setString(STORAGE_KEY, JSON.stringify(value));
}

export function setWanxiangAutoDeploy(enabled: boolean): WanxiangUpdaterMetadata {
  const next = { ...readWanxiangUpdaterMetadata(), autoDeploy: enabled };
  writeWanxiangUpdaterMetadata(next);
  return next;
}

export function wanxiangAssetMark(asset: WanxiangRemoteAsset): string {
  if (asset.digest.trim()) return asset.digest.trim();
  if (asset.tag.trim()) return `${asset.tag}|${asset.name}|${asset.size}`;
  return `${asset.updatedAt}|${asset.name}|${asset.size}`;
}

async function githubJson(url: string): Promise<any> {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "Scripting-Rime-Wanxiang-Updater",
      "X-GitHub-Api-Version": "2022-11-28"
    }
  } as any);
  if (!response.ok) throw new Error(`GitHub 请求失败：HTTP ${response.status}`);
  return await response.json();
}

function remoteAsset(kind: WanxiangAssetKind, release: any, name: string): WanxiangRemoteAsset {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const asset = assets.find((item: any) => String(item?.name ?? "") === name);
  if (!asset?.browser_download_url) throw new Error(`远端未找到 ${name}`);
  return {
    kind,
    name,
    url: String(asset.browser_download_url),
    tag: String(release?.tag_name ?? ""),
    updatedAt: String(asset?.updated_at ?? release?.published_at ?? ""),
    size: Number.isFinite(Number(asset?.size)) ? Number(asset.size) : 0,
    digest: String(asset?.digest ?? "").replace(/^sha256:/i, "").trim()
  };
}

async function latestStableScheme(): Promise<WanxiangRemoteAsset> {
  const releases = await githubJson(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=20`
  );
  if (!Array.isArray(releases)) throw new Error("万象 Release 返回格式异常");
  const release = releases.find((item: any) =>
    item &&
    item.draft !== true &&
    item.prerelease !== true &&
    /^v\d+\.\d+\.\d+$/.test(String(item.tag_name ?? "")) &&
    Array.isArray(item.assets) &&
    item.assets.some((asset: any) => asset?.name === SCHEME_ASSET)
  );
  if (!release) throw new Error("未找到万象 Lite 正式版");
  return remoteAsset("scheme", release, SCHEME_ASSET);
}

async function latestDictionary(): Promise<WanxiangRemoteAsset> {
  const release = await githubJson(
    `https://api.github.com/repos/${OWNER}/${REPO}/releases/tags/${DICT_TAG}`
  );
  return remoteAsset("dict", release, DICT_ASSET);
}

async function latestModel(): Promise<WanxiangRemoteAsset> {
  const release = await githubJson(
    `https://api.github.com/repos/${OWNER}/${MODEL_REPO}/releases/tags/${MODEL_TAG}`
  );
  return remoteAsset("model", release, MODEL_ASSET);
}

export async function checkWanxiangUpdates(): Promise<WanxiangUpdateSnapshot> {
  const [scheme, dict, model] = await Promise.all([
    latestStableScheme(),
    latestDictionary(),
    latestModel()
  ]);
  const metadata = {
    ...readWanxiangUpdaterMetadata(),
    lastCheckAt: new Date().toISOString()
  };
  writeWanxiangUpdaterMetadata(metadata);
  return {
    metadata,
    scheme,
    dict,
    model,
    schemeNeedsUpdate: metadata.schemeMark !== wanxiangAssetMark(scheme),
    dictNeedsUpdate: metadata.dictMark !== wanxiangAssetMark(dict),
    modelNeedsUpdate: metadata.modelMark !== wanxiangAssetMark(model)
  };
}
