import {
  List,
  NavigationLink,
  Picker,
  Section,
  Text,
  TextField,
  useState
} from "scripting";
import type { KeyboardCommand } from "../../contracts/action";
import {
  readKeyboardSettings,
  writeKeyboardSettings,
  type ChineseLayoutId
} from "../../settings/keyboardSettings";
import type { T9CustomKeyActionMode } from "../../settings/t9CustomKeyPreferences";
import {
  functionInstructionForCommand,
  resolveFunctionInstruction
} from "../../settings/functionInstructions";
import { FunctionInstructionsPage } from "./FunctionInstructionsPage";
import {
  hasKeyGestureOverride,
  keyGestureOverride,
  withKeyGestureOverride,
  type ConfigurableKeyGesture,
  type KeyGestureActionOverride
} from "../../settings/keyActionPreferences";
import { defaultKeyGestureCommand } from "../../keyboard/actions/defaultKeyActions";
import { FROZEN_QWERTY_ROWS } from "../../layout/qwerty";
import { FROZEN_T9_ROWS } from "../../layout/t9";

type EditableMode = "default" | "none" | "rimeText" | "insertDirect" | "functionInstruction";
type T9CustomKeyEditorMode = T9CustomKeyActionMode | "functionInstruction";

type KeyDescriptor = {
  id: string;
  label: string;
};

type EditorState = {
  mode: EditableMode;
  text: string;
};

const EDITABLE_GESTURES: readonly ConfigurableKeyGesture[] = [
  "swipeUp",
  "swipeDown",
  "swipeLeft",
  "swipeRight",
  "longPress"
];

const GESTURE_TITLES: Readonly<Record<ConfigurableKeyGesture, string>> = {
  swipeUp: "上滑",
  swipeDown: "下滑",
  swipeLeft: "左滑",
  swipeRight: "右滑",
  longPress: "长按"
};

function keyRows(layout: ChineseLayoutId): readonly (readonly KeyDescriptor[])[] {
  if (layout === "t9") {
    return FROZEN_T9_ROWS.map((row) => row.map((item) => ({
      id: `t9-${item.digit}`,
      label: `${item.digit}  ${item.letters}`
    })));
  }
  return FROZEN_QWERTY_ROWS.map((row) => row.map((letter) => ({
    id: `letter-${letter}`,
    label: letter.toUpperCase()
  })));
}

function commandText(command: KeyboardCommand | null | undefined): string {
  if (!command) return "";
  return "text" in command ? command.text : "";
}

function commandDescription(command: KeyboardCommand | undefined): string {
  if (!command) return "无动作";
  if (command.type === "rimeText") return `交给 Rime · ${command.text}`;
  if (command.type === "insertDirect") return `直接输入 · ${command.text}`;
  return command.type;
}

function initialEditorState(
  layout: ChineseLayoutId,
  keyId: string,
  gesture: ConfigurableKeyGesture
): EditorState {
  const settings = readKeyboardSettings();
  const preferences = settings.actionPreferences;
  const fallback = defaultKeyGestureCommand(layout, keyId, gesture);
  if (!hasKeyGestureOverride(preferences, layout, keyId, gesture)) {
    return { mode: "default", text: commandText(fallback) };
  }
  const override = keyGestureOverride(preferences, layout, keyId, gesture);
  if (override === null) return { mode: "none", text: commandText(fallback) };
  if (override?.type === "insertDirect") return { mode: "insertDirect", text: override.text };
  if (override?.type === "rimeText") return { mode: "rimeText", text: override.text };
  const instruction = functionInstructionForCommand(override);
  if (instruction) return { mode: "functionInstruction", text: instruction };
  return { mode: "default", text: commandText(fallback) };
}

function overrideFor(mode: EditableMode, text: string): KeyGestureActionOverride | undefined {
  if (mode === "default") return undefined;
  if (mode === "none") return null;
  if (mode === "functionInstruction") return resolveFunctionInstruction(text) ?? undefined;
  if (text.length === 0) return undefined;
  return { type: mode, text };
}

