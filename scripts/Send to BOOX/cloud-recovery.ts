// Read-only recovery: a transient HTTP gateway failure is not proof of expired login.
export function httpStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null
  const status = (error as { status?: unknown }).status
  if (typeof status === "number" && Number.isInteger(status) && status >= 100 && status <= 599) return status
  const message = (error as { message?: unknown }).message
  if (typeof message !== "string") return null
  const match = message.match(/\((\d{3})\)/)
  return match ? Number(match[1]) : null
}

export function isGatewayTransient(error: unknown): boolean {
  const status = httpStatus(error)
  return status === 502 || status === 503 || status === 504
}

export function isUnauthorized(error: unknown): boolean {
  const status = httpStatus(error)
  return status === 401 || status === 403
}

/**
 * Normal operation does one cloud read and no account preflight.
 * On a 502/503/504, verify the account once and retry the read exactly once.
 * The read callback is responsible for obtaining a fresh Sync Gateway session.
 * Never clear the user's stored credentials automatically.
 */
export async function readWithCloudRecovery<T>(
  read: () => Promise<T>,
  checkAccount: () => Promise<void>,
  onRecovery?: () => void,
): Promise<T> {
  try {
    return await read()
  } catch (first) {
    if (isUnauthorized(first)) {
      throw new Error("BOOX 登录可能已失效，请在设置中检查登录状态")
    }
    if (!isGatewayTransient(first)) throw first

    onRecovery?.()
    let accountVerified = false
    try {
      await checkAccount()
      accountVerified = true
    } catch (checkError) {
      if (isUnauthorized(checkError)) {
        throw new Error("BOOX 登录已失效，请在设置中重新登录")
      }
      // Account check can also time out; it must not block one fresh read.
    }

    try {
      return await read()
    } catch (second) {
      if (isUnauthorized(second)) {
        throw new Error("BOOX 登录可能已失效，请在设置中检查登录状态")
      }
      if (isGatewayTransient(second)) {
        const detail = accountVerified ? "账号验证正常，但" : ""
        throw new Error(detail + "BOOX 云盘网关暂时不可用（" +
          httpStatus(second) + "）；请稍后重试。无需重新登录")
      }
      throw second
    }
  }
}
