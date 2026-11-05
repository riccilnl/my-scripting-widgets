import { fetch } from "scripting"

export type Train = { code: string; from: string; to: string; depart: string; arrive: string; duration: string; seats: { name: string; count: string }[] }
const BASE = "https://kyfw.12306.cn"
const HEADERS = { "Accept": "application/json,text/html,*/*", "Referer": BASE + "/otn/leftTicket/init" }
let sessionCookie = ""
async function get(url: string, headers: Record<string,string> = {}): Promise<string> {
  const response = await fetch(url, { headers: { ...HEADERS, ...(sessionCookie && url.startsWith(BASE) ? { Cookie: sessionCookie } : {}), ...headers } })
  if (url.startsWith(BASE)) {
    const setCookie = response.headers.get("set-cookie")
    if (setCookie) {
      const pieces = setCookie.split(/,(?=\s*[^;,=]+\s*=)/).map(x => x.split(";")[0].trim()).filter(x => /^[^=]+=[^;]+$/.test(x))
      if (pieces.length) sessionCookie = pieces.join("; ")
    }
  }
  const text = await response.text()
  if (!response.ok) throw new Error("12306 HTTP " + response.status)
  if (!text.trim()) throw new Error("12306 返回空响应")
  return text
}
export function parseStations(text: string): Record<string,string> {
  const result: Record<string,string> = {}
  const items = text.split("@")
  for (const item of items) {
    const fields = item.split("|")
    if (fields.length >= 3 && /^[A-Z]{3}$/.test(fields[2])) result[fields[1]] = fields[2]
  }
  return result
}
export function parseTicketPath(html: string): string {
  const match = html.match(/(?:var\s+)?CLeftTicketUrl\s*=\s*['"]([^'"]+)['"]/)
  if (!match) throw new Error("无法发现 12306 余票查询接口")
  const path = match[1].replace(/^\/+/, "")
  if (!/^leftTicket\/query[A-Za-z0-9]*$/.test(path)) throw new Error("12306 查询路径不符合预期")
  return path
}
export function parseTickets(raw: unknown, stations: Record<string,string>): Train[] {
  const data = raw && typeof raw === "object" ? (raw as any).data : null
  if (!data || !Array.isArray(data.result)) throw new Error("12306 数据格式变化或被风控拦截")
  const map: Record<string,string> = data.map && typeof data.map === "object" ? data.map : {}
  const reverse: Record<string,string> = {}
  Object.keys(stations).forEach(name => { reverse[stations[name]] = name })
  const seatFields: [string,number][] = [["商务座",32],["一等座",31],["二等座",30],["软卧",23],["硬卧",28],["硬座",29],["无座",26]]
  return data.result.map((line: unknown) => {
    if (typeof line !== "string") return null
    const f = line.split("|")
    if (f.length < 33 || !f[3]) return null
    return {
      code: f[3], from: map[f[6]] || reverse[f[6]] || f[6],
      to: map[f[7]] || reverse[f[7]] || f[7],
      depart: f[8], arrive: f[9], duration: f[10],
      seats: seatFields.map(([name,index]) => ({name,count:f[index] || "--"}))
    } as Train
  }).filter((t: Train | null): t is Train => !!t)
}
function validateDate(date: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+"T00:00:00+08:00"))) throw new Error("日期格式应为 YYYY-MM-DD")
  const today = new Date(Date.now() + 8*3600000).toISOString().slice(0,10)
  if (date < today) throw new Error("出发日期不能早于今天")
}
export async function searchTickets(date: string, from: string, to: string): Promise<Train[]> {
  validateDate(date)
  const page = await get("https://www.12306.cn/index/")
  const match = page.match(/\/script\/core\/common\/station_name[^"'\s<>]*\.js/)
  if (!match) throw new Error("无法发现 12306 车站列表")
  const stations = parseStations(await get("https://www.12306.cn"+match[0]))
  const a = stations[from.trim()], b = stations[to.trim()]
  if (!a || !b) throw new Error("车站名称未匹配，请输入准确站名（如广州南、深圳北）")
  if (a === b) throw new Error("出发站与到达站不能相同")
  const init = await get(BASE + "/otn/leftTicket/init")
  const path = parseTicketPath(init)
  const params = "leftTicketDTO.train_date="+encodeURIComponent(date)+"&leftTicketDTO.from_station="+a+"&leftTicketDTO.to_station="+b+"&purpose_codes=ADULT"
  const response = await get(BASE+"/otn/"+path+"?"+params)
  if (/^\s*</.test(response)) throw new Error("12306 返回验证页面，请稍后重试")
  let payload: unknown
  try { payload = JSON.parse(response) } catch { throw new Error("12306 返回非 JSON 数据") }
  return parseTickets(payload, stations)
}
