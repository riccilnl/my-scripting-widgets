import { Button, HStack, List, Section, Text, Toggle, useState, VStack } from "scripting";
import { formatStartupTraceReport } from "./formatStartupTraceReport";
import {
  clearLastStartupTrace,
  isStartupTraceEnabled,
  readLastStartupTrace,
  setStartupTraceEnabled,
  type StartupTraceReport
} from "../../keyboard/runtime/StartupTrace";

/** UI exposes last completed startup only; refreshing never accesses Rime. */
export function StartupDiagnosticsPage() {
  const [enabled, setEnabled] = useState(() => isStartupTraceEnabled());
  const [report, setReport] = useState<StartupTraceReport | null>(() => readLastStartupTrace());
  const [notice, setNotice] = useState("");

  function toggle(enabledNext: boolean) {
    if (!setStartupTraceEnabled(enabledNext)) {
      setNotice("无法保存诊断开关，请检查 Scripting 共享存储。");
      return;
    }
    setEnabled(enabledNext);
    setNotice(enabledNext ? "已开启；重新唤起输入法后返回本页刷新记录。" : "已关闭；不再记录后续启动。");
  }

  function refresh() {
    setReport(readLastStartupTrace());
    setEnabled(isStartupTraceEnabled());
    setNotice("");
  }

  async function copyLatestReport() {
    const latest = readLastStartupTrace();
    if (!latest) {
      setReport(null);
      setNotice("没有可复制的启动记录；请先开启诊断并唤起键盘。");
      return;
    }
    setReport(latest);
    try {
      await Pasteboard.setString(formatStartupTraceReport(latest));
      setNotice("完整诊断报告已复制，直接粘贴到 ChatGPT 对话即可。");
    } catch {
      setNotice("复制失败，请检查 Scripting 剪贴板权限后重试。");
    }
  }

  function clear() {
    if (!clearLastStartupTrace()) {
      setNotice("清除记录失败。");
      return;
    }
    setReport(null);
    setNotice("已清除最近一次启动记录。");
  }

  return (
    <List navigationTitle="启动性能诊断" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>启动记录</Text>}
        footer={<Text>诊断默认关闭。仅记录一次启动的阶段时间、布局和成功/取消/失败状态，不保存输入文本、候选内容或文件路径；开启后，每次启动最多写入一条记录。点击“一键复制完整诊断报告”，即可粘贴到 ChatGPT。诊断本身可能增加少量开销。</Text>}
      >
        <Toggle title="启用启动诊断" value={enabled} onChanged={toggle} />
        <Button title="刷新上次启动记录" action={refresh} />
        <Button title="一键复制完整诊断报告" systemImage="doc.on.doc" action={() => { void copyLatestReport(); }} />
        {notice ? <Text foregroundStyle="secondaryLabel">{notice}</Text> : null}
      </Section>
      {report
        ? (
          <Section header={<Text>最近一次启动</Text>}>
            <Text>{`状态：${report.outcome === "ready" ? "可输入" : report.outcome === "cancelled" ? "提前关闭" : "初始化失败"}`}</Text>
            <Text>{`布局：${report.layout === "t9" ? "九键" : "26 键"}`}</Text>
            <Text>{`记录时间：${new Date(report.recordedAt).toLocaleString()}`}</Text>
            <Text>{`已测得的启动阶段耗时：${report.marks.at(-1)?.elapsedMs ?? 0} ms`}</Text>
            {report.marks.map((event, index) => (
              <HStack key={`startup-mark-${index}`} spacing={8}>
                <VStack alignment="leading" spacing={2}>
                  <Text>{event.phase}</Text>
                  <Text foregroundStyle="secondaryLabel">{`累计 ${event.elapsedMs} ms`}</Text>
                </VStack>
                <Text>
                  {`+${Math.max(0, Math.round((event.elapsedMs - (report.marks[index - 1]?.elapsedMs ?? 0)) * 10) / 10)} ms`}
                </Text>
              </HStack>
            ))}
          </Section>
        )
        : <Section><Text foregroundStyle="secondaryLabel">还没有启动记录；请先开启诊断、唤起键盘，再回到此处刷新。</Text></Section>}
      {report ? <Section><Button title="清除上次记录" role="destructive" action={clear} /></Section> : null}
      <Section header={<Text>计时范围</Text>}>
        <Text foregroundStyle="secondaryLabel">起点为 keyboard.tsx 静态模块加载完成后、main() 开始执行时；present.return 只表示呈现接口返回，不等于实际画面出现。startup.ready 表示完成首次 Rime 发布，不代表屏幕绘制完成。要比较视觉首帧、系统键盘切换和真正的输入响应延迟，仍需使用 iPhone 真机计时。</Text>
      </Section>
    </List>
  );
}
