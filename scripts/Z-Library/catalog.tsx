import {
  NavigationStack, VStack, HStack, Spacer, Text, Button, TextField, Image,
  Menu, GeometryReader, Divider, useState, useEffect, useRef
} from "scripting"
import { Book, cachedRecent, recent, search } from "./api"
import { Results } from "./results"
import {
  Choice, YEAR_CHOICES, LANGUAGES, FORMATS, ORDERS, SearchPrefs,
  DEFAULT_PREFS, readSearchPrefs, saveSearchPrefs, searchPrefsLabel
} from "./search-options"

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

function ChoiceMenu({ options, selected, onChange }: {
  options: Choice[]; selected: string; onChange: (value: string) => void
}) {
  return <Menu label={<HStack spacing={4}>
    <Text foregroundStyle="blue">{searchPrefsLabel(options, selected)}</Text>
    <Image systemName="chevron.down" />
  </HStack>}>
    {options.map(item => <Button key={item.value}
      title={(selected === item.value ? "✓ " : "") + item.label}
      action={() => onChange(item.value)} />)}
  </Menu>
}
function FilterRow({ title, options, value, onChange }: {
  title: string; options: Choice[]; value: string; onChange: (value: string) => void
}) {
  return <HStack spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <Text>{title}</Text>
    <Spacer />
    <ChoiceMenu options={options} selected={value} onChange={onChange} />
  </HStack>
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
      <Results books={books} busy={busy} error={error} total={total} nextPage={page+1}
        refresh={() => void load(1, true)} canLoadMore={canLoadMore}
        loadMore={() => void load(page + 1)} />
    </VStack>
  </NavigationStack>
}

export function SearchPage() {
  const previous = readSearchPrefs()
  const initial = previous || DEFAULT_PREFS
  const [query, setQuery] = useState(initial.query)
  const [language, setLanguage] = useState(initial.language)
  const [format, setFormat] = useState(initial.format)
  const [yearFrom, setYearFrom] = useState(initial.yearFrom)
  const [yearTo, setYearTo] = useState(initial.yearTo)
  const [order, setOrder] = useState(initial.order)
  const [remember, setRemember] = useState(previous !== null)
  const [term, setTerm] = useState("")
  const [books, setBooks] = useState<Book[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [lastBatch, setLastBatch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  const activeFilters = useRef<SearchPrefs | null>(null)
  const prefs: SearchPrefs = {query, yearFrom, yearTo, language, format, order}
  useEffect(() => {
    if (remember) saveSearchPrefs(prefs)
  }, [remember, query, yearFrom, yearTo, language, format, order])
  function setRememberPreference(next: boolean) {
    setRemember(next)
    saveSearchPrefs(next ? prefs : null)
  }
  async function load(next: number, requested?: SearchPrefs) {
    if (lock.current) return
    const settings = next === 1 ? (requested || prefs) : activeFilters.current
    if (!settings || !settings.query.trim()) return
    if (settings.yearFrom && settings.yearTo && Number(settings.yearFrom) > Number(settings.yearTo)) {
      setError("开始年份不能晚于结束年份")
      return
    }
    lock.current = true; setBusy(true); setError("")
    if (next === 1) activeFilters.current = {...settings}
    try {
      const data = await search(settings.query, next, settings.language, settings.format,
        settings.yearFrom, settings.yearTo, settings.order)
      setBooks(prev => next === 1 ? data.books : appendUnique(prev, data.books))
      setPage(next); setLastBatch(data.books.length); setTotal(data.total)
      setTerm(settings.query)
    } catch (e) { setError(errorText(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  const canLoadMore = page > 0 && lastBatch === 20 && (total === 0 || books.length < total)
  return <NavigationStack>
    <VStack spacing={8} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <VStack alignment="leading" spacing={10}
        padding={{ top: 12, leading: 16, trailing: 16, bottom: 4 }}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="title2">搜索书籍</Text>
        <TextField title="搜索关键词" prompt="书名、作者、ISBN 或关键词"
          value={query} onChanged={setQuery} frame={{ maxWidth: "infinity" }} />
        <Divider />
        <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
          <Text>时间</Text>
          <Spacer />
          <ChoiceMenu options={YEAR_CHOICES} selected={yearFrom} onChange={setYearFrom} />
          <Text foregroundStyle="gray">至</Text>
          <ChoiceMenu options={YEAR_CHOICES} selected={yearTo} onChange={setYearTo} />
        </HStack>
        <Divider />
        <FilterRow title="语言" options={LANGUAGES} value={language} onChange={setLanguage} />
        <Divider />
        <FilterRow title="格式" options={FORMATS} value={format} onChange={setFormat} />
        <Divider />
        <FilterRow title="排列方式" options={ORDERS} value={order} onChange={setOrder} />
        <GeometryReader frame={{height: 48}}>
          {proxy => <HStack frame={{ maxWidth: "infinity" }}>
            <Spacer />
            <Button title={busy ? "正在搜索…" : "搜索"}
              systemImage="magnifyingglass" buttonStyle="borderedProminent"
              frame={{ width: Math.max(130, proxy.size.width / 2) }}
              disabled={busy || !query.trim()} action={() => void load(1, prefs)} />
            <Spacer />
          </HStack>}
        </GeometryReader>
        <HStack frame={{ maxWidth: "infinity" }}>
          <Spacer />
          <Button title="记住搜索偏好"
            systemImage={remember ? "checkmark.square.fill" : "square"}
            buttonStyle="plain" action={() => setRememberPreference(!remember)} />
          <Spacer />
        </HStack>
        {term ? <Text font="caption">「{term}」的搜索结果：{total}</Text> : null}
      </VStack>
      <Results books={books} busy={busy} error={error} total={total} nextPage={page+1}
        canLoadMore={canLoadMore} refresh={() => void load(1, activeFilters.current || prefs)}
        loadMore={() => void load(page + 1)} />
    </VStack>
  </NavigationStack>
}
