import { Widget } from "scripting";
import { renderIPWidget } from "./widget";

async function main() {
  const widget = await renderIPWidget();
  await Widget.present(widget); // 直接展示 Widget
}

main();