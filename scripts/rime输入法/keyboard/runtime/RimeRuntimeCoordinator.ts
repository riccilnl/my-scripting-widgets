import type { ChineseLayoutId } from "../../contracts/preferences";
import { RimeEngine } from "../../core/rime/RimeEngine";
import {
  describeSchemes,
  listInstalledRimeSchemes,
  listRuntimeSupportedRimeSchemes,
  resolveSchemaForChineseLayout
} from "../../core/rime/SchemeCatalog";
import { prepareT9BridgeRuntime } from "../../core/rime/T9BridgeRuntime";
import type { StartupTrace } from "./StartupTrace";

export type RimeRuntimeRequest = {
  chineseLayout: ChineseLayoutId;
  preferredSchemaId: string;
  /** True after the requesting keyboard view has been torn down. */
  isCancelled?: () => boolean;
  startupTrace?: StartupTrace | null;
};

export class RimeRuntimeCancelled extends Error {
  constructor() { super("Rime keyboard initialization cancelled"); }
}

async function buildRuntime(request: RimeRuntimeRequest): Promise<RimeEngine> {
  const requireActive = () => {
    if (request.isCancelled?.()) throw new RimeRuntimeCancelled();
  };
  const trace = request.startupTrace;
  requireActive();
  if (!Rime.isSetUp) {
    trace?.mark("rime.setup.begin");
    await Rime.setup();
    trace?.mark("rime.setup.end");
  } else {
    trace?.mark("rime.setup.skipped");
  }
  requireActive();

  // Snapshot the documented engine-wide deployment flag only while tracing.
  // This flag does not prove what work the native engine performs internally.
  if (trace) {
    const deploying = Rime.isDeploying;
    if (typeof deploying === "boolean") {
      trace.mark(deploying
        ? "rime.deployStatus.beforeSchemas.busy"
        : "rime.deployStatus.beforeSchemas.idle");
    }
  }
  trace?.mark("rime.schemas.begin");
  let runtimeSchemas = await Rime.listSchemas();
  trace?.mark("rime.schemas.end");
  requireActive();
  const { chineseLayout, preferredSchemaId } = request;

  if (preferredSchemaId && !runtimeSchemas.some((item: any) => item?.id === preferredSchemaId)) {
    trace?.mark("rime.installedScan.begin");
    const installed = await listInstalledRimeSchemes();
    trace?.mark("rime.installedScan.end");
    requireActive();
    if (installed.some((item) => item.id === preferredSchemaId) && typeof Rime.deploy === "function") {
      trace?.mark("rime.deploy.begin");
      await Rime.deploy();
      trace?.mark("rime.deploy.end");
      requireActive();
      trace?.mark("rime.schemasAfterDeploy.begin");
      runtimeSchemas = await Rime.listSchemas();
      trace?.mark("rime.schemasAfterDeploy.end");
      requireActive();
    }
  }

  if (chineseLayout === "t9") {
    trace?.mark("t9.bridge.begin");
    const bridge = await prepareT9BridgeRuntime(trace);
    trace?.mark("t9.bridge.end");
    requireActive();
    if (!bridge.ready) throw new Error("wanxiang_t9 九键输入桥安装或注册失败");
    if (bridge.changed) {
      trace?.mark("t9.schemasAfterBridge.begin");
      runtimeSchemas = await Rime.listSchemas();
      trace?.mark("t9.schemasAfterBridge.end");
      requireActive();
    }
  }

  // Rime.listSchemas() is already the runtime-selectable source of truth.
  // Avoid rescanning and parsing every installed .schema.yaml on each keyboard mount.
  trace?.mark("rime.schemaFilter.begin");
  const schemes = listRuntimeSupportedRimeSchemes(runtimeSchemas);
  trace?.mark("rime.schemaFilter.end");
  requireActive();
  if (trace) {
    const deploying = Rime.isDeploying;
    if (typeof deploying === "boolean") {
      trace.mark(deploying
        ? "rime.deployStatus.beforeSession.busy"
        : "rime.deployStatus.beforeSession.idle");
    }
  }

  // Preserve the original rime.session.begin/end bracket for comparable reports.
  // The native constructor is opaque: time includes the JS-to-native bridge,
  // and cannot be subdivided into librime's internal operations here.
  trace?.mark("rime.session.begin");
  trace?.mark("rime.session.native.begin");
  const nativeSession = new Rime.Session();
  trace?.mark("rime.session.native.end");
  trace?.mark("rime.session.wrap.begin");
  const engine = new RimeEngine(nativeSession);
  trace?.mark("rime.session.wrap.end");
  trace?.mark("rime.session.end");

  try {
    requireActive();
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

    trace?.mark("rime.schemaSelection.begin");
    if (engine.currentSchemaId !== targetScheme.id && !engine.selectSchema(targetScheme.id)) {
      throw new Error(`无法切换到 ${targetScheme.name} (${targetScheme.id})`);
    }
    if (engine.currentSchemaId !== targetScheme.id) {
      const actual = engine.currentSchemaId ?? "unknown";
      throw new Error(`Rime 方案切换失败：期望 ${targetScheme.id}，实际 ${actual}`);
    }
    trace?.mark("rime.schemaSelection.end");
    if (chineseLayout === "t9") {
      trace?.mark("t9.probe.begin");
      engine.enforceWanxiangT9RuntimeContract();
      if (!engine.probeT9Bridge()) {
        throw new Error("wanxiang_t9 九键输入桥未进入 Rime processor 链");
      }
      trace?.mark("t9.probe.end");
    }

    requireActive();
    trace?.mark("rime.runtimeReady");
    return engine;
  } catch (error) {
    engine.close();
    throw error;
  }
}

export function prepareKeyboardRimeRuntime(request: RimeRuntimeRequest): Promise<RimeEngine> {
  return buildRuntime(request);
}
