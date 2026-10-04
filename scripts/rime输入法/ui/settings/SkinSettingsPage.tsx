import { List, Picker, Section, Text, useState } from "scripting";
import type { SkinId } from "../../contracts/skin";
import { readKeyboardSettings, writeKeyboardSettings } from "../../settings/keyboardSettings";
import { SKIN_OPTIONS } from "../../skin/registry";

export function SkinSettingsPage() {
  const initial = readKeyboardSettings();
  const [skinId, setSkinId] = useState<SkinId>(initial.skinId);
  const [status, setStatus] = useState("");
  const selected = SKIN_OPTIONS.find((item) => item.id === skinId) ?? SKIN_OPTIONS[0];

  function changeSkin(value: string) {
    const target = SKIN_OPTIONS.find((item) => item.id === value);
    if (!target) return;
    const current = readKeyboardSettings();
    if (!writeKeyboardSettings({ ...current, skinId: target.id })) {
      setStatus("保存皮肤设置失败。");
      return;
    }
    setSkinId(target.id);
    setStatus("下次唤起键盘后生效。");
  }

  return (
    <List navigationTitle="皮肤管理">
      <Section
        header={<Text>当前皮肤</Text>}
        footer={<Text>皮肤切换不会修改输入方案或按键功能；重新唤起键盘后生效。</Text>}
      >
        <Picker title="键盘皮肤" value={skinId} onChanged={changeSkin}>
          {SKIN_OPTIONS.map((item) => (
            <Text key={item.id} tag={item.id}>{item.title}</Text>
          ))}
        </Picker>
        {status ? <Text foregroundStyle="secondaryLabel">{status}</Text> : null}
      </Section>

      <Section header={<Text>皮肤说明</Text>}>
        <Text>{selected.description}</Text>
      </Section>
    </List>
  );
}
