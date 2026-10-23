import {
  ScrollView, VStack, HStack, Spacer, Text, Image, Button, useState, useEffect
} from "scripting"
import { Book, details, download, formats, preferredFormat } from "./api"

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
      .catch(() => { /* Show searchable summary if details are unavailable. */ })
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
      setMessage("已存入「文件」App → Scripting → Z-Library")
    } catch (e) { setMessage(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  return <ScrollView>
    <VStack alignment="leading" spacing={14} padding={16}>
      <HStack spacing={14}>
        {current.cover.startsWith("https://")
          ? <Image imageUrl={current.cover} resizable={true}
              aspectRatio={{ contentMode: "fit" }} frame={{ width: 122, height: 173 }} />
          : <Image systemName="book.closed" aspectRatio={{ contentMode: "fit" }}
              frame={{ width: 122, height: 173 }} />}
        <VStack alignment="leading" spacing={8}>
          <Text font="title3" lineLimit={4}>{current.title}</Text>
          <Text font="subheadline">{current.author || "作者未知"}</Text>
          <Text font="caption">{[current.language, current.year].filter(Boolean).join(" · ")}</Text>
          <Text font="caption">当前版本：{current.extension || "未知格式"}</Text>
        </VStack>
      </HStack>
      <VStack alignment="leading" spacing={6}>
        <Text font="headline">图书介绍</Text>
        <Text font="body" lineLimit={5}>{toText(current.description) || "暂无图书介绍"}</Text>
      </VStack>
      <VStack alignment="leading" spacing={8}>
        <Text font="headline">下载格式</Text>
        <HStack spacing={8}>
          {options.map(item =>
            <Button key={item.id + ":" + item.hash}
              title={(selected.id === item.id && selected.hash === item.hash ? "✓ " : "") + (item.extension || "未知").toUpperCase()}
              action={() => { setSelected(item); setFile(""); setMessage("") }} disabled={busy} />)}
        </HStack>
        {selected.size ? <Text font="caption">文件大小：{selected.size}</Text> : null}
        {formatNotice ? <Text font="caption">{formatNotice}</Text> : null}
      </VStack>
      <Button title={busy ? "正在下载…" : "下载 " + (selected.extension || "文件").toUpperCase()}
        systemImage="arrow.down.to.line" disabled={busy} action={() => void save()} />
      {file ? <Button title="分享或另存文件" systemImage="square.and.arrow.up"
        action={() => void ShareSheet.present([file])} /> : null}
      {message ? <Text>{message}</Text> : null}
    </VStack>
  </ScrollView>
}
