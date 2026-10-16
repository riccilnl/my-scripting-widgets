import {
  Button,
  Form,
  HStack,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  Script,
  Section,
  Tab,
  TabView,
  Text,
  TextField,
  Toggle,
  useEffect,
  useObservable,
  useState,
} from "scripting"
import {
  clearAllAuthorization,
  clearLogin,
  discoverN10,
  exchangeToken,
  fetchDeviceState,
  fetchRemoteAuthorization,
  friendlyError,
  hasAuthMaterial,
  importAuthorizationFile,
  saveAuthMaterial,
  loadDevice,
  loadSession,
  shouldAutoLogin,
  tokenExpiryText,
  type FotileDevice,
  type FotileSession,
} from "./fotile"
import {
  clearLoginDeviceId,
  clearSsoLogin,
  loginWithSmsCode,
  requestFiksSign,
  sendSmsCode,
} from "./login"
import { mqttBridge, type MqttBridgeEvent } from "./mqttBridge"
import {
  PROGRAMS,
  buildStartPayload,
  decodePackedTime,
  mergeDeviceState,
  programName,
  reportedStateName,
  type ExtraOptions,
  type N10State,
} from "./protocol"

type ConnectionState = "未连接" | "连接中" | "已连接" | "连接失败"

const DEFAULT_EXTRAS: ExtraOptions = {
  enhanceDrying: false,
  enhancedRinsing: false,
  upperQuickWash: false,
  steamSterilization: false,
  lowerQuickWash: false,
}

function HomeView(props: {
  session: FotileSession | null
  device: FotileDevice | null
  deviceState: N10State | null
  connection: ConnectionState
  busy: boolean
  status: string
  onRefresh: () => Promise<void>
  onControl: (payload: unknown) => Promise<void>
}) {
  const [selectedMode, setSelectedMode] = useState("6")
  const [extras, setExtras] = useState<ExtraOptions>(DEFAULT_EXTRAS)
  const [actionStatus, setActionStatus] = useState("")
  const [actionBusy, setActionBusy] = useState(false)

  useEffect(() => {
    if (typeof props.deviceState?.WorkMode === "number") {
      setSelectedMode(String(props.deviceState.WorkMode))
    }
  }, [props.deviceState?.WorkMode])

  const runControl = async (label: string, payload: unknown) => {
    setActionBusy(true)
    setActionStatus(`${label}…`)
    try {
      await props.onControl(payload)
      setActionStatus(`${label}指令已发送`)
    } catch (error) {
      setActionStatus(`${label}失败：${friendlyError(error)}`)
    } finally {
      setActionBusy(false)
    }
  }

  const startProgram = () => {
    const mode = Number(selectedMode)
    return runControl("开始", buildStartPayload(mode, extras))
  }

  const workState = props.deviceState?.WorkState
  const powered = props.deviceState?.PowerSwitchAll === 1
  const running = workState === 2
  const paused = workState === 3
  const canControl = !!props.session && !!props.device && props.connection === "已连接" && !actionBusy

  return (
    <Form navigationTitle="N10 洗碗机">
      <Section header={<Text>设备</Text>}>
        <Text>{props.device?.name ?? "尚未找到 N10"}</Text>
        <Text>{reportedStateName(props.deviceState)} · MQTT {props.connection}</Text>
        <Text>当前程序 · {programName(props.deviceState?.WorkMode)}</Text>
        <Text>剩余时间 · {decodePackedTime(props.deviceState?.ClRemTime)}</Text>
        <Button title="刷新状态" systemImage="arrow.clockwise" disabled={props.busy || !props.session} action={props.onRefresh} />
        {props.busy ? <ProgressView /> : null}
        {props.status ? <Text>{props.status}</Text> : null}
      </Section>

      <Section header={<Text>电源</Text>}>
        <Button
          title={powered ? "关机" : "开机"}
          systemImage={powered ? "power.circle.fill" : "power.circle"}
          role={powered ? "destructive" : undefined}
          disabled={!canControl}
          action={() => runControl(powered ? "关机" : "开机", { PowerSwitchAll: powered ? 0 : 1 })}
        />
      </Section>

      <Section header={<Text>洗涤程序</Text>}>
        <Picker
          title="程序"
          value={selectedMode}
          onChanged={(value: unknown) => setSelectedMode(String(value))}
          pickerStyle="navigationLink"
        >
          {PROGRAMS.map((item) => <Text key={item.value} tag={String(item.value)}>{item.name}</Text>)}
        </Picker>
      </Section>

      <Section
        header={<Text>附加功能</Text>}
        footer={<Text>附加功能使用 N10 实际协议位；设备会按所选程序支持范围处理组合。</Text>}
      >
        <Toggle title="加强烘干" value={extras.enhanceDrying} onChanged={(value: boolean) => setExtras({ ...extras, enhanceDrying: value })} />
        <Toggle title="加强漂洗" value={extras.enhancedRinsing} onChanged={(value: boolean) => setExtras({ ...extras, enhancedRinsing: value })} />
        <Toggle title="上层速洗" value={extras.upperQuickWash} onChanged={(value: boolean) => setExtras({ ...extras, upperQuickWash: value })} />
        <Toggle title="蒸汽除菌" value={extras.steamSterilization} onChanged={(value: boolean) => setExtras({ ...extras, steamSterilization: value })} />
        <Toggle title="下层速洗" value={extras.lowerQuickWash} onChanged={(value: boolean) => setExtras({ ...extras, lowerQuickWash: value })} />
      </Section>

      <Section header={<Text>运行控制</Text>}>
        {!running && !paused ? (
          <Button title={`开始 · ${programName(Number(selectedMode))}`} systemImage="play.fill" disabled={!canControl} action={startProgram} />
        ) : null}
        {running ? (
          <Button title="暂停" systemImage="pause.fill" disabled={!canControl} action={() => runControl("暂停", { WorkState: 2 })} />
        ) : null}
        {paused ? (
          <Button title="继续" systemImage="play.fill" disabled={!canControl} action={() => runControl("继续", { WorkState: 1 })} />
        ) : null}
        {running || paused ? (
          <Button title="取消当前程序" systemImage="stop.fill" role="destructive" disabled={!canControl} action={() => runControl("取消", { WorkState: 0 })} />
        ) : null}
        {actionBusy ? <ProgressView /> : null}
        {actionStatus ? <Text>{actionStatus}</Text> : null}
      </Section>
    </Form>
  )
}

