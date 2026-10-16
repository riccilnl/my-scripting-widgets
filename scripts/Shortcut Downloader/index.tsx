import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Script,
  Section,
  Text,
  TextField,
  useState,
} from "scripting"

type ShortcutFields = {
  name?: { value?: string }
  shortcut?: { value?: { downloadURL?: string } }
  signedShortcut?: { value?: { downloadURL?: string } }
}

function extractShortcutId(input: string): string {
  const value = input.trim()

  const match = value.match(/icloud\.com\/shortcuts\/([A-Za-z0-9]+)/i)
  if (match?.[1]) {
    return match[1]
  }

  if (/^[A-Za-z0-9]{16,}$/.test(value)) {
    return value
  }

  throw new Error("请输入有效的 iCloud 快捷指令链接")
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?\"<>|]/g, "_")
    .replace(/[\r\n\t]/g, " ")
    .trim()

  return cleaned || "Shortcut"
}

function getFields(payload: any): ShortcutFields | null {
  return payload?.fields ?? payload?.records?.[0]?.fields ?? null
}

async function downloadShortcut(input: string): Promise<string> {
  const id = extractShortcutId(input)
  const apiURL = `https://www.icloud.com/shortcuts/api/records/${id}`

  const metadataResponse = await fetch(apiURL, { timeout: 30 })
  if (!metadataResponse.ok) {
    throw new Error(`读取快捷指令信息失败：HTTP ${metadataResponse.status}`)
  }

  const payload = await metadataResponse.json()
  const fields = getFields(payload)
  if (!fields) {
    throw new Error("Apple 返回的数据中没有快捷指令信息")
  }

  const shortcutName = sanitizeFileName(fields.name?.value || `Shortcut-${id.slice(0, 8)}`)
  const fileName = `${shortcutName}.shortcut`

  const downloadURL =
    fields.shortcut?.value?.downloadURL ||
    fields.signedShortcut?.value?.downloadURL

  if (!downloadURL) {
    throw new Error("Apple 返回的数据中没有下载地址")
  }

  const finalURL = downloadURL.includes("${f}")
    ? downloadURL.replace("${f}", encodeURIComponent(fileName))
    : downloadURL

  const fileResponse = await fetch(finalURL, { timeout: 60 })
  if (!fileResponse.ok) {
    throw new Error(`下载快捷指令失败：HTTP ${fileResponse.status}`)
  }

  const data = await fileResponse.data()
  const exported = await DocumentPicker.exportFiles({
    files: [
      {
        data,
        name: fileName,
      },
    ],
  })

  return exported.length > 0 ? fileName : ""
}

function App() {
  const [url, setURL] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")

  async function handleDownload() {
    if (busy) return

    setBusy(true)
    setStatus("正在读取快捷指令…")

    try {
      const fileName = await downloadShortcut(url)
      setStatus(fileName ? `已保存：${fileName}` : "已取消保存")
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus(message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="快捷指令下载"
        navigationBarTitleDisplayMode="inline"
      >
        <Section>
          <TextField
            title="iCloud URL"
            prompt="https://www.icloud.com/shortcuts/..."
            value={url}
            onChanged={setURL}
            keyboardType="URL"
            textInputAutocapitalization="never"
            autocorrectionDisabled
          />
        </Section>

        <Section>
          <Button
            title={busy ? "正在下载…" : "下载"}
            disabled={busy || url.trim().length === 0}
            action={handleDownload}
          />
        </Section>

        {status.length > 0 ? (
          <Section>
            <Text>{status}</Text>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  )
}

async function run() {
  await Navigation.present({
    element: <App />,
  })

  Script.exit()
}

run()
