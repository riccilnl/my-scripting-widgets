import { Navigation, NavigationStack, ScrollView, VStack, HStack, Text, TextField, Button, Spacer, Divider, Script, useState } from "scripting"
import { searchTickets, Train } from "./api"

function todayChina(): string { return new Date(Date.now() + 8 * 3600000).toISOString().slice(0,10) }
function Root() {
  const [from, setFrom] = useState("广州南")
  const [to, setTo] = useState("深圳北")
  const [date, setDate] = useState(todayChina())
  const [trains, setTrains] = useState<Train[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [type, setType] = useState("全部")
  async function run() {
    if (busy) return
    setBusy(true); setError(""); setTrains([])
    try { setTrains(await searchTickets(date,from,to)) }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
  const visible = trains.filter(t => type === "全部" || (type === "高铁/城际" ? /^[GC]/.test(t.code) : type === "动车" ? /^D/.test(t.code) : !/^[GCD]/.test(t.code)))
  return <NavigationStack><ScrollView><VStack spacing={12} padding={16}>
    <Text font="title2">12306 余票查询</Text>
    <Text font="caption" foregroundStyle="secondaryLabel">请输入具体车站名称；数据以 12306 实际响应为准</Text>
    <HStack spacing={8}>
      <VStack><Text>出发站</Text><TextField title="出发站" value={from} onChanged={setFrom} /></VStack>
      <VStack><Text>到达站</Text><TextField title="到达站" value={to} onChanged={setTo} /></VStack>
    </HStack>
    <Text>出发日期（YYYY-MM-DD）</Text>
    <TextField title="日期" value={date} onChanged={setDate} />
    <Button title={busy ? "查询中…" : "查询余票"} disabled={busy} action={() => void run()} buttonStyle="borderedProminent" />
    {error ? <Text foregroundStyle="red">{error}</Text> : null}
    <HStack spacing={8}>
      {["全部","高铁/城际","动车","普速"].map(v => <Button key={v} title={(type===v ? "✓ " : "")+v} action={() => setType(v)} />)}
    </HStack>
    <Text font="caption">{busy ? "正在请求 12306…" : "结果："+visible.length+" 趟"}</Text>
    {visible.map(t => <VStack key={t.code} alignment="leading" spacing={5}>
      <HStack><Text font="headline">{t.code}</Text><Spacer/><Text>{t.duration}</Text></HStack>
      <Text>{t.from+" "+t.depart+" → "+t.to+" "+t.arrive}</Text>
      <Text font="caption">{t.seats.map(s => s.name+" "+s.count).join(" · ")}</Text>
      <Divider />
    </VStack>)}
  </VStack></ScrollView></NavigationStack>
}
async function main() { try { await Navigation.present({element:<Root/>,modalPresentationStyle:"fullScreen"}) } finally { Script.exit() } }
main().catch(e => console.error("12306: "+String(e)))