function SettingsView(props: {
  session: FotileSession | null
  device: FotileDevice | null
  busy: boolean
  onLogin: (session: FotileSession, device: FotileDevice) => Promise<void>
  onLogout: () => Promise<void>
}) {
  const [status, setStatus] = useState("")
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState("")
  const [code, setCode] = useState("")
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const importAuthorization = async () => {
    let paths: string[] = []
    setBusy(true)
    setStatus("请选择 user_auth2 抓包 JSON…")
    try {
      paths = await DocumentPicker.pickFiles({
        types: ["public.json"],
        shouldShowFileExtensions: true,
      })
      const path = paths[0]
      if (!path) {
        setStatus("")
        return
      }
      setStatus("正在写入设备长期授权…")
      const session = await importAuthorizationFile(path)
      setStatus("正在查找 N10…")
      const device = await discoverN10(session)
      await props.onLogin(session, device)
      setStatus("设备授权已恢复，N10 已连接")
    } catch (error) {
      setStatus(`恢复失败：${friendlyError(error)}`)
    } finally {
      DocumentPicker.stopAcessingSecurityScopedResources()
      setBusy(false)
    }
  }

  const requestSms = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setStatus("请输入 11 位手机号")
      return
    }
    setBusy(true)
    setStatus("正在发送短信验证码…")
    try {
      await sendSmsCode(phone)
      setCooldown(60)
      setStatus("验证码已发送")
    } catch (error) {
      setStatus(`发送失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const smsLogin = async () => {
    if (!/^1\d{10}$/.test(phone)) {
      setStatus("请输入 11 位手机号")
      return
    }
    if (!/^\d{6}$/.test(code)) {
      setStatus("请输入 6 位短信验证码")
      return
    }
    setBusy(true)
    setStatus("正在验证方太账号…")
    try {
      const sso = await loginWithSmsCode(phone, code)
      setStatus("账号验证成功，正在建立设备授权…")
      const signed = await requestFiksSign(sso)
      saveAuthMaterial(signed.content, signed.sign)
      setStatus("设备授权已建立，正在连接 N10…")
      const session = await exchangeToken(true)
      const device = await discoverN10(session)
      await props.onLogin(session, device)
      setCode("")
      setStatus("登录成功，N10 已连接")
    } catch (error) {
      setStatus(`登录失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const refreshLogin = async () => {
    setBusy(true)
    setStatus("正在刷新 Token…")
    try {
      const session = await exchangeToken(true)
      const device = await discoverN10(session)
      await props.onLogin(session, device)
      setStatus("Token 已刷新")
    } catch (error) {
      setStatus(`刷新失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    setBusy(true)
    try {
      clearSsoLogin()
      await props.onLogout()
      setStatus("已退出账号；设备授权仍保存在 Keychain，可重新手机号登录")
    } catch (error) {
      setStatus(`退出失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const resetAll = async () => {
    setBusy(true)
    try {
      clearSsoLogin()
      clearLoginDeviceId()
      clearAllAuthorization()
      await props.onLogout()
      setPhone("")
      setCode("")
      setStatus("已清除账号、Token、设备长期授权和登录设备标识")
    } catch (error) {
      setStatus(`清除失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Form navigationTitle="设置">
      <Section
        header={<Text>方太登录</Text>}
        footer={<Text>测试版：直接发送短信和提交登录，不弹出前置安全检查；服务器拒绝时显示错误。</Text>}
      >
        {props.session ? (
          <>
            <Text>用户 · {props.session.userId}</Text>
            <Text>Token 有效至 · {tokenExpiryText(props.session)}</Text>
            <Text>设备 · {props.device?.name ?? "等待发现"}</Text>
            <Button title="刷新登录" systemImage="arrow.clockwise" disabled={busy || props.busy} action={refreshLogin} />
            <Button title="退出账号" systemImage="rectangle.portrait.and.arrow.right" role="destructive" disabled={busy || props.busy} action={logout} />
          </>
        ) : (
          <>
            <TextField
              title="手机号"
              value={phone}
              onChanged={setPhone}
              prompt="请输入 11 位手机号"
            />
            <TextField
              title="验证码"
              value={code}
              onChanged={setCode}
              prompt="请输入 6 位短信验证码"
            />
            <Button
              title={cooldown > 0 ? `${cooldown} 秒后可重新获取` : "获取验证码"}
              systemImage="message.fill"
              disabled={busy || props.busy || cooldown > 0}
              action={requestSms}
            />
            <Button
              title="登录"
              systemImage="person.crop.circle.badge.checkmark"
              disabled={busy || props.busy}
              action={smsLogin}
            />
          </>
        )}
        {busy ? <ProgressView /> : null}
        {status ? <Text>{status}</Text> : null}
      </Section>

      <Section
        header={<Text>高级恢复</Text>}
        footer={<Text>正常手机号登录会自动建立设备授权。这里的授权文件导入仅用于恢复或调试，日常使用不需要。</Text>}
      >
        <Text>设备长期授权 · {hasAuthMaterial() ? "已保存" : "未建立"}</Text>
        <Button
          title="从授权文件恢复"
          systemImage="key.fill"
          disabled={busy || props.busy}
          action={importAuthorization}
        />
        <Button
          title="清除全部本地授权"
          systemImage="trash"
          role="destructive"
          disabled={busy || props.busy}
          action={resetAll}
        />
      </Section>

      <Section header={<Text>设备协议</Text>}>
        <Text>型号 · JBCD6E-03-N10</Text>
        <Text>Product ID · 102FA</Text>
        <Text>连接 · 方太 MQTT WebSocket</Text>
      </Section>
    </Form>
  )
}
function App() {
  const [session, setSession] = useState<FotileSession | null>(loadSession())
  const [device, setDevice] = useState<FotileDevice | null>(loadDevice())
  const [deviceState, setDeviceState] = useState<N10State | null>(null)
  const [connection, setConnection] = useState<ConnectionState>("未连接")
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState("")
  const selection = useObservable<number>(shouldAutoLogin() ? 0 : 1)
  const dismiss = Navigation.useDismiss()

  useEffect(() => {
    const unsubscribe = mqttBridge.subscribe((event: MqttBridgeEvent) => {
      if (event.type === "connecting") setConnection("连接中")
      else if (event.type === "connected") setConnection("已连接")
      else if (event.type === "disconnected") setConnection("未连接")
      else if (event.type === "error") {
        setConnection("连接失败")
        setStatus(event.message)
      } else if (event.type === "sync") {
        setDeviceState((current) => mergeDeviceState(current, event.payload))
      }
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    if (selection.value === 2) dismiss()
  }, [selection.value])

  useEffect(() => {
    if (!shouldAutoLogin()) return
    void bootstrap(false)
  }, [])

  const connectAndAuthorize = async (nextSession: FotileSession, nextDevice: FotileDevice) => {
    setConnection("连接中")
    await mqttBridge.connect(nextSession, nextDevice)
    const auth = await fetchRemoteAuthorization(nextSession)
    if (auth) {
      await mqttBridge.publishService({
        setDevRemoteAuthInfo: {
          NewRemoteAuth: auth.status,
          localControlTime: auth.localControlTime,
        },
      })
    }
    await mqttBridge.publishService({ updateAllStatus: null })
  }

  const bootstrap = async (forceToken: boolean) => {
    setBusy(true)
    setStatus("正在连接方太服务…")
    try {
      const nextSession = await exchangeToken(forceToken)
      const nextDevice = await discoverN10(nextSession)
      setSession(nextSession)
      setDevice(nextDevice)
      try {
        const initial = await fetchDeviceState(nextSession, nextDevice)
        setDeviceState(initial)
      } catch {}
      await connectAndAuthorize(nextSession, nextDevice)
      setStatus(nextDevice.online ? "N10 已连接" : "N10 当前显示离线")
    } catch (error) {
      setStatus(friendlyError(error))
      setConnection("连接失败")
    } finally {
      setBusy(false)
    }
  }

  const refresh = async () => {
    if (!session || !device) {
      await bootstrap(false)
      return
    }
    setBusy(true)
    setStatus("正在刷新状态…")
    try {
      const freshSession = await exchangeToken(false)
      setSession(freshSession)
      const state = await fetchDeviceState(freshSession, device)
      setDeviceState(state)
      if (!mqttBridge.isConnected()) await connectAndAuthorize(freshSession, device)
      else await mqttBridge.publishService({ updateAllStatus: null })
      setStatus("状态已刷新")
    } catch (error) {
      setStatus(`刷新失败：${friendlyError(error)}`)
    } finally {
      setBusy(false)
    }
  }

  const control = async (payload: unknown) => {
    if (!session || !device) throw new Error("请先在设置中登录")
    if (!mqttBridge.isConnected()) await connectAndAuthorize(session, device)
    await mqttBridge.publishControl(payload)
  }

  const loginSucceeded = async (nextSession: FotileSession, nextDevice: FotileDevice) => {
    setSession(nextSession)
    setDevice(nextDevice)
    selection.setValue(0)
    try {
      const initial = await fetchDeviceState(nextSession, nextDevice)
      setDeviceState(initial)
    } catch {}
    try {
      await connectAndAuthorize(nextSession, nextDevice)
      setStatus("N10 已连接")
    } catch (error) {
      setConnection("连接失败")
      setStatus(`登录成功；MQTT 连接失败：${friendlyError(error)}`)
    }
  }

  const logout = async () => {
    await mqttBridge.disconnect()
    clearSsoLogin()
    clearLogin()
    setSession(null)
    setDevice(null)
    setDeviceState(null)
    setConnection("未连接")
    setStatus("")
    selection.setValue(1)
  }

  return (
    <TabView selection={selection} tabViewStyle="sidebarAdaptable">
      <Tab title="首页" systemImage="dishwasher.fill" value={0}>
        <NavigationStack>
          <HomeView
            session={session}
            device={device}
            deviceState={deviceState}
            connection={connection}
            busy={busy}
            status={status}
            onRefresh={refresh}
            onControl={control}
          />
        </NavigationStack>
      </Tab>
      <Tab title="设置" systemImage="gearshape.fill" value={1}>
        <NavigationStack>
          <SettingsView
            session={session}
            device={device}
            busy={busy}
            onLogin={loginSucceeded}
            onLogout={logout}
          />
        </NavigationStack>
      </Tab>
      <Tab title="退出" systemImage="xmark" value={2} tabPlacement="pinned">
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
  await mqttBridge.disconnect()
  Script.exit()
}

run()
