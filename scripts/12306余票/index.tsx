import { Navigation, NavigationStack, TabView, Tab, ScrollView, VStack, HStack, Text, TextField, Button, Spacer, Divider, Script, useState } from "scripting"
import { searchTickets, trainStops, combineTransfers, Train, Stop, Connection } from "./api"

function todayChina(): string { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10) }
function Home() {
  const [from, setFrom] = useState("广州南")
  const [to, setTo] = useState("深圳北")
  const [via, setVia] = useState("广州东")
  const [date, setDate] = useState(todayChina())
  const [trains, setTrains] = useState<Train[]>([])
  const [connections, setConnections] = useState<Connection[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [selectedTrain, setSelectedTrain] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [type, setType] = useState("全部")
  async function query(transfer: boolean) {
    if (busy) return
    setBusy(true); setError(""); setTrains([]); setConnections([]); setStops([]); setSelectedTrain("")
    try {
      if (transfer) {
        if (!via.trim() || via.trim() === from.trim() || via.trim() === to.trim()) throw new Error("请输入不同于出发站和到达站的中转站")
        const first = await searchTickets(date, from, via)
        const second = await searchTickets(date, via, to)
        setConnections(combineTransfers(first, second))
      } else setTrains(await searchTickets(date, from, to))
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  async function showStops(t: Train) {
    if (busy) return
    if (selectedTrain === t.code) { setSelectedTrain(""); return }
    setBusy(true); setError(""); setStops([]); setSelectedTrain(t.code)
    try { setStops(await trainStops(t, date)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const visible = trains.filter(t => type === "全部" || (type === "高铁/城际" ? /^[GC]/.test(t.code) : type === "动车" ? /^D/.test(t.code) : !/^[GCD]/.test(t.code)))
  return <NavigationStack><ScrollView><VStack spacing={16} padding={16} background="rgba(246,248,250,1)">
    <VStack spacing={12} padding={20} background="rgba(24,11,113,1)" clipShape={{type:"rect",cornerRadius:22}}>
      <Text font="caption" foregroundStyle="rgba(199,195,245,1)">CHINA RAILWAY · 12306</Text>
      <Text font="title2" fontWeight="bold" foregroundStyle="white">车次与余票</Text>
      <Text font="caption" foregroundStyle="rgba(225,223,255,1)">查时刻 · 看余票 · 找换乘</Text>
      <VStack spacing={10} padding={14} background="rgba(47,33,136,1)" clipShape={{type:"rect",cornerRadius:14}}>
        <HStack spacing={12}>
          <VStack alignment="leading" spacing={4}>
            <Text font="caption" foregroundStyle="rgba(199,195,245,1)">出发 FROM</Text>
            <TextField title="出发站" value={from} onChanged={setFrom}/>
          </VStack>
          <Button title="⇄" action={() => { const old=from; setFrom(to); setTo(old) }}/>
          <VStack alignment="leading" spacing={4}>
            <Text font="caption" foregroundStyle="rgba(199,195,245,1)">到达 TO</Text>
            <TextField title="到达站" value={to} onChanged={setTo}/>
          </VStack>
        </HStack>
      </VStack>
      <Text font="caption" foregroundStyle="rgba(225,223,255,1)">出发日期 · YYYY-MM-DD</Text>
      <TextField title="日期" value={date} onChanged={setDate}/>
      <Button title={busy ? "查询中…" : "查询直达车次 →"} disabled={busy} action={() => void query(false)} buttonStyle="borderedProminent" tint="rgba(0,187,168,1)"/>
    </VStack>
    <VStack alignment="leading" spacing={10} padding={16} background="white" clipShape={{type:"rect",cornerRadius:18}}>
      <Text font="headline" fontWeight="semibold">指定中转</Text>
      <Text font="caption" foregroundStyle="secondaryLabel">选择途经车站，组合可衔接的车次</Text>
      <TextField title="中转站" value={via} onChanged={setVia}/>
      <Button title="查询中转方案 →" disabled={busy} action={() => void query(true)} />
    </VStack>
    {error ? <VStack padding={14} background="rgba(255,237,237,1)" clipShape={{type:"rect",cornerRadius:12}}><Text foregroundStyle="red">{error}</Text></VStack> : null}
    <VStack alignment="leading" spacing={12} padding={16} background="white" clipShape={{type:"rect",cornerRadius:18}}>
      <HStack><Text font="headline" fontWeight="bold">查询结果</Text><Spacer/><Text font="caption" foregroundStyle="secondaryLabel">{busy ? "正在查询…" : "直达 "+visible.length+" 趟 · 中转 "+connections.length+" 组"}</Text></HStack>
      <HStack spacing={4}>
        {["全部","高铁/城际","动车","普速"].map(v => <Button key={v} title={(type===v ? "✓ " : "")+v} action={() => setType(v)} buttonStyle={type===v ? "borderedProminent" : "bordered"}/>)}
      </HStack>
      {visible.map(t => <VStack key={t.code} alignment="leading" spacing={10} padding={12} background="rgba(247,249,252,1)" clipShape={{type:"rect",cornerRadius:12}}>
        <HStack><Text font="headline" fontWeight="bold">{t.code}</Text><Spacer/><Text font="caption" foregroundStyle="secondaryLabel">{t.duration}</Text></HStack>
        <HStack spacing={8}><Text font="title3" fontWeight="bold">{t.depart}</Text><Text foregroundStyle="secondaryLabel">→</Text><Text font="title3" fontWeight="bold">{t.arrive}</Text></HStack>
        <Text font="caption" foregroundStyle="secondaryLabel">{t.from+" → "+t.to}</Text>
        <Divider/>
        <Text font="caption">{t.seats.map(s => s.name+" "+s.count).join(" · ")}</Text>
        <Button title={selectedTrain===t.code ? "收起经停站 ↑" : "查看经停站 ›"} disabled={busy} action={() => void showStops(t)}/>
        {selectedTrain===t.code ? stops.map((s,i) => <Text key={i} font="caption">{s.station+"  到 "+s.arrive+"  发 "+s.depart+"  停 "+s.stay}</Text>) : null}
      </VStack>)}
      {connections.map((c,i) => <VStack key={i} alignment="leading" spacing={8} padding={12} background="rgba(247,249,252,1)" clipShape={{type:"rect",cornerRadius:12}}>
        <Text font="headline" fontWeight="bold">{c.first.code+" → "+c.second.code}</Text>
        <Text>{c.first.from+"  "+c.first.depart+" → "+c.first.to+"  "+c.first.arrive}</Text>
        <Divider/>
        <Text>{c.second.from+"  "+c.second.depart+" → "+c.second.to+"  "+c.second.arrive}</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">{"换乘约 "+c.waitMinutes+" 分钟 · 当日时刻估算"}</Text>
      </VStack>)}
      {!busy && !error && !visible.length && !connections.length ? <Text font="caption" foregroundStyle="secondaryLabel">选择出发站、目的地与日期，开始查询</Text> : null}
    </VStack>
    <Text font="caption" foregroundStyle="secondaryLabel">票价与实时站台暂未接入；跨日中转暂不支持。数据以 12306 为准。</Text>
  </VStack></ScrollView></NavigationStack>
}
function Root() {
  const dismiss = Navigation.useDismiss()
  const [tab, setTab] = useState(0)
  return <TabView tabIndex={tab} onTabIndexChanged={next => {
    if (next === 1) { dismiss(); return }
    setTab(next)
  }}>
    <Tab title="首页" systemImage="house.fill" value={0}><Home/></Tab>
    <Tab title="退出" systemImage="xmark.circle.fill" value={1}><Text>正在退出…</Text></Tab>
  </TabView>
}
async function main() { try { await Navigation.present({element:<Root/>,modalPresentationStyle:"fullScreen"}) } finally { Script.exit() } }
main().catch(e => console.error("12306: "+String(e)))