function persistGesture(
  layout: ChineseLayoutId,
  keyId: string,
  gesture: ConfigurableKeyGesture,
  mode: EditableMode,
  text: string
): boolean {
  const current = readKeyboardSettings();
  const actionPreferences = withKeyGestureOverride(
    current.actionPreferences,
    layout,
    keyId,
    gesture,
    overrideFor(mode, text)
  );
  return writeKeyboardSettings({ ...current, actionPreferences });
}

function GestureEditor(props: {
  layout: ChineseLayoutId;
  keyId: string;
  gesture: ConfigurableKeyGesture;
  title: string;
}) {
  const initial = initialEditorState(props.layout, props.keyId, props.gesture);
  const [mode, setMode] = useState<EditableMode>(initial.mode);
  const [text, setText] = useState(initial.text);
  const defaultCommand = defaultKeyGestureCommand(props.layout, props.keyId, props.gesture);

  function changeMode(value: string) {
    const next: EditableMode = value === "none"
      || value === "rimeText"
      || value === "insertDirect"
      || value === "functionInstruction"
      ? value
      : "default";
    const nextText = next === "functionInstruction"
      ? (functionInstructionForCommand(defaultCommand) ?? "")
      : (text || commandText(defaultCommand));
    if (!persistGesture(props.layout, props.keyId, props.gesture, next, nextText)) return;
    setMode(next);
    if (nextText !== text) setText(nextText);
  }

  function changeText(value: string) {
    if (mode === "functionInstruction") {
      setText(value);
      if (!resolveFunctionInstruction(value)) return;
      void persistGesture(props.layout, props.keyId, props.gesture, mode, value);
      return;
    }
    if (!persistGesture(props.layout, props.keyId, props.gesture, mode, value)) return;
    setText(value);
  }

  return (
    <Section
      header={<Text>{props.title}</Text>}
      footer={<Text>{`默认：${commandDescription(defaultCommand)}`}</Text>}
    >
      <Picker title="动作" value={mode} onChanged={changeMode}>
        <Text tag="default">使用默认</Text>
        <Text tag="none">无动作</Text>
        <Text tag="rimeText">交给 Rime</Text>
        <Text tag="insertDirect">直接输入</Text>
        <Text tag="functionInstruction">功能指令</Text>
      </Picker>
      {mode === "rimeText" || mode === "insertDirect"
        ? (
          <TextField
            title="输入内容"
            value={text}
            prompt="输入字符或文本"
            onChanged={changeText}
          />
        )
        : null}
      {mode === "functionInstruction"
        ? (
          <>
            <TextField
              title="指令"
              value={text}
              prompt="例如 {copy}"
              onChanged={changeText}
            />
            <NavigationLink
              title="查看功能指令"
              destination={<FunctionInstructionsPage />}
            />
          </>
        )
        : null}
    </Section>
  );
}

function KeyActionEditorPage(props: {
  layout: ChineseLayoutId;
  keyId: string;
  label: string;
}) {
  return (
    <List navigationTitle={`${props.label} 动作`} navigationBarTitleDisplayMode="inline">
      {EDITABLE_GESTURES.map((gesture) => (
        <GestureEditor
          key={gesture}
          layout={props.layout}
          keyId={props.keyId}
          gesture={gesture}
          title={GESTURE_TITLES[gesture]}
        />
      ))}
    </List>
  );
}

