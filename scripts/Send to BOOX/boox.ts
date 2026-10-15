import { Path } from "scripting"
import { BOOX_PUSH_PAGE_SIZE, normalizeBooxTime, parseChangesPage, type BooxChangesPage } from "./cloud-pagination"
import { readWithCloudRecovery } from "./cloud-recovery"

export type BooxRegion = "cn" | "us" | "eu"

export type BooxSession = {
  token: string
  uid: string
  email: string
  region: BooxRegion
}

export type SendProgress =
  | "准备文件"
  | "获取上传凭据"
  | "上传文件"
  | "生成下载地址"
  | "同步到设备"
  | "完成推送"

export type RecentSend = {
  name: string
  time: number
  ok: boolean
  detail?: string
}

export type BooxCloudStorageInfo = {
  totalBytes: number
  usedBytes: number | null
  freeBytes: number | null
  usageAvailable: boolean
}

export type BooxPushBook = {
  id: string
  rev: string
  name: string
  size: number
  createdAt: number
  updatedAt: number
  ext: string
  objectKey: string | null
  doc: Record<string, any>
  content: Record<string, any>
}

const REGION_HOSTS: Record<BooxRegion, string> = {
  cn: "https://send2boox.com",
  us: "https://push.boox.com",
  eu: "https://eur.boox.com",
}

const REGION_NAMES: Record<BooxRegion, string> = {
  cn: "中国服务器",
  us: "美国 / 全球服务器",
  eu: "欧洲服务器",
}

const KEY_TOKEN = "send_to_boox_token"
const KEY_UID = "send_to_boox_uid"
const KEY_EMAIL = "send_to_boox_email"
const KEY_REGION = "send_to_boox_region"
const KEY_RECENT = "send_to_boox_recent"

const MAX_FILE_BYTES = 200 * 1024 * 1024
const SHARE_EXTENSION_MAX_BYTES = 80 * 1024 * 1024
const OFFICIAL_CLOUD_TOTAL_BYTES = 10 * 1024 * 1024 * 1024

function hostFor(region: BooxRegion): string {
  return REGION_HOSTS[region]
}

export function regionName(region: BooxRegion): string {
  return REGION_NAMES[region]
}

export function loadRegion(): BooxRegion {
  const value = Storage.get<string>(KEY_REGION)
  return value === "cn" || value === "us" || value === "eu" ? value : "cn"
}

export function saveRegion(region: BooxRegion): void {
  Storage.set(KEY_REGION, region)
}

export function loadEmail(): string {
  return Storage.get<string>(KEY_EMAIL) ?? ""
}

export function saveEmail(email: string): void {
  Storage.set(KEY_EMAIL, email.trim())
}

export function loadSession(): BooxSession | null {
  const token = Keychain.get(KEY_TOKEN)
  const uid = Keychain.get(KEY_UID)
  const email = loadEmail()
  const region = loadRegion()
  if (!token || !uid || !email) return null
  return { token, uid, email, region }
}

export function saveSession(session: BooxSession): void {
  const tokenOK = Keychain.set(KEY_TOKEN, session.token, {
    accessibility: "first_unlock_this_device",
  })
  const uidOK = Keychain.set(KEY_UID, session.uid, {
    accessibility: "first_unlock_this_device",
  })
  if (!tokenOK || !uidOK) {
    throw new Error("无法把 BOOX 登录凭据写入系统 Keychain")
  }
  saveEmail(session.email)
  saveRegion(session.region)
}

export function clearSession(): void {
  Keychain.remove(KEY_TOKEN)
  Keychain.remove(KEY_UID)
}

export function loadRecentSends(): RecentSend[] {
  const value = Storage.get<RecentSend[]>(KEY_RECENT)
  return Array.isArray(value) ? value.slice(0, 10) : []
}

export function addRecentSend(item: RecentSend): void {
  const next = [item, ...loadRecentSends()].slice(0, 10)
  Storage.set(KEY_RECENT, next)
}

function stringData(value: string): Data {
  const data = Data.fromRawString(value)
  if (!data) throw new Error("无法编码签名数据")
  return data
}

function md5Hex(data: Data): string {
  return Crypto.md5(data).toHexString().toLowerCase()
}

function hmacSHA1Base64(message: string, secret: string): string {
  return Crypto.hmacSHA1(stringData(message), stringData(secret)).toBase64String()
}

function encodeObjectKey(objectKey: string): string {
  return objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")
}

function encodeQuery(value: string): string {
  return encodeURIComponent(value)
}

