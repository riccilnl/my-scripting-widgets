import {
  Button, Intent, Navigation, NavigationStack, ProgressView, Script,
  Text, VStack, useEffect, useRef, useState,
} from "scripting"
import { addRecentSend, friendlyError, loadSession, sendFilesToBoox } from "./boox"
import { summarizeShareAttempt } from "./share-result"

type Phase = "sending" | "success" | "attention"
type Failure = { name: string; detail: string }

function IntentView(props: { files: string[]; onResult: (text: string) => void }) {
  const [phase, setPhase] = useState<Phase>("sending")
  const [status, setStatus] = useState("准备发送…")
  const [failures, setFailures] = useState<Failure[]>([])
  const [canRetry, setCanRetry] = useState(false)
  const remainingRef = useRef<string[]>([...props.files])
  const completedRef = useRef(0)
  const inFlightRef = useRef(false)
  const aliveRef = useRef(true)
  const dismiss = Navigation.useDismiss()

  const sendPending = async () => {
    if (inFlightRef.current || !remainingRef.current.length) return
    inFlightRef.current = true
    const paths = [...remainingRef.current]
    setPhase("sending")
    setStatus(paths.length === 1 ? "准备发送文件…" : "准备发送 " + paths.length + " 个文件…")
    setFailures([])
    setCanRetry(false)

    try {
      if (!loadSession()) {
        const message = "尚未登录 BOOX。请打开脚本本体登录后，重新分享文件。"
        props.onResult(message)
        if (aliveRef.current) {
          setStatus(message)
          setPhase("attention")
        }
        return
      }

      const results = await sendFilesToBoox(paths, {
        shareExtension: true,
        onProgress: ({ index, total, name, step }) => {
          if (!aliveRef.current) return
          if (step === "获取上传凭据") {
            setStatus("正在连接 BOOX…")
          } else {
            setStatus((index + 1) + "/" + total + " · " + name + " · " + step)
          }
        },
      })

      // History is best-effort; its failure must not change the remote result.
      for (const result of results) {
        try {
          addRecentSend({
            name: result.name,
            time: Date.now(),
            ok: result.ok,
            detail: result.detail,
          })
        } catch {
          // BOOX result remains authoritative.
        }
      }

      const summary = summarizeShareAttempt(props.files.length, completedRef.current, paths, results)
      completedRef.current = summary.completed
      remainingRef.current = summary.remainingPaths
      props.onResult(summary.message)
      if (!aliveRef.current) return
      setStatus(summary.message)
      setFailures(summary.failures)
      if (summary.remainingPaths.length === 0) {
        setPhase("success")
      } else {
        setCanRetry(true)
        setPhase("attention")
      }
    } catch (error) {
      const message = "已发送 " + completedRef.current + "/" + props.files.length + " 个文件；本轮失败：" + friendlyError(error)
      props.onResult(message)
      if (aliveRef.current) {
        setStatus(message)
        setCanRetry(true)
        setPhase("attention")
      }
    } finally {
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    aliveRef.current = true
    void sendPending()
    return () => {
      aliveRef.current = false
    }
  }, [])

  useEffect(() => {
    if (phase !== "success") return
    const timer = setTimeout(() => dismiss(), 1800)
    return () => clearTimeout(timer)
  }, [phase])

  return (
    <NavigationStack>
      <VStack
        navigationTitle="发送到 BOOX"
        spacing={16}
        padding={24}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        {phase === "sending" ? <ProgressView /> : null}
        <Text multilineTextAlignment="center">{status}</Text>
        {failures.length ? (
          <VStack spacing={8}>
            {failures.slice(0, 3).map((item, index) => (
              <Text key={index}>{item.name}：{item.detail}</Text>
            ))}
            {failures.length > 3 ? (
              <Text>另有 {failures.length - 3} 个文件未发送成功</Text>
            ) : null}
          </VStack>
        ) : null}
        {phase === "attention" && canRetry ? (
          <Button title="重试未成功的文件" systemImage="arrow.clockwise" action={() => void sendPending()} />
        ) : null}
        {phase !== "sending" ? (
          <Button title={phase === "success" ? "完成" : "关闭"} action={dismiss} />
        ) : (
          <Text font="caption" foregroundStyle="secondaryLabel">发送中请保持此页面打开</Text>
        )}
      </VStack>
    </NavigationStack>
  )
}

async function run() {
  const files = Intent.fileURLsParameter ?? []
  if (!files.length) {
    Script.exit(Intent.text("没有收到可发送的文件"))
    return
  }

  let resultText = "发送未完成，请在 BOOX 中核对结果"
  await Navigation.present({
    element: <IntentView files={files} onResult={(text) => { resultText = text }} />,
  })
  Script.exit(Intent.text(resultText))
}

run()
