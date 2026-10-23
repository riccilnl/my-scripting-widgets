import {
  NavigationStack, VStack, HStack, Spacer, Text, Button, TextField,
  useState, useEffect, useRef
} from "scripting"
import { Book, cachedRecent, recent, search } from "./api"
import { Results } from "./results"

function errorText(e: unknown) { return e instanceof Error ? e.message : String(e) }
function appendUnique(old: Book[], next: Book[]): Book[] {
  const seen = new Set(old.map(b => b.id + ":" + b.hash))
  return old.concat(next.filter(b => {
    const key = b.id + ":" + b.hash
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }))
}

export function LatestPage() {
  const cached = cachedRecent()
  const [books, setBooks] = useState<Book[]>(cached?.books || [])
  const [page, setPage] = useState(cached ? 1 : 0)
  const [total, setTotal] = useState(cached?.total || 0)
  const [lastBatch, setLastBatch] = useState(cached?.books.length || 0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  async function load(next: number, force = false) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    try {
      const result = await recent(next, force)
      setBooks(prev => next === 1 ? result.books : appendUnique(prev, result.books))
      setTotal(result.total)
      setLastBatch(result.books.length)
      setPage(next)
    } catch (e) { setError(errorText(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!cachedRecent()) void load(1)
  }, [])
  const canLoadMore = page > 0 && lastBatch === 20 && (total === 0 || books.length < total)
  return <NavigationStack>
    <VStack>
      <HStack padding={12}>
        <VStack alignment="leading" spacing={3}>
          <Text font="title2">中文最新收录</Text>
          <Text font="caption">按最近添加排序</Text>
        </VStack>
        <Spacer />
        <Button title="刷新" systemImage="arrow.clockwise" disabled={busy} action={() => void load(1, true)} />
      </HStack>
      <Results books={books} busy={busy} error={error} total={total}
        refresh={() => void load(1, true)} canLoadMore={canLoadMore}
        loadMore={() => void load(page + 1)} />
    </VStack>
  </NavigationStack>
}

export function SearchPage() {
  const [query, setQuery] = useState("")
  const [term, setTerm] = useState("")
  const [language, setLanguage] = useState("")
  const [format, setFormat] = useState("")
  const [yearFrom, setYearFrom] = useState("")
  const [yearTo, setYearTo] = useState("")
  const [filters, setFilters] = useState(false)
  const [books, setBooks] = useState<Book[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [lastBatch, setLastBatch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  async function load(next: number, word = term) {
    if (lock.current || !word.trim()) return
    lock.current = true; setBusy(true); setError("")
    try {
      const data = await search(word, next, language, format, yearFrom, yearTo)
      setBooks(prev => next === 1 ? data.books : appendUnique(prev, data.books))
      setPage(next); setLastBatch(data.books.length); setTotal(data.total); setTerm(word)
    } catch (e) { setError(errorText(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  const canLoadMore = page > 0 && lastBatch === 20 && (total === 0 || books.length < total)
  return <NavigationStack>
    <VStack spacing={10}>
      <HStack padding={{ top: 12, leading: 12, trailing: 12 }} spacing={8}>
        <TextField title="图书搜索" prompt="书名 / 作者 / ISBN / 关键词" value={query} onChanged={setQuery} />
        <Button title="搜索" systemImage="magnifyingglass" disabled={busy || !query.trim()} action={() => void load(1, query)} />
      </HStack>
      <HStack padding={{ leading: 12, trailing: 12 }} spacing={10}>
        <Button title={filters ? "收起筛选" : "筛选条件"} systemImage="slider.horizontal.3" action={() => setFilters(!filters)} />
        <Spacer />
        <Text font="caption">{term ? "结果 " + total : "输入内容后搜索"}</Text>
      </HStack>
      {filters ? <VStack alignment="leading" spacing={8} padding={{ leading: 12, trailing: 12, bottom: 8 }}>
        <Text font="subheadline">语言</Text>
        <HStack spacing={8}>
          {(["", "chinese", "english"] as const).map((v, i) =>
            <Button key={v} title={(language === v ? "✓ " : "") + ["全部", "中文", "英文"][i]} action={() => setLanguage(v)} />)}
        </HStack>
        <Text font="subheadline">文件格式</Text>
        <HStack spacing={8}>
          {(["", "epub", "pdf", "mobi"] as const).map((v, i) =>
            <Button key={v} title={(format === v ? "✓ " : "") + ["全部", "EPUB", "PDF", "MOBI"][i]} action={() => setFormat(v)} />)}
        </HStack>
        <HStack spacing={8}>
          <TextField title="起始年份" prompt="例如 2020" value={yearFrom} onChanged={setYearFrom} />
          <TextField title="截止年份" prompt="例如 2026" value={yearTo} onChanged={setYearTo} />
        </HStack>
        <Text font="caption">更改条件后点击搜索应用筛选</Text>
      </VStack> : null}
      <Results books={books} busy={busy} error={error} total={total}
        canLoadMore={canLoadMore} refresh={() => void load(1, term)}
        loadMore={() => void load(page + 1)} />
    </VStack>
  </NavigationStack>
}
