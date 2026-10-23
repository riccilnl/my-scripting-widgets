import {
  NavigationStack, NavigationLink, ScrollView, VStack, HStack, Spacer,
  Text, Button, TextField, Image, Menu, Divider, useState, useEffect, useRef, useColorScheme
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
  // Ensure the selection and chevron remain readable in both light and
  // dark appearances instead of inheriting low-contrast link tint.
  const scheme = useColorScheme()
  const ink = scheme === "dark" ? "white" : "black"
  return <Menu label={<HStack spacing={6}>
    <Text foregroundStyle={ink}>{searchPrefsLabel(options, selected)}</Text>
    <Image systemName="chevron.down" foregroundStyle={ink} />
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
      <Results books={books} busy={busy} error={error} total={total} nextPage={page + 1}
        refresh={() => void load(1, true)} canLoadMore={canLoadMore}
        loadMore={() => void load(page + 1)} />
    </VStack>
  </NavigationStack>
}

/** The results own their request lifecycle and pagination; they are never
 * rendered inside the search form and the active filters are immutable. */
export function SearchResultsPage({ criteria }: { criteria: SearchPrefs }) {
  const [books, setBooks] = useState<Book[]>([])
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [lastBatch, setLastBatch] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const lock = useRef(false)
  async function load(next: number) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    try {
      const data = await search(criteria.query, next, criteria.language, criteria.format,
        criteria.yearFrom, criteria.yearTo, criteria.order)
      setBooks(prev => next === 1 ? data.books : appendUnique(prev, data.books))
      setPage(next); setLastBatch(data.books.length); setTotal(data.total)
    } catch (e) { setError(errorText(e)) }
    finally { lock.current = false; setBusy(false) }
  }
  useEffect(() => { void load(1) }, [])
  const canLoadMore = page > 0 && lastBatch === 20 &&
    (total === 0 || books.length < total)
  const title = criteria.query.trim() || "筛选结果"
  return <VStack navigationTitle="搜索结果" spacing={6}
    frame={{ maxWidth: "infinity", alignment: "leading" }}>
    <HStack padding={12} frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Text font="subheadline" lineLimit={1}>{title}</Text>
      <Spacer />
      <Text font="caption">{total > 0 ? total + " 本" : ""}</Text>
    </HStack>
    <Results books={books} busy={busy} error={error} total={total} nextPage={page + 1}
      canLoadMore={canLoadMore} refresh={() => void load(1)}
      loadMore={() => void load(page + 1)} />
  </VStack>
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
  const prefs: SearchPrefs = {query, yearFrom, yearTo, language, format, order}
  useEffect(() => {
    if (remember) saveSearchPrefs(prefs)
  }, [remember, query, yearFrom, yearTo, language, format, order])
  function setRememberPreference(next: boolean) {
    setRemember(next)
    saveSearchPrefs(next ? prefs : null)
  }
  const invalidYears = !!(yearFrom && yearTo && Number(yearFrom) > Number(yearTo))
  return <NavigationStack>
    <ScrollView scrollDismissesKeyboard="interactively"
      frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <VStack alignment="leading" spacing={13} padding={16}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="title2">搜索书籍</Text>
        <TextField title="搜索关键词" prompt="书名、作者、ISBN 或关键词（可留空）"
          value={query} onChanged={setQuery} textFieldStyle="roundedBorder"
          frame={{ maxWidth: "infinity", alignment: "leading" }} />
        <Divider />
        <HStack spacing={8} frame={{ maxWidth: "infinity" }}>
          <Text>时间</Text>
          <Spacer />
          <ChoiceMenu options={YEAR_CHOICES} selected={yearFrom} onChange={setYearFrom} />
          <Text>至</Text>
          <ChoiceMenu options={YEAR_CHOICES} selected={yearTo} onChange={setYearTo} />
        </HStack>
        <Divider />
        <FilterRow title="语言" options={LANGUAGES} value={language} onChange={setLanguage} />
        <Divider />
        <FilterRow title="格式" options={FORMATS} value={format} onChange={setFormat} />
        <Divider />
        <FilterRow title="排列方式" options={ORDERS} value={order} onChange={setOrder} />
        {invalidYears ? <Text foregroundStyle="red">开始年份不能晚于结束年份</Text> : null}
        <HStack frame={{ maxWidth: "infinity" }} spacing={0}>
          <Spacer />
          <NavigationLink destination={<SearchResultsPage criteria={{ ...prefs }} />}
            containerRelativeFrame={{ axes: "horizontal", count: 2, span: 1, spacing: 0 }}
            buttonStyle="borderedProminent" disabled={invalidYears}>
            <HStack spacing={6}>
              <Image systemName="magnifyingglass" />
              <Text>搜索</Text>
            </HStack>
          </NavigationLink>
          <Spacer />
        </HStack>
        <HStack frame={{ maxWidth: "infinity" }} spacing={8}>
          <Spacer />
          <Button title="记住搜索偏好"
            systemImage={remember ? "checkmark.square.fill" : "square"}
            buttonStyle="plain" action={() => setRememberPreference(!remember)} />
          <Spacer />
        </HStack>
      </VStack>
    </ScrollView>
  </NavigationStack>
}
