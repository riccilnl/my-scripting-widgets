import type { StartupTraceReport } from "../../keyboard/runtime/StartupTrace";

/** Only loaded in settings, never on the keyboard startup path. */
export function formatStartupTraceReport(report: StartupTraceReport): string {
  const round = (n: number) => Math.round(n * 10) / 10;
  const state = report.outcome === "ready" ? "可输入"
    : report.outcome === "cancelled" ? "提前关闭" : "初始化失败";
  const marks = report.marks;
  const total = marks.length ? marks[marks.length - 1].elapsedMs : 0;
  const events = marks.map((item, index) => {
    const previous = index ? marks[index - 1].elapsedMs : 0;
    return `${String(index + 1).padStart(2, "0")}. ${item.phase}：累计 ${round(item.elapsedMs)} ms，本阶段 +${round(Math.max(0, item.elapsedMs - previous))} ms`;
  });
  return [
    "Rime 启动性能诊断报告",
    "报告格式：1",
    `记录时间：${new Date(report.recordedAt).toLocaleString("zh-CN", { hour12: false })}`,
    `布局：${report.layout === "t9" ? "九键" : "26 键"}`,
    `状态：${state}`,
    `JS 启动阶段累计：${round(total)} ms`,
    "计时起点：keyboard main() 执行时；不含静态模块加载、系统键盘切换和屏幕首次绘制。",
    "各阶段（累计 / 距前一阶段）：",
    ...events,
    "说明：仅包含最后一次启动阶段及耗时，不保存输入内容、候选词。"
  ].join("\n");
}
