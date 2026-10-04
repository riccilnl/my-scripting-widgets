import {
  Button,
  Group,
  HStack,
  Image,
  ScrollView,
  Spacer,
  Text,
  useEffect,
  useState,
  VStack,
  ZStack
} from "scripting";
import type { CommonPhraseCategory } from "../../contracts/auxiliary";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";
import {
  loadClipboardHistory,
  loadVisibleCommonPhraseCategories,
  prependClipboardHistory,
  recordClipboardText,
  removeClipboardHistoryItem,
  saveClipboardHistory
} from "../runtime/AuxiliaryStorage";

export type AuxiliarySurfaceId = "clipboard" | "commonPhrases";

export function AuxiliarySurfaceHost(props: {
  surface: AuxiliarySurfaceId;
  skin: KeyboardSkin;
  colors: SkinColors;
  width: number;
  height: number;
  onClose: () => void;
  onInsertText: (text: string) => void;
  onHaptic: () => void;
}) {
  const [clipboardItems, setClipboardItems] = useState<string[]>([]);
  const [categories, setCategories] = useState<CommonPhraseCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState("");
  const headerHeight = 44;
  const horizontalInset = 10;
  const hitTargetSize = 44;
  const bodyHeight = Math.max(0, props.height - headerHeight);

  useEffect(() => {
    let disposed = false;
    if (props.surface === "clipboard") {
      let items = loadClipboardHistory();
      setClipboardItems(items);
      void Promise.resolve(Pasteboard.getString())
        .then((current) => {
          if (disposed || !current || !current.trim()) return;
          const next = prependClipboardHistory(items, current);
          items = saveClipboardHistory(next) ?? next;
          if (!disposed) setClipboardItems(items);
        })
        .catch(() => {});
    } else {
      const next = loadVisibleCommonPhraseCategories();
      setCategories(next);
      setSelectedCategoryId(next[0]?.id ?? "");
    }
    return () => { disposed = true; };
  }, [props.surface]);

  function selectClipboard(text: string) {
    if (!text) return;
    props.onHaptic();
    props.onInsertText(text);
    const next = recordClipboardText(text);
    if (next) setClipboardItems(next);
  }

  function deleteClipboard(text: string) {
    props.onHaptic();
    const next = removeClipboardHistoryItem(loadClipboardHistory(), text);
    setClipboardItems(saveClipboardHistory(next) ?? next);
  }

  function clearClipboard() {
    props.onHaptic();
    if (saveClipboardHistory([])) setClipboardItems([]);
  }

  function selectPhrase(text: string) {
    if (!text.trim()) return;
    props.onHaptic();
    props.onInsertText(text);
  }

  function header(title: string, trailing?: any) {
    return (
      <HStack
        spacing={0}
        padding={{ horizontal: horizontalInset }}
        frame={{ width: props.width, height: headerHeight }}
      >
        <ZStack
          frame={{ width: hitTargetSize, height: headerHeight }}
          background={"rgba(0,0,0,0.001)" as any}
          contentShape="rect"
          onTapGesture={props.onClose}
        >
          <ZStack
            frame={{ width: 36, height: headerHeight }}
            foregroundStyle={props.colors.foreground as any}
          >
            <Image systemName="chevron.left" font={18} />
          </ZStack>
        </ZStack>
        <Text font={16} fontWeight="semibold" foregroundStyle={props.colors.foreground as any}>
          {title}
        </Text>
        <Spacer />
        {trailing ?? null}
      </HStack>
    );
  }

  if (props.surface === "clipboard") {
    const rowWidth = Math.max(0, props.width - horizontalInset * 2);
    return (
      <VStack
        spacing={0}
        frame={{ width: props.width, height: props.height, alignment: "top" as any }}
        background={props.colors.keyboardBackground as any}
      >
        {header(
          "剪贴板",
          <ZStack
            frame={{ width: hitTargetSize, height: headerHeight }}
            background={"rgba(0,0,0,0.001)" as any}
            contentShape="rect"
            onTapGesture={clearClipboard}
          >
            <ZStack
              frame={{ width: 36, height: headerHeight }}
              foregroundStyle={props.colors.secondaryForeground as any}
            >
              <Image systemName="trash" font={17} />
            </ZStack>
          </ZStack>
        )}
        <ScrollView axes="vertical" scrollIndicator="visible" frame={{ width: props.width, height: bodyHeight }}>
          <VStack
            spacing={6}
            padding={{ horizontal: horizontalInset, top: 4, bottom: 10 }}
            frame={{ width: props.width, alignment: "top" as any }}
          >
            {clipboardItems.length > 0
              ? clipboardItems.map((text, index) => (
                <Text
                  key={`clipboard-${index}-${text}`}
                  font={props.skin.typography.contentPanel.row.fontSize}
                  lineLimit={3}
                  foregroundStyle={props.colors.foreground as any}
                  padding={{ horizontal: 10, vertical: 7 }}
                  frame={{ width: rowWidth, minHeight: 38, alignment: "leading" as any }}
                  background={props.colors.keyBackgrounds.normal as any}
                  clipShape={{ type: "rect", cornerRadius: props.skin.visuals.keyCornerRadius } as any}
                  contentShape="rect"
                  onTapGesture={() => selectClipboard(text)}
                  contextMenu={{
                    menuItems: (
                      <Group>
                        <Button title="删除" role="destructive" action={() => deleteClipboard(text)} />
                      </Group>
                    )
                  }}
                >
                  {text.replace(/\s+/g, " ")}
                </Text>
              ))
              : (
                <Text
                  font={props.skin.typography.status.fontSize}
                  foregroundStyle={props.colors.secondaryForeground as any}
                  padding={{ top: 28 }}
                  frame={{ width: rowWidth, alignment: "center" as any }}
                >
                  暂无剪贴板记录
                </Text>
              )}
          </VStack>
        </ScrollView>
      </VStack>
    );
  }

  const navigationWidth = 52;
  const contentWidth = Math.max(0, props.width - navigationWidth - 1);
  const effectiveSelectedCategoryId = categories.some((category) => category.id === selectedCategoryId)
    ? selectedCategoryId
    : categories[0]?.id ?? "";

  return (
    <VStack
      spacing={0}
      frame={{ width: props.width, height: props.height, alignment: "top" as any }}
      background={props.colors.keyboardBackground as any}
    >
      {header("常用语")}
      {categories.length > 0
        ? (
          <HStack spacing={0} frame={{ width: props.width, height: bodyHeight, alignment: "top" as any }}>
            <ScrollView axes="vertical" scrollIndicator="hidden" frame={{ width: navigationWidth, height: bodyHeight }}>
              <VStack spacing={1} padding={{ top: 6, bottom: 10 }} frame={{ width: navigationWidth, alignment: "top" as any }}>
                {categories.map((category) => {
                  const selected = category.id === effectiveSelectedCategoryId;
                  return (
                    <ZStack
                      key={`common-phrase-nav-${category.id}`}
                      frame={{ width: hitTargetSize, height: hitTargetSize }}
                      background={"rgba(0,0,0,0.001)" as any}
                      contentShape="rect"
                      onTapGesture={() => setSelectedCategoryId(category.id)}
                    >
                      <ZStack
                        frame={{ width: 38, height: 38 }}
                        foregroundStyle={(selected ? props.colors.foreground : props.colors.secondaryForeground) as any}
                        background={(selected ? props.colors.keyBackgrounds.system : "rgba(0,0,0,0)") as any}
                        clipShape={{ type: "rect", cornerRadius: props.skin.visuals.keyCornerRadius } as any}
                      >
                        <Image systemName={category.symbol} font={18} />
                      </ZStack>
                    </ZStack>
                  );
                })}
              </VStack>
            </ScrollView>
            <VStack frame={{ width: 1, height: bodyHeight }} background={props.colors.keyBackgrounds.system as any} />
            <ScrollView
              axes="vertical"
              scrollIndicator="visible"
              scrollPosition={{
                value: effectiveSelectedCategoryId || null,
                onChanged: (value: any) => {
                  if (typeof value === "string" && categories.some((category) => category.id === value)) {
                    setSelectedCategoryId(value);
                  }
                },
                anchor: "top"
              }}
              frame={{ width: contentWidth, height: bodyHeight }}
            >
              <VStack
                spacing={12}
                padding={{ horizontal: 10, top: 6, bottom: 12 }}
                frame={{ width: contentWidth, alignment: "top" as any }}
                scrollTargetLayout
              >
                {categories.map((category, categoryIndex) => (
                  <VStack
                    key={category.id}
                    spacing={6}
                    frame={{ width: Math.max(0, contentWidth - 20), alignment: "top" as any }}
                  >
                    <Text
                      font={props.skin.typography.contentPanel.sectionTitle.fontSize}
                      fontWeight={props.skin.typography.contentPanel.sectionTitle.fontWeight}
                      foregroundStyle={props.colors.secondaryForeground as any}
                      frame={{ width: Math.max(0, contentWidth - 20), height: 28, alignment: "leading" as any }}
                    >
                      {category.title.trim() || `分类 ${categoryIndex + 1}`}
                    </Text>
                    {category.phrases.map((phrase) => (
                      <Text
                        key={phrase.id}
                        font={props.skin.typography.contentPanel.row.fontSize}
                        lineLimit={3}
                        foregroundStyle={props.colors.foreground as any}
                        padding={{ horizontal: 10, vertical: 7 }}
                        frame={{ width: Math.max(0, contentWidth - 20), minHeight: 38, alignment: "leading" as any }}
                        background={props.colors.keyBackgrounds.normal as any}
                        clipShape={{ type: "rect", cornerRadius: props.skin.visuals.keyCornerRadius } as any}
                        contentShape="rect"
                        onTapGesture={() => selectPhrase(phrase.text)}
                      >
                        {phrase.text}
                      </Text>
                    ))}
                  </VStack>
                ))}
              </VStack>
            </ScrollView>
          </HStack>
        )
        : (
          <Text
            font={props.skin.typography.status.fontSize}
            foregroundStyle={props.colors.secondaryForeground as any}
            padding={{ top: 32 }}
            frame={{ width: props.width, alignment: "center" as any }}
          >
            暂无常用语，请先在设置中添加
          </Text>
        )}
    </VStack>
  );
}
