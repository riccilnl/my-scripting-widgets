import { Navigation, NavigationStack, Script } from "scripting";
import { SettingsHomePage } from "./ui/settings/SettingsHomePage";

function App() {
  return (
    <NavigationStack>
      <SettingsHomePage />
    </NavigationStack>
  );
}

void (async () => {
  await Navigation.present(<App />);
  Script.exit();
})();
