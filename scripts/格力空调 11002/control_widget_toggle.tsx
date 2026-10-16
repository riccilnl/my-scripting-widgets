import { ControlWidget, ControlWidgetToggle } from "scripting"
import { GreePowerIntent } from "./app_intents"
import { getPowerState } from "./gree"

async function run() {
  let on = false
  try {
    const r = await getPowerState()
    on = Boolean(r.power)
  } catch (_) {
    // Keep the control available even if the AC is temporarily unreachable.
  }

  ControlWidget.present(
    <ControlWidgetToggle
      intent={GreePowerIntent({ value: !on })}
      label={{
        title: "格力空调",
        systemImage: "air.conditioner.horizontal",
      }}
      activeValueLabel={{ title: "已开", systemImage: "power" }}
      inactiveValueLabel={{ title: "已关", systemImage: "power" }}
    />
  )
}

run()