function canonicalSubresources(params: Record<string, string | null>): string {
  const keys = Object.keys(params).sort()
  if (!keys.length) return ""
  return (
    "?" +
    keys
      .map((key) => {
        const value = params[key]
        return value === null || value === "" ? key : `${key}=${value}`
      })
      .join("&")
  )
}

function canonicalOSSHeaders(headers: Record<string, string>): string {
  return Object.keys(headers)
    .filter((key) => key.toLowerCase().startsWith("x-oss-"))
    .map((key) => [key.toLowerCase(), headers[key].trim()] as const)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, value]) => `${key}:${value}\n`)
    .join("")
}

function ossAuthorization(args: {
  method: string
  bucket: string
  objectKey: string
  contentType?: string
  date: string
  accessKeyId: string
  accessKeySecret: string
  ossHeaders: Record<string, string>
  subresources?: Record<string, string | null>
}): string {
  const resource = `/${args.bucket}/${encodeObjectKey(args.objectKey)}`
  const canonicalResource = resource + canonicalSubresources(args.subresources ?? {})
  const canonical = [
    args.method.toUpperCase(),
    "",
    args.contentType ?? "",
    args.date,
    canonicalOSSHeaders(args.ossHeaders) + canonicalResource,
  ].join("\n")
  const signature = hmacSHA1Base64(canonical, args.accessKeySecret)
  return `OSS ${args.accessKeyId}:${signature}`
}

function ossHeaders(args: {
  method: string
  bucket: string
  objectKey: string
  contentType?: string
  accessKeyId: string
  accessKeySecret: string
  securityToken: string
  subresources?: Record<string, string | null>
}): Record<string, string> {
  const date = new Date().toUTCString()
  const xHeaders = {
    "x-oss-security-token": args.securityToken,
  }
  return {
    ...(args.contentType ? { "Content-Type": args.contentType } : {}),
    Date: date,
    ...xHeaders,
    Authorization: ossAuthorization({
      method: args.method,
      bucket: args.bucket,
      objectKey: args.objectKey,
      contentType: args.contentType,
      date,
      accessKeyId: args.accessKeyId,
      accessKeySecret: args.accessKeySecret,
      ossHeaders: xHeaders,
      subresources: args.subresources,
    }),
  }
}

function ossEndpoint(bucket: BucketInfo, objectKey: string): string {
  const raw = (bucket.region || bucket.aliEndpoint || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/$/, "")
  if (!raw) throw new Error("BOOX OSS Endpoint 为空")

  const endpointHost = raw.includes(".") ? raw : `${raw}.aliyuncs.com`
  const host = endpointHost.startsWith(`${bucket.bucket}.`)
    ? endpointHost
    : `${bucket.bucket}.${endpointHost}`
  return `https://${host}/${encodeObjectKey(objectKey)}`
}

async function responseError(response: any, label: string): Promise<never> {
  let body = ""
  try {
    body = (await response.text()).trim()
  } catch {
    // Ignore response-body decoding errors.
  }
  if (body.length > 1200) body = body.slice(0, 1200) + "…"
  const error = new Error(`${label}失败 (${response.status})${body ? `：${body}` : ""}`) as Error & { status: number }
  error.status = response.status
  throw error
}

