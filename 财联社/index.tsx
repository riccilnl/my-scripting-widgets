// index.tsx - 主脚本入口
import { Navigation } from "scripting"
import { NewsListPage } from "./news_list"

async function main() {
  console.log("📡 财联社电报主脚本开始执行")

  // 使用 Navigation.present 正确显示页面
  await Navigation.present({
    element: <NewsListPage />
  })
}

main().catch(error => {
  console.error("❌ 应用启动失败:", error)
})