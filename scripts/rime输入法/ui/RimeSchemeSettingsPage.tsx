import type { RuntimeSchemaLike } from "../core/rime/SchemeCatalog";
import {
  Button,
  HStack,
  List,
  NavigationLink,
  Picker,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  useEffect,
  useState,
  VStack
} from "scripting";
import {
  FUZZY_SOUND_OPTIONS,
  SCHEME_SCALAR_SETTINGS,
  SUPER_TIPS_TYPES,
  commitSchemeSwitchDraft,
  isKnownSchemeSwitch,
  isRuntimeOwnedSchemeSwitch,
  listConfigurableSchemes,
  loadSchemeSwitchDraft,
  scalarSettingDescriptor,
  schemeSwitchDraftDirty,
  switchChoiceLabels,
  switchDisplayTitle,
  updateSchemeFuzzyDraft,
  updateSchemeListDraft,
  updateSchemeScalarDraft,
  updateSchemeSwitchDraft,
  validateSchemeScalarValue,
  validateSchemeSwitchDraft,
  type SchemeDescriptor,
  type SchemeScalarSettingDescriptor,
  type SchemeScalarSettingGroup,
  type SchemeSwitchDescriptor,
  type SchemeSwitchDraft
} from "../settings/scheme/rimeSchemeSettings";

async function runtimeSchemas(): Promise<RuntimeSchemaLike[]> {
  const rime = (globalThis as any).Rime;
  if (!rime) return [];
  try {
    if (!rime.isSetUp && typeof rime.setup === "function") await rime.setup();
    if (typeof rime.listSchemas !== "function") return [];
    return await rime.listSchemas();
  } catch {
    return [];
  }
}

function binarySwitchEnabled(draft: SchemeSwitchDraft, item: SchemeSwitchDescriptor): boolean {
  return (draft.values[item.id] ?? item.defaultIndex) > 0;
}

function boolValue(value: string): boolean {
  return value.trim().toLowerCase() === "true";
}

function standardTipsDisabled(values: string[]): string[] {
  const known = new Set<string>(SUPER_TIPS_TYPES as readonly string[]);
  const unknown = values.filter((value) => !known.has(value));
  const selected = SUPER_TIPS_TYPES.filter((type) => values.includes(type));
  return [...unknown, ...selected];
}

function displayScalarValue(draft: SchemeSwitchDraft, setting: SchemeScalarSettingDescriptor): string {
  const value = String(draft.scalarValues[setting.path] ?? "");
  if (setting.kind === "boolean") return boolValue(value) ? "开启" : "关闭";
  if (setting.kind === "choice") return setting.choices?.find((item) => item.value === value)?.title ?? "方案自定义值";
  return value;
}

function ScalarEditPage(props: {
  setting: SchemeScalarSettingDescriptor;
  value: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(props.value);
  const [status, setStatus] = useState("");

  function save() {
    const normalized = value.trim();
    const error = validateSchemeScalarValue(props.setting, normalized);
    if (error) {
      setStatus(error);
      return;
    }
    props.onSave(normalized);
    setStatus("已加入方案草稿；返回方案页后点击右上角“确定”才会写入 custom.yaml。");
  }

  return (
    <List navigationTitle={props.setting.title} navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{props.setting.help ?? "修改只进入当前方案草稿，不会立即写入 Rime 配置。"}</Text>}>
        <TextField title="" value={value} prompt="" onChanged={setValue} />
      </Section>
      <Section>
        <Button title="完成" systemImage="checkmark" action={save} />
      </Section>
      {status ? <Section><Text foregroundStyle="secondaryLabel">{status}</Text></Section> : null}
    </List>
  );
}

