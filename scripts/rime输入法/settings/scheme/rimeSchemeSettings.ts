import { Path } from "scripting";
import { sharedRimeDataDir, type RuntimeSchemaLike } from "../../core/rime/SchemeCatalog";
import { indentationWidth, readRimeText, rimeFileManager, writeRimeText } from "./rimeConfigText";


export type SchemeDescriptor = {
  id: string;
  name: string;
  schemaPath: string;
  customPath: string;
};

export type SchemeSwitchDescriptor = {
  index: number;
  id: string;
  kind: "name" | "options";
  options: string[];
  states: string[];
  defaultIndex: number;
};

export type SchemeScalarSettingGroup =
  | "learning"
  | "phrases"
  | "english"
  | "context"
  | "comment"
  | "lookup"
  | "grammar"
  | "input";

export type SchemeScalarSettingDescriptor = {
  path: string;
  section: string;
  key: string;
  title: string;
  group: SchemeScalarSettingGroup;
  tier: "basic" | "advanced" | "tips";
  kind: "boolean" | "integer" | "number" | "text" | "choice";
  includeCommented?: boolean;
  min?: number;
  choices?: ReadonlyArray<{ value: string; title: string }>;
  help?: string;
  validation?: "nonempty" | "comment-placeholder" | "percent-placeholder" | "repeated-limit";
};

export type SchemeSwitchDraft = {
  scheme: SchemeDescriptor;
  schemaText: string;
  customText: string;
  switches: SchemeSwitchDescriptor[];
  values: Record<string, number>;
  baseValues: Record<string, number>;
  supportedScalars: string[];
  scalarValues: Record<string, string>;
  baseScalarValues: Record<string, string>;
  supportedLists: string[];
  listValues: Record<string, string[]>;
  baseListValues: Record<string, string[]>;
  fuzzySupported: boolean;
  fuzzyConflict: boolean;
  fuzzyMode: "none" | "wanxiang_refs" | "wanxiang_t9_materialized";
  fuzzyEnabled: string[];
  baseFuzzyEnabled: string[];
  fuzzyOptionIds: string[];
  baseAlgebra: string[];
  baseAlgebraRefs: string[];
};

export const SUPER_TIPS_TYPES = [
  "偏旁",
  "符号",
  "化学式",
  "时间",
  "组字",
  "翻译",
  "表情",
  "货币",
  "车牌",
  "单位"
] as const;

// Current Wanxiang fuzzy presets (wanxiang_algebra.yaml, 2026-09).
// Full-pinyin writes the official __patch references. T9 has a direct algebra
// chain, so it reuses these verified rules and materializes them before the
// uppercase->digit conversion, matching the mature frozen implementation.
export const FUZZY_SOUND_OPTIONS = [
  { id: "nl", title: "n ↔ l", ref: "wanxiang_algebra:/模糊音_nl", rules: ["derive/^l/n", "derive/^n/l"] },
  { id: "ry", title: "r ↔ y", ref: "wanxiang_algebra:/模糊音_ry", rules: ["derive/^y/r", "derive/^r/y"] },
  { id: "hf", title: "h ↔ f", ref: "wanxiang_algebra:/模糊音_hf", rules: ["derive/^h/f", "derive/^f/h"] },
  { id: "rl", title: "r ↔ l", ref: "wanxiang_algebra:/模糊音_rl", rules: ["derive/^r/l", "derive/^l/r"] },
  { id: "kg", title: "k ↔ g", ref: "wanxiang_algebra:/模糊音_kg", rules: ["derive/^k/g", "derive/^g/k"] },
  {
    id: "en_eng",
    title: "en ↔ eng",
    ref: "wanxiang_algebra:/模糊音_en_eng",
    rules: ["derive/(ē|é|ě|è|e)ng(.*)$/$1n$2", "derive/(ē|é|ě|è|e)n([^g].*)?$/$1ng$2"]
  },
  {
    id: "in_ing",
    title: "in ↔ ing",
    ref: "wanxiang_algebra:/模糊音_in_ing",
    rules: ["derive/(ī|í|ǐ|ì|i)ng(.*)$/$1n$2", "derive/(ī|í|ǐ|ì|i)n([^g].*)?$/$1ng$2"]
  },
  { id: "c_ch", title: "c ↔ ch", ref: "wanxiang_algebra:/模糊音_c_ch", rules: ["derive/^ch/c", "derive/^c([^h]*)/ch$1"] },
  { id: "z_zh", title: "z ↔ zh", ref: "wanxiang_algebra:/模糊音_z_zh", rules: ["derive/^zh/z", "derive/^z([^h]*)/zh$1"] },
  { id: "s_sh", title: "s ↔ sh", ref: "wanxiang_algebra:/模糊音_s_sh", rules: ["derive/^sh/s", "derive/^s([^h]*)/sh$1"] }
] as const;

