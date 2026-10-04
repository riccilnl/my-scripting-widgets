import type { ChineseLayoutId } from "../../contracts/preferences";
import { RimeEngine } from "../../core/rime/RimeEngine";
import {
  describeSchemes,
  listInstalledRimeSchemes,
  listSupportedRimeSchemes,
  resolveSchemaForChineseLayout
} from "../../core/rime/SchemeCatalog";
import { prepareT9BridgeRuntime } from "../../core/rime/T9BridgeRuntime";

export type RimeRuntimeRequest = {
  chineseLayout: ChineseLayoutId;
  preferredSchemaId: string;
};

async function buildRuntime(request: RimeRuntimeRequest): Promise<RimeEngine> {
  if (!Rime.isSetUp) await Rime.setup();

  let runtimeSchemas = await Rime.listSchemas();
  const { chineseLayout, preferredSchemaId } = request;

  if (preferredSchemaId && !runtimeSchemas.some((item: any) => item?.id === preferredSchemaId)) {
    const installed = await listInstalledRimeSchemes();
    if (installed.some((item) => item.id === preferredSchemaId) && typeof Rime.deploy === "function") {
      await Rime.deploy();
      runtimeSchemas = await Rime.listSchemas();
    }
  }

  if (chineseLayout === "t9") {
    const bridgeReady = await prepareT9BridgeRuntime();
    if (!bridgeReady) throw new Error("wanxiang_t9 九键输入桥安装或注册失败");
    runtimeSchemas = await Rime.listSchemas();
  }

  const schemes = await listSupportedRimeSchemes(runtimeSchemas);
  const engine = new RimeEngine(new Rime.Session());

  try {
    const targetScheme = resolveSchemaForChineseLayout(
      schemes,
      engine.currentSchemaId,
      chineseLayout,
      preferredSchemaId
    );
    if (!targetScheme) {
      const available = describeSchemes(schemes);
      throw new Error(
        chineseLayout === "t9"
          ? `未识别到可用的 wanxiang_t9${available ? `；已识别：${available}` : ""}`
          : `未识别到可用的 26 键 Rime 方案${available ? `；已识别：${available}` : ""}`
      );
    }

    if (engine.currentSchemaId !== targetScheme.id && !engine.selectSchema(targetScheme.id)) {
      throw new Error(`无法切换到 ${targetScheme.name} (${targetScheme.id})`);
    }
    if (engine.currentSchemaId !== targetScheme.id) {
      const actual = engine.currentSchemaId ?? "unknown";
      throw new Error(`Rime 方案切换失败：期望 ${targetScheme.id}，实际 ${actual}`);
    }
    if (chineseLayout === "t9") {
      engine.enforceWanxiangT9RuntimeContract();
      if (!engine.probeT9Bridge()) {
        throw new Error("wanxiang_t9 九键输入桥未进入 Rime processor 链");
      }
    }

    return engine;
  } catch (error) {
    engine.close();
    throw error;
  }
}

export function prepareKeyboardRimeRuntime(request: RimeRuntimeRequest): Promise<RimeEngine> {
  return buildRuntime(request);
}