async function booxJSON(
  region: BooxRegion,
  path: string,
  options: { method?: string; body?: unknown; token?: string } = {},
): Promise<any> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  }
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  const response = await fetch(`${hostFor(region)}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeout: 30,
    debugLabel: `BOOX ${path}`,
  })
  if (!response.ok) await responseError(response, "BOOX 请求")
  try {
    return await response.json()
  } catch {
    throw new Error(`BOOX 接口 ${path} 返回了无法解析的数据`)
  }
}

export async function requestVerificationCode(
  email: string,
  region: BooxRegion,
): Promise<void> {
  const mobi = email.trim()
  if (!mobi) throw new Error("请输入 BOOX 账号邮箱或手机号")
  await booxJSON(region, "/api/1/users/sendMobileCode", {
    method: "POST",
    body: { mobi },
  })
  saveEmail(mobi)
  saveRegion(region)
}

export async function completeLogin(
  email: string,
  code: string,
  region: BooxRegion,
): Promise<BooxSession> {
  const mobi = email.trim()
  const verificationCode = code.trim()
  if (!mobi || !verificationCode) throw new Error("请输入账号和验证码")

  const auth = await booxJSON(region, "/api/1/users/signupByPhoneOrEmail", {
    method: "POST",
    body: { mobi, code: verificationCode },
  })
  const token = auth?.data?.token
  if (!token) throw new Error("BOOX 登录成功响应中没有 Token")

  const me = await booxJSON(region, "/api/1/users/me", { token })
  const uid = me?.data?.uid
  if (!uid) throw new Error("BOOX 账号资料中没有 UID")

  const session: BooxSession = { token, uid, email: mobi, region }
  saveSession(session)
  return session
}

function normalizeCapacityKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "")
}

function parseCapacityValue(value: unknown, key: string): number | null {
  const normalizedKey = normalizeCapacityKey(key)
  const multiplier = normalizedKey.endsWith("gb")
    ? 1024 * 1024 * 1024
    : normalizedKey.endsWith("mb")
      ? 1024 * 1024
      : normalizedKey.endsWith("kb")
        ? 1024
        : 1

  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    if (multiplier !== 1) return value * multiplier
    // Undocumented BOOX capacity fields observed by clients are byte counts.
    // Reject tiny counters (OCR quotas, item counts, etc.) rather than mistaking them for storage bytes.
    return value >= 1024 * 1024 ? value : null
  }

  if (typeof value !== "string") return null
  const text = value.trim()
  if (!text) return null
  const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(b|bytes?|kb|kib|mb|mib|gb|gib|tb|tib)?$/i)
  if (!match) return null
  const number = Number(match[1])
  if (!Number.isFinite(number) || number < 0) return null
  const unit = (match[2] || "").toLowerCase()
  const units: Record<string, number> = {
    b: 1,
    byte: 1,
    bytes: 1,
    kb: 1024,
    kib: 1024,
    mb: 1024 * 1024,
    mib: 1024 * 1024,
    gb: 1024 * 1024 * 1024,
    gib: 1024 * 1024 * 1024,
    tb: 1024 * 1024 * 1024 * 1024,
    tib: 1024 * 1024 * 1024 * 1024,
  }
  if (unit) return number * (units[unit] ?? 1)
  if (multiplier !== 1) return number * multiplier
  return number >= 1024 * 1024 ? number : null
}

const TOTAL_SPACE_KEYS = new Set([
  "totalspace",
  "spacetotal",
  "storagetotal",
  "totalstorage",
  "storagecapacity",
  "cloudstoragecapacity",
  "cloudstoragetotal",
  "cloudspacetotal",
  "cloudquota",
  "storagequota",
  "spacequota",
  "maxspace",
  "maxstorage",
  "storagesizelimit",
])

const USED_SPACE_KEYS = new Set([
  "usedspace",
  "spaceused",
  "storageused",
  "usedstorage",
  "cloudstorageused",
  "cloudusedspace",
  "usagespace",
  "usespace",
  "occupiedspace",
  "occupiedstorage",
])

const FREE_SPACE_KEYS = new Set([
  "freespace",
  "spacefree",
  "availablespace",
  "spaceavailable",
  "remainingspace",
  "remainspace",
  "storageremaining",
  "storageavailable",
  "cloudstoragefree",
  "cloudfreespace",
])

function findCapacityMetric(root: unknown, keys: Set<string>): number | null {
  const seen = new Set<unknown>()
  const visit = (value: unknown, depth: number): number | null => {
    if (!value || typeof value !== "object" || depth > 5 || seen.has(value)) return null
    seen.add(value)
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const normalized = normalizeCapacityKey(key)
      if (keys.has(normalized)) {
        const parsed = parseCapacityValue(child, normalized)
        if (parsed !== null) return parsed
      }
    }
    for (const child of Object.values(value as Record<string, unknown>)) {
      const nested = visit(child, depth + 1)
      if (nested !== null) return nested
    }
    return null
  }
  return visit(root, 0)
}

export async function getCloudStorageInfo(): Promise<BooxCloudStorageInfo> {
  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX")

  const me = await booxJSON(session.region, "/api/1/users/me", { token: session.token })
  let totalBytes = findCapacityMetric(me, TOTAL_SPACE_KEYS)
  let usedBytes = findCapacityMetric(me, USED_SPACE_KEYS)
  let freeBytes = findCapacityMetric(me, FREE_SPACE_KEYS)

  // Some BOOX clients expose /configUsers/one. It is only a best-effort secondary
  // source for account metadata, so never let it slow or break Settings.
  if (usedBytes === null || freeBytes === null) {
    try {
      const response = await fetch(`${hostFor(session.region)}/api/1/configUsers/one`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.token}` },
        timeout: 5,
        debugLabel: "BOOX optional cloud-space metadata",
      })
      if (response.ok) {
        const configUser = await response.json()
        totalBytes ??= findCapacityMetric(configUser, TOTAL_SPACE_KEYS)
        usedBytes ??= findCapacityMetric(configUser, USED_SPACE_KEYS)
        freeBytes ??= findCapacityMetric(configUser, FREE_SPACE_KEYS)
      }
    } catch {
      // users/me + official total remain sufficient for a safe fallback.
    }
  }

  totalBytes = totalBytes ?? OFFICIAL_CLOUD_TOTAL_BYTES
  if (usedBytes === null && freeBytes !== null && freeBytes <= totalBytes) {
    usedBytes = Math.max(0, totalBytes - freeBytes)
  }
  if (freeBytes === null && usedBytes !== null && usedBytes <= totalBytes) {
    freeBytes = Math.max(0, totalBytes - usedBytes)
  }

  return {
    totalBytes,
    usedBytes,
    freeBytes,
    usageAvailable: usedBytes !== null && freeBytes !== null,
  }
}

