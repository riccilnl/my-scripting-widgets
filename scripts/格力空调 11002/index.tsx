import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Script,
  Section,
  Stepper,
  Text,
  Toggle,
  useEffect,
  useState,
  VStack,
} from "scripting"
import {
  clearCachedDevice,
  discoverGree,
  debugGreeTemperature,
  getCachedDevice,
  getGreeState,
  setPowerState,
  setTargetTemperature,
  type GreeResult,
} from "./gree"

function App() {
  const cached = getCachedDevice()
  const [power, setPower] = useState<boolean | null>(null)
  const [currentTemperature, setCurrentTemperature] = useState<number | null>(null)
  const [targetTemperature, setTargetTemperatureValue] = useState<number | null>(null)
  const [temperatureUnit, setTemperatureUnit] = useState<"C" | "F">("C")
  const [temperatureMin, setTemperatureMin] = useState(16)
  const [temperatureMax, setTemperatureMax] = useState(30)
  const [busy, setBusy] = useState(false)
  const [diagnosticText, setDiagnosticText] = useState("")
  const [clipboardStatus, setClipboardStatus] = useState("")
  const [message, setMessage] = useState(cached ? `已缓存 ${cached.ip}` : "首次使用请点“发现并绑定”")

  function applyState(r: GreeResult) {
    if (r.power != null) setPower(Boolean(r.power))
    setCurrentTemperature(r.currentTemperature ?? null)
    setTargetTemperatureValue(r.targetTemperature ?? null)
    if (r.temperatureUnit) setTemperatureUnit(r.temperatureUnit)
    if (r.temperatureMin != null) setTemperatureMin(r.temperatureMin)
    if (r.temperatureMax != null) setTemperatureMax(r.temperatureMax)
  }

  function tempText(value: number | null) {
    return value == null ? "--" : `${value}°${temperatureUnit}`
  }

  useEffect(() => {
    if (cached) {
      void refresh()
    }
  }, [])

  async function refresh() {
    if (busy) return
    setBusy(true)
    setMessage("正在读取空调状态…")
    try {
      const r = await getGreeState()
      applyState(r)
      setMessage(`${r.device?.ip ?? "设备"} · ${r.rebound ? "已重新绑定 · " : ""}状态已刷新`)
    } catch (e) {
      setMessage(`失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function changePower(value: boolean) {
    if (busy) return
    setBusy(true)
    const previous = power
    setPower(value)
    setMessage(value ? "正在开机…" : "正在关机…")
    try {
      const r = await setPowerState(value)
      applyState(r)
      setMessage(`${r.device?.ip ?? "设备"} · 空调已${r.power ? "开启" : "关闭"}`)
    } catch (e) {
      setPower(previous)
      setMessage(`失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  async function adjustTemperature(delta: number) {
    if (busy || targetTemperature == null) return
    const desired = Math.max(temperatureMin, Math.min(temperatureMax, targetTemperature + delta))
    if (desired === targetTemperature) return

    setBusy(true)
    setMessage(`正在设定 ${desired}°${temperatureUnit}…`)
    try {
      const r = await setTargetTemperature(desired)
      applyState(r)
      setMessage(`设定温度已调整为 ${r.targetTemperature ?? desired}°${r.temperatureUnit ?? temperatureUnit}`)
    } catch (e) {
      setMessage(`失败：${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return <NavigationStack>
    <List
      navigationTitle="格力空调"
      navigationBarTitleDisplayMode="inline"
    >
      <Section
        header={<Text>空调状态 · mid 11002</Text>}
        footer={<Text>{message}</Text>}
      >
        <Toggle
          title={power === null ? "空调" : (power ? "空调已开启" : "空调已关闭")}
          systemImage="air.conditioner.horizontal"
          value={power ?? false}
          onChanged={changePower}
          disabled={busy || power === null}
        />
        <VStack alignment="leading">
          <Text font="headline">室内温度 {tempText(currentTemperature)}</Text>
          <Text font="caption">读取 TemSen；mid 11002 按直接摄氏值解析，亦兼容 +40 编码</Text>
        </VStack>
        <Stepper
          onIncrement={() => { void adjustTemperature(1) }}
          onDecrement={() => { void adjustTemperature(-1) }}
        >
          <VStack alignment="leading">
            <Text font="headline">设定温度 {tempText(targetTemperature)}</Text>
            <Text font="caption">范围 {temperatureMin}–{temperatureMax}°{temperatureUnit}</Text>
          </VStack>
        </Stepper>
        <Button
          title={busy ? "处理中…" : "刷新状态"}
          systemImage="arrow.clockwise"
          disabled={busy}
          action={refresh}
        />
      </Section>

      <Section
        header={<Text>首次设置 / 网络变化</Text>}
        footer={<Text>扫描使用格力局域网 UDP 7000；绑定成功后会缓存设备 MAC、IP 和 key。DHCP 地址变化时脚本会自动重新扫描一次。</Text>}
      >
        <Button
          title="发现并绑定"
          systemImage="wifi"
          disabled={busy}
          action={async () => {
            setBusy(true)
            setMessage("正在扫描 mid 11002…")
            try {
              const r = await discoverGree()
              applyState(r)
              setMessage(`绑定成功：${r.device?.name ?? "Gree AC"} · ${r.device?.ip ?? ""}`)
            } catch (e) {
              setMessage(`失败：${String(e)}`)
            } finally {
              setBusy(false)
            }
          }}
        />
        <Button
          title="运行温度诊断"
          systemImage="stethoscope"
          disabled={busy}
          action={async () => {
            setBusy(true)
            setDiagnosticText("")
            setClipboardStatus("")
            setMessage("正在逐组探测温度状态字段…")
            try {
              const r = await debugGreeTemperature()
              const text = JSON.stringify(r.debug ?? {}, null, 2)
              setDiagnosticText(text)
              console.log("__GREE_DIAGNOSTIC__" + text)

              try {
                await Pasteboard.setString(text)
                const verify = await Pasteboard.getString()
                const copied = verify === text
                setClipboardStatus(copied
                  ? `剪贴板校验成功：${verify?.length ?? 0} 字符`
                  : `剪贴板校验失败：生成 ${text.length} 字符，回读 ${verify?.length ?? 0} 字符`)
                setMessage(copied
                  ? `诊断完成：生成 ${text.length} 字符，已复制并校验`
                  : `诊断完成：生成 ${text.length} 字符；剪贴板未通过回读校验，请直接查看下方结果`)
              } catch (copyError) {
                setClipboardStatus(`剪贴板异常：${String(copyError)}`)
                setMessage(`诊断完成：生成 ${text.length} 字符；复制失败，请直接查看下方结果`)
              }
            } catch (e) {
              const errorText = `诊断失败：${String(e)}`
              setDiagnosticText(errorText)
              setClipboardStatus("没有生成可复制的诊断 JSON")
              setMessage(errorText)
            } finally {
              setBusy(false)
            }
          }}
        />
        <Button
          title="清除绑定缓存"
          role="destructive"
          disabled={busy}
          action={() => {
            clearCachedDevice()
            setPower(null)
            setCurrentTemperature(null)
            setTargetTemperatureValue(null)
            setMessage("缓存已清除，请重新发现并绑定")
          }}
        />
      </Section>

      {diagnosticText ? <Section
        header={<Text>诊断结果 · {diagnosticText.length} 字符</Text>}
        footer={<Text>{clipboardStatus || "诊断结果已直接显示在页面，无需依赖剪贴板"}</Text>}
      >
        <VStack alignment="leading">
          <Text font="caption">{diagnosticText}</Text>
        </VStack>
        <Button
          title="重新复制并校验"
          systemImage="doc.on.doc"
          action={async () => {
            try {
              await Pasteboard.setString(diagnosticText)
              const verify = await Pasteboard.getString()
              if (verify === diagnosticText) {
                setClipboardStatus(`剪贴板校验成功：${verify?.length ?? 0} 字符`)
              } else {
                setClipboardStatus(`剪贴板校验失败：生成 ${diagnosticText.length} 字符，回读 ${verify?.length ?? 0} 字符`)
              }
            } catch (e) {
              setClipboardStatus(`剪贴板异常：${String(e)}`)
            }
          }}
        />
      </Section> : null}

      <Section footer={<Text>v1.1.4：诊断结果直接显示在页面；复制后立即从剪贴板回读校验，并显示生成/回读字符数，不再吞掉剪贴板错误。</Text>}>
        <VStack alignment="leading">
          <Text font="headline">使用方式</Text>
          <Text font="caption">点“刷新状态”读取实时温度；使用设定温度右侧 − / + 调整。</Text>
        </VStack>
      </Section>
    </List>
  </NavigationStack>
}

async function run() {
  await Navigation.present({ element: <App /> })
  Script.exit()
}

run()