export const SCHEME_SCALAR_SETTINGS: ReadonlyArray<SchemeScalarSettingDescriptor> = [
  // Common settings kept on the normal scheme page.
  {
    path: "translator/enable_completion", section: "translator", key: "enable_completion",
    title: "候选补全", group: "learning", tier: "basic", kind: "boolean",
    help: "输入尚未完整时提前提供补全候选。"
  },
  {
    path: "translator/enable_user_dict", section: "translator", key: "enable_user_dict",
    title: "个人词频学习", group: "learning", tier: "basic", kind: "boolean",
    help: "允许 Rime 用户词典根据选择记录调整词频。"
  },

  // Main translator / learning.
  { path: "translator/enable_word_completion", section: "translator", key: "enable_word_completion", title: "词语补全", group: "learning", tier: "advanced", kind: "boolean", includeCommented: true },
  { path: "translator/enable_sentence", section: "translator", key: "enable_sentence", title: "自动造句", group: "learning", tier: "advanced", kind: "boolean", includeCommented: true },
  { path: "translator/max_sentences", section: "translator", key: "max_sentences", title: "最大造句候选数", group: "learning", tier: "advanced", kind: "integer", includeCommented: true, min: 0 },
  { path: "translator/keep_comments", section: "translator", key: "keep_comments", title: "保留原始候选注释", group: "learning", tier: "advanced", kind: "boolean", includeCommented: true },
  { path: "translator/enable_correction", section: "translator", key: "enable_correction", title: "自动纠错", group: "learning", tier: "advanced", kind: "boolean", includeCommented: true },
  { path: "translator/encode_commit_history", section: "translator", key: "encode_commit_history", title: "记录上屏历史", group: "learning", tier: "advanced", kind: "boolean", includeCommented: true },
  { path: "translator/contextual_suggestions", section: "translator", key: "contextual_suggestions", title: "模型上下文建议", group: "learning", tier: "advanced", kind: "boolean" },
  { path: "translator/max_homophones", section: "translator", key: "max_homophones", title: "最大同音候选", group: "learning", tier: "advanced", kind: "integer", min: 0 },
  { path: "translator/core_word_length", section: "translator", key: "core_word_length", title: "核心学词长度", group: "learning", tier: "advanced", kind: "integer", min: 0 },
  { path: "translator/max_word_length", section: "translator", key: "max_word_length", title: "最大学词长度", group: "learning", tier: "advanced", kind: "integer", min: 0 },
  { path: "translator/initial_quality", section: "translator", key: "initial_quality", title: "主翻译器初始权重", group: "learning", tier: "advanced", kind: "number" },
  { path: "translator/spelling_hints", section: "translator", key: "spelling_hints", title: "拼写提示长度", group: "learning", tier: "advanced", kind: "integer", min: 0 },
  { path: "translator/always_show_comments", section: "translator", key: "always_show_comments", title: "始终保留候选注释", group: "learning", tier: "advanced", kind: "boolean" },

  // Custom phrases / abbreviations.
  { path: "custom_phrase/dictionary", section: "custom_phrase", key: "dictionary", title: "自定义短语词典", group: "phrases", tier: "advanced", kind: "text", validation: "nonempty" },
  { path: "custom_phrase/user_dict", section: "custom_phrase", key: "user_dict", title: "自定义短语用户词典", group: "phrases", tier: "advanced", kind: "text" },
  { path: "custom_phrase/db_class", section: "custom_phrase", key: "db_class", title: "自定义短语数据库类型", group: "phrases", tier: "advanced", kind: "text" },
  { path: "custom_phrase/enable_user_dict", section: "custom_phrase", key: "enable_user_dict", title: "自定义短语用户词典", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "custom_phrase/enable_completion", section: "custom_phrase", key: "enable_completion", title: "自定义短语补全", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "custom_phrase/enable_sentence", section: "custom_phrase", key: "enable_sentence", title: "自定义短语造句", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "custom_phrase/initial_quality", section: "custom_phrase", key: "initial_quality", title: "自定义短语初始权重", group: "phrases", tier: "advanced", kind: "number" },
  { path: "custom_phrase/always_show_comments", section: "custom_phrase", key: "always_show_comments", title: "自定义短语始终显示注释", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "custom_phrase/spelling_hints", section: "custom_phrase", key: "spelling_hints", title: "自定义短语拼写提示长度", group: "phrases", tier: "advanced", kind: "integer", min: 0 },
  { path: "abbrev_phrase/dictionary", section: "abbrev_phrase", key: "dictionary", title: "简码词典", group: "phrases", tier: "advanced", kind: "text", validation: "nonempty" },
  { path: "abbrev_phrase/enable_user_dict", section: "abbrev_phrase", key: "enable_user_dict", title: "简码用户词典", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "abbrev_phrase/enable_completion", section: "abbrev_phrase", key: "enable_completion", title: "简码补全", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "abbrev_phrase/always_show_comments", section: "abbrev_phrase", key: "always_show_comments", title: "简码始终显示注释", group: "phrases", tier: "advanced", kind: "boolean" },
  { path: "abbrev_phrase/spelling_hints", section: "abbrev_phrase", key: "spelling_hints", title: "简码拼写提示长度", group: "phrases", tier: "advanced", kind: "integer", min: 0 },
  { path: "abbrev_phrase/insert_position", section: "abbrev_phrase", key: "insert_position", title: "简码前置位置", group: "phrases", tier: "advanced", kind: "integer", min: 1 },
  { path: "abbrev_phrase/max_candidates", section: "abbrev_phrase", key: "max_candidates", title: "简码最大候选数", group: "phrases", tier: "advanced", kind: "integer", min: 0 },

  // English / mixed input.
  {
    path: "wanxiang_english/english_spacing", section: "wanxiang_english", key: "english_spacing",
    title: "英文自动空格", group: "english", tier: "advanced", kind: "choice",
    choices: [
      { value: "off", title: "关闭" },
      { value: "before", title: "词前加空格" },
      { value: "after", title: "词后加空格" },
      { value: "smart", title: "智能空格" }
    ]
  },
  { path: "wanxiang_english/spacing_timeout", section: "wanxiang_english", key: "spacing_timeout", title: "空格状态超时（秒）", group: "english", tier: "advanced", kind: "number", min: 0 },
  { path: "wanxiang_english/max_candidates", section: "wanxiang_english", key: "max_candidates", title: "英文最大候选数", group: "english", tier: "advanced", kind: "integer", min: 0 },
  { path: "wanxiang_english/trigger", section: "wanxiang_english", key: "trigger", title: "英文造词触发符", group: "english", tier: "advanced", kind: "text", validation: "nonempty" },

  // Context reorder.
  { path: "context_reorder/enable_fallback_reorder", section: "context_reorder", key: "enable_fallback_reorder", title: "无上下文时回退调频", group: "context", tier: "advanced", kind: "boolean" },
  { path: "context_reorder/context_timeout", section: "context_reorder", key: "context_timeout", title: "上下文有效时间（毫秒）", group: "context", tier: "advanced", kind: "integer", min: 0 },

  // Super comment.
  { path: "super_comment/candidate_length", section: "super_comment", key: "candidate_length", title: "辅助码提示最大词长", group: "comment", tier: "advanced", kind: "integer", min: 0 },
  { path: "super_comment/corrector_type", section: "super_comment", key: "corrector_type", title: "纠错提示格式", group: "comment", tier: "advanced", kind: "text", validation: "comment-placeholder", help: "必须保留 comment 占位符。" },
  { path: "super_comment/tone_isolate", section: "super_comment", key: "tone_isolate", title: "声调数字隔离", group: "comment", tier: "advanced", kind: "boolean" },
  { path: "super_comment/convert_abbrev_preedit", section: "super_comment", key: "convert_abbrev_preedit", title: "单音节简码转全拼", group: "comment", tier: "advanced", kind: "boolean" },

  // Lookup / emoji.
  { path: "wanxiang_lookup/key", section: "wanxiang_lookup", key: "key", title: "输入中反查引导符", group: "lookup", tier: "advanced", kind: "text", validation: "nonempty" },
  { path: "wanxiang_lookup/enable_tone", section: "wanxiang_lookup", key: "enable_tone", title: "反查支持声调", group: "lookup", tier: "advanced", kind: "boolean" },
  { path: "wanxiang_lookup/enable_direct", section: "wanxiang_lookup", key: "enable_direct", title: "无引导直接辅助查询", group: "lookup", tier: "advanced", kind: "boolean" },
  { path: "emoji/tips", section: "emoji", key: "tips", title: "Emoji 提示方式", group: "lookup", tier: "advanced", kind: "text" },
  { path: "emoji/inherit_comment", section: "emoji", key: "inherit_comment", title: "Emoji 继承候选注释", group: "lookup", tier: "advanced", kind: "boolean" },

  // Super tips detail stays outside the expert page, but below the main toggle.
  { path: "super_tips/tips_key", section: "super_tips", key: "tips_key", title: "提示展开键", group: "input", tier: "tips", kind: "text", validation: "nonempty" },

  // Grammar model.
  { path: "grammar/collocation_max_length", section: "grammar", key: "collocation_max_length", title: "最大搭配长度", group: "grammar", tier: "advanced", kind: "integer", min: 0 },
  { path: "grammar/collocation_min_length", section: "grammar", key: "collocation_min_length", title: "最小搭配长度", group: "grammar", tier: "advanced", kind: "integer", min: 0 },
  { path: "grammar/collocation_penalty", section: "grammar", key: "collocation_penalty", title: "搭配惩罚", group: "grammar", tier: "advanced", kind: "number" },
  { path: "grammar/non_collocation_penalty", section: "grammar", key: "non_collocation_penalty", title: "非搭配惩罚", group: "grammar", tier: "advanced", kind: "number" },
  { path: "grammar/weak_collocation_penalty", section: "grammar", key: "weak_collocation_penalty", title: "弱搭配惩罚", group: "grammar", tier: "advanced", kind: "number" },
  { path: "grammar/rear_penalty", section: "grammar", key: "rear_penalty", title: "尾部惩罚", group: "grammar", tier: "advanced", kind: "number" },

  // Input behaviour. Deliberately excludes Wanxiang T9's "莫动" fields:
  // enable_backspace_limit / enable_seg_loop / enable_tone_fallback / kp_number_mode.
  { path: "add_user_dict/enable_auto_phrase", section: "add_user_dict", key: "enable_auto_phrase", title: "无感自动造词", group: "input", tier: "advanced", kind: "boolean" },
  { path: "super_processor/enable_predict_space", section: "super_processor", key: "enable_predict_space", title: "联想空格打断", group: "input", tier: "advanced", kind: "boolean" },
  { path: "super_processor/limit_repeated", section: "super_processor", key: "limit_repeated", title: "重复输入限制", group: "input", tier: "advanced", kind: "text", validation: "repeated-limit", help: "格式：最大重复声母数,最大候选字数，例如 8,40。" },
  { path: "super_processor/select_character", section: "super_processor", key: "select_character", title: "以词定字按键", group: "input", tier: "advanced", kind: "text", validation: "nonempty" },
  { path: "punctuator/digit_separators", section: "punctuator", key: "digit_separators", title: "数字分隔符", group: "input", tier: "advanced", kind: "text" },
  { path: "super_replacer/comment_format", section: "super_replacer", key: "comment_format", title: "替换器注释格式", group: "input", tier: "advanced", kind: "text", validation: "percent-placeholder", help: "必须保留 %s 占位符。" },
  { path: "super_replacer/chain", section: "super_replacer", key: "chain", title: "替换器流水线模式", group: "input", tier: "advanced", kind: "boolean" }
];