export function KeyActionSettingsPage() {
  const initial = readKeyboardSettings();
  const [layout, setLayout] = useState<ChineseLayoutId>(initial.chineseLayout);
  const [t9CustomKeyLabel, setT9CustomKeyLabel] = useState(initial.t9CustomKeyPreferences.label);
  const [t9CustomKeyAction, setT9CustomKeyAction] = useState(initial.t9CustomKeyPreferences.action);
  const [t9CustomKeyMode, setT9CustomKeyMode] = useState<T9CustomKeyEditorMode>(
    initial.t9CustomKeyPreferences.mode === "auto"
      && resolveFunctionInstruction(initial.t9CustomKeyPreferences.action)
      ? "functionInstruction"
      : initial.t9CustomKeyPreferences.mode
  );
  const rows = keyRows(layout);

  function changeLayout(value: string) {
    setLayout(value === "qwerty" ? "qwerty" : "t9");
  }

  function persistT9CustomKey(
    patch: Partial<{ label: string; action: string; mode: T9CustomKeyActionMode }>
  ): boolean {
    const current = readKeyboardSettings();
    return writeKeyboardSettings({
      ...current,
      t9CustomKeyPreferences: { ...current.t9CustomKeyPreferences, ...patch }
    });
  }

  function changeT9CustomKeyLabel(value: string) {
    if (!persistT9CustomKey({ label: value })) return;
    setT9CustomKeyLabel(value);
  }

  function changeT9CustomKeyAction(value: string) {
    setT9CustomKeyAction(value);
    if (t9CustomKeyMode === "functionInstruction") {
      if (!resolveFunctionInstruction(value)) return;
      void persistT9CustomKey({ action: value, mode: "auto" });
      return;
    }
    void persistT9CustomKey({ action: value });
  }

  function changeT9CustomKeyMode(value: string) {
    if (value === "functionInstruction") {
      setT9CustomKeyMode("functionInstruction");
      if (resolveFunctionInstruction(t9CustomKeyAction)) {
        void persistT9CustomKey({ mode: "auto" });
      }
      return;
    }
    const mode: T9CustomKeyActionMode = value === "rime" || value === "direct"
      ? value
      : "auto";
    if (!persistT9CustomKey({ mode, action: t9CustomKeyAction })) return;
    setT9CustomKeyMode(mode);
  }

  return (
    <List navigationTitle="按键动作" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>布局</Text>}
        footer={<Text>修改保存为当前键的覆盖值；选择“使用默认”会删除覆盖并恢复内置默认。</Text>}
      >
        <Picker
          title="键盘"
          value={layout}
          onChanged={changeLayout}
          pickerStyle="segmented"
        >
          <Text tag="t9">九键</Text>
          <Text tag="qwerty">26 键</Text>
        </Picker>
      </Section>

      {layout === "t9"
        ? (
          <Section
            header={<Text>右侧自定义按键</Text>}
            footer={(
              <Text foregroundStyle="secondaryLabel">
                默认键面与动作均为单引号。自动模式先识别“功能指令”，其他文本交给 Rime；修改在下次唤起键盘时生效。
              </Text>
            )}
          >
            <TextField
              title="键面文本"
              value={t9CustomKeyLabel}
              prompt="'"
              onChanged={changeT9CustomKeyLabel}
            />
            <TextField
              title={t9CustomKeyMode === "functionInstruction" ? "功能指令" : "点击动作"}
              value={t9CustomKeyAction}
              prompt={t9CustomKeyMode === "functionInstruction" ? "例如 {copy}" : "'"}
              onChanged={changeT9CustomKeyAction}
            />
            <Picker title="发送方式" value={t9CustomKeyMode} onChanged={changeT9CustomKeyMode}>
              <Text tag="auto">自动</Text>
              <Text tag="rime">发送给 Rime</Text>
              <Text tag="direct">直接输入</Text>
              <Text tag="functionInstruction">功能指令</Text>
            </Picker>
            {t9CustomKeyMode === "functionInstruction"
              ? (
                <NavigationLink
                  title="查看功能指令"
                  destination={<FunctionInstructionsPage />}
                />
              )
              : null}
          </Section>
        )
        : null}

      {rows.map((row, rowIndex) => (
        <Section key={`${layout}-row-${rowIndex}`}>
          {row.map((key) => (
            <NavigationLink
              key={key.id}
              title={key.label}
              destination={(
                <KeyActionEditorPage
                  layout={layout}
                  keyId={key.id}
                  label={key.label}
                />
              )}
            />
          ))}
        </Section>
      ))}

      <Section footer={<Text>上、下、左、右滑与长按均可独立覆盖。没有内置默认的方向显示“默认：无动作”；恢复“使用默认”会删除该覆盖。</Text>}>
        <Text foregroundStyle="secondaryLabel">设置在下次唤起键盘时生效。</Text>
      </Section>
    </List>
  );
}
