import { HStack, List, NavigationLink, Section, Slider, Text, TextField, Toggle, useState, VStack } from "scripting";
import {
  KEYBOARD_BODY_HEIGHT_MAX,
  KEYBOARD_BODY_HEIGHT_MIN,
  TOP_SURFACE_HEIGHT_MAX,
  TOP_SURFACE_HEIGHT_MIN
} from "../../contracts/layout";
import {
  readKeyboardSettings,
  writeKeyboardSettings,
  type KeyboardSettings
} from "../../settings/keyboardSettings";
import { resolveSkin } from "../../skin/registry";
import { KeyActionSettingsPage } from "./KeyActionSettingsPage";
import { ToolbarSettingsPage } from "./ToolbarSettingsPage";

export function KeyboardSettingsPage() {
  const initial = readKeyboardSettings();
  const skin = resolveSkin(initial.skinId);
  const [showActionHints, setShowActionHints] = useState(initial.keyFacePreferences.showActionHints);
  const [showSpaceLabel, setShowSpaceLabel] = useState(initial.keyFacePreferences.showSpaceLabel);
  const [spaceLabel, setSpaceLabel] = useState(initial.keyFacePreferences.spaceLabel);
  const [hapticsEnabled, setHapticsEnabled] = useState(initial.feedbackPreferences.hapticsEnabled);
  const [keyPopupEnabled, setKeyPopupEnabled] = useState(initial.feedbackPreferences.keyPopupEnabled);
  const [customKeyboardHeight, setCustomKeyboardHeight] = useState(initial.layoutPreferences.keyboardBodyHeightOverride != null);
  const [keyboardHeight, setKeyboardHeight] = useState(
    initial.layoutPreferences.keyboardBodyHeightOverride ?? skin.layoutDefaults.keyboardBodyHeight
  );
  const [customToolbarHeight, setCustomToolbarHeight] = useState(initial.layoutPreferences.topSurfaceHeightOverride != null);
  const [toolbarHeight, setToolbarHeight] = useState(
    initial.layoutPreferences.topSurfaceHeightOverride ?? skin.layoutDefaults.topSurfaceHeight
  );

  function persistKeyboardPatch(patch: Partial<KeyboardSettings>): boolean {
    const current = readKeyboardSettings();
    return writeKeyboardSettings({ ...current, ...patch });
  }


  function changeShowActionHints(value: boolean) {
    const current = readKeyboardSettings();
    const keyFacePreferences = { ...current.keyFacePreferences, showActionHints: value };
    if (!persistKeyboardPatch({ keyFacePreferences })) return;
    setShowActionHints(value);
  }

  function changeShowSpaceLabel(value: boolean) {
    const current = readKeyboardSettings();
    const keyFacePreferences = { ...current.keyFacePreferences, showSpaceLabel: value };
    if (!persistKeyboardPatch({ keyFacePreferences })) return;
    setShowSpaceLabel(value);
  }

  function changeHapticsEnabled(value: boolean) {
    const current = readKeyboardSettings();
    const feedbackPreferences = { ...current.feedbackPreferences, hapticsEnabled: value };
    if (!persistKeyboardPatch({ feedbackPreferences })) return;
    setHapticsEnabled(value);
  }

  function changeKeyPopupEnabled(value: boolean) {
    const current = readKeyboardSettings();
    const feedbackPreferences = { ...current.feedbackPreferences, keyPopupEnabled: value };
    if (!persistKeyboardPatch({ feedbackPreferences })) return;
    setKeyPopupEnabled(value);
  }


  function changeCustomKeyboardHeight(value: boolean) {
    const current = readKeyboardSettings();
    const layoutPreferences = { ...current.layoutPreferences };
    if (value) layoutPreferences.keyboardBodyHeightOverride = keyboardHeight;
    else delete layoutPreferences.keyboardBodyHeightOverride;
    if (!persistKeyboardPatch({ layoutPreferences })) return;
    setCustomKeyboardHeight(value);
  }

  function changeKeyboardHeight(value: number) {
    const next = Math.round(value);
    const current = readKeyboardSettings();
    const layoutPreferences = { ...current.layoutPreferences, keyboardBodyHeightOverride: next };
    if (!persistKeyboardPatch({ layoutPreferences })) return;
    setKeyboardHeight(next);
  }

  function changeCustomToolbarHeight(value: boolean) {
    const current = readKeyboardSettings();
    const layoutPreferences = { ...current.layoutPreferences };
    if (value) layoutPreferences.topSurfaceHeightOverride = toolbarHeight;
    else delete layoutPreferences.topSurfaceHeightOverride;
    if (!persistKeyboardPatch({ layoutPreferences })) return;
    setCustomToolbarHeight(value);
  }

  function changeToolbarHeight(value: number) {
    const next = Math.round(value);
    const current = readKeyboardSettings();
    const layoutPreferences = { ...current.layoutPreferences, topSurfaceHeightOverride: next };
    if (!persistKeyboardPatch({ layoutPreferences })) return;
    setToolbarHeight(next);
  }

  function HeightSlider(props: {
    title: string;
    value: number;
    min: number;
    max: number;
    onChanged: (value: number) => void;
  }) {
    return (
      <VStack alignment="leading" spacing={8}>
        <HStack>
          <Text>{props.title}</Text>
          <Text
            font="subheadline"
            foregroundStyle="secondaryLabel"
            frame={{ maxWidth: "infinity" as any, alignment: "trailing" as any }}
          >
            {`${props.value} pt`}
          </Text>
        </HStack>
        <Slider
          min={props.min}
          max={props.max}
          step={1}
          value={props.value}
          onChanged={props.onChanged}
          label={<Text>{props.title}</Text>}
          minValueLabel={<Text>{props.min}</Text>}
          maxValueLabel={<Text>{props.max}</Text>}
        />
      </VStack>
    );
  }

  function changeSpaceLabel(value: string) {
    const current = readKeyboardSettings();
    const keyFacePreferences = { ...current.keyFacePreferences, spaceLabel: value };
    if (!persistKeyboardPatch({ keyFacePreferences })) return;
    setSpaceLabel(value);
  }

  return (
    <List navigationTitle="键盘设置" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>输入反馈</Text>}
        footer={<Text>按键预览只控制字符键按下时的放大预览，不影响震动、按压反馈或输入事务。</Text>}
      >
        <Toggle
          title="按键震动反馈"
          value={hapticsEnabled}
          onChanged={changeHapticsEnabled}
        />
        <Toggle
          title="按键预览 Popup"
          value={keyPopupEnabled}
          onChanged={changeKeyPopupEnabled}
        />
      </Section>



      <Section
        header={<Text>布局尺寸</Text>}
        footer={<Text>未自定义时跟随当前皮肤默认值。键盘高度只调整按键区；工具栏与候选栏共用同一顶部高度，重新唤起键盘后生效。</Text>}
      >
        <Toggle
          title="自定义键盘高度"
          value={customKeyboardHeight}
          onChanged={changeCustomKeyboardHeight}
        />
        {customKeyboardHeight
          ? (
            <HeightSlider
              title="键盘高度"
              value={keyboardHeight}
              min={KEYBOARD_BODY_HEIGHT_MIN}
              max={KEYBOARD_BODY_HEIGHT_MAX}
              onChanged={changeKeyboardHeight}
            />
          )
          : null}
        <Toggle
          title="自定义工具栏高度"
          value={customToolbarHeight}
          onChanged={changeCustomToolbarHeight}
        />
        {customToolbarHeight
          ? (
            <HeightSlider
              title="工具栏高度"
              value={toolbarHeight}
              min={TOP_SURFACE_HEIGHT_MIN}
              max={TOP_SURFACE_HEIGHT_MAX}
              onChanged={changeToolbarHeight}
            />
          )
          : null}
      </Section>

      <Section
        header={<Text>动作与工具栏</Text>}
        footer={<Text>按键动作使用内置默认并允许覆盖；工具栏最多显示 8 个编辑工具。</Text>}
      >
        <NavigationLink title="按键动作" destination={<KeyActionSettingsPage />} />
        <NavigationLink title="工具栏" destination={<ToolbarSettingsPage />} />
      </Section>

      <Section header={<Text>基础键面</Text>}>
        <Toggle
          title="显示按键角标"
          value={showActionHints}
          onChanged={changeShowActionHints}
        />
        <Toggle
          title="空格显示自定义内容"
          value={showSpaceLabel}
          onChanged={changeShowSpaceLabel}
        />
        {showSpaceLabel
          ? (
            <TextField
              title="空格文字"
              value={spaceLabel}
              prompt="万象"
              onChanged={changeSpaceLabel}
            />
          )
          : null}
      </Section>
    </List>
  );
}
