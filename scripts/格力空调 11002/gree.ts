import { Script } from "scripting"

export type GreeDevice = {
  ip: string
  port: number
  mac: string
  mid: string
  name?: string
  ver?: string
  key: string
}

export type GreeResult = {
  ok: boolean
  power?: boolean | null
  currentTemperature?: number | null
  targetTemperature?: number | null
  temperatureUnit?: "C" | "F"
  temperatureMin?: number
  temperatureMax?: number
  device?: GreeDevice | null
  rebound?: boolean
  message?: string
  error?: string
  debug?: unknown
}

const STORAGE_KEY = "gree_11002_device_v1"
const PYTHON_ENTRY = `
import os, sys
sys.path.insert(0, os.getcwd())
from gree_runtime import main
main()
`
const RESULT_PREFIX = "__GREE_JSON__"

function parseResult(output: string): GreeResult {
  const lines = output.split(/\r?\n/).reverse()
  const line = lines.find((x) => x.startsWith(RESULT_PREFIX))
  if (!line) {
    throw new Error(output.trim() || "Python 运行没有返回结果")
  }
  return JSON.parse(line.slice(RESULT_PREFIX.length)) as GreeResult
}

export function getCachedDevice(): GreeDevice | null {
  return Storage.get<GreeDevice>(STORAGE_KEY)
}

export function clearCachedDevice() {
  Storage.remove(STORAGE_KEY)
}

type Action = "status" | "setPower" | "setTemperature" | "discover" | "reset" | "debugStatus"

async function callPython(
  action: Action,
  value?: boolean | number,
): Promise<GreeResult> {
  const cached = getCachedDevice()
  const r = await Python.run(PYTHON_ENTRY, {
    cwd: Script.directory,
    queryParameters: {
      action,
      mid: "11002",
      value: value == null ? "" : String(value),
      config: JSON.stringify(cached ?? {}),
    },
  })

  if (r.exitCode !== 0) {
    throw new Error(r.output.trim() || `Python 退出码 ${r.exitCode}`)
  }

  const result = parseResult(r.output)
  if (result.ok && result.device) {
    Storage.set(STORAGE_KEY, result.device)
  }
  if (action === "reset") {
    clearCachedDevice()
  }
  if (!result.ok) {
    throw new Error(result.error || "格力空调操作失败")
  }
  return result
}

export async function discoverGree() {
  return callPython("discover")
}

export async function getPowerState() {
  return callPython("status")
}

export async function getGreeState() {
  return callPython("status")
}

export async function setPowerState(value: boolean) {
  return callPython("setPower", value)
}

export async function setTargetTemperature(value: number) {
  return callPython("setTemperature", value)
}

export async function debugGreeTemperature() {
  return callPython("debugStatus")
}
