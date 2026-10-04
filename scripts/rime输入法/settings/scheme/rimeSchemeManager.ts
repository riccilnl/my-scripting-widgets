import { Path } from "scripting";
import { sharedRimeDataDir, type RuntimeSchemaLike } from "../../core/rime/SchemeCatalog";
import { indentationWidth, readRimeText, writeRimeText } from "./rimeConfigText";
import {
  listConfigurableSchemes,
  type SchemeDescriptor
} from "./rimeSchemeSettings";

type SchemeEnableDraft = {
  installed: SchemeDescriptor[];
  values: Record<string, boolean>;
  baseEnabledOrder: string[];
  defaultCustomPath: string;
  defaultCustomText: string;
};

function runtimeSchemaIds(runtimeSchemas: readonly RuntimeSchemaLike[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of runtimeSchemas) {
    const id = String(item?.id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function schemaListRange(text: string): { start: number; end: number; indent: number } | null {
  const lines = text.split(/\r?\n/);
  const patchIndex = lines.findIndex((line) => /^\s*patch:\s*(?:#.*)?$/.test(line));
  if (patchIndex < 0) return null;
  const patchIndent = indentationWidth(lines[patchIndex]);

  for (let index = patchIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && indentationWidth(line) <= patchIndent) break;
    const keyMatch = line.match(/^(\s*)(?:["']?schema_list["']?)\s*:\s*(?:#.*)?$/);
    if (!keyMatch) continue;
    const indent = indentationWidth(line);
    let end = index + 1;
    while (end < lines.length) {
      const next = lines[end];
      const nextTrimmed = next.trim();
      if (nextTrimmed && !nextTrimmed.startsWith("#") && indentationWidth(next) <= indent) break;
      end += 1;
    }
    return { start: index, end, indent };
  }
  return null;
}


function parseSchemaListItems(lines: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const match = line.match(/^\s*-\s+schema:\s*["']?([^"'\s#]+)["']?/);
    const id = String(match?.[1] ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function parseManagedSchemaList(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const range = schemaListRange(text);
  return range ? parseSchemaListItems(lines.slice(range.start + 1, range.end)) : [];
}

function parseDefaultSchemaList(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => /^\s*schema_list:\s*(?:#.*)?$/.test(line));
  if (start < 0) return [];
  const indent = indentationWidth(lines[start]);
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && indentationWidth(line) <= indent) break;
    end += 1;
  }
  return parseSchemaListItems(lines.slice(start + 1, end));
}

function ensurePatch(text: string): string {
  const trimmed = text.trimEnd();
  if (/^\s*patch:\s*(?:#.*)?$/m.test(trimmed)) return `${trimmed}\n`;
  if (/^\s*patch:\s*\S+/m.test(trimmed)) {
    throw new Error("default.custom.yaml 使用行内 patch 写法，暂不自动修改，请先改成标准多行 patch 格式");
  }
  return `${trimmed}${trimmed ? "\n\n" : ""}patch:\n`;
}

function schemaListBlock(ids: readonly string[], indent = 2): string[] {
  const prefix = " ".repeat(indent);
  const itemPrefix = " ".repeat(indent + 2);
  return [
    `${prefix}schema_list:`,
    ...ids.map((id) => `${itemPrefix}- schema: ${id}`)
  ];
}

function renderDefaultCustomWithSchemaList(text: string, ids: readonly string[]): string {
  if (ids.length === 0) throw new Error("至少需要启用一个 Rime 输入方案");
  const normalizedIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
  if (normalizedIds.length === 0) throw new Error("至少需要启用一个 Rime 输入方案");

  let normalized = ensurePatch(text);
  let lines = normalized.split(/\r?\n/);
  let range = schemaListRange(normalized);
  if (range) {
    lines.splice(range.start, range.end - range.start, ...schemaListBlock(normalizedIds, range.indent));
    return `${lines.join("\n").replace(/\n+$/, "")}\n`;
  }

  const patchIndex = lines.findIndex((line) => /^\s*patch:\s*(?:#.*)?$/.test(line));
  if (patchIndex < 0) throw new Error("无法定位 default.custom.yaml 的 patch 节点");
  const patchIndent = indentationWidth(lines[patchIndex]);
  lines.splice(patchIndex + 1, 0, ...schemaListBlock(normalizedIds, patchIndent + 2));
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

async function loadSchemeEnableDraft(
  runtimeSchemas: readonly RuntimeSchemaLike[]
): Promise<SchemeEnableDraft> {
  const installed = await listConfigurableSchemes(runtimeSchemas);
  const root = sharedRimeDataDir();
  if (!root) throw new Error("无法定位 Rime shared 数据目录");
  const defaultCustomPath = String(Path.join(root, "default.custom.yaml"));
  const defaultCustomText = readRimeText(defaultCustomPath);
  const defaultYamlPath = String(Path.join(root, "default.yaml"));
  const defaultYamlText = readRimeText(defaultYamlPath);

  const runtimeOrder = runtimeSchemaIds(runtimeSchemas);
  const customOrder = parseManagedSchemaList(defaultCustomText);
  const shippedDefaultOrder = parseDefaultSchemaList(defaultYamlText);
  // App/settings context does not guarantee a Rime runtime. The editable state
  // therefore comes from files first: explicit default.custom.yaml wins, then
  // the shipped default.yaml schema_list, and runtime ids are only a final
  // fallback when the host happens to expose Rime here.
  const baseEnabledOrder = customOrder.length
    ? customOrder
    : shippedDefaultOrder.length
    ? shippedDefaultOrder
    : runtimeOrder;
  const enabled = new Set(baseEnabledOrder);
  const values: Record<string, boolean> = {};
  for (const scheme of installed) values[scheme.id] = enabled.has(scheme.id);

  return {
    installed,
    values,
    baseEnabledOrder,
    defaultCustomPath,
    defaultCustomText,
  };
}

function updateSchemeEnableDraft(
  draft: SchemeEnableDraft,
  id: string,
  enabled: boolean
): SchemeEnableDraft {
  if (!draft.installed.some((item) => item.id === id)) {
    throw new Error(`未安装输入方案：${id}`);
  }
  return { ...draft, values: { ...draft.values, [id]: enabled } };
}

function enabledSchemeOrder(draft: SchemeEnableDraft): string[] {
  const managedIds = new Set(draft.installed.map((item) => item.id));
  const result: string[] = [];
  const seen = new Set<string>();

  // Keep the user's current effective order and preserve enabled schemes that
  // this page intentionally does not manage.
  for (const id of draft.baseEnabledOrder) {
    const keep = managedIds.has(id) ? draft.values[id] === true : true;
    if (!keep || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }

  // Newly enabled installed schemes are appended in installed-file order.
  for (const scheme of draft.installed) {
    if (draft.values[scheme.id] !== true || seen.has(scheme.id)) continue;
    seen.add(scheme.id);
    result.push(scheme.id);
  }

  return result;
}

function renderSchemeEnableCustomText(draft: SchemeEnableDraft): string {
  return renderDefaultCustomWithSchemaList(draft.defaultCustomText, enabledSchemeOrder(draft));
}

function writeSchemeEnableCustomText(draft: SchemeEnableDraft, text: string): void {
  writeRimeText(draft.defaultCustomPath, text);
}

export async function effectiveEnabledSchemeIds(): Promise<string[]> {
  const root = sharedRimeDataDir();
  if (!root) return [];
  const customText = readRimeText(String(Path.join(root, "default.custom.yaml")));
  const custom = parseManagedSchemaList(customText);
  if (custom.length) return custom;
  return parseDefaultSchemaList(readRimeText(String(Path.join(root, "default.yaml"))));
}

export async function ensureSchemeEnabled(schemaId: string): Promise<{ changed: boolean; enabled: string[] }> {
  const id = String(schemaId ?? "").trim();
  if (!id) throw new Error("输入方案 ID 为空");
  const draft = await loadSchemeEnableDraft([]);
  if (!draft.installed.some((item) => item.id === id)) {
    throw new Error(`未安装输入方案：${id}`);
  }
  if (draft.baseEnabledOrder.includes(id)) {
    return { changed: false, enabled: [...draft.baseEnabledOrder] };
  }
  const next = updateSchemeEnableDraft(draft, id, true);
  const text = renderSchemeEnableCustomText(next);
  writeSchemeEnableCustomText(next, text);
  return { changed: true, enabled: enabledSchemeOrder(next) };
}
