import type { StartupTraceReport } from "../../keyboard/runtime/StartupTrace";

/** Only loaded in settings, never on the keyboard startup path. */
export function formatStartupTraceReport(report: StartupTraceReport): string {
  const round = (n: number) => Math.round(n * 10) / 10;
  const state = report.outcome === "ready" ? "可输入"
    : report.outcome === "cancelled" ? "提前关闭" : "初始化失败";
  const marks = report.marks;
  const total = marks.length ? marks[marks.length - 1].elapsedMs : 0;
  const timeAt = (phase: string): number | null => {
    const mark = marks.find((item) => item.phase === phase);
    return mark ? mark.elapsedMs : null;
  };
  const interval = (label: string, begin: string, end: string): string | null => {
    const start = timeAt(begin);
    const finish = timeAt(end);
    return start !== null && finish !== null
      ? label + " " + round(Math.max(0, finish - start)) + " ms" : null;
  };
  const setupPath = timeAt("rime.setup.begin") !== null
    ? "本次执行 Rime.setup"
    : timeAt("rime.setup.skipped") !== null
    ? "本次跳过 Rime.setup" : "未知";
  const deployAt = (stage: "beforeSchemas" | "beforeSession") => {
    return timeAt("rime.deployStatus." + stage + ".busy") !== null ? "忙碌"
      : timeAt("rime.deployStatus." + stage + ".idle") !== null ? "未部署" : "未知";
  };
  const critical = [
    interval("Effect 调度等待", "ui.present.return", "ui.effect.begin"),
    interval("Rime.setup", "rime.setup.begin", "rime.setup.end"),
    interval("Schema 枚举", "rime.schemas.begin", "rime.schemas.end"),
    interval("Session 构造调用（含 JS/原生桥接）",
      "rime.session.native.begin", "rime.session.native.end"),
    interval("Session JS 包装", "rime.session.wrap.begin", "rime.session.wrap.end")
  ].filter((value): value is string => value !== null);
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
    "初始化路径：" + setupPath + "；这不等同于判断 iOS 进程是否冷启动。",
    "部署状态采样：枚举前 " + deployAt("beforeSchemas") + "；Session 前 " + deployAt("beforeSession") + "（仅瞬时状态）。",
    ...(critical.length ? ["主要区间：" + critical.join("；") + "。"] : []),
    "各阶段（累计 / 距前一阶段）：",
    ...events,
    "说明：仅包含最后一次启动阶段及耗时，不保存输入内容、候选词。"
  ].join("\n");
}
