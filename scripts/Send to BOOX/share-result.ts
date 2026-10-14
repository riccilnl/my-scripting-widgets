import type { BatchSendResult } from "./boox"

export type ShareAttemptSummary = {
  completed: number
  remainingPaths: string[]
  failures: { name: string; detail: string }[]
  message: string
}

export function summarizeShareAttempt(
  total: number,
  completedBefore: number,
  attemptedPaths: string[],
  results: BatchSendResult[],
): ShareAttemptSummary {
  if (results.length !== attemptedPaths.length) {
    throw new Error("BOOX 返回的逐文件结果数量不一致")
  }

  let completed = completedBefore
  const remainingPaths: string[] = []
  const failures: { name: string; detail: string }[] = []
  results.forEach((result, index) => {
    if (result.ok) {
      completed += 1
    } else {
      remainingPaths.push(attemptedPaths[index])
      failures.push({ name: result.name, detail: result.detail || "未能完成发送" })
    }
  })
  if (completed > total) throw new Error("发送结果数量超出本次文件数量")

  const failed = remainingPaths.length
  const message = failed === 0
    ? (total === 1 ? "已发送到 BOOX" : total + " 个文件均已发送到 BOOX")
    : completed > 0
      ? "已发送 " + completed + "/" + total + " 个文件，" + failed + " 个未成功"
      : "发送失败，" + failed + " 个文件未成功"

  return { completed, remainingPaths, failures, message }
}
