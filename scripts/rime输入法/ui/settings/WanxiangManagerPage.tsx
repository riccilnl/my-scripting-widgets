import { Button, List, Section, Text, useState } from "scripting";
import {
  checkWanxiangUpdates,
  type WanxiangRemoteAsset,
  type WanxiangUpdateSnapshot
} from "../../settings/wanxiang/WanxiangRelease";
import {
  deployWanxiangRime,
  installWanxiangAsset
} from "../../settings/wanxiang/WanxiangInstall";

function labelFor(asset: WanxiangRemoteAsset): string {
  return asset.kind === "scheme" ? "完整 Lite 方案" : asset.kind === "dict" ? "Lite 词库" : "语法模型";
}

function remoteLine(asset: WanxiangRemoteAsset): string {
  const size = asset.size > 0 ? ` · ${(asset.size / 1024 / 1024).toFixed(1)} MB` : "";
  return `${asset.tag || "Rolling"} · ${asset.name}${size}`;
}

export function WanxiangManagerPage() {
  const [snapshot, setSnapshot] = useState<WanxiangUpdateSnapshot | null>(null);
  const [status, setStatus] = useState("点击“检查更新”读取万象官方 Release。");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setStatus("检查更新中…");
    setProgress(0);
    try {
      const next = await checkWanxiangUpdates();
      setSnapshot(next);
      const count = [next.schemeNeedsUpdate, next.dictNeedsUpdate, next.modelNeedsUpdate].filter(Boolean).length;
      setStatus(count ? `发现 ${count} 项可安装/更新。` : "已是最新。");
    } catch (error) {
      setStatus(String((error as any)?.message ?? error));
    } finally {
      setBusy(false);
    }
  }

  async function install(asset: WanxiangRemoteAsset) {
    if (busy) return;
    setBusy(true);
    setProgress(0);
    try {
      await installWanxiangAsset(asset, {
        onStage: setStatus,
        onProgress: setProgress
      });
      setStatus(`${labelFor(asset)}文件更新完成；需要生效时请点“部署 Rime”。`);
      const next = await checkWanxiangUpdates();
      setSnapshot(next);
    } catch (error) {
      setStatus(`更新失败：${String((error as any)?.message ?? error)}`);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function installAll() {
    if (busy || !snapshot) return;
    const jobs = [
      snapshot.schemeNeedsUpdate ? snapshot.scheme : null,
      snapshot.dictNeedsUpdate ? snapshot.dict : null,
      snapshot.modelNeedsUpdate ? snapshot.model : null
    ].filter((item): item is WanxiangRemoteAsset => item != null);

    if (!jobs.length) {
      setStatus("已是最新。");
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      for (let index = 0; index < jobs.length; index += 1) {
        const asset = jobs[index];
        setStatus(`更新 ${index + 1}/${jobs.length}：${labelFor(asset)}`);
        await installWanxiangAsset(asset, {
          onStage: setStatus,
          onProgress: setProgress
        });
      }
      setStatus("全部文件更新完成；需要生效时请点“部署 Rime”。");
      const next = await checkWanxiangUpdates();
      setSnapshot(next);
    } catch (error) {
      setStatus(`更新失败：${String((error as any)?.message ?? error)}`);
    } finally {
      setBusy(false);
      setProgress(0);
    }
  }

  async function deploy() {
    if (busy) return;
    setBusy(true);
    try {
      await deployWanxiangRime(setStatus);
    } catch (error) {
      setStatus(`部署失败：${String((error as any)?.message ?? error)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <List navigationTitle="方案下载&更新" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>万象 Lite / T9</Text>}
        footer={<Text>固定使用官方 Lite 包；Lite 与九键方案一起发布。完整方案更新会保护用户配置，并在更新前清理上一次由本更新器写入的旧方案文件。</Text>}
      >
        <Button title={busy ? "处理中…" : "检查更新"} systemImage="arrow.clockwise" action={() => { void refresh(); }} />
      </Section>

      {snapshot
        ? (
          <>
            <Section header={<Text>远端状态</Text>}>
              <Text>完整方案：{snapshot.schemeNeedsUpdate ? "可安装/更新" : "已是最新"}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">{remoteLine(snapshot.scheme)}</Text>
              <Text>Lite 词库：{snapshot.dictNeedsUpdate ? "可安装/更新" : "已是最新"}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">{remoteLine(snapshot.dict)}</Text>
              <Text>语法模型：{snapshot.modelNeedsUpdate ? "可安装/更新" : "已是最新"}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">{remoteLine(snapshot.model)}</Text>
            </Section>

            <Section header={<Text>下载与更新</Text>}>
              <Button title="下载/更新完整 Lite 方案" systemImage="square.and.arrow.down" action={() => { void install(snapshot.scheme); }} />
              <Button title="更新 Lite 词库" systemImage="books.vertical" action={() => { void install(snapshot.dict); }} />
              <Button title="更新语法模型" systemImage="brain" action={() => { void install(snapshot.model); }} />
              <Button title="更新全部需要更新的项目" systemImage="arrow.triangle.2.circlepath" action={() => { void installAll(); }} />
              <Button title="部署 Rime" systemImage="checkmark.circle" action={() => { void deploy(); }} />
            </Section>
          </>
        )
        : null}

      <Section header={<Text>状态</Text>}>
        <Text>{status}</Text>
        {progress > 0 && progress < 1
          ? <Text font="caption" foregroundStyle="secondaryLabel">下载进度：{Math.round(progress * 100)}%</Text>
          : null}
      </Section>

      <Section footer={<Text>部署方式与万象方案助手的 Scripting 实现一致：先执行 Rime.setup，再以 fullCheck=false 部署，避免走全量依赖检查。</Text>}>
        <Text font="caption" foregroundStyle="secondaryLabel">方案：万象最新稳定版 rime-wanxiang-lite.zip</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">词库：万象 dict-nightly / lite-dicts.zip</Text>
        <Text font="caption" foregroundStyle="secondaryLabel">模型：RIME-LMDG LTS / wanxiang-lts-zh-hans.gram</Text>
      </Section>
    </List>
  );
}
