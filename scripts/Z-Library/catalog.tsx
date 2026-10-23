import { NavigationStack, VStack, HStack, Spacer, Text, Button, TextField, useState, useEffect } from "scripting"
import { Book, recent, search } from "./api"
import { Results } from "./results"

function errorText(e: unknown) { return e instanceof Error ? e.message : String(e) }

export function LatestPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function load(next: number) {
    if (busy) return
    setBusy(true); setError("")
    try {
      const data = await recent(next)
      setBooks(prev => next === 1 ? data.books : [...prev, ...data.books.filter(b => !prev.some(p => p.id === b.id && p.hash === b.hash))])
      setTotal(data.total); setPage(next)
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  useEffect(() => { void load(1) }, [])
  return <NavigationStack>
    <VStack>
      <HStack padding={12}>
        <Text font="title2">最新收录</Text>
        <Spacer />
        <Button title="刷新" systemImage="arrow.clockwise" action={() => void load(1)} />
      </HStack>
      <Results books={books} busy={busy} error={error} page={page} total={total} refresh={() => void load(1)} more={() => void load(page + 1)} showRefresh={false} />
    </VStack>
  </NavigationStack>
}

export function SearchPage() {
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [language, setLanguage] = useState("")
  const [format, setFormat] = useState("")
  const [fromYear, setFromYear] = useState("")
  const [toYear, setToYear] = useState("")
  const [books, setBooks] = useState<Book[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  async function load(next: number, word = term) {
    if (busy || !word.trim()) return
    setBusy(true); setError("")
    try {
      const data = await search(word, next, language.trim(), format.trim(), fromYear.trim(), toYear.trim())
      setBooks(prev => next === 1 ? data.books : [...prev, ...data.books.filter(b => !prev.some(p => p.id === b.id && p.hash === b.hash))])
      setTotal(data.total); setPage(next); setTerm(word)
    } catch (e) { setError(errorText(e)) }
    finally { setBusy(false) }
  }
  return <NavigationStack>
    <VStack spacing={8}>
      <TextField title="搜索" prompt="书名、作者、ISBN 或关键词" value={query} onChanged={setQuery} />
      <HStack padding={8}>
        <Button title="搜索书籍" systemImage="magnifyingglass" action={() => void load(1, query)} disabled={busy || !query.trim()} />
        <Spacer />
      </HStack>
      <HStack padding={8} spacing={8}>
        <TextField title="语言" prompt="english / chinese" value={language} onChanged={setLanguage} />
        <TextField title="格式" prompt="epub / pdf" value={format} onChanged={setFormat} />
      </HStack>
      <HStack padding={8} spacing={8}>
        <TextField title="起始年" prompt="例如 2018" value={fromYear} onChanged={setFromYear} />
        <TextField title="截止年" prompt="例如 2026" value={toYear} onChanged={setToYear} />
      </HStack>
      <Results books={books} busy={busy} error={error} page={page} total={total} refresh={() => void load(1)} more={() => void load(page + 1)} />
    </VStack>
  </NavigationStack>
}
