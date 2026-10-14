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
  listPushBooks,
  repushPushBook,
} from "./boox"

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
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState("")
  const requestRef = useRef(0)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState("")

  const refresh = async () => {
    const request = ++requestRef.current
    if (!props.session) {
      setItems([])
      setLoaded(false)
      setLoadError("")
      setStatus("")
      return
    }
    setLoading(true)
    setLoadError("")
    setStatus("")
    try {
      const books = await listPushBooks()
      if (request !== requestRef.current) return
      setItems(books)
      setLoaded(true)
    } catch (error) {
      if (request !== requestRef.current) return
      const reason = friendlyError(error)
      setLoadError(reason)
      setStatus("刷新失败：" + reason)
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    setItems([])
    setQuery("")
    setLoaded(false)
    void refresh()
    return () => { requestRef.current += 1 }
  }, [props.session?.token, props.session?.region])

  const repush = async (item: BooxPushBook) => {
    if (busyId) return
    setBusyId(item.id)
    setStatus(`正在重新推送：${item.name}`)
    try {
      const updated = await repushPushBook(item)
      setItems((current) =>
        current
          .map((value) => (value.id === updated.id ? updated : value))
          .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt)),
      )
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
      setItems((current) => current.filter((value) => value.id !== item.id))
      setStatus(`已删除：${item.name}`)
    } catch (error) {
      setStatus(`删除状态尚未确认：${friendlyError(error)}。请刷新列表核对，不要重复删除。`)
    } finally {
      setBusyId(null)
    }
  }

  const keyword = query.trim().toLowerCase()
  const visible = keyword
    ? items.filter((item) => item.name.toLowerCase().includes(keyword))
    : items

  return (
    <Form navigationTitle="云盘" searchable={{ value: query, onChanged: setQuery, prompt: "搜索推送书名" }}>
      <Section>
        <Button
          title="刷新推送列表"
          systemImage="arrow.clockwise"
          disabled={loading || busyId !== null || !props.session}
          action={refresh}
        />
        {loading ? <ProgressView /> : null}
        {loading && items.length > 0 ? <Text>正在刷新，以下为上次读取的列表</Text> : null}
        {status ? <Text>{status}</Text> : null}
      </Section>

      <Section header={<Text>推送列表 · {visible.length}/{items.length}</Text>}>
        {!props.session ? (
          <VStack alignment="leading" spacing={8}>
            <Text>登录后可查看和管理已推送到 BOOX 的电子书。</Text>
            <Button title="前往登录" systemImage="person.crop.circle" action={props.onRequestLogin} />
          </VStack>
        ) : loading && !items.length ? (
          <Text>正在读取推送列表…</Text>
        ) : loadError && !items.length ? (
          <VStack alignment="leading" spacing={8}>
            <Text>读取失败，云端文件未受影响。</Text>
            <Button title="重试读取" systemImage="arrow.clockwise" action={refresh} />
          </VStack>
        ) : !loaded ? (
          <Text>尚未读取推送列表</Text>
        ) : visible.length ? (
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
                label={<Image systemName="ellipsis.circle" accessibilityLabel={`更多操作：${item.name}`} />}
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
          <Text>{keyword && items.length ? "没有匹配的电子书" : "暂无已推送的电子书"}</Text>
        )}
      </Section>
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