function ScalarNavigationRow(props: {
  draft: SchemeSwitchDraft;
  setting: SchemeScalarSettingDescriptor;
  onChanged: (next: SchemeSwitchDraft) => void;
}) {
  const value = String(props.draft.scalarValues[props.setting.path] ?? "");
  return (
    <NavigationLink
      destination={(
        <ScalarEditPage
          setting={props.setting}
          value={value}
          onSave={(nextValue) => props.onChanged(updateSchemeScalarDraft(props.draft, props.setting.path, nextValue))}
        />
      )}
    >
      <HStack spacing={10} frame={{ maxWidth: "infinity" as any }}>
        <Text>{props.setting.title}</Text>
        <Spacer />
        <Text foregroundStyle="secondaryLabel" lineLimit={1}>{displayScalarValue(props.draft, props.setting)}</Text>
      </HStack>
    </NavigationLink>
  );
}

function ScalarControlRow(props: {
  key?: string;
  draft: SchemeSwitchDraft;
  setting: SchemeScalarSettingDescriptor;
  onChanged: (next: SchemeSwitchDraft) => void;
}) {
  const { setting, draft } = props;
  const value = String(draft.scalarValues[setting.path] ?? "");
  if (setting.kind === "boolean") {
    return (
      <Toggle
        title={setting.title}
        value={boolValue(value)}
        onChanged={(enabled) => props.onChanged(updateSchemeScalarDraft(draft, setting.path, String(enabled)))}
      />
    );
  }
  if (setting.kind === "choice" && setting.choices?.some((item) => item.value === value)) {
    return (
      <Picker
        title={setting.title}
        value={value}
        onChanged={(next) => props.onChanged(updateSchemeScalarDraft(draft, setting.path, String(next)))}
        pickerStyle="menu"
      >
        {setting.choices.map((item) => <Text key={`${setting.path}-${item.value}`} tag={item.value}>{item.title}</Text>)}
      </Picker>
    );
  }
  return <ScalarNavigationRow draft={draft} setting={setting} onChanged={props.onChanged} />;
}

function StringListEditPage(props: {
  title: string;
  values: string[];
  footer: string;
  onSave: (values: string[]) => void;
}) {
  const [values, setValues] = useState(props.values.slice());
  const [saved, setSaved] = useState(false);

  function updateItem(index: number, value: string) {
    setValues((current) => current.map((item, itemIndex) => itemIndex === index ? value : item));
    setSaved(false);
  }

  function removeItem(index: number) {
    setValues((current) => current.filter((_, itemIndex) => itemIndex !== index));
    setSaved(false);
  }

  function finish() {
    props.onSave(values.map((item) => item.trim()).filter(Boolean));
    setSaved(true);
  }

  return (
    <List navigationTitle={props.title} navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{props.footer}</Text>}>
        {values.map((value, index) => (
          <HStack key={`${index}-${values.length}`} spacing={8}>
            <TextField title={`第 ${index + 1} 组`} value={value} prompt="" onChanged={(next) => updateItem(index, next)} />
            <Button title="" systemImage="trash" role="destructive" action={() => removeItem(index)} />
          </HStack>
        ))}
        <Button title="添加一组" systemImage="plus" action={() => { setValues((current) => [...current, ""]); setSaved(false); }} />
      </Section>
      <Section>
        <Button title="完成" systemImage="checkmark" action={finish} />
      </Section>
      {saved ? <Section><Text foregroundStyle="secondaryLabel">已加入方案草稿；最终仍由方案页右上角“确定”统一写入。</Text></Section> : null}
    </List>
  );
}

