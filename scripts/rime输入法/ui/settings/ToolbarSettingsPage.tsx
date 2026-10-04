import { Button, ForEach, HStack, Image, List, Section, Spacer, Text, useEffect, useObservable, useRef } from "scripting";
import { readKeyboardSettings, writeKeyboardSettings } from "../../settings/keyboardSettings";
import {
  appendToolbarTool,
  MAX_TOOLBAR_ITEMS,
  type ToolbarToolId
} from "../../settings/toolbarPreferences";
import { TOOLBAR_TOOL_CATALOG } from "../../keyboard/toolbar/toolCatalog";

const TITLE_BY_ID = new Map(TOOLBAR_TOOL_CATALOG.map((item) => [item.id, item.title] as const));

type ToolbarToolRow = {
  id: ToolbarToolId;
};

function rowsForIds(ids: readonly ToolbarToolId[]): ToolbarToolRow[] {
  return ids.map((id) => ({ id }));
}

export function ToolbarSettingsPage() {
  const initialItems = readKeyboardSettings().toolbarPreferences.items;
  const items = useObservable<ToolbarToolRow[]>(() => rowsForIds(initialItems));
  const currentIds = items.value.map((item) => item.id);
  const currentSignature = JSON.stringify(currentIds);
  const lastPersistedRef = useRef(JSON.stringify(initialItems));

  useEffect(() => {
    if (currentSignature === lastPersistedRef.current) return;

    const current = readKeyboardSettings();
    if (!writeKeyboardSettings({
      ...current,
      toolbarPreferences: { items: currentIds }
    })) return;

    lastPersistedRef.current = currentSignature;
  }, [currentSignature]);

  function add(id: ToolbarToolId) {
    if (!TITLE_BY_ID.has(id)) return;
    const currentIds = items.value.map((item) => item.id);
    const nextIds = appendToolbarTool(currentIds, id);
    if (nextIds.length === currentIds.length) return;
    items.setValue(rowsForIds(nextIds));
  }

  const available = TOOLBAR_TOOL_CATALOG.filter((item) => !currentIds.includes(item.id));
  const isFull = currentIds.length >= MAX_TOOLBAR_ITEMS;

  return (
    <List navigationTitle="工具栏" navigationBarTitleDisplayMode="inline">
      <Section
        header={<Text>已显示</Text>}
        footer={<Text>最多 8 个。长按拖动调整顺序；向左滑动删除。</Text>}
      >
        {items.value.length > 0 ? (
          <ForEach
            data={items}
            builder={(item) => (
              <HStack key={item.id} spacing={8}>
                <Text>{TITLE_BY_ID.get(item.id) ?? item.id}</Text>
                <Spacer />
                <Image systemName="line.3.horizontal" foregroundStyle="secondaryLabel" />
              </HStack>
            )}
            editActions="all"
          />
        ) : <Text foregroundStyle="secondaryLabel">工具区为空</Text>}
      </Section>

      <Section
        header={<Text>可添加工具</Text>}
        footer={<Text>{isFull ? "已达到 8 个上限。先从上方左滑删除一个工具。" : "点击右侧加号添加到工具栏。"}</Text>}
      >
        {available.length === 0
          ? <Text foregroundStyle="secondaryLabel">没有可添加工具</Text>
          : available.map((item) => (
            <HStack key={item.id}>
              <Text>{item.title}</Text>
              <Spacer />
              <Button
                key={`toolbar-add-${item.id}`}
                title=""
                systemImage="plus.circle"
                buttonStyle="plain"
                action={() => add(item.id)}
              />
            </HStack>
          ))}
      </Section>
    </List>
  );
}
