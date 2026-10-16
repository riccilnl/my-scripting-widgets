export type N10State = {
  PowerSwitchAll?: number
  WorkState?: number
  RunState?: number
  WorkMode?: number
  SetAppointmentTime?: number
  SetWorkTime?: number
  ClRemTime?: number
  StRemTime?: number
  AddFunH?: number
  AddFunL?: number
  DefAddFunH?: number
  DefAddFunL?: number
  StoreTotalTime?: number
  DefStoreTime?: number
  NewRemoteAuth?: number
  [key: string]: unknown
}

export type Program = {
  value: number
  name: string
}

export const N10_PRODUCT_ID = "102FA"
export const N10_PRODUCT_TYPE = "JBCD6E-03-N10"

export const PROGRAMS: Program[] = [
  { value: 0, name: "日常洗" },
  { value: 1, name: "超快洗" },
  { value: 2, name: "超净洗" },
  { value: 3, name: "晶亮洗" },
  { value: 4, name: "蒸汽清洁" },
  { value: 5, name: "节能洗" },
  { value: 6, name: "智能洗" },
  { value: 128, name: "预冲洗" },
  { value: 129, name: "母婴洗" },
  { value: 130, name: "静音洗" },
  { value: 131, name: "煲仔锅" },
  { value: 132, name: "独立消杀" },
  { value: 133, name: "独立烘干" },
  { value: 135, name: "谷电洗" },
  { value: 136, name: "餐前暖碟" },
]

export type ExtraOptions = {
  enhanceDrying: boolean
  enhancedRinsing: boolean
  upperQuickWash: boolean
  steamSterilization: boolean
  lowerQuickWash: boolean
}

export function programName(value: number | undefined): string {
  if (typeof value !== "number") return "未知"
  return PROGRAMS.find((item) => item.value === value)?.name ?? `模式 ${value}`
}

export function decodePackedTime(value: number | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return "--"
  const hours = (value >> 8) & 0xff
  const minutes = value & 0xff
  if (minutes > 59) return "--"
  if (hours <= 0) return `${minutes} 分钟`
  if (minutes <= 0) return `${hours} 小时`
  return `${hours} 小时 ${minutes} 分钟`
}

export function reportedStateName(state: N10State | null): string {
  if (!state) return "状态未知"
  if (state.PowerSwitchAll === 0 || state.WorkState === 0) return "已关机"
  switch (state.WorkState) {
    case 1:
      return "待机"
    case 2:
      return "运行中"
    case 3:
      return "已暂停"
    case 4:
      return "烘干中"
    case 5:
      return "存储中"
    case 6:
      return "预约中"
    default:
      return state.PowerSwitchAll === 1 ? "已开机" : "状态未知"
  }
}

export function buildExtraMasks(options: ExtraOptions): { AddFunH: number; AddFunL: number } {
  let AddFunH = 0
  let AddFunL = 0
  if (options.enhanceDrying) AddFunL |= 4
  if (options.enhancedRinsing) AddFunL |= 8
  if (options.upperQuickWash) AddFunL |= 16
  if (options.steamSterilization) AddFunH |= 4
  if (options.lowerQuickWash) AddFunH |= 128
  return { AddFunH, AddFunL }
}

export function buildStartPayload(mode: number, options: ExtraOptions): Record<string, number> {
  const masks = buildExtraMasks(options)
  return {
    WorkMode: mode,
    WorkState: 1,
    AddFunH: masks.AddFunH,
    AddFunL: masks.AddFunL,
    StoreTotalTime: 0,
    PowerSwitchAll: 1,
  }
}

export function mergeDeviceState(current: N10State | null, incoming: unknown): N10State | null {
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return current
  const obj = incoming as Record<string, unknown>
  const pairs = obj.propertyPairs
  if (pairs && typeof pairs === "object" && !Array.isArray(pairs)) {
    return { ...(current ?? {}), ...(pairs as Record<string, unknown>) }
  }
  return { ...(current ?? {}), ...obj }
}
