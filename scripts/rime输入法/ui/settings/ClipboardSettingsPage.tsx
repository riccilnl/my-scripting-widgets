import { Button, HStack, List, Section, Text, useState } from "scripting";
import {
  CLIPBOARD_HISTORY_LIMIT,
  loadClipboardHistory,
  removeClipboardHistoryItem,
  saveClipboardHistory
} from "../../settings/clipboardHistory";

export function ClipboardSettingsPage() {
  const [items, setItems] = useState<string[]>(() => loadClipboardHistory());

  function persist(next: string[]) {
    const saved = saveClipboardHistory(next);
    if (saved) setItems(saved);
  }

  function remove(text: string) {
    persist(removeClipboardHistoryItem(items, text));
  }

  function clear() {
    persist([]);
  }

  return (
    <List navigationTitle="剪贴板" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>{`历史记录 ${items.length} / ${CLIPBOARD_HISTORY_LIMIT}`}</Text>}
        footer={<Text>打开键盘剪贴板时会读取当前系统剪贴板；通过本键盘复制、剪切或粘贴的文本也会进入历史。相同文本只保留最新一条。</Text>}
      >
        {items.length > 0
          ? items.map((text, index) => (
            <HStack key={`clipboard-setting-${index}-${text}`} spacing={8}>
              <Text lineLimit={2}>{text.replace(/\s+/g, " ")}</Text>
              <Button title="" systemImage="trash" role="destructive" action={() => remove(text)} />
            </HStack>
          ))
          : <Text foregroundStyle="secondaryLabel">暂无剪贴板记录</Text>}
      </Section>
      {items.length > 0
        ? (
          <Section>
            <Button title="清空历史" role="destructive" action={clear} />
          </Section>
        )
        : null}
    </List>
  );
}
