import { N10_PRODUCT_ID, N10_PRODUCT_TYPE, type N10State } from "./protocol"

export type FotileAuthMaterial = {
  content: string
  sign: string
  appRandom: string
}

export type FotileSession = {
  accessToken: string
  refreshToken: string
  authorize: string
  userId: string
  expiresAt: number
}

export type FotileDevice = {
  id: string
  name: string
  productId: string
  type: string
  online: boolean
  familyId?: string
}

const API = "https://api.fotile.com"

const KEY_AUTH_CONTENT = "fotile_n10_auth_content"
const KEY_AUTH_SIGN = "fotile_n10_auth_sign"
const KEY_AUTH_RANDOM = "fotile_n10_auth_random"
const KEY_ACCESS_TOKEN = "fotile_n10_access_token"
const KEY_REFRESH_TOKEN = "fotile_n10_refresh_token"
const KEY_AUTHORIZE = "fotile_n10_authorize"
const KEY_USER_ID = "fotile_n10_user_id"
const KEY_EXPIRES_AT = "fotile_n10_expires_at"
const KEY_DEVICE = "fotile_n10_device"
const KEY_MANUAL_LOGOUT = "fotile_n10_manual_logout"

function secureSet(key: string, value: string): void {
  const ok = Keychain.set(key, value, { accessibility: "first_unlock_this_device" })
  if (!ok) throw new Error("无法写入系统 Keychain")
}

function getAuthMaterial(): FotileAuthMaterial | null {
  const content = Keychain.get(KEY_AUTH_CONTENT)
  const sign = Keychain.get(KEY_AUTH_SIGN)
  const appRandom = Keychain.get(KEY_AUTH_RANDOM)
  if (!content || !sign || !appRandom) return null
  return { content, sign, appRandom }
}

export function hasAuthMaterial(): boolean {
  return getAuthMaterial() != null
}

function getOrCreateAppRandom(): string {
  const existing = Keychain.get(KEY_AUTH_RANDOM)
  if (existing && /^[0-9a-f]{16}$/.test(existing)) return existing
  const bytes = Crypto.generateSymmetricKey(64).toUint8Array()
  if (!bytes || bytes.length < 8) throw new Error("无法生成设备授权随机值")
  const appRandom = Array.from(bytes.slice(0, 8), (b: number) => b.toString(16).padStart(2, "0")).join("")
  secureSet(KEY_AUTH_RANDOM, appRandom)
  return appRandom
}

export function saveAuthMaterial(content: string, sign: string, appRandom?: string): FotileAuthMaterial {
  if (!content || !sign) throw new Error("设备授权缺少 content/sign")
  const random = appRandom && /^[0-9a-f]{16}$/.test(appRandom) ? appRandom : getOrCreateAppRandom()
  secureSet(KEY_AUTH_CONTENT, content)
  secureSet(KEY_AUTH_SIGN, sign)
  secureSet(KEY_AUTH_RANDOM, random)
  return { content, sign, appRandom: random }
}

export function loadSession(): FotileSession | null {
  const accessToken = Keychain.get(KEY_ACCESS_TOKEN)
  const refreshToken = Keychain.get(KEY_REFRESH_TOKEN) ?? ""
  const authorize = Keychain.get(KEY_AUTHORIZE) ?? ""
  const userId = Keychain.get(KEY_USER_ID)
  const expiresAt = Number(Storage.get<number>(KEY_EXPIRES_AT) ?? 0)
  if (!accessToken || !userId) return null
  return { accessToken, refreshToken, authorize, userId, expiresAt }
}

function saveSession(session: FotileSession): void {
  secureSet(KEY_ACCESS_TOKEN, session.accessToken)
  secureSet(KEY_REFRESH_TOKEN, session.refreshToken)
  secureSet(KEY_AUTHORIZE, session.authorize)
  secureSet(KEY_USER_ID, session.userId)
  Storage.set(KEY_EXPIRES_AT, session.expiresAt)
  Storage.set(KEY_MANUAL_LOGOUT, false)
}

export function loadDevice(): FotileDevice | null {
  const value = Storage.get<FotileDevice>(KEY_DEVICE)
  if (!value || typeof value !== "object" || !value.id) return null
  return value
}

function saveDevice(device: FotileDevice): void {
  Storage.set(KEY_DEVICE, device)
}

export function clearLogin(): void {
  for (const key of [
    KEY_ACCESS_TOKEN,
    KEY_REFRESH_TOKEN,
    KEY_AUTHORIZE,
    KEY_USER_ID,
  ]) {
    Keychain.remove(key)
  }
  Storage.remove(KEY_EXPIRES_AT)
  Storage.remove(KEY_DEVICE)
  Storage.set(KEY_MANUAL_LOGOUT, true)
}

export function clearAllAuthorization(): void {
  clearLogin()
  for (const key of [KEY_AUTH_CONTENT, KEY_AUTH_SIGN, KEY_AUTH_RANDOM]) {
    Keychain.remove(key)
  }
}

export function shouldAutoLogin(): boolean {
  return hasAuthMaterial() && Storage.get<boolean>(KEY_MANUAL_LOGOUT) !== true
}

function cleanHeaderObject(input: unknown): Record<string, string> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {}
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === "string") result[key] = value
  }
  return result
}