export async function verifySession(): Promise<string> {
  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX")
  const me = await booxJSON(session.region, "/api/1/users/me", { token: session.token })
  if (!me?.data?.uid || String(me.data.uid) !== String(session.uid)) {
    throw new Error("BOOX 账号资料缺少匹配的 UID，无法确认当前登录状态")
  }
  return me.data.nickname || me.data.email || session.email
}

type STSCredentials = {
  AccessKeyId: string
  AccessKeySecret: string
  SecurityToken: string
}

type BucketInfo = {
  bucket: string
  region?: string
  aliEndpoint?: string
}
type SyncSession = {
  session_id: string
  cookie_name: string
}

function getMimeType(filePath: string, ext: string): string {
  try {
    const value = FileManager.mimeType(filePath)
    if (value) return value
  } catch {
    // Fall through to stable extension mappings.
  }
  const map: Record<string, string> = {
    epub: "application/epub+zip",
    pdf: "application/pdf",
    mobi: "application/x-mobipocket-ebook",
    azw3: "application/vnd.amazon.ebook",
    txt: "text/plain",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    cbz: "application/vnd.comicbook+zip",
    cbr: "application/vnd.comicbook-rar",
  }
  return map[ext] ?? "application/octet-stream"
}

function validateFile(filePath: string, shareExtension = false): {
  fileData: Data
  filename: string
  ext: string
  size: number
  mime: string
} {
  const normalizedPath = normalizeSharedFilePath(filePath)
  const filename = Path.basename(normalizedPath)
  const ext = Path.extname(filename).replace(/^\./, "").toLowerCase()
  if (!ext) throw new Error("文件没有扩展名，无法确定 BOOX 资源类型")

  // DocumentPicker already returns file paths. FileManager.statSync().type is useful
  // for an explicit directory rejection, but it is not authoritative across all
  // security-scoped providers. A readable Data object is the final proof that the
  // selected path is a file.
  let stat: { type?: string; size?: number } | null = null
  try {
    stat = FileManager.statSync(normalizedPath)
  } catch {
    stat = null
  }

  if (stat?.type === "directory") {
    throw new Error("请选择有效文件，而不是文件夹")
  }

  const statSize = stat?.size
  if (typeof statSize === "number" && Number.isFinite(statSize) && statSize > 0) {
    if (statSize > MAX_FILE_BYTES) throw new Error("BOOX 在线传输单文件不能超过 200 MB")
    if (shareExtension && statSize > SHARE_EXTENSION_MAX_BYTES) {
      throw new Error("该文件超过 80 MB。为避免 iOS 分享扩展被系统终止，请打开脚本本体后选择此文件发送")
    }
  }

  const fileData = Data.fromFile(normalizedPath)
  if (!fileData) {
    throw new Error("无法读取所选文件，请确认文件已下载到本机或当前云盘允许访问")
  }

  const size = fileData.size
  if (!Number.isFinite(size) || size <= 0) throw new Error("文件为空或无法读取")
  if (size > MAX_FILE_BYTES) throw new Error("BOOX 在线传输单文件不能超过 200 MB")
  if (shareExtension && size > SHARE_EXTENSION_MAX_BYTES) {
    throw new Error("该文件超过 80 MB。为避免 iOS 分享扩展被系统终止，请打开脚本本体后选择此文件发送")
  }

  return { fileData, filename, ext, size, mime: getMimeType(normalizedPath, ext) }
}