function unquote(value: string): string {
  const text = value.trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineList(value: string): string[] {
  const match = value.match(/^\s*\[(.*)\]\s*$/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => unquote(item).trim())
    .filter(Boolean);
}

function switchSectionLines(text: string): string[] {
  return sectionLines(text, "switches");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sectionLines(text: string, section: string): string[] {
  const lines = text.split(/\r?\n/);
  const sectionRegex = new RegExp(`^([ \\t]*)${escapeRegex(section)}:\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => sectionRegex.test(line));
  if (start < 0) return [];
  const baseIndent = indentationWidth(lines[start]);
  const out: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && indentationWidth(line) <= baseIndent && !/^-\s+/.test(trimmed)) break;
    out.push(line);
  }
  return out;
}

function schemaScalarDeclared(text: string, section: string, key: string, includeCommented = false): string | null {
  const lines = sectionLines(text, section);
  const active = new RegExp(`^\\s+${escapeRegex(key)}:\\s*([^#]+?)\\s*(?:#.*)?$`);
  for (const line of lines) {
    const match = line.match(active);
    if (match) return unquote(match[1]);
  }
  if (includeCommented) {
    const commented = new RegExp(`^\\s*#\\s*${escapeRegex(key)}:\\s*([^#]+?)\\s*(?:#.*)?$`);
    for (const line of lines) {
      const match = line.match(commented);
      if (match) return unquote(match[1]);
    }
  }
  return null;
}

function schemaListDeclared(text: string, section: string, key: string): boolean {
  const lines = sectionLines(text, section);
  const keyRegex = new RegExp(`^([ \\t]+)${escapeRegex(key)}:\\s*(?:\\[[^\\]]*\\])?\\s*(?:#.*)?$`);
  return lines.some((line) => keyRegex.test(line));
}

function schemaList(text: string, section: string, key: string): string[] {
  const lines = sectionLines(text, section);
  const inlineRegex = new RegExp(`^([ \\t]+)${escapeRegex(key)}:\\s*(\\[[^\\]]*\\])\\s*(?:#.*)?$`);
  for (const line of lines) {
    const match = line.match(inlineRegex);
    if (match) return parseInlineList(match[2]);
  }
  const keyRegex = new RegExp(`^([ \\t]+)${escapeRegex(key)}:\\s*(?:#.*)?$`);
  const start = lines.findIndex((line) => keyRegex.test(line));
  if (start < 0) return [];
  const keyIndent = indentationWidth(lines[start]);
  const out: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = indentationWidth(line);
    const item = line.match(/^\s*-\s*(.+?)\s*(?:#.*)?$/);
    if (item && indent > keyIndent) {
      out.push(unquote(item[1]));
      continue;
    }
    if (indent <= keyIndent) break;
  }
  return out;
}

function parsePatchScalar(text: string, key: string): string | null {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`^\\s{2}"${escaped}"\\s*:\\s*([^#\\n]+?)\\s*(?:#.*)?$`, "m"),
    new RegExp(`^\\s{2}'${escaped}'\\s*:\\s*([^#\\n]+?)\\s*(?:#.*)?$`, "m"),
    new RegExp(`^\\s{2}${escaped}\\s*:\\s*([^#\\n]+?)\\s*(?:#.*)?$`, "m")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return unquote(match[1]);
  }
  return null;
}

function parsePatchList(text: string, key: string): string[] | null {
  const lines = text.split(/\r?\n/);
  const escaped = escapeRegex(key);
  const inlinePatterns = [
    new RegExp(`^\\s{2}"${escaped}"\\s*:\\s*(\\[[^\\]]*\\])\\s*(?:#.*)?$`),
    new RegExp(`^\\s{2}'${escaped}'\\s*:\\s*(\\[[^\\]]*\\])\\s*(?:#.*)?$`),
    new RegExp(`^\\s{2}${escaped}\\s*:\\s*(\\[[^\\]]*\\])\\s*(?:#.*)?$`)
  ];
  for (const line of lines) {
    for (const pattern of inlinePatterns) {
      const match = line.match(pattern);
      if (match) return parseInlineList(match[1]);
    }
  }
  const blockPatterns = [
    new RegExp(`^\\s{2}"${escaped}"\\s*:\\s*$`),
    new RegExp(`^\\s{2}'${escaped}'\\s*:\\s*$`),
    new RegExp(`^\\s{2}${escaped}\\s*:\\s*$`)
  ];
  const start = lines.findIndex((line) => blockPatterns.some((pattern) => pattern.test(line)));
  if (start < 0) return null;
  const out: string[] = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const item = line.match(/^\s{4}-\s*(.+?)\s*(?:#.*)?$/);
    if (item) {
      out.push(unquote(item[1]));
      continue;
    }
    if (/^\s{2}\S/.test(line) || /^\S/.test(line)) break;
  }
  return out;
}

function sameStringArray(left: string[] = [], right: string[] = []): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function normalizedTipsDisabled(values: string[]): string[] {
  return values
    .map((value) => value.trim())
    .filter((value) => value && !/^禁用类型/.test(value));
}

function parseSchemeSwitches(text: string): SchemeSwitchDescriptor[] {
  const lines = switchSectionLines(text);
  const result: SchemeSwitchDescriptor[] = [];
  let current: SchemeSwitchDescriptor | null = null;
  let index = -1;
  for (const line of lines) {
    const nameMatch = line.match(/^\s*-\s+name:\s*([^\s#]+)/);
    const optionsMatch = line.match(/^\s*-\s+options:\s*(\[[^\]]*\])/);
    if (nameMatch || optionsMatch) {
      index += 1;
      if (nameMatch) {
        const id = unquote(nameMatch[1]);
        current = { index, id, kind: "name", options: [id], states: [], defaultIndex: 0 };
      } else {
        const options = parseInlineList(optionsMatch?.[1] ?? "");
        current = { index, id: `switch@${index}`, kind: "options", options, states: [], defaultIndex: 0 };
      }
      result.push(current);
      continue;
    }
    if (!current) continue;
    const statesMatch = line.match(/^\s+states:\s*(\[[^\]]*\])/);
    if (statesMatch) {
      current.states = parseInlineList(statesMatch[1]);
      continue;
    }
    const resetMatch = line.match(/^\s+reset:\s*(-?\d+)/);
    if (resetMatch) current.defaultIndex = Number(resetMatch[1]);
  }
  return result.filter((item) => item.kind === "name" || item.options.length > 0);
}

function parseSchemaMeta(text: string): { id: string; name: string } {
  const id = text.match(/^\s*schema_id:\s*["']?([^"'\s#]+)["']?/m)?.[1]?.trim() ?? "";
  const name = text.match(/^\s*name:\s*["']?([^"'\n#]+?)["']?\s*(?:#.*)?$/m)?.[1]?.trim() ?? "";
  return { id, name: name || id };
}

type ConfigurableSchemeClassification = {
  family: "wanxiang" | "rime_ice";
  inheritedSchemaPath?: string;
};

const AUX_WANXIANG_SUFFIX = /(?:_mixedcode|_reverse|_english|_charset|_symbols|_people|_abbrev|_phrase)$/;

function classifyConfigurableScheme(
  id: string,
  schemaText: string,
  root: string
): ConfigurableSchemeClassification | null {
  if (id.startsWith("wanxiang")) {
    if (AUX_WANXIANG_SUFFIX.test(id)) return null;
    return { family: "wanxiang" };
  }
  if (id === "rime_ice") return { family: "rime_ice" };
  if (id === "t9" && /^__include:\s*rime_ice\.schema\.yaml:\/\s*$/m.test(schemaText)) {
    return {
      family: "rime_ice",
      inheritedSchemaPath: String(Path.join(root, "rime_ice.schema.yaml"))
    };
  }
  return null;
}

function effectiveConfigurableSchemaText(
  classification: ConfigurableSchemeClassification,
  schemaText: string
): string {
  if (!classification.inheritedSchemaPath) return schemaText;
  const inherited = readRimeText(classification.inheritedSchemaPath);
  return inherited || schemaText;
}

export async function listConfigurableSchemes(runtimeSchemas: readonly RuntimeSchemaLike[] = []): Promise<SchemeDescriptor[]> {
  const root = sharedRimeDataDir();
  const manager = rimeFileManager();
  if (!root || !manager) return [];
  let files: string[] = [];
  try {
    files = (manager.readDirectorySync?.(root, false) ?? []).map((item: unknown) => String(item));
  } catch {
    return [];
  }

  const runtime = new Map<string, RuntimeSchemaLike>();
  for (const item of runtimeSchemas) {
    const id = String(item?.id ?? "").trim();
    if (id) runtime.set(id, item);
  }

  const result: SchemeDescriptor[] = [];
  for (const file of files.filter((item) => item.endsWith(".schema.yaml")).sort()) {
    const schemaPath = String(Path.join(root, file));
    const text = readRimeText(schemaPath);
    const meta = parseSchemaMeta(text);
    if (!meta.id) continue;

    const classification = classifyConfigurableScheme(meta.id, text, root);
    if (!classification) continue;

    const effectiveText = effectiveConfigurableSchemaText(classification, text);
    const switches = parseSchemeSwitches(effectiveText);
    if (!switches.some((item) => item.kind === "name" && item.id === "ascii_mode")) continue;

    result.push({
      id: meta.id,
      name: meta.name || String(runtime.get(meta.id)?.name ?? "").trim() || meta.id,
      schemaPath,
      customPath: String(Path.join(root, `${meta.id}.custom.yaml`))
    });
  }
  return result;
}

function parsePatchReset(text: string, index: number): number | null {
  const escaped = escapeRegex(`switches/@${index}/reset`);
  const patterns = [
    new RegExp(`^\\s{2}\"${escaped}\"\\s*:\\s*(-?\\d+)\\s*(?:#.*)?$`, "m"),
    new RegExp(`^\\s{2}'${escaped}'\\s*:\\s*(-?\\d+)\\s*(?:#.*)?$`, "m"),
    new RegExp(`^\\s{2}${escaped}\\s*:\\s*(-?\\d+)\\s*(?:#.*)?$`, "m")
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return Number(match[1]);
  }
  return null;
}

const FUZZY_MARKER = "rime-input-fuzzy";

function parseManagedFuzzy(text: string): string[] {
  const match = text.match(/^\s*#\s*rime-input-fuzzy:\s*([^#\r\n]*)\s*$/m);
  if (!match) return [];
  const allowed = new Set<string>(FUZZY_SOUND_OPTIONS.map((item) => item.id));
  return match[1]
    .split(",")
    .map((value) => value.trim())
    .filter((value) => allowed.has(value));
}

function hasManagedFuzzyMarker(text: string): boolean {
  return new RegExp(`^\\s*#\\s*${FUZZY_MARKER}:`, "m").test(text);
}

function removeManagedFuzzyMarker(text: string): string {
  return text
    .split(/\r?\n/)
    .filter((line) => !new RegExp(`^\\s*#\\s*${FUZZY_MARKER}:`).test(line))
    .join("\n");
}

function patchEntryExists(text: string, key: string): boolean {
  const escaped = escapeRegex(key);
  return [
    new RegExp(`^\\s{2}"${escaped}"\\s*:`, "m"),
    new RegExp(`^\\s{2}'${escaped}'\\s*:`, "m"),
    new RegExp(`^\\s{2}${escaped}\\s*:`, "m")
  ].some((pattern) => pattern.test(text));
}

function extractSpellerAlgebraPatchRefs(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const speller = lines.findIndex((line) => /^\s*speller:\s*(?:#.*)?$/.test(line));
  if (speller < 0) return [];
  const spellerIndent = indentationWidth(lines[speller]);
  let algebra = -1;
  let algebraIndent = -1;
  for (let index = speller + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed && !trimmed.startsWith("#") && indentationWidth(lines[index]) <= spellerIndent) break;
    if (/^algebra:\s*(?:#.*)?$/.test(trimmed)) {
      algebra = index;
      algebraIndent = indentationWidth(lines[index]);
      break;
    }
  }
  if (algebra < 0) return [];
  let patchIndent = -1;
  const refs: string[] = [];
  for (let index = algebra + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = indentationWidth(line);
    if (indent <= algebraIndent) break;
    if (/^__patch:\s*(?:#.*)?$/.test(trimmed)) {
      patchIndent = indent;
      continue;
    }
    if (patchIndent >= 0 && indent > patchIndent) {
      const item = trimmed.match(/^-\s*(.+?)\s*(?:#.*)?$/);
      if (item) refs.push(unquote(item[1]));
    }
  }
  return refs;
}

function extractDirectSpellerAlgebra(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const speller = lines.findIndex((line) => /^\s*speller:\s*(?:#.*)?$/.test(line));
  if (speller < 0) return [];
  const spellerIndent = indentationWidth(lines[speller]);
  let algebra = -1;
  let algebraIndent = -1;
  for (let index = speller + 1; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (trimmed && !trimmed.startsWith("#") && indentationWidth(lines[index]) <= spellerIndent) break;
    if (/^algebra:\s*(?:#.*)?$/.test(trimmed)) {
      algebra = index;
      algebraIndent = indentationWidth(lines[index]);
      break;
    }
  }
  if (algebra < 0) return [];
  const out: string[] = [];
  for (let index = algebra + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const indent = indentationWidth(line);
    if (indent <= algebraIndent) break;
    if (/^__patch:/.test(trimmed)) return [];
    const item = trimmed.match(/^-\s*(.+?)\s*(?:#.*)?$/);
    if (item) out.push(unquote(item[1]));
  }
  return out;
}

function fuzzySupportForScheme(scheme: SchemeDescriptor, schemaText: string, customText: string) {
  const managed = hasManagedFuzzyMarker(customText);
  const externalAlgebra = patchEntryExists(customText, "speller/algebra") && !managed;
  if (scheme.id === "wanxiang_t9") {
    const baseAlgebra = extractDirectSpellerAlgebra(schemaText);
    return {
      fuzzySupported: baseAlgebra.length > 0,
      fuzzyConflict: externalAlgebra,
      fuzzyMode: (baseAlgebra.length > 0 ? "wanxiang_t9_materialized" : "none") as SchemeSwitchDraft["fuzzyMode"],
      baseAlgebra,
      baseAlgebraRefs: [] as string[]
    };
  }
  if (scheme.id === "wanxiang") {
    const baseAlgebraRefs = extractSpellerAlgebraPatchRefs(schemaText);
    return {
      fuzzySupported: baseAlgebraRefs.length > 0,
      fuzzyConflict: externalAlgebra,
      fuzzyMode: (baseAlgebraRefs.length > 0 ? "wanxiang_refs" : "none") as SchemeSwitchDraft["fuzzyMode"],
      baseAlgebra: [] as string[],
      baseAlgebraRefs
    };
  }
  return {
    fuzzySupported: false,
    fuzzyConflict: false,
    fuzzyMode: "none" as SchemeSwitchDraft["fuzzyMode"],
    baseAlgebra: [] as string[],
    baseAlgebraRefs: [] as string[]
  };
}

export function loadSchemeSwitchDraft(scheme: SchemeDescriptor): SchemeSwitchDraft {
  const schemaText = readRimeText(scheme.schemaPath);
  const customText = readRimeText(scheme.customPath);
  const switches = parseSchemeSwitches(schemaText);
  const values: Record<string, number> = {};
  for (const descriptor of switches) {
    const patched = parsePatchReset(customText, descriptor.index);
    const raw = patched ?? descriptor.defaultIndex;
    const max = descriptor.kind === "options"
      ? Math.max(0, descriptor.options.length - 1)
      : Math.max(1, descriptor.states.length - 1);
    values[descriptor.id] = Math.max(0, Math.min(max, Number.isFinite(raw) ? raw : descriptor.defaultIndex));
  }

  const supportedScalars: string[] = [];
  const scalarValues: Record<string, string> = {};
  for (const item of SCHEME_SCALAR_SETTINGS) {
    const declared = schemaScalarDeclared(schemaText, item.section, item.key, item.includeCommented === true);
    if (declared == null) continue;
    supportedScalars.push(item.path);
    scalarValues[item.path] = parsePatchScalar(customText, item.path) ?? declared;
  }

  const supportedLists: string[] = [];
  const listValues: Record<string, string[]> = {};
  if (schemaListDeclared(schemaText, "super_tips", "disabled_types")) {
    const path = "super_tips/disabled_types";
    supportedLists.push(path);
    const schemaDefault = normalizedTipsDisabled(schemaList(schemaText, "super_tips", "disabled_types"));
    listValues[path] = normalizedTipsDisabled(parsePatchList(customText, path) ?? schemaDefault);
  }
  if (schemaListDeclared(schemaText, "context_reorder", "custom_classifiers")) {
    const path = "context_reorder/custom_classifiers";
    supportedLists.push(path);
    const schemaDefault = schemaList(schemaText, "context_reorder", "custom_classifiers");
    listValues[path] = parsePatchList(customText, path) ?? schemaDefault;
  }

  const fuzzy = fuzzySupportForScheme(scheme, schemaText, customText);
  const fuzzyEnabled = parseManagedFuzzy(customText);

  return {
    scheme,
    schemaText,
    customText,
    switches,
    values,
    baseValues: { ...values },
    supportedScalars,
    scalarValues,
    baseScalarValues: { ...scalarValues },
    supportedLists,
    listValues,
    baseListValues: Object.fromEntries(Object.entries(listValues).map(([key, value]) => [key, value.slice()])),
    fuzzySupported: fuzzy.fuzzySupported,
    fuzzyConflict: fuzzy.fuzzyConflict,
    fuzzyMode: fuzzy.fuzzyMode,
    fuzzyEnabled,
    baseFuzzyEnabled: fuzzyEnabled.slice(),
    fuzzyOptionIds: FUZZY_SOUND_OPTIONS.map((item) => item.id),
    baseAlgebra: fuzzy.baseAlgebra,
    baseAlgebraRefs: fuzzy.baseAlgebraRefs
  };
}


export function isRuntimeOwnedSchemeSwitch(
  schemeId: string,
  descriptor: SchemeSwitchDescriptor
): boolean {
  if (schemeId !== "wanxiang_t9" || descriptor.kind !== "options") return false;
  const key = descriptor.options.join("|");
  return key === "raw_input|tone_display|full_pinyin"
    || key === "comment_off|tone_hint|toneless_hint";
}

export function updateSchemeSwitchDraft(draft: SchemeSwitchDraft, id: string, value: number): SchemeSwitchDraft {
  const descriptor = draft.switches.find((item) => item.id === id);
  if (!descriptor) throw new Error(`当前方案不支持开关：${id}`);
  if (isRuntimeOwnedSchemeSwitch(draft.scheme.id, descriptor)) {
    throw new Error("当前九键方案的预编辑与候选注释由 Scripting T9 运行时契约固定");
  }
  const max = descriptor.kind === "options"
    ? Math.max(0, descriptor.options.length - 1)
    : Math.max(1, descriptor.states.length - 1);
  const normalized = Math.max(0, Math.min(max, Math.floor(value)));
  return { ...draft, values: { ...draft.values, [id]: normalized } };
}

export function updateSchemeScalarDraft(draft: SchemeSwitchDraft, path: string, value: string): SchemeSwitchDraft {
  if (!draft.supportedScalars.includes(path)) throw new Error(`当前方案不支持设置：${path}`);
  return { ...draft, scalarValues: { ...draft.scalarValues, [path]: value } };
}

export function updateSchemeListDraft(draft: SchemeSwitchDraft, path: string, values: string[]): SchemeSwitchDraft {
  if (!draft.supportedLists.includes(path)) throw new Error(`当前方案不支持列表设置：${path}`);
  return { ...draft, listValues: { ...draft.listValues, [path]: values.slice() } };
}

export function updateSchemeFuzzyDraft(draft: SchemeSwitchDraft, enabled: string[]): SchemeSwitchDraft {
  if (!draft.fuzzySupported) throw new Error("当前方案不支持安全的模糊音配置");
  if (draft.fuzzyConflict) throw new Error("检测到已有手工 speller/algebra 配置，模糊音设置已锁定以避免覆盖");
  const allowed = new Set<string>(draft.fuzzyOptionIds);
  const normalized = FUZZY_SOUND_OPTIONS
    .map((item) => item.id)
    .filter((id) => allowed.has(id) && enabled.includes(id));
  return { ...draft, fuzzyEnabled: normalized };
}

export function schemeSwitchDraftDirty(draft: SchemeSwitchDraft | null): boolean {
  if (!draft) return false;
  if (draft.switches.some((item) => !isRuntimeOwnedSchemeSwitch(draft.scheme.id, item) && draft.values[item.id] !== draft.baseValues[item.id])) return true;
  if (draft.supportedScalars.some((path) => draft.scalarValues[path] !== draft.baseScalarValues[path])) return true;
  if (draft.supportedLists.some((path) => !sameStringArray(draft.listValues[path], draft.baseListValues[path]))) return true;
  return !sameStringArray(draft.fuzzyEnabled, draft.baseFuzzyEnabled);
}

export function scalarSettingDescriptor(path: string): SchemeScalarSettingDescriptor | null {
  return SCHEME_SCALAR_SETTINGS.find((item) => item.path === path) ?? null;
}

export function validateSchemeScalarValue(setting: SchemeScalarSettingDescriptor, rawValue: string): string | null {
  const value = rawValue.trim();
  if (setting.kind === "boolean") {
    if (value !== "true" && value !== "false") return `${setting.title}必须是开启或关闭。`;
  }
  if (setting.kind === "integer") {
    if (!/^-?\d+$/.test(value)) return `${setting.title}必须是整数。`;
    if (setting.min != null && Number(value) < setting.min) return `${setting.title}不能小于 ${setting.min}。`;
  }
  if (setting.kind === "number") {
    if (!value || !Number.isFinite(Number(value))) return `${setting.title}必须是有效数字。`;
    if (setting.min != null && Number(value) < setting.min) return `${setting.title}不能小于 ${setting.min}。`;
  }
  if (setting.kind === "choice" && setting.choices && !setting.choices.some((item) => item.value === value)) {
    return `${setting.title}不是当前支持的选项。`;
  }
  if (setting.validation === "nonempty" && !value) return `${setting.title}不能为空。`;
  if (setting.validation === "comment-placeholder" && !value.includes("comment")) return `${setting.title}必须保留 comment 占位符。`;
  if (setting.validation === "percent-placeholder" && !value.includes("%s")) return `${setting.title}必须保留 %s 占位符。`;
  if (setting.validation === "repeated-limit" && !/^\d+,\d+$/.test(value)) return `${setting.title}必须使用类似 8,40 的格式。`;
  return null;
}

export function validateSchemeSwitchDraft(draft: SchemeSwitchDraft): string[] {
  const errors: string[] = [];
  for (const path of draft.supportedScalars) {
    if (draft.scalarValues[path] === draft.baseScalarValues[path]) continue;
    const descriptor = scalarSettingDescriptor(path);
    if (!descriptor) continue;
    const error = validateSchemeScalarValue(descriptor, draft.scalarValues[path] ?? "");
    if (error) errors.push(error);
  }
  if (!sameStringArray(draft.fuzzyEnabled, draft.baseFuzzyEnabled) && draft.fuzzyConflict) {
    errors.push("检测到已有手工 speller/algebra 配置，不能自动保存模糊音。 ");
  }
  return errors;
}

function ensureRootPatch(text: string): string {
  const trimmed = text.trimEnd();
  if (/^patch:\s*$/m.test(trimmed)) return `${trimmed}\n`;
  if (/^patch:\s*\S+/m.test(trimmed)) {
    throw new Error("custom.yaml 使用行内 patch 写法，暂不自动修改，请先改成标准多行 patch 格式");
  }
  return `${trimmed}${trimmed ? "\n\n" : ""}patch:\n`;
}

function upsertPatchReset(text: string, index: number, value: number): string {
  const key = `switches/@${index}/reset`;
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`^(\\s{2})\"${escaped}\"\\s*:\\s*[^#\\n]+?(\\s*(?:#.*)?)$`, "m"),
    new RegExp(`^(\\s{2})'${escaped}'\\s*:\\s*[^#\\n]+?(\\s*(?:#.*)?)$`, "m"),
    new RegExp(`^(\\s{2})${escaped}\\s*:\\s*[^#\\n]+?(\\s*(?:#.*)?)$`, "m")
  ];
  for (const pattern of patterns) {
    if (pattern.test(text)) return text.replace(pattern, `$1\"${key}\": ${value}$2`);
  }
  const normalized = ensureRootPatch(text);
  return normalized.replace(/^patch:\s*$/m, `patch:\n  \"${key}\": ${value}`);
}

function removePatchEntry(text: string, key: string): string {
  const escaped = escapeRegex(key);
  const patterns = [
    new RegExp(`^\\s{2}"${escaped}"\\s*:`),
    new RegExp(`^\\s{2}'${escaped}'\\s*:`),
    new RegExp(`^\\s{2}${escaped}\\s*:`)
  ];
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (!skipping && patterns.some((pattern) => pattern.test(line))) {
      skipping = true;
      continue;
    }
    if (skipping) {
      if (/^\s{4,}\S/.test(line) || /^\s*$/.test(line) || /^\s{4,}#/.test(line)) continue;
      skipping = false;
    }
    out.push(line);
  }
  return out.join("\n");
}

function yamlScalar(value: string): string {
  const normalized = value.trim();
  if (normalized === "true" || normalized === "false" || /^-?\d+(?:\.\d+)?$/.test(normalized)) return normalized;
  return JSON.stringify(normalized);
}

function upsertPatchScalar(text: string, key: string, value: string): string {
  const withoutExisting = removePatchEntry(text, key);
  const normalized = ensureRootPatch(withoutExisting);
  return normalized.replace(/^patch:\s*$/m, `patch:\n  "${key}": ${yamlScalar(value)}`);
}

function upsertPatchList(text: string, key: string, values: string[]): string {
  const withoutExisting = removePatchEntry(text, key);
  const normalized = ensureRootPatch(withoutExisting);
  const lines = values.length === 0
    ? [`  "${key}": []`]
    : [`  "${key}":`, ...values.map((value) => `    - ${JSON.stringify(value)}`)];
  return normalized.replace(/^patch:\s*$/m, `patch:\n${lines.join("\n")}`);
}

function insertT9FuzzyRules(base: string[], enabled: string[]): string[] {
  const selected = FUZZY_SOUND_OPTIONS.filter((item) => enabled.includes(item.id));
  const additions: string[] = [];
  for (const item of selected) {
    for (const rule of item.rules) {
      if (!base.includes(rule) && !additions.includes(rule)) additions.push(rule);
    }
  }
  if (additions.length === 0) return base.slice();
  let insertAt = base.findIndex((item) => /derive\/\^\(\.\*\)\$\/\\U\$1\//.test(item));
  if (insertAt < 0) insertAt = base.findIndex((item) => item.includes("xlit/ABCDEFGHIJKLMNOPQRSTUVWXYZ/"));
  if (insertAt < 0) insertAt = base.length;
  return [...base.slice(0, insertAt), ...additions, ...base.slice(insertAt)];
}

function applyFuzzyPatch(text: string, draft: SchemeSwitchDraft): string {
  if (sameStringArray(draft.fuzzyEnabled, draft.baseFuzzyEnabled)) return text;
  if (draft.fuzzyConflict) throw new Error("检测到已有手工 speller/algebra 配置，不能覆盖模糊音规则");

  let next = removeManagedFuzzyMarker(text);
  next = removePatchEntry(next, "speller/algebra");
  if (draft.fuzzyEnabled.length === 0) return next.replace(/\n{3,}/g, "\n\n");

  const normalized = ensureRootPatch(next);
  const marker = `  # ${FUZZY_MARKER}: ${draft.fuzzyEnabled.join(",")}`;
  if (draft.fuzzyMode === "wanxiang_refs") {
    const selectedRefs = FUZZY_SOUND_OPTIONS
      .filter((item) => draft.fuzzyEnabled.includes(item.id))
      .map((item) => item.ref);
    const baseRefs = draft.baseAlgebraRefs.filter((ref) => !ref.includes("/模糊音"));
    const refs = [...selectedRefs, ...baseRefs];
    const lines = [marker, `  "speller/algebra":`, "    __patch:", ...refs.map((ref) => `      - ${ref}`)];
    return normalized.replace(/^patch:\s*$/m, `patch:\n${lines.join("\n")}`);
  }
  if (draft.fuzzyMode === "wanxiang_t9_materialized") {
    const algebra = insertT9FuzzyRules(draft.baseAlgebra, draft.fuzzyEnabled);
    const lines = [marker, `  "speller/algebra":`, ...algebra.map((rule) => `    - ${JSON.stringify(rule)}`)];
    return normalized.replace(/^patch:\s*$/m, `patch:\n${lines.join("\n")}`);
  }
  return next;
}

function renderSchemeSwitchCustomText(draft: SchemeSwitchDraft): string {
  let next = draft.customText;
  for (const descriptor of draft.switches) {
    if (isRuntimeOwnedSchemeSwitch(draft.scheme.id, descriptor)) continue;
    const value = draft.values[descriptor.id];
    const base = draft.baseValues[descriptor.id];
    if (!Number.isFinite(value) || value === base) continue;
    next = upsertPatchReset(next, descriptor.index, value);
  }
  for (const path of draft.supportedScalars) {
    const value = draft.scalarValues[path];
    const base = draft.baseScalarValues[path];
    if (value == null || value === base) continue;
    next = upsertPatchScalar(next, path, value);
  }
  for (const path of draft.supportedLists) {
    const value = draft.listValues[path] ?? [];
    const base = draft.baseListValues[path] ?? [];
    if (sameStringArray(value, base)) continue;
    next = upsertPatchList(next, path, value);
  }
  next = applyFuzzyPatch(next, draft);
  return next;
}

export function commitSchemeSwitchDraft(draft: SchemeSwitchDraft): SchemeSwitchDraft {
  const errors = validateSchemeSwitchDraft(draft);
  if (errors.length > 0) throw new Error(errors[0]);
  const nextText = renderSchemeSwitchCustomText(draft);
  writeRimeText(draft.scheme.customPath, nextText);
  return loadSchemeSwitchDraft(draft.scheme);
}

export function switchChoiceLabels(descriptor: SchemeSwitchDescriptor): string[] {
  if (descriptor.states.length > 0) return descriptor.states.slice();
  if (descriptor.kind === "options" && descriptor.options.length > 0) return descriptor.options.slice();
  return ["关闭", "开启"];
}

export function switchDisplayTitle(descriptor: SchemeSwitchDescriptor): string {
  if (descriptor.kind === "name") {
    const titles: Record<string, string> = {
      ascii_mode: "默认输入语言",
      ascii_punct: "标点模式",
      full_shape: "字符宽度",
      simplification: "简繁输出",
      traditionalization: "简繁输出",
      emoji: "Emoji 候选",
      chinese_english: "中英翻译候选",
      charset_filter: "字符集范围",
      context_reorder: "上下文调频",
      super_tips: "超级提示",
      abbrev: "简码",
      char_priority: "候选优先",
      english: "英文候选",
      search_single_char: "辅码查词单字优先"
    };
    return titles[descriptor.id] ?? "";
  }
  const key = descriptor.options.join("|");
  const titles: Record<string, string> = {
    "raw_input|tone_display|full_pinyin": "预编辑显示",
    "comment_off|tone_hint|toneless_hint": "候选注释",
    "s2s|s2t|s2hk|s2tw": "简繁输出"
  };
  return titles[key] ?? "";
}

export function isKnownSchemeSwitch(descriptor: SchemeSwitchDescriptor): boolean {
  return switchDisplayTitle(descriptor).length > 0;
}
