import { Navigation, TabView, Tab, Script, Text, useState, useEffect, useRef, AppEvents } from "scripting"
import { LatestPage, SearchPage } from "./catalog"
import { SettingsPage } from "./settings"
import { profile, readSession } from "./api"

function Root() {
  const dismiss = Navigation.useDismiss()
  const [selected, setSelected] = useState(0)
  const lastCheck = useRef(0)
  const checking = useRef(false)
  function checkSession() {
    if (!readSession() || checking.current || Date.now() - lastCheck.current < 10 * 60 * 1000) return
    checking.current = true
    lastCheck.current = Date.now()
    void profile().then(() => {
      try { Storage.set("zlibrary-last-session-verified", Date.now()) } catch {}
    }).catch(() => {
      // Network failure is not proof that credentials are invalid.
    }).finally(() => { checking.current = false })
  }
  useEffect(() => {
    const listener = (phase: string) => { if (phase === "active") checkSession() }
    AppEvents.scenePhase.addListener(listener)
    checkSession()
    return () => AppEvents.scenePhase.removeListener(listener)
  }, [])
  function onTabIndexChanged(next: number) {
    checkSession()
    if (next === 3) {
      // Dismiss the modal first; main() then terminates the script instance.
      dismiss()
      return
    }
    setSelected(next)
  }
  return <TabView tabIndex={selected} onTabIndexChanged={onTabIndexChanged}>
    <Tab title="最新" systemImage="clock" value={0}><LatestPage /></Tab>
    <Tab title="搜索" systemImage="magnifyingglass" value={1}><SearchPage /></Tab>
    <Tab title="设置" systemImage="gearshape" value={2}><SettingsPage /></Tab>
    <Tab title="退出" systemImage="rectangle.portrait.and.arrow.right" value={3}><Text>正在退出…</Text></Tab>
  </TabView>
}

async function main() {
  try {
    await Navigation.present({ element: <Root />, modalPresentationStyle: "fullScreen" })
  } finally {
    Script.exit()
  }
}
main().catch(e => console.error("Z-Library: " + String(e)))