function AdvancedSettingsPage(props: {
  draft: SchemeSwitchDraft;
  onChanged: (next: SchemeSwitchDraft) => void;
}) {
  const draft = props.draft;

  function apply(next: SchemeSwitchDraft) {
    props.onChanged(next);
  }

  const supported = SCHEME_SCALAR_SETTINGS.filter(
    (item) => item.tier === "advanced" && draft.supportedScalars.includes(item.path)
  );
  const group = (name: SchemeScalarSettingGroup) => supported.filter((item) => item.group === name);
  const learning = group("learning");
  const phrases = group("phrases");
  const english = group("english");
  const context = group("context");
  const comment = group("comment");
  const lookup = group("lookup");
  const grammar = group("grammar");
  const input = group("input");
  const supportsContextClassifiers = draft.supportedLists.includes("context_reorder/custom_classifiers");
  const hasAnything = supported.length > 0 || supportsContextClassifiers;

  return (
    <List navigationTitle="高级设置" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>这里只放专业参数。所有修改仍属于同一份方案草稿；退出而不点击上一级方案页“确定”不会写入 custom.yaml。</Text>}>
        <Text>当前方案：{draft.scheme.name}</Text>
      </Section>

      {learning.length > 0
        ? (
          <Section header={<Text>词库学习与候选</Text>} footer={<Text>影响学习、造句、模型建议与主翻译器候选权重。</Text>}>
            {learning.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {phrases.length > 0
        ? (
          <Section header={<Text>自定义短语与简码</Text>} footer={<Text>这些参数直接控制方案现有的短语和简码翻译器，不创建第二套词库。</Text>}>
            {phrases.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {english.length > 0
        ? (
          <Section header={<Text>英文与中英混输</Text>} footer={<Text>当前 schema 实际声明对应参数时才显示。</Text>}>
            {english.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {context.length > 0 || supportsContextClassifiers
        ? (
          <Section header={<Text>上下文调频</Text>} footer={<Text>调整上下文有效时间、无上下文回退策略以及量词分类。</Text>}>
            {context.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
            {supportsContextClassifiers
              ? (
                <NavigationLink
                  destination={(
                    <StringListEditPage
                      title="量词分类"
                      values={draft.listValues["context_reorder/custom_classifiers"] ?? []}
                      footer="每一组是一串同类量词；修改的是 context_reorder/custom_classifiers。"
                      onSave={(values) => apply(updateSchemeListDraft(draft, "context_reorder/custom_classifiers", values))}
                    />
                  )}
                >
                  <HStack spacing={10} frame={{ maxWidth: "infinity" as any }}>
                    <Text>量词分类</Text>
                    <Spacer />
                    <Text foregroundStyle="secondaryLabel">{(draft.listValues["context_reorder/custom_classifiers"] ?? []).length} 组</Text>
                  </HStack>
                </NavigationLink>
              )
              : <Text foregroundStyle="secondaryLabel">当前方案没有量词分类列表。</Text>}
          </Section>
        )
        : null}

      {comment.length > 0
        ? (
          <Section header={<Text>超级注释</Text>} footer={<Text>包括辅助码提示、纠错格式与声调注释处理。</Text>}>
            {comment.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {lookup.length > 0
        ? (
          <Section header={<Text>反查与 Emoji</Text>} footer={<Text>控制输入中反查和候选注释继承等细节。</Text>}>
            {lookup.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {grammar.length > 0
        ? (
          <Section header={<Text>语法模型</Text>} footer={<Text>这些权重会直接改变长词与组合候选排序，建议仅在明确知道影响时修改。</Text>}>
            {grammar.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {input.length > 0
        ? (
          <Section header={<Text>输入行为</Text>} footer={<Text>九键 schema 明确标注“莫动”的退格限制、分词循环、声调回退和小键盘模式不会暴露在这里。</Text>}>
            {input.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={apply} />)}
          </Section>
        )
        : null}

      {!hasAnything
        ? <Section><Text foregroundStyle="secondaryLabel">当前方案没有已验证的高级设置。</Text></Section>
        : null}
    </List>
  );
}

function FuzzySoundPage(props: {
  draft: SchemeSwitchDraft;
  onChanged: (next: SchemeSwitchDraft) => void;
}) {
  const draft = props.draft;

  function apply(next: SchemeSwitchDraft) {
    props.onChanged(next);
  }

  const options = FUZZY_SOUND_OPTIONS.filter((item) => draft.fuzzyOptionIds.includes(item.id));

  return (
    <List navigationTitle="模糊音" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>{draft.scheme.id === "wanxiang_t9" ? "九键使用冻结版已经验证过的规则插入位置：模糊音规则位于字母转数字之前；不会改动 T9Bridge 或数字→拼音事务。" : "全拼按当前万象官方方式引用 wanxiang_algebra 中的预设模糊音段。"}</Text>}>
        <Text>按自己的发音习惯开启需要的组合，不建议无差别全部打开。</Text>
      </Section>

      {draft.fuzzyConflict
        ? (
          <Section header={<Text>已锁定</Text>} footer={<Text>检测到 custom.yaml 已有手工 speller/algebra 配置。为避免覆盖你的拼写规则，本页不会自动修改。</Text>}>
            <Text foregroundStyle="secondaryLabel">请先保留现有手工配置；其他方案设置仍可正常使用。</Text>
          </Section>
        )
        : (
          <Section header={<Text>可用模糊音</Text>} footer={<Text>修改只进入草稿；最终在方案页点击“确定”后写入，重新部署 Rime 后生效。</Text>}>
            {options.map((item) => (
              <Toggle
                key={item.id}
                title={item.title}
                value={draft.fuzzyEnabled.includes(item.id)}
                onChanged={(enabled) => {
                  const next = new Set<string>(draft.fuzzyEnabled);
                  if (enabled) next.add(item.id); else next.delete(item.id);
                  apply(updateSchemeFuzzyDraft(draft, Array.from(next)));
                }}
              />
            ))}
          </Section>
        )}
    </List>
  );
}

function SuperTipsDetailPage(props: {
  draft: SchemeSwitchDraft;
  onChanged: (next: SchemeSwitchDraft) => void;
}) {
  const draft = props.draft;
  const tipsKeyPath = "super_tips/tips_key";
  const disabledTypesPath = "super_tips/disabled_types";
  const tipsKeySetting = scalarSettingDescriptor(tipsKeyPath);
  const supportsTipsKey = draft.supportedScalars.includes(tipsKeyPath) && tipsKeySetting != null;
  const supportsDisabledTypes = draft.supportedLists.includes(disabledTypesPath);
  const disabledTypes = draft.listValues[disabledTypesPath] ?? [];

  function apply(next: SchemeSwitchDraft) {
    props.onChanged(next);
  }

  return (
    <List navigationTitle="超级提示" navigationBarTitleDisplayMode="inline">
      <Section header={<Text>展开方式</Text>} footer={<Text>提示展开键由方案的 super_tips/tips_key 控制。</Text>}>
        {supportsTipsKey && tipsKeySetting
          ? <ScalarNavigationRow draft={draft} setting={tipsKeySetting} onChanged={apply} />
          : <Text foregroundStyle="secondaryLabel">当前方案没有声明提示展开键。</Text>}
      </Section>

      <Section header={<Text>提示类型</Text>} footer={<Text>关闭的类型写入 super_tips/disabled_types；重新部署后生效。</Text>}>
        {supportsDisabledTypes
          ? SUPER_TIPS_TYPES.map((type) => (
            <Toggle
              key={type}
              title={`显示${type}提示`}
              value={!disabledTypes.includes(type)}
              onChanged={(enabled) => {
                const next = new Set<string>(disabledTypes);
                if (enabled) next.delete(type); else next.add(type);
                apply(updateSchemeListDraft(draft, disabledTypesPath, standardTipsDisabled(Array.from(next))));
              }}
            />
          ))
          : <Text foregroundStyle="secondaryLabel">当前方案没有声明可配置的提示类型列表。</Text>}
      </Section>
    </List>
  );
}

function SchemeSwitchEditor(props: { scheme: SchemeDescriptor }) {
  const [draft, setDraft] = useState<SchemeSwitchDraft | null>(null);
  const [status, setStatus] = useState("读取中…");

  useEffect(() => {
    try {
      const loaded = loadSchemeSwitchDraft(props.scheme);
      setDraft(loaded);
      setStatus(loaded.switches.length === 0 ? "当前方案没有可直接编辑的 switches。" : "");
    } catch (error) {
      setStatus(`读取失败：${String((error as any)?.message ?? error)}`);
    }
  }, [props.scheme.id]);

  if (!draft) {
    return (
      <List navigationTitle={props.scheme.name} navigationBarTitleDisplayMode="inline">
        <Section><Text foregroundStyle="secondaryLabel">{status}</Text></Section>
      </List>
    );
  }

  function commit() {
    try {
      const errors = validateSchemeSwitchDraft(draft);
      if (errors.length > 0) {
        setStatus(`未保存：${errors[0]}`);
        return;
      }
      const saved = commitSchemeSwitchDraft(draft);
      setDraft(saved);
      setStatus("已写入 custom.yaml；需要生效时请手动重新部署 Rime。");
    } catch (error) {
      setStatus(`保存失败：${String((error as any)?.message ?? error)}`);
    }
  }

  const dirty = schemeSwitchDraftDirty(draft);
  const knownSwitches = draft.switches.filter((item) => isKnownSchemeSwitch(item) && !isRuntimeOwnedSchemeSwitch(draft.scheme.id, item));
  const runtimeOwnedSwitchCount = draft.switches.filter((item) => isRuntimeOwnedSchemeSwitch(draft.scheme.id, item)).length;
  const unknownSwitchCount = draft.switches.filter(
    (item) => !isKnownSchemeSwitch(item) && !isRuntimeOwnedSchemeSwitch(draft.scheme.id, item)
  ).length;
  const basicScalars = SCHEME_SCALAR_SETTINGS.filter(
    (item) => item.tier === "basic" && draft.supportedScalars.includes(item.path)
  );
  const hasTipsDetails = draft.supportedScalars.includes("super_tips/tips_key") || draft.supportedLists.includes("super_tips/disabled_types");
  const hasAdvanced = SCHEME_SCALAR_SETTINGS.some(
    (item) => item.tier === "advanced" && draft.supportedScalars.includes(item.path)
  ) || draft.supportedLists.includes("context_reorder/custom_classifiers");

  return (
    <List
      navigationTitle={props.scheme.name}
      navigationBarTitleDisplayMode="inline"
      toolbar={{
        topBarTrailing: (
          <Button
            title="确定"
            systemImage={dirty ? "checkmark.circle.fill" : "checkmark.circle"}
            action={commit}
          />
        )
      }}
    >
      <Section
        header={<Text>方案</Text>}
        footer={<Text>本页和子页面只修改同一份草稿；点击右上角“确定”才一次写入 custom.yaml。{unknownSwitchCount > 0 ? ` 另有 ${unknownSwitchCount} 个未识别开关未自动暴露。` : ""}</Text>}
      >
        <VStack alignment="leading" spacing={2}>
          <Text>{props.scheme.name}</Text>
          <Text font="caption" foregroundStyle="secondaryLabel">{props.scheme.id}</Text>
          {runtimeOwnedSwitchCount > 0
            ? <Text font="caption" foregroundStyle="secondaryLabel">九键预编辑与候选注释由 Scripting T9 运行时契约固定，不在方案页重复控制。</Text>
            : null}
        </VStack>
      </Section>

      {knownSwitches.map((item) => {
        const title = switchDisplayTitle(item);
        if (item.id === "abbrev") {
          return (
            <Section key={`switch-${item.index}`} header={<Text>{title}</Text>} footer={<Text>对应方案自身的 abbrev 开关，不建立第二套简码逻辑。</Text>}>
              <Toggle
                title="启用简码"
                value={binarySwitchEnabled(draft, item)}
                onChanged={(enabled) => setDraft(updateSchemeSwitchDraft(draft, item.id, enabled ? 1 : 0))}
              />
            </Section>
          );
        }
        if (item.id === "super_tips") {
          return (
            <Section key={`switch-${item.index}`} header={<Text>{title}</Text>} footer={<Text>普通用户只需要控制总开关；触发键和提示类型放在详细设置中。</Text>}>
              <Toggle
                title="启用超级提示"
                value={binarySwitchEnabled(draft, item)}
                onChanged={(enabled) => setDraft(updateSchemeSwitchDraft(draft, item.id, enabled ? 1 : 0))}
              />
              {hasTipsDetails
                ? (
                  <NavigationLink destination={<SuperTipsDetailPage draft={draft} onChanged={setDraft} />}>
                    <Text>超级提示详细设置</Text>
                  </NavigationLink>
                )
                : <Text foregroundStyle="secondaryLabel">当前方案没有更多超级提示参数。</Text>}
            </Section>
          );
        }
        const labels = switchChoiceLabels(item);
        const value = String(draft.values[item.id] ?? item.defaultIndex);
        return (
          <Section key={`switch-${item.index}`} header={<Text>{title}</Text>}>
            <Picker
              title="状态"
              value={value}
              onChanged={(next) => setDraft(updateSchemeSwitchDraft(draft, item.id, Number(next)))}
              pickerStyle="menu"
            >
              {labels.map((label, index) => <Text key={`${item.index}-${index}`} tag={String(index)}>{label}</Text>)}
            </Picker>
          </Section>
        );
      })}

      {basicScalars.length > 0
        ? (
          <Section header={<Text>常用输入设置</Text>} footer={<Text>这些直接对应当前方案主翻译器的常用参数。</Text>}>
            {basicScalars.map((setting) => <ScalarControlRow key={setting.path} draft={draft} setting={setting} onChanged={setDraft} />)}
          </Section>
        )
        : null}

      <Section header={<Text>更多方案设置</Text>} footer={<Text>模糊音属于常用个性化能力；复杂参数统一收进“高级设置”。</Text>}>
        {draft.fuzzySupported
          ? (
            <NavigationLink destination={<FuzzySoundPage draft={draft} onChanged={setDraft} />}>
              <HStack spacing={10} frame={{ maxWidth: "infinity" as any }}>
                <Text>模糊音</Text>
                <Spacer />
                <Text foregroundStyle="secondaryLabel">{draft.fuzzyEnabled.length > 0 ? `${draft.fuzzyEnabled.length} 项已启用` : "未启用"}</Text>
              </HStack>
            </NavigationLink>
          )
          : <Text foregroundStyle="secondaryLabel">当前方案没有已验证的模糊音配置入口。</Text>}
        {hasAdvanced
          ? (
            <NavigationLink destination={<AdvancedSettingsPage draft={draft} onChanged={setDraft} />}>
              <Text>高级设置</Text>
            </NavigationLink>
          )
          : <Text foregroundStyle="secondaryLabel">当前方案没有已验证的高级参数。</Text>}
      </Section>

      {status ? <Section><Text foregroundStyle="secondaryLabel">{status}</Text></Section> : null}
    </List>
  );
}

export function RimeSchemeSettingsPage() {
  const [schemes, setSchemes] = useState<SchemeDescriptor[]>([]);
  const [status, setStatus] = useState("读取方案中…");

  useEffect(() => {
    void (async () => {
      const runtime = await runtimeSchemas();
      const list = await listConfigurableSchemes(runtime);
      setSchemes(list);
      setStatus(list.length ? "" : "shared 目录中没有找到当前模块可配置的 Rime 方案。");
    })();
  }, []);

  return (
    <List navigationTitle="方案设置" navigationBarTitleDisplayMode="inline">
      <Section footer={<Text>这里配置 Rime 输入方案本身，不属于输入法全局设置。只显示当前 schema 已验证的普通设置和高级设置。</Text>}>
        {schemes.map((scheme) => (
          <NavigationLink key={scheme.id} destination={<SchemeSwitchEditor scheme={scheme} />}>
            <VStack alignment="leading" spacing={2}>
              <Text>{scheme.name}</Text>
              <Text font="caption" foregroundStyle="secondaryLabel">{scheme.id}</Text>
            </VStack>
          </NavigationLink>
        ))}
        {status ? <Text foregroundStyle="secondaryLabel">{status}</Text> : null}
      </Section>
    </List>
  );
}