export function extractAuthMaterial(parsed: any): FotileAuthMaterial {
  const body = parsed?.request_body ?? parsed?.requestBody ?? parsed
  const content = body?.content
  const sign = body?.sign
  const appRandom = body?.appRandom
  if (typeof content !== "string" || typeof sign !== "string" || typeof appRandom !== "string") {
    throw new Error("授权文件缺少 request_body.content / sign / appRandom")
  }
  return { content, sign, appRandom }
}

export async function importAuthorizationFile(path: string): Promise<FotileSession> {
  const raw = await FileManager.readAsString(path)
  const parsed = JSON.parse(raw)
  const material = extractAuthMaterial(parsed)
  saveAuthMaterial(material.content, material.sign, material.appRandom)
  return exchangeToken(true)
}

function appHeaders(userId?: string, accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "*/*",
    "X-SoftwareVersion": "iOS",
    "X-Source": "ios.4.7.0",
    "X-ModelName": "Scripting",
    "X-AppVer": "ios.3.3.06",
  }
  if (userId) headers["X-User"] = userId
  if (accessToken) headers["Access-Token"] = accessToken
  return headers
}

async function jsonRequest(url: string, init: any, label: string): Promise<any> {
  const response = await fetch(url, init)
  let obj: any = null
  try {
    obj = await response.json()
  } catch {
    let text = ""
    try { text = await response.text() } catch {}
    throw new Error(`${label}失败 (${response.status})${text ? `：${text.slice(0, 240)}` : ""}`)
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label}失败 (${response.status})`)
  }
  if (obj && typeof obj === "object" && typeof obj.code === "number" && obj.code !== 200) {
    throw new Error(`${label}失败：${obj.msg ?? obj.message ?? `code=${obj.code}`}`)
  }
  return obj
}

export async function exchangeToken(force = false): Promise<FotileSession> {
  const existing = loadSession()
  if (!force && existing && existing.expiresAt > Date.now() + 60 * 60 * 1000) return existing

  const material = getAuthMaterial()
  if (!material) throw new Error("尚未建立方太设备授权")

  const obj = await jsonRequest(`${API}/v2/user_auth2`, {
    method: "POST",
    headers: appHeaders(),
    body: JSON.stringify(material),
  }, "方太登录")

  const accessToken = obj?.access_token
  const refreshToken = obj?.refresh_token
  const authorize = obj?.authorize
  const userId = obj?.user_id
  const expireIn = Number(obj?.expire_in ?? 0)
  if (typeof accessToken !== "string" || typeof refreshToken !== "string" || userId == null || !expireIn) {
    throw new Error("方太登录响应缺少 Token 或 user_id")
  }

  const session: FotileSession = {
    accessToken,
    refreshToken,
    authorize: typeof authorize === "string" ? authorize : "",
    userId: String(userId),
    expiresAt: Date.now() + expireIn * 1000,
  }
  saveSession(session)
  return session
}

export function extractN10Device(obj: any): FotileDevice {
  const list = Array.isArray(obj?.deviceList) ? obj.deviceList : Array.isArray(obj?.list) ? obj.list : []
  const found = list.find((item: any) => item?.product_id === N10_PRODUCT_ID || item?.type === N10_PRODUCT_TYPE)
  if (!found?.id) throw new Error("当前账号下没有找到 JBCD6E-03-N10")
  return {
    id: String(found.id),
    name: String(found.name ?? found.productName ?? "嵌入式洗碗机N10"),
    productId: String(found.product_id ?? N10_PRODUCT_ID),
    type: String(found.type ?? N10_PRODUCT_TYPE),
    online: found.is_online !== false,
    familyId: found.familyId == null ? undefined : String(found.familyId),
  }
}

export function extractDeviceState(obj: any): N10State {
  const pairs = obj?.propertyPairs
  if (!pairs || typeof pairs !== "object" || Array.isArray(pairs)) {
    throw new Error("设备状态响应缺少 propertyPairs")
  }
  return pairs as N10State
}

export async function discoverN10(session: FotileSession): Promise<FotileDevice> {
  const obj = await jsonRequest(`${API}/v2/all/homes/devices`, {
    method: "GET",
    headers: appHeaders(session.userId, session.accessToken),
  }, "读取设备列表")
  const device = extractN10Device(obj)
  saveDevice(device)
  return device
}

export async function fetchDeviceState(session: FotileSession, device: FotileDevice): Promise<N10State> {
  const obj = await jsonRequest(`${API}/v2/corp/fotile/product/${encodeURIComponent(device.productId)}/device/${encodeURIComponent(device.id)}`, {
    method: "GET",
    headers: appHeaders(session.userId, session.accessToken),
  }, "读取洗碗机状态")
  return extractDeviceState(obj)
}

export async function fetchRemoteAuthorization(session: FotileSession): Promise<{ status: number; localControlTime: number } | null> {
  try {
    const obj = await jsonRequest(`${API}/v10/h5/device/auth/status`, {
      method: "POST",
      headers: appHeaders(session.userId, session.accessToken),
      body: JSON.stringify({ productId: N10_PRODUCT_ID }),
    }, "读取设备授权")
    const data = obj?.data
    if (!data || typeof data.status !== "number" || typeof data.localControlTime !== "number") return null
    return { status: data.status, localControlTime: data.localControlTime }
  } catch {
    return null
  }
}

export function tokenExpiryText(session: FotileSession | null): string {
  if (!session?.expiresAt) return "--"
  const d = new Date(session.expiresAt)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function friendlyError(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === "string") return error
  try { return JSON.stringify(error) } catch { return String(error) }
}
