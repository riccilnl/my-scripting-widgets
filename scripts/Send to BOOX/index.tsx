import {
  Button,
  Form,
  HStack,
  Image,
  Menu,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  Script,
  Section,
  SecureField,
  Spacer,
  Tab,
  TabView,
  Text,
  Toolbar,
  ToolbarItem,
  TextField,
  VStack,
  useEffect,
  useObservable,
  useRef,
  useState,
} from "scripting"
import {
  type BooxRegion,
  type BooxSession,
  addRecentSend,
  clearSession,
  completeLogin,
  friendlyError,
  loadEmail,
  loadRecentSends,
  loadRegion,
  loadSession,
  requestVerificationCode,
  saveEmail,
  saveRegion,
  sendFilesToBoox,
  verifySession,
  getCloudStorageInfo,
  type BooxCloudStorageInfo,
  type BooxPushBook,
  deletePushBook,
  listPushBooksPage,
  repushPushBook,
} from "./boox"
import { searchCloudBooks, sortBooksLatest } from "./cloud-sort"

function formatRecentTime(value: number): string {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return "时间未知"
  try {
    return new Intl.DateTimeFormat(undefined, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

function formatBytes(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return "暂无法获取"
  const gb = 1024 * 1024 * 1024
  const mb = 1024 * 1024
  if (value >= gb) {
    const n = value / gb
    return `${n >= 10 ? n.toFixed(1) : n.toFixed(2)} GB`
  }
  return `${Math.max(0, value / mb).toFixed(1)} MB`
}

function HomeView(props: {
  session: BooxSession | null
  onRequestLogin: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [recent, setRecent] = useState(loadRecentSends())

  const chooseAndSend = async () => {
    let paths: string[] = []
    try {
      paths = await DocumentPicker.pickFiles({
        shouldShowFileExtensions: true,
        allowsMultipleSelection: true,
      })
    } catch (error) {
      setStatus(`选择文件失败：${friendlyError(error)}`)
      return
    }
    if (!paths.length) return

    setBusy(true)
    setStatus(paths.length > 1 ? `准备发送 ${paths.length} 个文件…` : "准备发送文件…")
    try {
      const results = await sendFilesToBoox(paths, {
        onProgress: ({ index, total, name, step }) => {
          if (step === "获取上传凭据") {
            setStatus(total > 1 ? `正在为 ${total} 个文件获取上传凭据…` : "正在获取上传凭据…")
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

      if (success === results.length) {
        setStatus(results.length === 1 ? "发送完成" : `${success} 个文件发送完成`)
      } else if (success > 0) {
        setStatus(`已发送 ${success}/${results.length} 个文件；失败项见发送历史`)
      } else {
        setStatus(results[0]?.detail ? `发送失败：${results[0].detail}` : "发送失败")
      }
    } catch (error) {
      setStatus(`发送失败：${friendlyError(error)}`)
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources()
      setRecent(loadRecentSends())
      setBusy(false)
    }
  }

  return (
    <Form navigationTitle="首页" onAppear={() => setRecent(loadRecentSends())}>
      <Section>
        <Button
          title="添加图书并发送"
          systemImage="plus.circle.fill"
          frame={{ maxWidth: "infinity", minHeight: 138 }}
          buttonStyle="borderedProminent"
          controlSize="large"
          disabled={busy || !props.session}
          action={chooseAndSend}
        />
        {busy ? <ProgressView /> : null}
        {status ? <Text>{status}</Text> : null}
        {!props.session ? (
          <VStack alignment="leading" spacing={8}>
            <Text>请先登录 BOOX，即可将文件发送到阅读器。</Text>
            <Button title="前往登录" systemImage="person.crop.circle" action={props.onRequestLogin} />
          </VStack>
        ) : null}
      </Section>

      <Section header={<Text>发送历史</Text>}>
        {recent.length ? (
          recent.map((item, index) => (
            <HStack key={String(item.time) + "-" + index} spacing={10}>
              <Image systemName={item.ok ? "checkmark.circle.fill" : "exclamationmark.circle.fill"} accessibilityLabel={item.ok ? "发送成功" : "发送失败"} />
              <VStack alignment="leading" spacing={3}>
                <Text>{item.name}</Text>
                <Text font="caption" foregroundStyle="secondaryLabel">{item.ok ? "发送成功" : "发送失败"} · {formatRecentTime(item.time)}</Text>
                {!item.ok && item.detail ? <Text font="caption" foregroundStyle="secondaryLabel">{item.detail}</Text> : null}
              </VStack>
            </HStack>
          ))
        ) : (
          <Text>暂无发送记录</Text>
        )}
      </Section>
    </Form>
  )
}

function CloudView(props: {
  session: BooxSession | null
  onRequestLogin: () => void
}) {
  const [items, setItems] = useState<BooxPushBook[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState("")
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState("")
  const [searchStage, setSearchStage] = useState<"browse" | "searching" | "results" | "error">("browse")
  const [searchResults, setSearchResults] = useState<BooxPushBook[]>([])
  const [searchError, setSearchError] = useState("")
  const searchRequest = useRef(0)
  const snapshot = useRef({
    generation: 0,
    books: [] as BooxPushBook[],
    deletedIds: new Set<string>(),
    loading: null as Promise<void> | null,
    error: "",
  })

  // One fetch, one sort and one visible list update, as in v0.1.13.
  // No progressive background scans or repeated list reordering.
  const refresh = async () => {
    const state = snapshot.current
    const generation = ++state.generation
    searchRequest.current++
    state.error = ""
    setLoadError("")
    setStatus("")
    setSearchStage("browse")
    setSearchResults([])
    setSearchError("")
    setQuery("")
    if (!props.session) {
      state.books = []
      state.loading = null
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    const task = (async () => {
      try {
        const books = await listPushBooks(() => {
          if (state.generation === generation) setStatus("BOOX 网关暂时超时，正在检查登录状态并重试…")
        })
        if (state.generation !== generation) return
        state.books = sortBooksLatest(books.filter(item => !state.deletedIds.has(item.id)))
        setItems(state.books)
        setStatus("")
      } catch (error) {
        if (state.generation !== generation) return
        state.error = friendlyError(error)
        setLoadError(state.error)
        setStatus("")
      } finally {
        if (state.generation === generation) {
          state.loading = null
          setLoading(false)
        }
      }
    })()
    state.loading = task
    await task
  }

  // Search only the complete snapshot. The result replaces the library view.
  const runSearch = async () => {
    const term = query.trim()
    const request = ++searchRequest.current
    const generation = snapshot.current.generation
    if (!term) {
      setSearchStage("browse")
      setSearchResults([])
      setSearchError("")
      return
    }
    setSearchStage("searching")
    setSearchResults([])
    setSearchError("")
    try {
      const state = snapshot.current
      if (state.loading) await state.loading
      if (state.generation !== generation || searchRequest.current !== request) return
      if (state.error) throw new Error(state.error)
      setSearchResults(searchCloudBooks(state.books, term))
      setSearchStage("results")
    } catch (error) {
      if (snapshot.current.generation !== generation || searchRequest.current !== request) return
      setSearchError(friendlyError(error))
      setSearchStage("error")
    }
  }

  useEffect(() => {
    snapshot.current.books = []
    snapshot.current.deletedIds = new Set<string>()
    setItems([])
    void refresh()
  }, [props.session?.token, props.session?.region])

  const repush = async (item: BooxPushBook) => {
    if (busyId) return
    setBusyId(item.id)
    setStatus(`正在重新推送：${item.name}`)
    try {
      const updated = await repushPushBook(item)
      pager.current.books = mergeChanges(pager.current.books, [updated])
      setItems(pager.current.books)
      setSearchResults((current) => sortBooksLatest(
        current.map(value => value.id === updated.id ? updated : value),
      ))
      setStatus(`已重新推送：${item.name}`)
    } catch (error) {
      setStatus(`重新推送失败：${friendlyError(error)}`)
    } finally {
      setBusyId(null)
    }
  }

  const remove = async (item: BooxPushBook) => {
    if (busyId) return
    const confirmed = await Dialog.confirm({
      title: "删除电子书",
      message: `确定从 BOOX 推送列表永久删除“${item.name}”吗？此操作没有回收站。`,
      cancelLabel: "取消",
      confirmLabel: "删除",
    })
    if (!confirmed) return

    setBusyId(item.id)
    setStatus(`正在删除：${item.name}`)
    try {
      await deletePushBook(item)
      pager.current.deletedIds.add(item.id)
      pager.current.books = pager.current.books.filter(value => value.id !== item.id)
      setItems(pager.current.books)
      setSearchResults((current) => current.filter(value => value.id !== item.id))
      setStatus(`已删除：${item.name}`)
    } catch (error) {
      setStatus(`删除失败：${friendlyError(error)}`)
    } finally {
      setBusyId(null)
    }
  }

  const visible = searchStage === "results" ? searchResults : items

  return (
    <Form
      navigationTitle="云盘"
      toolbar={
        <Toolbar>
          <ToolbarItem placement="topBarTrailing">
            <Button
              title="刷新"
              systemImage="arrow.clockwise"
              disabled={loading || busyId !== null || !props.session}
              action={refresh}
            />
          </ToolbarItem>
        </Toolbar>
      }
    >
      <Section>
        <HStack spacing={8}>
          <TextField
            title="搜索电子书"
            value={query}
            onChanged={setQuery}
            prompt="输入书名"
          />
          <Button
            title="搜索"
            systemImage="magnifyingglass"
            disabled={!props.session || searchStage === "searching"}
            action={() => { void runSearch() }}
          />
        </HStack>
      </Section>

      {searchStage === "searching" ? (
        <Section>
          <VStack alignment="center" spacing={10}>
            <ProgressView />
            <Text>搜索中…</Text>
          </VStack>
        </Section>
      ) : searchStage === "error" ? (
        <Section>
          <Text>搜索失败：{searchError}</Text>
          <Button title="重试搜索" systemImage="arrow.clockwise" action={() => { void runSearch() }} />
        </Section>
      ) : (
        <Section>
          {!props.session ? (
            <Button title="前往登录" systemImage="person.crop.circle" action={props.onRequestLogin} />
          ) : loading && !loaded ? (
            <VStack alignment="leading" spacing={8}>
              <ProgressView />
              <Text>正在读取云盘图书…</Text>
            </VStack>
          ) : loadError ? (
            <VStack alignment="leading" spacing={8}>
              <Text>云盘读取失败：{loadError}</Text>
              <Button title="重试读取" systemImage="arrow.clockwise" action={refresh} />
            </VStack>
          ) : visible.length > 0 ? (
            visible.map((item) => (
              <HStack key={item.id} spacing={10}>
                <VStack alignment="leading" spacing={3}>
                  <Text>{item.name}</Text>
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {formatBytes(item.size)} · {formatRecentTime(item.updatedAt || item.createdAt)}
                  </Text>
                </VStack>
                <Spacer />
                {busyId === item.id ? <ProgressView /> : null}
                <Menu
                  buttonStyle="plain"
                  label={<Image systemName="ellipsis.circle" />}
                >
                  <Button
                    title="重新推送"
                    systemImage="paperplane"
                    disabled={busyId !== null}
                    action={() => repush(item)}
                  />
                  <Button
                    title="删除"
                    systemImage="trash"
                    role="destructive"
                    disabled={busyId !== null}
                    action={() => remove(item)}
                  />
                </Menu>
              </HStack>
            ))
          ) : (
            <Text>{searchStage === "results" ? "没有匹配的电子书" : "暂无推送电子书"}</Text>
          )}
          {status && !loading ? <Text font="caption" foregroundStyle="secondaryLabel">{status}</Text> : null}
        </Section>
      )}

      {searchStage === "browse" && scanning ? (
        <Section>
          <HStack spacing={8}>
            <ProgressView />
            <Text font="caption" foregroundStyle="secondaryLabel">正在整理完整书库，按最新时间排序…</Text>
          </HStack>
        </Section>
      ) : null}
      {searchStage === "browse" && hasMore && !scanning && scanError ? (
        <Section>
          <Text>{scanError}</Text>
          <Button
            title="继续整理书库"
            systemImage="arrow.clockwise"
            action={() => { void scanRemaining(pager.current.generation) }}
          />
        </Section>
      ) : null}
    </Form>
  )
}

function SettingsView(props: {
  session: BooxSession | null
  onSessionChanged: (session: BooxSession | null) => void
  onLoginSucceeded: () => void
}) {
  const dismiss = Navigation.useDismiss()
  const [region, setRegion] = useState<BooxRegion>(loadRegion())
  const [email, setEmail] = useState(loadEmail())
  const [code, setCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const [cloudSpace, setCloudSpace] = useState<BooxCloudStorageInfo | null>(null)
  const [cloudBusy, setCloudBusy] = useState(false)
  const [cloudStatus, setCloudStatus] = useState("")

  const refreshCloudSpace = async () => {
    if (!props.session) {
      setCloudSpace(null)
      setCloudStatus("")
      return
    }
    setCloudBusy(true)
    setCloudStatus("正在读取云空间…")
    try {
      const info = await getCloudStorageInfo()
      setCloudSpace(info)
      setCloudStatus(info.usageAvailable ? "" : "BOOX 当前接口未返回已用空间字段")
    } catch (error) {
      setCloudStatus(`云空间暂无法获取：${friendlyError(error)}`)
    } finally {
      setCloudBusy(false)
    }
  }

  useEffect(() => {
    if (props.session) {
      void refreshCloudSpace()
    } else {
      setCloudSpace(null)
      setCloudStatus("")
    }
  }, [props.session?.token, props.session?.region])

  const changeRegion = async (next: BooxRegion) => {
    if (next === region || busy) return
    if (props.session) {
      const confirmed = await Dialog.confirm({
        title: "切换 BOOX 服务器",
        message: "切换服务器会退出当前账号，需要在新服务器重新登录。是否继续？",
        cancelLabel: "取消",
        confirmLabel: "切换并退出登录",
      })
      if (!confirmed) return
      clearSession()
      props.onSessionChanged(null)
      setStatus("服务器已切换，请重新登录")
    }
    setRegion(next)
    saveRegion(next)
  }

  const sendCode = async () => {
    setBusy(true)
    setStatus("正在请求验证码…")
    try {
      saveEmail(email)
      await requestVerificationCode(email, region)
      setStatus("验证码已发送")
    } catch (error) {
      setStatus(`发送失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const login = async () => {
    setBusy(true)
    setStatus("正在登录 BOOX…")

    let next: BooxSession
    try {
      next = await completeLogin(email, code, region)
    } catch (error) {
      setStatus(`登录失败：${friendlyError(error)}`)
      setBusy(false)
      return
    }

    props.onSessionChanged(next)
    setCode("")
    setStatus("登录成功")

    try {
      props.onLoginSucceeded()
    } catch (error) {
      setStatus(`登录成功，但切换首页失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const checkLogin = async () => {
    setBusy(true)
    setStatus("正在检查登录状态…")
    try {
      const who = await verifySession()
      setStatus(`登录有效：${who}`)
    } catch (error) {
      setStatus(`登录检查失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const logout = () => {
    clearSession()
    props.onSessionChanged(null)
    setStatus("已退出登录")
  }

  return (
    <Form navigationTitle="设置">
      <Section
        header={<Text>BOOX 登录</Text>}
        footer={<Text>登录信息保存在本设备的 iOS 钥匙串中；重装脚本可能需要重新登录。</Text>}
      >
        {props.session ? (
          <>
            <Text>{props.session.email}</Text>
            <Picker
              title="服务器"
              value={region}
              onChanged={(value: unknown) => { void changeRegion(value as BooxRegion) }}
              pickerStyle="navigationLink"
            >
              <Text tag="cn">中国服务器</Text>
              <Text tag="us">美国 / 全球服务器</Text>
              <Text tag="eu">欧洲服务器</Text>
            </Picker>
            <Button title="检查登录状态" disabled={busy} action={checkLogin} />
            <Button title="退出登录" role="destructive" disabled={busy} action={logout} />
          </>
        ) : (
          <>
            <Picker
              title="服务器"
              value={region}
              onChanged={(value: unknown) => { void changeRegion(value as BooxRegion) }}
              pickerStyle="navigationLink"
            >
              <Text tag="cn">中国服务器</Text>
              <Text tag="us">美国 / 全球服务器</Text>
              <Text tag="eu">欧洲服务器</Text>
            </Picker>
            <HStack spacing={8}>
              <TextField title="邮箱或手机号" value={email} onChanged={setEmail} />
              <Button title="获取验证码" disabled={busy || !email.trim()} action={sendCode} />
            </HStack>
            <SecureField title="验证码" value={code} onChanged={setCode} />
            <Button
              title="登录"
              disabled={busy || !email.trim() || !code.trim()}
              action={login}
            />
          </>
        )}
        {busy ? <ProgressView /> : null}
        {status ? <Text>{status}</Text> : null}
      </Section>

      {props.session ? (
        <Section header={<Text>BOOX 云空间</Text>}>
          <Text>总容量 · {formatBytes(cloudSpace?.totalBytes)}</Text>
          <Text>已用空间 · {formatBytes(cloudSpace?.usedBytes)}</Text>
          <Text>剩余空间 · {formatBytes(cloudSpace?.freeBytes)}</Text>
          <Button title="刷新空间信息" disabled={cloudBusy} action={refreshCloudSpace} />
          {cloudBusy ? <ProgressView /> : null}
          {cloudStatus ? <Text>{cloudStatus}</Text> : null}
        </Section>
      ) : null}
      <Section>
        <Button title="关闭" systemImage="xmark" action={dismiss} />
      </Section>
    </Form>
  )
}

function App() {
  const [session, setSession] = useState<BooxSession | null>(loadSession())
  const selection = useObservable<number>(session ? 0 : 2)
  return (
    <TabView selection={selection}>
      <Tab title="首页" systemImage="house.fill" value={0}>
        <NavigationStack>
          <HomeView session={session} onRequestLogin={() => selection.setValue(2)} />
        </NavigationStack>
      </Tab>
      <Tab title="云盘" systemImage="books.vertical.fill" value={1}>
        <NavigationStack>
          <CloudView session={session} onRequestLogin={() => selection.setValue(2)} />
        </NavigationStack>
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value={2}>
        <NavigationStack>
          <SettingsView
            session={session}
            onSessionChanged={setSession}
            onLoginSucceeded={() => selection.setValue(0)}
          />
        </NavigationStack>
      </Tab>
    </TabView>
  )
}

async function run() {
  await Navigation.present({
    element: <App />,
  })
  Script.exit()
}

run()
