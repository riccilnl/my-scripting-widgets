import {
  ScrollView, VStack, HStack, Spacer, Text, Image, Button, Divider, ProgressView,
  useState, useEffect
} from "scripting"
import { Book, details, download, formats, preferredFormat } from "./api"
import { UI } from "./ui-tokens"

function toText(value: string): string {
  return value.replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim()
}

export function BookDetails({ book }: { book: Book }) {
  const [current, setCurrent] = useState<Book>(book)
  const [options, setOptions] = useState<Book[]>([book])
  const [selected, setSelected] = useState<Book>(book)
  const [busy, setBusy] = useState(false)
  const [formatNotice, setFormatNotice] = useState("")
  const [message, setMessage] = useState("")
  const [file, setFile] = useState("")
  useEffect(() => {
    let active = true
    void details(book).then(data => { if (active) setCurrent({ ...book, ...data }) })
      .catch(() => { /* Keep the list summary if details are unavailable. */ })
    void formats(book).then(choices => {
      if (!active) return
      setOptions(choices)
      setSelected(preferredFormat(choices) || book)
    }).catch(() => { if (active) setFormatNotice("其他格式暂时无法获取，仅可下载当前版本") })
    return () => { active = false }
  }, [book.id, book.hash])

  async function save() {
    if (busy) return
    setBusy(true); setMessage("")
    try {
      const path = await download(selected)
      setFile(path)
      setMessage("已保存到「文件」App · Scripting / Z-Library")
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return <ScrollView frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <VStack alignment="leading" spacing={UI.sectionGap} padding={UI.pageInset}
      frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <HStack spacing={14} frame={{ maxWidth: "infinity", alignment: "leading" }}>
        {current.cover.startsWith("https://")
          ? <Image imageUrl={current.cover} resizable={true}
              aspectRatio={{ contentMode: "fit" }}
              background={UI.coverBackground}
              frame={{ width: UI.heroCoverWidth, height: UI.heroCoverHeight }} />
          : <Image systemName="book.closed" foregroundStyle={UI.secondary}
              aspectRatio={{ contentMode: "fit" }}
              background={UI.coverBackground}
              frame={{ width: UI.heroCoverWidth, height: UI.heroCoverHeight }} />}
        <VStack alignment="leading" spacing={9}
          frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <Text font="title3" lineLimit={4} foregroundStyle={UI.primary}>
            {current.title}
          </Text>
          <Text font="subheadline" foregroundStyle={UI.secondary}>
            {current.author || "作者未知"}
          </Text>
          <Text font="caption" foregroundStyle={UI.muted}>
            {[current.language, current.year].filter(Boolean).join(" · ")}
          </Text>
          <Text font="caption" foregroundStyle={UI.secondary}>
            当前版本：{current.extension || "未知格式"}
          </Text>
        </VStack>
      </HStack>

      <Divider />
      <VStack alignment="leading" spacing={9}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="headline" foregroundStyle={UI.primary}>图书介绍</Text>
        <Text font="body" lineLimit={5} foregroundStyle={UI.secondary}>
          {toText(current.description) || "暂无图书介绍"}
        </Text>
      </VStack>

      <Divider />
      <VStack alignment="leading" spacing={10}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="headline" foregroundStyle={UI.primary}>下载格式</Text>
        <ScrollView axes="horizontal" scrollIndicator="hidden"
          frame={{ maxWidth: "infinity", alignment: "leading" }}>
          <HStack spacing={8}>
            {options.map(item =>
              <Button key={item.id + ":" + item.hash}
                title={(selected.id === item.id && selected.hash === item.hash ? "✓ " : "") +
                  (item.extension || "未知").toUpperCase()}
                buttonStyle={selected.id === item.id && selected.hash === item.hash
                  ? "borderedProminent" : "bordered"}
                buttonBorderShape="capsule"
                action={() => { setSelected(item); setFile(""); setMessage("") }}
                disabled={busy} />)}
          </HStack>
        </ScrollView>
        {selected.size ? <Text font="caption" foregroundStyle={UI.secondary}>
          文件大小：{selected.size}
        </Text> : null}
        {formatNotice ? <Text font="caption" foregroundStyle={UI.secondary}>
          {formatNotice}
        </Text> : null}
      </VStack>

      <Button title={file ? "分享或另存文件" : busy ? "正在下载…" :
          "下载 " + (selected.extension || "文件").toUpperCase()}
        systemImage={file ? "square.and.arrow.up" : "arrow.down.to.line"}
        buttonStyle="borderedProminent" buttonBorderShape="roundedRectangle"
        frame={{ maxWidth: "infinity", minHeight: UI.touchHeight, alignment: "leading" }}
        disabled={busy} action={() => { if (file) void ShareSheet.present([file]); else void save() }} />
      {busy ? <HStack spacing={7}><ProgressView />
        <Text font="caption" foregroundStyle={UI.secondary}>正在保存文件…</Text>
      </HStack> : null}
      {message ? <Text font="caption" foregroundStyle={UI.secondary}>{message}</Text> : null}
    </VStack>
  </ScrollView>
}
