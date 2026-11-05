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
  return <NavigationStack><ScrollView><VStack spacing={12} padding={16}>
    <Text font="title2">12306 余票查询</Text>
    <Text font="caption" foregroundStyle="secondaryLabel">直达查询、指定中转站换乘及经停站；以 12306 实际数据为准</Text>
    <HStack spacing={8}>
      <VStack><Text>出发站</Text><TextField title="出发站" value={from} onChanged={setFrom}/></VStack>
      <VStack><Text>到达站</Text><TextField title="到达站" value={to} onChanged={setTo}/></VStack>
    </HStack>
    <Text>出发日期（YYYY-MM-DD）</Text>
    <TextField title="日期" value={date} onChanged={setDate}/>
    <Button title={busy ? "查询中…" : "查询直达余票"} disabled={busy} action={() => void query(false)} buttonStyle="borderedProminent"/>
    <Text>中转站（可选，指定中转）</Text>
    <TextField title="中转站" value={via} onChanged={setVia}/>
    <Button title="查询中转方案" disabled={busy} action={() => void query(true)} />
    {error ? <Text foregroundStyle="red">{error}</Text> : null}
    <HStack spacing={8}>
      {["全部","高铁/城际","动车","普速"].map(v => <Button key={v} title={(type===v ? "✓ " : "")+v} action={() => setType(v)}/>)}
    </HStack>
    <Text font="caption">{busy ? "正在请求 12306…" : "直达 "+visible.length+" 趟 · 中转 "+connections.length+" 组"}</Text>
    {visible.map(t => <VStack key={t.code} alignment="leading" spacing={5}>
      <HStack><Text font="headline">{t.code}</Text><Spacer/><Text>{t.duration}</Text></HStack>
      <Text>{t.from+" "+t.depart+" → "+t.to+" "+t.arrive}</Text>
      <Text font="caption">{t.seats.map(s => s.name+" "+s.count).join(" · ")}</Text>
      <Button title={selectedTrain===t.code ? "收起经停站" : "查看经停站"} disabled={busy} action={() => void showStops(t)}/>
      {selectedTrain===t.code ? stops.map((s,i) => <Text key={i} font="caption">{s.station+" 到 "+s.arrive+" 发 "+s.depart+" 停 "+s.stay}</Text>) : null}
      <Divider/>
    </VStack>)}
    {connections.map((c,i) => <VStack key={i} alignment="leading" spacing={5}>
      <Text font="headline">{c.first.code+" → "+c.second.code}</Text>
      <Text>{c.first.from+" "+c.first.depart+" → "+c.first.to+" "+c.first.arrive}</Text>
      <Text>{c.second.from+" "+c.second.depart+" → "+c.second.to+" "+c.second.arrive}</Text>
      <Text font="caption">{"换乘约 "+c.waitMinutes+" 分钟（按当日时刻估算）"}</Text>
      <Divider/>
    </VStack>)}
    <Text font="caption" foregroundStyle="secondaryLabel">票价、折扣及后台定时提醒暂未接入；跨日中转尚未支持。仅展示可验证的余票数据。</Text>
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
