import { encryptInstallDeviceId, encryptLoginValue } from "./loginCrypto"

const SSO_API = "https://hsadmin.fotile.com/fotilestyle-happylife"
const SMS_TEMPLATE_ID = "27187684"

const KEY_SSO_ACCESS = "fotile_n10_sso_access_token"
const KEY_SSO_REFRESH = "fotile_n10_sso_refresh_token"
const KEY_LOGIN_DEVICE = "fotile_n10_login_device_cipher"

export type FotileSsoSession = {
  accessToken: string
  refreshToken: string
  expiresIn: number
  refreshExpiresIn: number
}

export type FotileFiksSign = {
  content: string
  sign: string
}

function secureSet(key: string, value: string): void {
  const ok = Keychain.set(key, value, { accessibility: "first_unlock_this_device" })
  if (!ok) throw new Error("无法写入系统 Keychain")
}

function ssoHeaders(session?: FotileSsoSession): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Content-Type": "application/json; charset=utf-8",
    deviceType: "iOS",
    version: "3306",
    channelType: "10",
    groupId: "",
    role: "",
    platformType: "01",
  }
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`
  return headers
}

async function ssoRequest(path: string, body: unknown, label: string, session?: FotileSsoSession): Promise<any> {
  const response = await fetch(`${SSO_API}${path}`, {
    method: "POST",
    headers: ssoHeaders(session),
    body: JSON.stringify(body),
  })
  let obj: any
  try {
    obj = await response.json()
  } catch {
    throw new Error(`${label}失败 (${response.status})`)
  }
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label}失败 (${response.status})`)
  }
  if (!obj?.success || Number(obj?.code ?? -1) !== 0) {
    throw new Error(`${label}失败：${obj?.msg ?? obj?.message ?? `code=${obj?.code ?? "?"}`}`)
  }
  return obj
}

function randomInstallId(): string {
  const bytes = Crypto.generateSymmetricKey(128).toUint8Array()
  if (!bytes || bytes.length < 16) throw new Error("无法生成登录设备标识")
  const hex = Array.from(bytes.slice(0, 16), (b: number) => b.toString(16).padStart(2, "0")).join("").toUpperCase()
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

function getOrCreateEncryptedDeviceId(): string {
  const existing = Keychain.get(KEY_LOGIN_DEVICE)
  if (existing) return existing
  const encrypted = encryptInstallDeviceId(randomInstallId())
  secureSet(KEY_LOGIN_DEVICE, encrypted)
  return encrypted
}

export async function sendSmsCode(phone: string, validate: string = ""): Promise<void> {
  if (!/^1\d{10}$/.test(phone)) throw new Error("请输入 11 位手机号")
  await ssoRequest("/api/open/msg/sendcodeNotification", {
    templateid: SMS_TEMPLATE_ID,
    deviceId: getOrCreateEncryptedDeviceId(),
    mobile: encryptLoginValue(phone),
    validate,
    codeLen: 6,
    sourceName: "方太幸福家APP",
  }, "发送验证码")
}

export async function loginWithSmsCode(phone: string, code: string, validate: string = ""): Promise<FotileSsoSession> {
  if (!/^1\d{10}$/.test(phone)) throw new Error("请输入 11 位手机号")
  if (!/^\d{6}$/.test(code)) throw new Error("请输入 6 位短信验证码")

  const obj = await ssoRequest("/api/open/auth/loginWithCode", {
    templateid: SMS_TEMPLATE_ID,
    noPassword: 1,
    mobile: encryptLoginValue(phone),
    channel: "10",
    validate,
    code: encryptLoginValue(code),
  }, "短信登录")

  const data = obj?.data
  if (typeof data?.access_token !== "string" || typeof data?.refresh_token !== "string") {
    throw new Error("短信登录成功但响应缺少 SSO Token")
  }
  const session: FotileSsoSession = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: Number(data.expires_in ?? 0),
    refreshExpiresIn: Number(data.refresh_expires_in ?? 0),
  }
  secureSet(KEY_SSO_ACCESS, session.accessToken)
  secureSet(KEY_SSO_REFRESH, session.refreshToken)
  return session
}

export async function requestFiksSign(session: FotileSsoSession): Promise<FotileFiksSign> {
  const obj = await ssoRequest("/api/m/user/sign", { source: "ios" }, "获取设备授权", session)
  const content = obj?.data?.content
  const sign = obj?.data?.sign
  if (typeof content !== "string" || typeof sign !== "string" || !content || !sign) {
    throw new Error("设备授权响应缺少 content/sign")
  }
  return { content, sign }
}

export function loadSsoLogin(): FotileSsoSession | null {
  const accessToken = Keychain.get(KEY_SSO_ACCESS)
  const refreshToken = Keychain.get(KEY_SSO_REFRESH)
  if (!accessToken || !refreshToken) return null
  return { accessToken, refreshToken, expiresIn: 0, refreshExpiresIn: 0 }
}

export function clearSsoLogin(): void {
  Keychain.remove(KEY_SSO_ACCESS)
  Keychain.remove(KEY_SSO_REFRESH)
}

export function clearLoginDeviceId(): void {
  Keychain.remove(KEY_LOGIN_DEVICE)
}
