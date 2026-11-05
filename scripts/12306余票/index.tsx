import { Navigation, NavigationStack, TabView, Tab, ScrollView, VStack, HStack, Text, TextField, Button, Spacer, Divider, Script, useState } from "scripting"
import { searchTickets, trainStops, combineTransfers, Train, Stop, Connection } from "./api"

const PURPLE = "rgba(78,54,218,1)"
const DARK = "rgba(39,23,137,1)"
const LIGHT = "rgba(245,245,252,1)"
const INK = "rgba(23,28,51,1)"
const MUTED = "rgba(103,109,135,1)"
const GREEN = "rgba(30,160,112,1)"
type Screen = "home" | "results" | "stops" | "transfer"
function todayChina(): string { return new Date(Date.now()+8*3600000).toISOString().slice(0,10) }
function dateLabel(d:string):string { const t=new Date(d+"T12:00:00+08:00"); return Number.isFinite(t.getTime()) ? d.slice(5)+" 周"+"日一二三四五六"[t.getUTCDay()] : d }
function shiftDate(d:string,days:number):string { const t=new Date(d+"T12:00:00+08:00"); return Number.isFinite(t.getTime()) ? new Date(t.getTime()+days*86400000).toISOString().slice(0,10) : d }
function Seat({name,count}:{name:string,count:string}) {
  const available = count !== "--" && count !== "无" && count !== "0"
  return <HStack spacing={4}><Text font="caption" foregroundStyle={INK}>{name}</Text><Text font="caption" fontWeight="semibold" foregroundStyle={available ? GREEN : MUTED}>{count === "--" ? "—" : available && !/^\d+$/.test(count) ? "有" : count}</Text></HStack>
}
function Header({title,subtitle,back}:{title:string,subtitle?:string,back?:()=>void}) {
  return <VStack spacing={12} padding={{horizontal:18,top:22,bottom:20}} background={DARK}>
    <HStack spacing={12}>
      {back ? <Button title="❮" action={back} tint="white" /> : <Text font="title2" foregroundStyle="white">▣</Text>}
      <Spacer/><Text font="title3" fontWeight="bold" foregroundStyle="white">{title}</Text><Spacer/>
      {back ? <Text foregroundStyle={DARK}>❮</Text> : <Text foregroundStyle="white">ⓘ</Text>}
    </HStack>
    {subtitle ? <Text font="subheadline" foregroundStyle="rgba(222,218,255,1)" multilineTextAlignment="center">{subtitle}</Text> : null}
  </VStack>
}
function Panel({children}:{children:any}) {
  return <VStack spacing={12} padding={14} background="white" clipShape={{type:"rect",cornerRadius:16}}>{children}</VStack>
}
function Field({title,value,change}:{title:string,value:string,change:(s:string)=>void}) {
  return <VStack alignment="leading" spacing={5}>
    <Text font="caption" foregroundStyle={MUTED}>{title}</Text>
    <TextField title={title} value={value} onChanged={change} foregroundStyle={INK} background={LIGHT} padding={8} clipShape={{type:"rect",cornerRadius:10}}/>
  </VStack>
}
function MainButton({title,action,disabled}:{title:string,action:()=>void,disabled?:boolean}) {
  return <Button title={title} action={action} disabled={disabled} buttonStyle="borderedProminent" tint={PURPLE} controlSize="large"/>
}
function Filters({type,setType}:{type:string,setType:(v:string)=>void}) {
  return <ScrollView axes="horizontal"><HStack spacing={7}>
    {["全部","高铁","城际","动车","普速"].map(v=><Button key={v} title={v} action={()=>setType(v)} buttonStyle={type===v?"borderedProminent":"bordered"} tint={PURPLE}/>)}
  </HStack></ScrollView>
}
function matches(t:Train,type:string):boolean {
  return type==="全部" || (type==="高铁" && /^G/.test(t.code)) || (type==="城际" && /^C/.test(t.code)) || (type==="动车" && /^D/.test(t.code)) || (type==="普速" && !/^[GCD]/.test(t.code))
}
function TrainCard({train,onPress}:{train:Train,onPress:()=>void}) {
  const seats=train.seats.filter(s=>["二等座","一等座","商务座"].includes(s.name))
  return <VStack spacing={12} padding={14} background="white" clipShape={{type:"rect",cornerRadius:15}}>
    <HStack spacing={8}>
      <Button title={train.code} action={onPress} tint={PURPLE}/>
      <Spacer/>
      <VStack spacing={3}><Text font="headline" fontWeight="bold" foregroundStyle={INK}>{train.depart}</Text><Text font="caption" foregroundStyle={MUTED}>{train.from}</Text></VStack>
      <Text foregroundStyle="rgba(164,169,188,1)">→</Text>
      <VStack spacing={3}><Text font="headline" fontWeight="bold" foregroundStyle={INK}>{train.arrive}</Text><Text font="caption" foregroundStyle={MUTED}>{train.to}</Text></VStack>
      <Spacer/>
      <Text font="caption" foregroundStyle={MUTED}>{train.duration}</Text>
      <Button title="›" action={onPress} tint={PURPLE}/>
    </HStack>
    <Divider/>
    <HStack><Spacer/>{seats.map(s=><Seat key={s.name} name={s.name.replace("座","等")} count={s.count}/>)}<Spacer/></HStack>
  </VStack>
}
function App() {
  const [screen,setScreen]=useState<Screen>("home")
  const [from,setFrom]=useState("广州南")
  const [to,setTo]=useState("深圳北")
  const [via,setVia]=useState("深圳北")
  const [date,setDate]=useState(todayChina())
  const [type,setType]=useState("全部")
  const [trains,setTrains]=useState<Train[]>([])
  const [connections,setConnections]=useState<Connection[]>([])
  const [stops,setStops]=useState<Stop[]>([])
  const [selected,setSelected]=useState<Train|null>(null)
  const [trainCode,setTrainCode]=useState("G6523")
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState("")
  const [queried,setQueried]=useState(false)
  const [stopsQueried,setStopsQueried]=useState(false)
  const [transferQueried,setTransferQueried]=useState(false)
  async function loadTickets(d=date) {
    if(busy)return
    setBusy(true);setError("");setQueried(false);setTrains([]);setScreen("results")
    try {setTrains(await searchTickets(d,from,to));setQueried(true)}
    catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  async function loadStops(train?:Train) {
    if(busy)return
    const t=train||trains.find(t=>t.code.trim().toUpperCase()===trainCode.trim().toUpperCase())
    setScreen("stops");setError("");setStops([])
    if(!t){setError("请先查询对应日期的车次，再选择该车次查看经停站");return}
    setSelected(t);setTrainCode(t.code);setBusy(true);setStopsQueried(false)
    try {setStops(await trainStops(t,date));setStopsQueried(true)}
    catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  async function loadTransfers() {
    if(busy)return
    setScreen("transfer");setError("");setConnections([]);setTransferQueried(false)
    if(!via.trim()||via.trim()===from.trim()||via.trim()===to.trim()){setError("中转站不能与出发站或到达站相同");return}
    setBusy(true)
    try {const first=await searchTickets(date,from,via);const second=await searchTickets(date,via,to);setConnections(combineTransfers(first,second));setTransferQueried(true)}
    catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setBusy(false)}
  }
  const filtered=trains.filter(t=>matches(t,type))
  const errorView=error?<VStack padding={12} background="rgba(255,238,241,1)" clipShape={{type:"rect",cornerRadius:10}}><Text foregroundStyle="red">{error}</Text></VStack>:null
  return <NavigationStack><VStack spacing={0} background={LIGHT}>
    {screen==="home" ? <>
      <Header title="12306 余票查询" subtitle="实时余票 · 经停信息 · 中转换乘"/>
      <ScrollView><VStack spacing={12} padding={14}>
        <Panel>
          <HStack spacing={6}>
            <VStack spacing={4}><Field title="出发站" value={from} change={setFrom}/></VStack>
            <Button title="⇄" action={()=>{const old=from;setFrom(to);setTo(old)}} tint={PURPLE}/>
            <VStack spacing={4}><Field title="到达站" value={to} change={setTo}/></VStack>
          </HStack>
          <Divider/>
          <HStack><Text foregroundStyle={MUTED}>▣ 出发日期</Text><Spacer/><TextField title="YYYY-MM-DD" value={date} onChanged={setDate}/></HStack>
        </Panel>
        <Panel><Filters type={type} setType={setType}/></Panel>
        <MainButton title="查询余票" action={()=>void loadTickets()} disabled={busy}/>
        <Panel>
          <Button title="▣  经停站查询                       ›" action={()=>{setError("");setScreen("stops")}} tint={DARK}/>
          <Text font="caption" foregroundStyle={MUTED}>输入车次，查看途经站和时刻</Text>
          <Divider/>
          <Button title="⌘  中转换乘                           ›" action={()=>{setError("");setScreen("transfer")}} tint={DARK}/>
          <Text font="caption" foregroundStyle={MUTED}>查询指定中转站的换乘方案</Text>
        </Panel>
      </VStack></ScrollView>
    </> : null}
    {screen==="results" ? <>
      <Header title="列车余票" subtitle={from+" → "+to+" · "+date} back={()=>setScreen("home")}/>
      <ScrollView><VStack spacing={12} padding={12}>
        <Panel><HStack>
          <Button title="‹ 前一天" action={()=>{const d=shiftDate(date,-1);setDate(d);void loadTickets(d)}} disabled={busy} tint={PURPLE}/>
          <Spacer/><Text foregroundStyle={INK}>{dateLabel(date)}</Text><Spacer/>
          <Button title="后一天 ›" action={()=>{const d=shiftDate(date,1);setDate(d);void loadTickets(d)}} disabled={busy} tint={PURPLE}/>
        </HStack></Panel>
        <Filters type={type} setType={setType}/>
        {errorView}
        {busy?<Text foregroundStyle={MUTED}>正在查询实时余票…</Text>:null}
        {filtered.map(t=><TrainCard key={t.code} train={t} onPress={()=>void loadStops(t)}/>)}
        {!busy&&!error&&queried&&!filtered.length?<Text foregroundStyle={MUTED}>该日期暂无符合筛选条件的车次</Text>:null}
      </VStack></ScrollView>
    </> : null}
    {screen==="stops" ? <>
      <Header title="经停站查询" back={()=>setScreen("home")}/>
      <ScrollView><VStack spacing={14} padding={14}>
        <Panel><HStack><Text foregroundStyle={MUTED}>▣ 车次</Text><Spacer/><TextField title="如 G6523" value={trainCode} onChanged={setTrainCode}/></HStack></Panel>
        <MainButton title={busy?"查询中…":"查询经停站"} disabled={busy} action={()=>void loadStops()}/>
        {errorView}
        {selected&&stops.length?<Panel>
          <HStack><Text font="title2" fontWeight="bold" foregroundStyle={PURPLE}>{selected.code}</Text><Spacer/><Text foregroundStyle={INK}>{selected.from+" → "+selected.to}</Text></HStack>
          <Text font="caption" foregroundStyle={MUTED}>{"运行时长："+selected.duration}</Text>
          <Divider/>
          {stops.map((s,i)=><HStack key={i} spacing={10}>
            <Text foregroundStyle={i===0?GREEN:i===stops.length-1?PURPLE:"rgba(188,192,208,1)"}>{i===0?"●":i===stops.length-1?"◉":"○"}</Text>
            <Text fontWeight={i===0||i===stops.length-1?"bold":"regular"} foregroundStyle={INK}>{s.station}</Text>
            <Spacer/>
            <Text font="caption" foregroundStyle={MUTED}>{s.arrive+"  "+s.depart}</Text>
          </HStack>)}
        </Panel>:null}
        {stopsQueried&&!stops.length?<Text foregroundStyle={MUTED}>该车次没有返回经停站数据</Text>:null}
      </VStack></ScrollView>
    </> : null}
    {screen==="transfer" ? <>
      <Header title="中转换乘" back={()=>setScreen("home")}/>
      <ScrollView><VStack spacing={12} padding={14}>
        <Panel>
          <HStack spacing={6}><Field title="出发站" value={from} change={setFrom}/><Button title="⇄" action={()=>{const old=from;setFrom(to);setTo(old)}} tint={PURPLE}/><Field title="到达站" value={to} change={setTo}/></HStack>
          <Field title="中转站" value={via} change={setVia}/>
          <HStack><Text foregroundStyle={MUTED}>▣ 出发日期</Text><Spacer/><TextField title="YYYY-MM-DD" value={date} onChanged={setDate}/></HStack>
        </Panel>
        <MainButton title={busy?"查询中…":"查询换乘方案"} action={()=>void loadTransfers()} disabled={busy}/>
        {errorView}
        {connections.map((c,i)=><Panel key={i}>
          <HStack><Text foregroundStyle={PURPLE} fontWeight="bold">{"方案 "+(i+1)}</Text><Spacer/><Text font="caption" foregroundStyle={MUTED}>{"换乘 "+c.waitMinutes+" 分钟"}</Text></HStack>
          <HStack><Text foregroundStyle={PURPLE}>▣</Text><VStack alignment="leading"><Text fontWeight="bold">{c.first.code+"   "+c.first.from+" → "+c.first.to}</Text><Text font="caption">{c.first.depart+" – "+c.first.arrive+"  ·  "+c.first.duration}</Text></VStack><Spacer/><Button title="›" action={()=>void loadStops(c.first)}/></HStack>
          <Text font="caption" foregroundStyle={MUTED}>{via+" · 换乘 "+c.waitMinutes+" 分钟"}</Text>
          <HStack><Text foregroundStyle={PURPLE}>▣</Text><VStack alignment="leading"><Text fontWeight="bold">{c.second.code+"   "+c.second.from+" → "+c.second.to}</Text><Text font="caption">{c.second.depart+" – "+c.second.arrive+"  ·  "+c.second.duration}</Text></VStack><Spacer/><Button title="›" action={()=>void loadStops(c.second)}/></HStack>
        </Panel>)}
        {transferQueried&&!connections.length?<Text foregroundStyle={MUTED}>未找到符合换乘时间条件的当日方案</Text>:null}
        <Text font="caption" foregroundStyle={MUTED}>仅提供当日时刻估算，不保证实际换乘可行；跨日换乘暂不支持。</Text>
      </VStack></ScrollView>
    </> : null}
  </VStack></NavigationStack>
}
function Root() {
  const dismiss=Navigation.useDismiss()
  const [tab,setTab]=useState(0)
  return <TabView tabIndex={tab} onTabIndexChanged={next=>{if(next===1){dismiss();return}setTab(next)}}>
    <Tab title="首页" systemImage="house.fill" value={0}><App/></Tab>
    <Tab title="退出" systemImage="power" value={1}><Text>正在退出…</Text></Tab>
  </TabView>
}
async function main(){try{await Navigation.present({element:<Root/>,modalPresentationStyle:"fullScreen"})}finally{Script.exit()}}
main().catch(e=>console.error("12306: "+String(e)))
