import {
  Button, HStack, Image, List, Navigation, NavigationLink, NavigationStack,
  ProgressView, Script, Section, SecureField, Spacer, Text, TextField, VStack, WebView,
  useEffect, useMemo, useRef, useState,
} from "scripting"
import { scoreURL, searchSongs, Song, titleOf, subtitleOf } from "./api"
import { describeFailure, parseScoreProbe, probeScript, readerHTML, saveSvgFiles, ScoreProbe } from "./score"
import {
  clearMySheetToken, readMySheetSettings, saveMySheetSettings, saveToMySheet,
} from "./mysheet"

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

function ScorePage({ song }: { song: Song }) {
  const controller = useMemo(() => new WebViewController(), [])
  const active = useRef(true)
  const locked = useRef(false)
  const svgCache = useRef<string[]>([])
  const sourceCache = useRef<ScoreProbe | null>(null)
  const [hasDsl, setHasDsl] = useState(false)
  const [importing, setImporting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [status, setStatus] = useState('正在获取简谱…')
  const [available, setAvailable] = useState(false)
  const [savedFiles, setSavedFiles] = useState<string[]>([])

  async function readScore() {
    if (locked.current || !active.current) return
    locked.current = true
    svgCache.current = []
    sourceCache.current = null
    setHasDsl(false)
    setAvailable(false)
    setSavedFiles([])
    setLoading(true)
    setStatus('正在加载曲谱页面…')
    let last: ScoreProbe | null = null
    try {
      // 已显示独立 SVG 时，必须重新访问原网址，不能仅 reload()。
      if (!(await controller.loadURL(scoreURL(song)))) throw new Error('网页请求失败')
      if (!active.current) return
      setStatus('网页已加载，正在检查 SVG…')
      for (let i = 0; i < 12 && active.current; i++) {
        // 先让网页完成正常绘制，随后再尝试直接调用网站编译函数。
        last = parseScoreProbe(await controller.evaluateJavaScript<string>(probeScript(i >= 3)))
        if (last.login) break
        if (last.svgs.length) {
          const svg = last.svgs
          const ok = await controller.loadHTML(readerHTML(svg), 'https://www.kuaiyuepu.com/')
          if (!ok) throw new Error('独立 SVG 阅读页加载失败')
          if (!active.current) return
          svgCache.current = svg
          if (last.nativeDsl && last.sourceUuid === song.song_uuid) {
            sourceCache.current = last
            setHasDsl(true)
          }
          setAvailable(true)
          setStatus(sourceCache.current
            ? 'SVG 与官方 DSL 已取得，可以保存到 MySheet'
            : 'SVG 可阅读；原生 DSL 未取得，不能导入 MySheet' +
              (last.sourceError ? '：' + last.sourceError : ''))
          return
        }
        if (!last.hasSheet && i >= 2) break
        if (i < 11) await delay(400)
      }
      if (active.current) setStatus(describeFailure(last))
    } catch (error) {
      if (active.current) setStatus('曲谱加载失败：' + errorMessage(error))
    } finally {
      locked.current = false
      if (active.current) setLoading(false)
    }
  }

  useEffect(() => {
    active.current = true
    void readScore()
    return () => {
      active.current = false
      svgCache.current = []
      sourceCache.current = null
      controller.dispose()
    }
  }, [controller, song.song_uuid])

  async function saveSVG() {
    if (saving || !svgCache.current.length) return
    setSaving(true)
    setStatus('正在保存 SVG…')
    try {
      const files = await saveSvgFiles(song, svgCache.current)
      if (!active.current) return
      setSavedFiles(files)
      setStatus(`已保存 ${files.length} 个 SVG 到 文件 App → Scripting → 快乐谱`)
    } catch (error) {
      if (active.current) setStatus('保存失败：' + errorMessage(error))
    } finally {
      if (active.current) setSaving(false)
    }
  }

  async function saveMySheet() {
    if (importing || !hasDsl || !sourceCache.current) return
    const probe = sourceCache.current
    setImporting(true)
    setStatus('正在写入 MySheet 并核验 DSL…')
    try {
      const result = await saveToMySheet(song, probe)
      if (!active.current) return
      setStatus(result.alreadyExists
        ? `MySheet 已有相同原生 DSL（ID ${result.id}），无需重复保存`
        : `保存成功：MySheet 曲谱 ID ${result.id}，原生 DSL 已回读校验`)
    } catch (error) {
      if (active.current) setStatus('MySheet 保存失败：' + errorMessage(error))
    } finally {
      if (active.current) setImporting(false)
    }
  }

  return <VStack navigationTitle={titleOf(song)} navigationBarTitleDisplayMode="inline"
    spacing={0} frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
    <HStack spacing={8} padding={{ horizontal: 12, vertical: 8 }}
      frame={{ maxWidth: "infinity", alignment: "leading" }}>
      <Button title={importing ? "入库中…" : "保存到 MySheet"} systemImage="square.and.arrow.down.on.square" buttonStyle="borderedProminent"
        disabled={loading || importing || !hasDsl} action={() => void saveMySheet()} />
      <Button title="保存 SVG" systemImage="square.and.arrow.down" buttonStyle="bordered"
        disabled={loading || saving || !available} action={() => void saveSVG()} />
      <Button title="重读" systemImage="arrow.clockwise" buttonStyle="bordered"
        disabled={loading || importing} action={() => void readScore()} />
      <Spacer />
      {loading ? <ProgressView /> : null}
    </HStack>
    <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={4}
      padding={{ horizontal: 12, bottom: 8 }}>{status}</Text>
    {savedFiles.length ? <Button title="分享已保存曲谱" systemImage="square.and.arrow.up"
      action={() => void ShareSheet.present(savedFiles)} /> : null}
    {/* 明确高度：原站 JS 检测到 #sheet 宽度为 0 时会一直延期绘制。 */}
    <WebView controller={controller} frame={{ maxWidth: "infinity", height: 560 }} />
  </VStack>
}

function SongRow({ song }: { song: Song }) {
  return <NavigationLink key={song.song_uuid} destination={<ScorePage song={song} />}>
    <HStack spacing={12} padding={{ vertical: 7 }}>
      <Image systemName="music.note.list" foregroundStyle="secondaryLabel"
        frame={{ width: 24, height: 26 }} />
      <VStack alignment="leading" spacing={4}
        frame={{ maxWidth: "infinity", alignment: "leading" }}>
        <Text font="headline" lineLimit={2}>{titleOf(song)}</Text>
        {subtitleOf(song) ? <Text font="caption" foregroundStyle="secondaryLabel"
          lineLimit={2}>{subtitleOf(song)}</Text> : null}
      </VStack>
    </HStack>
  </NavigationLink>
}

function MySheetSettingsPage() {
  const current = readMySheetSettings()
  const [url, setUrl] = useState(current.url)
  const [token, setToken] = useState("")
  const [hasToken, setHasToken] = useState(current.hasToken)
  const [notice, setNotice] = useState("")

  function save() {
    try {
      saveMySheetSettings(url, token)
      setToken("")
      const saved = readMySheetSettings()
      setUrl(saved.url)
      setHasToken(saved.hasToken)
      setNotice("连接设置已保存在本机；可返回曲谱页保存 DSL")
    } catch (error) { setNotice("保存失败：" + errorMessage(error)) }
  }
  function forget() {
    try {
      clearMySheetToken()
      setHasToken(false)
      setToken("")
      setNotice("本机 API Token 已清除")
    } catch (error) { setNotice("清除失败：" + errorMessage(error)) }
  }

  return <List navigationTitle="MySheet 设置" listStyle="insetGroup">
    <Section header={<Text>曲库连接</Text>}>
      <TextField title="MySheet 地址" prompt="https://你的域名" value={url} onChanged={setUrl} />
      <SecureField title="曲谱 API Token" prompt={hasToken ? "已保存；留空表示不变" : "粘贴曲谱 API Token"}
        value={token} onChanged={setToken} />
      <Button title="保存连接" systemImage="checkmark.circle" action={save} />
      {hasToken ? <Button title="清除本机 Token" systemImage="trash" action={forget} /> : null}
      <Text font="caption" foregroundStyle="secondaryLabel" lineLimit={4}>
        云端填写 HTTPS 地址和 MYSHEET_API_TOKEN，不能填写管理员 Token。
        Token 仅保存在本机钥匙串，不会写入脚本、GitHub 或日志。
        局域网无认证时可使用私有 IP 的 HTTP 地址，并留空 Token。
      </Text>
    </Section>
    {notice ? <Section header={<Text>连接状态</Text>}><Text>{notice}</Text></Section> : null}
  </List>
}

function SearchPage() {
  const [query, setQuery] = useState("")
  const [songs, setSongs] = useState<Song[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [searched, setSearched] = useState("")
  const lock = useRef(false)

  async function search() {
    const value = query.trim()
    if (!value || lock.current) return
    lock.current = true
    setBusy(true); setError(""); setSearched("")
    try {
      const result = await searchSongs(value)
      setSongs(result)
      setSearched(value)
    } catch (e) {
      setSongs([])
      setError(errorMessage(e))
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  return <NavigationStack>
    <List navigationTitle="快乐谱" navigationBarTitleDisplayMode="inline">
      <Section header={<Text>MySheet</Text>}>
        <NavigationLink destination={<MySheetSettingsPage />}>
          <Text>连接设置（HTTPS 地址与曲谱 Token）</Text>
        </NavigationLink>
      </Section>
      <Section header={<Text>搜索简谱</Text>}>
        <TextField title="曲名" prompt="输入曲名或拼音首字母"
          value={query} onChanged={setQuery} submitLabel="search"
          onSubmit={() => void search()} />
        <Button title={busy ? "正在搜索…" : "搜索"} systemImage="magnifyingglass"
          disabled={busy || !query.trim()} action={() => void search()} />
      </Section>
      {busy ? <Section><HStack spacing={10}><ProgressView />
        <Text font="subheadline">搜索中…</Text></HStack></Section> : null}
      {error ? <Section><Text foregroundStyle="systemRed">{error}</Text>
        <Button title="重试" action={() => void search()} /></Section> : null}
      {searched ? <Section header={<Text>{searched} · {songs.length} 首曲谱</Text>}>
        {songs.length ? songs.map(song => <SongRow key={song.song_uuid} song={song} />) :
          <Text foregroundStyle="secondaryLabel">未找到相关曲谱</Text>}
      </Section> : null}
    </List>
  </NavigationStack>
}

async function main() {
  try { await Navigation.present({ element: <SearchPage /> }) }
  finally { Script.exit() }
}
main().catch(error => console.error("快乐谱：" + errorMessage(error)))
