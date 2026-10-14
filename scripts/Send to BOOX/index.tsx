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
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
    <Form navigationTitle="首页">
      <Section>
        <Button
          title="添加图书并发送"
          systemImage="plus.circle.fill"
          disabled={busy || !props.session}
          action={chooseAndSend}
        />
        {busy ? <ProgressView /> : null}
        <Text>{status || (props.session ? "准备就绪" : "请先在设置中登录 BOOX")}</Text>
      </Section>

      <Section header={<Text>发送历史</Text>}>
        {recent.length ? (
          recent.map((item, index) => (
            <Text key={`${item.time}-${index}`}>
              {item.ok ? "✓" : "×"} {item.name} · {formatRecentTime(item.time)}
              {item.detail ? ` · ${item.detail}` : ""}
            </Text>
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
}) {
  const [items, setItems] = useState<BooxPushBook[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [status, setStatus] = useState("")

  const refresh = async () => {
    if (!props.session) {
      setItems([])
      setStatus("请先在设置中登录 BOOX")
      return
    }
    setLoading(true)
    setStatus("正在读取 BOOX 推送列表…")
    try {
      const books = await listPushBooks()
      setItems(books)
      setStatus(books.length ? `已读取 ${books.length} 本电子书` : "云端推送列表为空")
    } catch (error) {
      setStatus(`读取失败：${friendlyError(error)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
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
      setStatus(`删除失败：${friendlyError(error)}`)
    } finally {
      setBusyId(null)
    }
  }

  const keyword = query.trim().toLowerCase()
  const visible = keyword
    ? items.filter((item) => item.name.toLowerCase().includes(keyword))
    : items

  return (
    <Form navigationTitle="云盘">
      <Section>
        <HStack spacing={8}>
          <TextField
            title="搜索电子书"
            value={query}
            onChanged={setQuery}
            prompt="书名"
          />
          <Button
            title="刷新"
            systemImage="arrow.clockwise"
            disabled={loading || busyId !== null || !props.session}
            action={refresh}
          />
        </HStack>
        {loading ? <ProgressView /> : null}
        {status ? <Text>{status}</Text> : null}
      </Section>

      <Section header={<Text>推送列表 · {visible.length}/{items.length}</Text>}>
        {!props.session ? (
          <Text>请先在设置中登录 BOOX</Text>
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
          <Text>{keyword ? "没有匹配的电子书" : "暂无推送电子书"}</Text>
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

  const changeRegion = (next: BooxRegion) => {
    if (next === region) return
    setRegion(next)
    saveRegion(next)
    if (props.session) {
      clearSession()
      props.onSessionChanged(null)
      setStatus("服务器已切换，请在新服务器重新登录")
    }
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
        footer={<Text>账号 Token 与 UID 使用系统 Keychain 保存；替换/删除脚本可能导致该脚本的 Keychain 作用域被系统回收。</Text>}
      >
        {props.session ? (
          <>
            <Text>{props.session.email}</Text>
            <Picker
              title="服务器"
              value={region}
              onChanged={(value: unknown) => changeRegion(value as BooxRegion)}
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
            <HStack spacing={8}>
              <TextField title="邮箱或手机号" value={email} onChanged={setEmail} />
              <Button title="获取验证码" disabled={busy || !email.trim()} action={sendCode} />
            </HStack>
            <Picker
              title="服务器"
              value={region}
              onChanged={(value: unknown) => changeRegion(value as BooxRegion)}
              pickerStyle="navigationLink"
            >
              <Text tag="cn">中国服务器</Text>
              <Text tag="us">美国 / 全球服务器</Text>
              <Text tag="eu">欧洲服务器</Text>
            </Picker>
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
    </Form>
  )
}

function App() {
  const [session, setSession] = useState<BooxSession | null>(loadSession())
  const selection = useObservable<number>(session ? 0 : 2)
  const dismiss = Navigation.useDismiss()

  useEffect(() => {
    if (selection.value === 3) dismiss()
  }, [selection.value])

  return (
    <TabView selection={selection} tabViewStyle="sidebarAdaptable">
      <Tab title="首页" systemImage="house.fill" value={0}>
        <NavigationStack>
          <HomeView session={session} />
        </NavigationStack>
      </Tab>
      <Tab title="云盘" systemImage="books.vertical.fill" value={1}>
        <NavigationStack>
          <CloudView session={session} />
        </NavigationStack>
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value={2}>
        <NavigationStack>
          <SettingsView
            session={session}
            onSessionChanged={setSession}
            onLoginSucceeded={() => selection.setValue(0)}
          />        </NavigationStack>
      </Tab>
      <Tab title="退出" systemImage="xmark" value={3} tabPlacement="pinned">
        <></>
      </Tab>
    </TabView>
  )
}

async function run() {
  await Navigation.present({
    element: <App />,
    modalPresentationStyle: "overFullScreen",
  })
  Script.exit()
}

run()
