import {
  List,
  NavigationLink,
  Picker,
  Section,
  Text,
  useEffect,
  useState
} from "scripting";
import {
  readKeyboardSettings,
  writeKeyboardSettings,
  type ChineseLayoutId,
  type KeyboardSettings,
  type SchemePreferences
} from "../../settings/keyboardSettings";
import {
  isKeyboardCompatibleScheme,
  listInstalledRimeSchemes,
  type RimeSchemeDescriptor
} from "../../core/rime/SchemeCatalog";
import {
  effectiveEnabledSchemeIds,
  ensureSchemeEnabled
} from "../../settings/scheme/rimeSchemeManager";
import { RimeSchemeSettingsPage } from "../RimeSchemeSettingsPage";
import { KeyboardSettingsPage } from "./KeyboardSettingsPage";
import { SkinSettingsPage } from "./SkinSettingsPage";
import { FunctionInstructionsPage } from "./FunctionInstructionsPage";
import { ClipboardSettingsPage } from "./ClipboardSettingsPage";
import { CommonPhrasesSettingsPage } from "./CommonPhrasesSettingsPage";
import { WanxiangManagerPage } from "./WanxiangManagerPage";

function availableFor(
  layout: ChineseLayoutId,
  source: readonly RimeSchemeDescriptor[]
): RimeSchemeDescriptor[] {
  return source.filter((scheme) => scheme.layout === layout && isKeyboardCompatibleScheme(scheme));
}

export function SettingsHomePage() {
  const initial = readKeyboardSettings();
  const [chineseLayout, setChineseLayout] = useState<ChineseLayoutId>(initial.chineseLayout);
  const [schemes, setSchemes] = useState<SchemePreferences>({ ...initial.schemes });
  const [installedSchemes, setInstalledSchemes] = useState<RimeSchemeDescriptor[]>([]);
  const [schemeStatus, setSchemeStatus] = useState("读取可用方案中…");

  useEffect(() => {
    let disposed = false;
    void (async () => {
      try {
        const installed = (await listInstalledRimeSchemes()).filter(isKeyboardCompatibleScheme);
        const enabledOrder = await effectiveEnabledSchemeIds();
        const current = readKeyboardSettings();
        const resolved: SchemePreferences = { ...current.schemes };

        for (const layout of ["t9", "qwerty"] as const) {
          const options = availableFor(layout, installed);
          if (!options.length) continue;
          if (options.some((item) => item.id === resolved[layout])) continue;
          const enabled = enabledOrder
            .map((id) => options.find((item) => item.id === id) ?? null)
            .find((item): item is RimeSchemeDescriptor => item != null);
          resolved[layout] = enabled?.id ?? options[0].id;
        }

        const changed = resolved.t9 !== current.schemes.t9 || resolved.qwerty !== current.schemes.qwerty;
        if (changed) writeKeyboardSettings({ ...current, schemes: resolved });

        if (disposed) return;
        setInstalledSchemes(installed);
        setSchemes(resolved);
        setSchemeStatus(installed.length ? "" : "Rime/shared 中没有找到当前键盘可用的主输入方案。");
      } catch (error) {
        if (!disposed) setSchemeStatus(`读取方案失败：${String((error as any)?.message ?? error)}`);
      }
    })();
    return () => { disposed = true; };
  }, []);

  function preferredForLayout(layout: ChineseLayoutId): RimeSchemeDescriptor | null {
    const options = availableFor(layout, installedSchemes);
    if (!options.length) return null;
    return options.find((item) => item.id === schemes[layout]) ?? options[0] ?? null;
  }

  async function applyLayoutAndScheme(layout: ChineseLayoutId, schemaId: string) {
    const target = availableFor(layout, installedSchemes).find((item) => item.id === schemaId) ?? null;
    if (!target) {
      setSchemeStatus(layout === "t9" ? "没有找到当前键盘兼容的九键方案。" : "没有找到当前键盘兼容的 26 键方案。");
      return;
    }

    const before = readKeyboardSettings();
    const nextSchemes: SchemePreferences = { ...before.schemes, [layout]: target.id };
    const next: KeyboardSettings = { ...before, chineseLayout: layout, schemes: nextSchemes };
    if (!writeKeyboardSettings(next)) {
      setSchemeStatus("保存输入法设置失败。");
      return;
    }

    try {
      const result = await ensureSchemeEnabled(target.id);
      setChineseLayout(layout);
      setSchemes(nextSchemes);
      setSchemeStatus(result.changed
        ? `${target.name} 已加入 Rime schema_list；下次唤起键盘会自动部署并使用。`
        : "");
    } catch (error) {
      writeKeyboardSettings(before);
      setSchemeStatus(`启用方案失败：${String((error as any)?.message ?? error)}`);
    }
  }

  function changeChineseLayout(value: string) {
    const next: ChineseLayoutId = value === "qwerty" ? "qwerty" : "t9";
    const target = preferredForLayout(next);
    if (!target) {
      setSchemeStatus(next === "t9" ? "没有找到当前键盘兼容的九键方案。" : "没有找到当前键盘兼容的 26 键方案。");
      return;
    }
    void applyLayoutAndScheme(next, target.id);
  }

  function changeScheme(value: string) {
    void applyLayoutAndScheme(chineseLayout, value);
  }

  const currentAvailable = availableFor(chineseLayout, installedSchemes);
  const currentSchemeId = currentAvailable.some((item) => item.id === schemes[chineseLayout])
    ? schemes[chineseLayout]
    : currentAvailable[0]?.id ?? "";

  return (
    <List navigationTitle="Rime输入法">
      <Section header={<Text>键盘&方案</Text>}>
        <Picker
          title="中文布局"
          value={chineseLayout}
          onChanged={changeChineseLayout}
          pickerStyle="segmented"
        >
          <Text tag="t9">九键</Text>
          <Text tag="qwerty">26 键</Text>
        </Picker>
        {currentAvailable.length
          ? (
            <Picker title="输入方案" value={currentSchemeId} onChanged={changeScheme}>
              {currentAvailable.map((scheme) => (
                <Text key={scheme.id} tag={scheme.id}>{scheme.name}</Text>
              ))}
            </Picker>
          )
          : <Text foregroundStyle="secondaryLabel">当前布局没有可用方案。</Text>}
        {schemeStatus ? <Text foregroundStyle="secondaryLabel">{schemeStatus}</Text> : null}
        <NavigationLink title="方案下载&更新" destination={<WanxiangManagerPage />} />
        <NavigationLink title="方案设置" destination={<RimeSchemeSettingsPage />} />
        <NavigationLink title="键盘设置" destination={<KeyboardSettingsPage />} />
      </Section>

      <Section header={<Text>键盘皮肤</Text>}>
        <NavigationLink title="皮肤管理" destination={<SkinSettingsPage />} />
      </Section>

      <Section header={<Text>增强功能</Text>}>
        <NavigationLink title="剪贴板" destination={<ClipboardSettingsPage />} />
        <NavigationLink title="常用语" destination={<CommonPhrasesSettingsPage />} />
      </Section>

      <Section header={<Text>其他</Text>}>
        <NavigationLink title="功能指令" destination={<FunctionInstructionsPage />} />
        <Text>性能诊断</Text>
        <Text>Rime部署</Text>
      </Section>
    </List>
  );
}
