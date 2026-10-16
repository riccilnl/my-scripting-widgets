import {
  AppIntentManager,
  AppIntentProtocol,
  ControlWidget,
} from "scripting"
import { setPowerState } from "./gree"

export const GreePowerIntent = AppIntentManager.register({
  name: "Gree11002PowerIntent",
  protocol: AppIntentProtocol.AppIntent,
  perform: async ({ value }: { value: boolean }) => {
    await setPowerState(value)
    ControlWidget.reloadToggles()
  },
})
