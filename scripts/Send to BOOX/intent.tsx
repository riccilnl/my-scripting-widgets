import {
  Intent,
  Navigation,
  NavigationStack,
  ProgressView,
  Script,
  Text,
  VStack,
  useEffect,
  useState,
} from "scripting"
import {
  addRecentSend,
  friendlyError,
  loadSession,
  sendFilesToBoox,
} from "./boox"

function IntentView(props: { files: string[] }) {
  const [status, setStatus] = useState("准备发送…")
  const [done, setDone] = useState(false)
  const dismiss = Navigation.useDismiss()

  useEffect(() => {
    let active = true

    const send = async () => {
      if (!loadSession()) {
        if (active) {
          setStatus("尚未登录 BOOX。请先打开“发送到 BOOX”完成一次登录。")
          setDone(true)
        }
        return
      }

      try {
        const results = await sendFilesToBoox(props.files, {
          shareExtension: true,
          onProgress: ({ index, total, name, step }) => {
            if (!active) return
            if (step === "获取上传凭据") {
              setStatus(total > 1 ? `正在为 ${total} 个文件获取一次上传凭据…` : "正在获取上传凭据…")
              return
            }
            const prefix = total > 1 ? `${index + 1}/${total} · ` : ""
            setStatus(`${prefix}${name} · ${step}`)
          },
        })

        let success = 0
        for (const result of results) {
          addRecentSend({
            name: result.name,
            time: Date.now(),
            ok: result.ok,
            detail: result.detail,
          })
          if (result.ok) success++
        }

        if (active) {
          if (success === results.length) {
            setStatus(results.length === 1 ? "已发送到 BOOX" : `${success} 个文件均已发送到 BOOX`)
          } else if (success > 0) {
            setStatus(`已发送 ${success}/${results.length} 个文件`)
          } else {
            setStatus(results[0]?.detail ? `发送失败：${results[0].detail}` : "发送失败")
          }
        }
      } catch (error) {
        if (active) setStatus(`发送失败：${friendlyError(error)}`)
      } finally {
        if (active) setDone(true)
      }
    }

    send()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!done) return
    const timer = setTimeout(() => dismiss(), 1200)
    return () => clearTimeout(timer)
  }, [done])

  return (
    <NavigationStack>
      <VStack
        navigationTitle="发送到 BOOX"
        spacing={16}
        padding={24}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        {!done ? <ProgressView /> : null}
        <Text multilineTextAlignment="center">{status}</Text>
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

  await Navigation.present({ element: <IntentView files={files} /> })
  Script.exit(Intent.text("发送到 BOOX 已结束"))
}

run()
