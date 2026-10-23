import { ScrollView, VStack, HStack, Text, Image, Button, useState, useEffect } from "scripting"
import { Book, details, download } from "./api"
export function BookDetails({ book }: { book: Book }) {
 const [current, setCurrent] = useState(book)
 const [busy, setBusy] = useState(false)
 const [message, setMessage] = useState("")
 const [file, setFile] = useState("")
 useEffect(() => {
  let active = true
  details(book).then(next => { if (active) setCurrent({ ...book, ...next }) })
   .catch(error => { if (active) setMessage(String(error)) })
  return () => { active = false }
 }, [book.id, book.hash])
 async function save() {
  if (busy) return
  setBusy(true); setMessage("")
  try {
   const path = await download(current)
   setFile(path)
   setMessage("已保存到「文件」App 的 Scripting / Z-Library 文件夹")
  } catch (error) { setMessage(String(error)) }
  finally { setBusy(false) }
 }
 return <ScrollView><VStack spacing={12} padding={16}>
  {current.cover.startsWith("https://") ? <Image imageUrl={current.cover} frame={{width: 116,height: 165}} /> : <Image systemName="book.closed" frame={{width: 100,height: 135}} />}
  <Text font="title2">{current.title}</Text>
  <Text>{current.author}</Text>
  <Text>{[current.language,current.year,current.extension,current.size].filter(Boolean).join(" · ")}</Text>
  {current.description ? <Text>{current.description}</Text> : null}
  <Button title={busy ? "下载中" : "下载到文件 App"} action={() => void save()} disabled={busy} />
  {file ? <Button title="分享文件" action={() => void ShareSheet.present([file])} /> : null}
  {message ? <Text>{message}</Text> : null}
 </VStack></ScrollView>
}