async function getUploadContext(session: BooxSession): Promise<{
  sts: STSCredentials
  bucket: BucketInfo
  sync: SyncSession
}> {
  const [stsResult, bucketsResult, syncResult] = await Promise.all([
    booxJSON(session.region, "/api/1/config/stss", { token: session.token }),
    booxJSON(session.region, "/api/1/config/buckets", { token: session.token }),
    booxJSON(session.region, "/api/1/users/syncToken", { token: session.token }),
  ])

  const sts = stsResult?.data as STSCredentials | undefined
  if (!sts?.AccessKeyId || !sts?.AccessKeySecret || !sts?.SecurityToken) {
    throw new Error("BOOX 未返回完整的 OSS 临时凭据")
  }

  const bucket = bucketsResult?.data?.["onyx-cloud"] as BucketInfo | undefined
  if (!bucket?.bucket || (!bucket?.region && !bucket?.aliEndpoint)) {
    throw new Error("BOOX 未返回完整的 onyx-cloud 存储桶信息")
  }

  const sync = syncResult?.data as SyncSession | undefined
  if (!sync?.session_id || !sync?.cookie_name) {
    throw new Error("BOOX 未返回 Sync Gateway 会话")
  }

  return { sts, bucket, sync }
}

async function putObject(args: {
  sts: STSCredentials
  bucket: BucketInfo
  objectKey: string
  mime: string
  fileData: Data
}): Promise<void> {
  const url = ossEndpoint(args.bucket, args.objectKey)
  const headers = ossHeaders({
    method: "PUT",
    bucket: args.bucket.bucket,
    objectKey: args.objectKey,
    contentType: args.mime,
    accessKeyId: args.sts.AccessKeyId,
    accessKeySecret: args.sts.AccessKeySecret,
    securityToken: args.sts.SecurityToken,
  })
  const response = await fetch(url, {
    method: "PUT",
    headers,
    body: args.fileData,
    timeout: 180,
    debugLabel: "BOOX OSS upload",
  })
  if (!response.ok) await responseError(response, "OSS 上传")
}

function signedDownloadURL(args: {
  sts: STSCredentials
  bucket: BucketInfo
  objectKey: string
}): string {
  const expires = Math.floor(Date.now() / 1000) + 10000
  const resource = `/${args.bucket.bucket}/${encodeObjectKey(args.objectKey)}`
  const subresources: Record<string, string | null> = {
    "response-content-disposition": "attachment",
    "security-token": args.sts.SecurityToken,
  }
  const canonicalResource = resource + canonicalSubresources(subresources)
  const canonical = ["GET", "", "", String(expires), canonicalResource].join("\n")
  const signature = hmacSHA1Base64(canonical, args.sts.AccessKeySecret)
  const base = ossEndpoint(args.bucket, args.objectKey)
  const query = [
    `OSSAccessKeyId=${encodeQuery(args.sts.AccessKeyId)}`,
    `Expires=${expires}`,
    `Signature=${encodeQuery(signature)}`,
    `response-content-disposition=${encodeQuery("attachment")}`,
    `security-token=${encodeQuery(args.sts.SecurityToken)}`,
  ].join("&")
  return `${base}?${query}`
}

async function syncGateway(args: {
  session: BooxSession
  sync: SyncSession
  filename: string
  size: number
  docId: string
  content: string
  revHash: string
  rev: string
}): Promise<void> {
  const nowContent = JSON.parse(args.content)
  const now = nowContent.updatedAt as number
  const response = await fetch(`${hostFor(args.session.region)}/neocloud/_bulk_docs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: `${args.sync.cookie_name}=${args.sync.session_id}`,
    },
    body: JSON.stringify({
      docs: [
        {
          contentType: "digital_content",
          content: args.content,
          msgType: 2,
          dbId: `${args.session.uid}-MESSAGE`,
          user: args.session.uid,
          name: args.filename,
          size: args.size,
          uniqueId: args.docId,
          createdAt: now,
          updatedAt: now,
          _id: args.docId,
          _rev: args.rev,
          _revisions: { start: 1, ids: [args.revHash] },
        },
      ],
      new_edits: false,
    }),
    timeout: 30,
    debugLabel: "BOOX Sync Gateway",
  })

  const bodyText = await response.text()
  if (!response.ok) {
    const detail = bodyText.trim().slice(0, 1200)
    throw new Error(
      `BOOX Sync Gateway 同步失败 (${response.status})${detail ? `：${detail}` : ""}`,
    )
  }

  if (bodyText) {
    try {
      const payload = JSON.parse(bodyText)
      const first = Array.isArray(payload) ? payload[0] : null
      if (first?.error) {
        throw new Error(`BOOX Sync Gateway 拒绝文档：${first.reason || first.error}`)
      }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("BOOX Sync Gateway 拒绝文档")) {
        throw error
      }
      // A successful gateway may return an empty/non-JSON body. HTTP success is sufficient in that case.
    }
  }
}

type UploadContext = {
  sts: STSCredentials
  bucket: BucketInfo
  sync: SyncSession
}

type PreparedFile = ReturnType<typeof validateFile>

export type BatchSendResult = {
  path: string
  name: string
  size?: number
  ok: boolean
  detail?: string
}

async function sendPreparedFileWithContext(
  prepared: PreparedFile,
  session: BooxSession,
  context: UploadContext,
  options: {
    onProgress?: (progress: SendProgress) => void
  } = {},
): Promise<{ name: string; size: number }> {
  const { fileData, filename, ext, size, mime } = prepared
  const fileHash = md5Hex(fileData)
  const objectKey = `${session.uid}/push/${fileHash}.${ext}`

  options.onProgress?.("上传文件")
  await putObject({
    sts: context.sts,
    bucket: context.bucket,
    objectKey,
    mime,
    fileData,
  })

  options.onProgress?.("生成下载地址")
  const signedUrl = signedDownloadURL({
    sts: context.sts,
    bucket: context.bucket,
    objectKey,
  })
  const now = Date.now()
  const docId = UUID.string().replace(/-/g, "")
  const content = JSON.stringify({
    _id: docId,
    createdAt: now,
    distributeChannel: "onyx",
    formats: [ext],
    guid: docId,
    name: filename,
    ownerId: session.uid,
    size,
    md5: "",
    storage: {
      [ext]: {
        oss: {
          displayName: filename,
          expires: 0,
          key: objectKey,
          provider: "oss",
          size,
          url: signedUrl,
        },
      },
    },
    title: filename,
    updatedAt: now,
  })
  const revHash = md5Hex(stringData(content))
  const rev = `1-${revHash}`

  options.onProgress?.("同步到设备")
  await syncGateway({
    session,
    sync: context.sync,
    filename,
    size,
    docId,
    content,
    revHash,
    rev,
  })

  await booxJSON(session.region, "/api/1/push/saveAndPush", {
    method: "POST",
    token: session.token,
    body: {
      data: {
        bucket: "onyx-cloud",
        name: filename,
        parent: null,
        resourceDisplayName: filename,
        resourceKey: objectKey,
        resourceType: ext,
        title: filename,
      },
      cbMsg: { id: docId, rev },
    },
  })

  options.onProgress?.("完成推送")
  return { name: filename, size }
}

export async function sendFileToBoox(
  filePath: string,
  options: {
    shareExtension?: boolean
    onProgress?: (progress: SendProgress) => void
  } = {},
): Promise<{ name: string; size: number }> {
  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX。请先打开“发送到 BOOX”脚本完成登录")

  options.onProgress?.("准备文件")
  const prepared = validateFile(filePath, options.shareExtension ?? false)
  options.onProgress?.("获取上传凭据")
  const context = await getUploadContext(session)
  return sendPreparedFileWithContext(prepared, session, context, options)
}

export async function sendFilesToBoox(
  filePaths: string[],
  options: {
    shareExtension?: boolean
    onProgress?: (event: {
      index: number
      total: number
      path: string
      name: string
      step: SendProgress
    }) => void
  } = {},
): Promise<BatchSendResult[]> {
  if (!filePaths.length) return []

  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX。请先打开“发送到 BOOX”脚本完成登录")

  const normalized = filePaths.map(normalizeSharedFilePath)
  const names = normalized.map((path) => Path.basename(path) || "未知文件")
  const results = new Array<BatchSendResult>(normalized.length)
  let firstPrepared: PreparedFile | null = null
  let firstPreparedIndex = -1

  // 先找到第一个可读文件。这样如果用户选到的全是无效文件，
  // 不会为了报错而先请求 BOOX 的 STS/bucket/syncToken。
  for (let i = 0; i < normalized.length; i++) {
    const path = normalized[i]
    const name = names[i]
    options.onProgress?.({ index: i, total: normalized.length, path, name, step: "准备文件" })
    try {
      firstPrepared = validateFile(path, options.shareExtension ?? false)
      firstPreparedIndex = i
      break
    } catch (error) {
      results[i] = {
        path,
        name,
        ok: false,
        detail: friendlyError(error),
      }
    }
  }

  if (!firstPrepared || firstPreparedIndex < 0) return results

  options.onProgress?.({
    index: firstPreparedIndex,
    total: normalized.length,
    path: normalized[firstPreparedIndex],
    name: firstPrepared.filename,
    step: "获取上传凭据",
  })

  // STS、bucket 与 Sync Gateway 会话对同一批次复用。
  // 这避免多文件时每个文件都重复执行三次 BOOX 凭据请求。
  const context = await getUploadContext(session)

  for (let i = firstPreparedIndex; i < normalized.length; i++) {
    const path = normalized[i]
    const fallbackName = names[i]
    try {
      let prepared: PreparedFile
      if (i === firstPreparedIndex) {
        prepared = firstPrepared
      } else {
        options.onProgress?.({
          index: i,
          total: normalized.length,
          path,
          name: fallbackName,
          step: "准备文件",
        })
        prepared = validateFile(path, options.shareExtension ?? false)
      }

      const result = await sendPreparedFileWithContext(prepared, session, context, {
        onProgress: (step) =>
          options.onProgress?.({
            index: i,
            total: normalized.length,
            path,
            name: prepared.filename,
            step,
          }),
      })
      results[i] = {
        path,
        name: result.name,
        size: result.size,
        ok: true,
      }
    } catch (error) {
      results[i] = {
        path,
        name: fallbackName,
        ok: false,
        detail: friendlyError(error),
      }
    }
  }

  return results
}

export function normalizeSharedFilePath(value: string): string {
  if (!/^file:\/\//i.test(value)) return value
  let raw = value.replace(/^file:\/\/(?:localhost)?/i, "")
  if (!raw.startsWith("/")) raw = `/${raw}`
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function friendlyError(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

async function getSyncSession(session: BooxSession): Promise<SyncSession> {
  const result = await booxJSON(session.region, "/api/1/users/syncToken", {
    token: session.token,
  })
  const sync = result?.data as SyncSession | undefined
  if (!sync?.session_id || !sync?.cookie_name) {
    throw new Error("BOOX 未返回 Sync Gateway 会话")
  }
  return sync
}

async function syncGatewayJSON(
  session: BooxSession,
  sync: SyncSession,
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<any> {
  const response = await fetch(`${hostFor(session.region)}/neocloud${path}`, {
    method: options.method ?? "GET",
    headers: {
      Accept: "application/json",
      Cookie: `${sync.cookie_name}=${sync.session_id}`,
      ...(options.body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    timeout: 30,
    debugLabel: "BOOX Sync Gateway",
  })

  const text = await response.text()
  if (!response.ok) {
    const detail = text.trim().slice(0, 1200)
    const error = new Error(`BOOX Sync Gateway 请求失败 (${response.status})${detail ? `：${detail}` : ""}`) as Error & { status: number }
    error.status = response.status
    throw error
  }
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("BOOX Sync Gateway 返回了无法解析的数据")
  }
}

function parsePushContent(doc: Record<string, any>): Record<string, any> {
  if (!doc || typeof doc !== "object") return {}
  if (doc.content && typeof doc.content === "object") return doc.content
  if (typeof doc.content !== "string") return {}
  try {
    const value = JSON.parse(doc.content)
    return value && typeof value === "object" ? value : {}
  } catch {
    return {}
  }
}

function pushBookFromDoc(doc: Record<string, any>): BooxPushBook | null {
  if (!doc?._id || !doc?._rev || doc?.contentType !== "digital_content") return null
  const content = parsePushContent(doc)
  const name = String(content.name || content.title || doc.name || "").trim()
  if (!name) return null

  const format = Array.isArray(content.formats) ? content.formats[0] : null
  const ext = String(format || Path.extname(name).replace(/^\./, "")).toLowerCase()
  const storage = ext ? content?.storage?.[ext]?.oss : null
  const sizeValue = Number(content.size ?? doc.size ?? storage?.size ?? 0)
  const createdValue = normalizeBooxTime(content.createdAt ?? doc.createdAt ?? 0)
  const updatedValue = normalizeBooxTime(content.updatedAt ?? doc.updatedAt ?? createdValue ?? 0)

  return {
    id: String(doc._id),
    rev: String(doc._rev),
    name,
    size: Number.isFinite(sizeValue) && sizeValue >= 0 ? sizeValue : 0,
    createdAt: Number.isFinite(createdValue) && createdValue > 0 ? createdValue : 0,
    updatedAt: Number.isFinite(updatedValue) && updatedValue > 0 ? updatedValue : 0,
    ext,
    objectKey: typeof storage?.key === "string" && storage.key ? storage.key : null,
    doc,
    content,
  }
}

/** One page of the versioned Sync Gateway changes feed; all writes retain _rev metadata. */
export async function listPushBooksPage(
  since: string | null = null,
  onRecovery?: () => void,
  pageSize: number = BOOX_PUSH_PAGE_SIZE,
): Promise<BooxChangesPage> {
  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX")
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200) throw new Error("无效的云盘分页大小")
  const channel = encodeURIComponent(session.uid + "-MESSAGE")
  const path = "/_changes?filter=sync_gateway/bychannel&channels=" + channel +
    "&include_docs=true&active_only=true&limit=" + pageSize +
    "&style=main_only" + (since === null ? "" : "&since=" + encodeURIComponent(since))

  return readWithCloudRecovery(
    async () => {
      // Each attempt obtains its own fresh Sync Gateway cookie.
      const sync = await getSyncSession(session)
      const payload = await syncGatewayJSON(session, sync, path)
      return parseChangesPage(payload, since, pageSize, pushBookFromDoc)
    },
    async () => {
      const me = await booxJSON(session.region, "/api/1/users/me", { token: session.token })
      if (!me?.data?.uid || String(me.data.uid) !== String(session.uid)) {
        throw new Error("BOOX 账号资料不匹配，无法确认登录状态")
      }
    },
    onRecovery,
  )
}

export async function deletePushBook(item: BooxPushBook): Promise<void> {
  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX")
  if (!item.id || !item.rev) throw new Error("该云端记录缺少文档版本，无法删除")

  const sync = await getSyncSession(session)
  await syncGatewayJSON(
    session,
    sync,
    `/${encodeURIComponent(item.id)}?rev=${encodeURIComponent(item.rev)}`,
    { method: "DELETE" },
  )
  await booxJSON(session.region, "/api/1/push/message/batchDelete", {
    method: "POST",
    token: session.token,
    body: { ids: [item.id] },
  })
}

async function bumpPushDocument(
  session: BooxSession,
  sync: SyncSession,
  item: BooxPushBook,
  content: Record<string, any>,
): Promise<{ rev: string; doc: Record<string, any>; content: Record<string, any> }> {
  const now = Date.now()
  const nextContent = { ...content, updatedAt: now }
  const nextDoc: Record<string, any> = {
    ...item.doc,
    _id: item.id,
    _rev: item.rev,
    content: JSON.stringify(nextContent),
    check: false,
    updatedAt: now,
  }
  delete nextDoc._revisions

  const result = await syncGatewayJSON(session, sync, "/_bulk_docs", {
    method: "POST",
    body: { docs: [nextDoc] },
  })
  const first = Array.isArray(result) ? result[0] : null
  if (first?.error) {
    throw new Error(`BOOX 拒绝重新推送：${first.reason || first.error}`)
  }
  const rev = String(first?.rev || "")
  if (!rev) throw new Error("BOOX 重新推送后没有返回新的文档版本")
  nextDoc._rev = rev
  return { rev, doc: nextDoc, content: nextContent }
}

export async function repushPushBook(item: BooxPushBook): Promise<BooxPushBook> {
  const session = loadSession()
  if (!session) throw new Error("尚未登录 BOOX")
  if (!item.objectKey) throw new Error("该电子书没有 OSS 文件地址，无法重新推送")
  if (!item.ext) throw new Error("该电子书缺少文件类型，无法重新推送")

  const context = await getUploadContext(session)
  const content = JSON.parse(JSON.stringify(item.content || {})) as Record<string, any>
  const storage = content?.storage?.[item.ext]?.oss
  if (!storage || typeof storage !== "object") {
    throw new Error("该电子书的云端存储信息不完整，无法重新推送")
  }

  storage.url = signedDownloadURL({
    sts: context.sts,
    bucket: context.bucket,
    objectKey: item.objectKey,
  })
  storage.expires = 0

  const bumped = await bumpPushDocument(session, context.sync, item, content)

  // 实际送达由 Sync Gateway 新 revision 触发。saveAndPush 只是服务端登记，
  // 当前网页流程中即使它失败，也不应把已经完成的重新推送判为失败。
  try {
    await booxJSON(session.region, "/api/1/push/saveAndPush", {
      method: "POST",
      token: session.token,
      body: {
        data: {
          bucket: "onyx-cloud",
          name: item.name,
          parent: null,
          resourceDisplayName: item.name,
          resourceKey: item.objectKey,
          resourceType: item.ext,
          title: item.name,
        },
        cbMsg: { id: item.id, rev: bumped.rev },
      },
    })
  } catch {
    // Delivery already happened by revision bump; keep this best-effort.
  }

  return {
    ...item,
    rev: bumped.rev,
    updatedAt: Number(bumped.content.updatedAt) || Date.now(),
    doc: bumped.doc,
    content: bumped.content,
  }
}

