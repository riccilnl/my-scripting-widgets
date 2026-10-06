import {
  HStack,
  Image,
  ScrollView,
  ScrollViewReader,
  Text,
  useEffect,
  useRef,
  VStack,
  ZStack
} from "scripting";
import type { KeyboardCommand } from "../../contracts/action";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";
import { firstDisplayLine, type CandidateEntry } from "../../core/rime/CandidateView";
import { ToolbarStrip, type ToolbarItem } from "../toolbar/ToolbarStrip";
import { resolveKeyboardHeaderMode } from "../toolbar/headerMode";

type Props = {
  candidates: CandidateEntry[];
  compositionActive: boolean;
  highlightedIndex: number;
  ready: boolean;
  error: string | null;
  skin: KeyboardSkin;
  colors: SkinColors;
  width: number;
  expanded: boolean;
  height: number;
  onSelect: (originalIndex: number) => void;
  onToggleExpanded: () => void;
  onDismissKeyboard: () => void;
  onCommand: (command: KeyboardCommand) => void;
  toolbarItems: readonly ToolbarItem[];
};

export function CandidateBar(props: Props) {
  const status = props.error
    ? `Rime：${props.error}`
    : props.ready
    ? ""
    : "Rime 初始化中…";
  const horizontalInset = props.skin.visuals.toolbarHorizontalInset;
  const edgeButtonWidth = props.skin.visuals.toolbarEdgeButtonWidth;
  const edgeSpacing = 0;
  const edgeHitSurface = "rgba(0,0,0,0.001)";
  const contentWidth = Math.max(0, props.width - horizontalInset * 2);
  const hasCandidates = props.candidates.length > 0;
  const headerMode = resolveKeyboardHeaderMode({
    ready: props.ready,
    error: props.error,
    compositionActive: props.compositionActive,
    candidateCount: props.candidates.length
  });
  const toolbarMode = headerMode === "toolbar";
  const rightButtonImage = hasCandidates
    ? props.expanded
      ? "chevron.up.circle"
      : "chevron.down.circle"
    : "keyboard.chevron.compact.down";
  const candidateScrollProxyRef = useRef<any>(null);
  const candidateScrollTimerRef = useRef<any>(null);
  const highlightedEntry = props.candidates[props.highlightedIndex];
  const highlightedKey = highlightedEntry
    ? `candidate-${highlightedEntry.originalIndex}-${highlightedEntry.candidate.text}`
    : null;

  useEffect(() => {
    if (candidateScrollTimerRef.current != null) {
      clearTimeout(candidateScrollTimerRef.current);
      candidateScrollTimerRef.current = null;
    }
    if (!highlightedKey) return;
    candidateScrollTimerRef.current = setTimeout(() => {
      candidateScrollTimerRef.current = null;
      candidateScrollProxyRef.current?.scrollTo(highlightedKey, "center");
    }, 0);
    return () => {
      if (candidateScrollTimerRef.current != null) {
        clearTimeout(candidateScrollTimerRef.current);
        candidateScrollTimerRef.current = null;
      }
    };
  }, [highlightedKey]);

  const centerWidth = toolbarMode
    ? Math.max(0, contentWidth - edgeButtonWidth * 2 - edgeSpacing * 2)
    : Math.max(0, contentWidth - edgeButtonWidth - edgeSpacing);

  return (
    <HStack spacing={0} frame={{ width: props.width, height: props.height }}>
      <VStack frame={{ width: horizontalInset, height: props.height }} />
      <HStack spacing={edgeSpacing} frame={{ width: contentWidth, height: props.height }}>
        {toolbarMode
          ? (
            <ZStack
              frame={{ width: edgeButtonWidth, height: props.height }}
              foregroundStyle={props.colors.foreground as any}
              background={edgeHitSurface as any}
              contentShape="rect"
              onTapGesture={() => props.onCommand({ type: "keyboardHome" })}
            >
              <Image
                systemName="house"
                font={props.skin.visuals.toolbarIconSize}
                offset={{ x: props.skin.visuals.toolbarHomeIconOffsetX, y: 0 }}
                allowsHitTesting={false}
              />
            </ZStack>
          )
          : null}

        {toolbarMode
          ? (
            <ToolbarStrip
              items={props.toolbarItems}
              colors={props.colors}
              width={centerWidth}
              height={props.height}
              skin={props.skin}
              onCommand={props.onCommand}
            />
          )
          : hasCandidates
          ? (
            <ScrollViewReader>
              {(proxy: any) => {
                candidateScrollProxyRef.current = proxy;
                return (
                  <ScrollView axes="horizontal" scrollIndicator="hidden" frame={{ width: centerWidth, height: props.height }}>
                    <HStack spacing={props.skin.visuals.candidateItemSpacing} frame={{ height: props.height }}>
                      {props.candidates.slice(0, 12).map((entry, index) => {
                        const displayText = firstDisplayLine(entry.candidate.text);
                        const isSingleCharacter = Array.from(displayText).length === 1;
                        const minTouchWidth = isSingleCharacter
                          ? props.skin.visuals.candidateSingleCharTouchWidth
                          : props.skin.visuals.candidateMinTouchWidth;
                        const selected = index === props.highlightedIndex;
                        const candidateKey = `candidate-${entry.originalIndex}-${entry.candidate.text}`;
                        return (
                          <VStack
                            key={candidateKey}
                            frame={{ minWidth: minTouchWidth, height: props.height }}
                            contentShape="rect"
                            onTapGesture={() => props.onSelect(entry.originalIndex)}
                          >
                            <ZStack
                              padding={{
                                leading: props.skin.visuals.candidateTextHorizontalPadding,
                                trailing: props.skin.visuals.candidateTextHorizontalPadding,
                                top: props.skin.visuals.candidateTextVerticalPadding,
                                bottom: props.skin.visuals.candidateTextVerticalPadding
                              }}
                              background={(selected ? props.colors.candidateSelectedBackground : "clear") as any}
                              clipShape={selected
                                ? { type: "rect", cornerRadius: props.skin.visuals.candidateSelectedCornerRadius } as any
                                : undefined}
                            >
                              <Text
                                font={props.skin.typography.candidate.fontSize}
                                foregroundStyle={(selected ? props.colors.candidateSelectedForeground : props.colors.candidateForeground) as any}
                                lineLimit={1}
                                minimumScaleFactor={0.65}
                              >
                                {displayText}
                              </Text>
                            </ZStack>
                          </VStack>
                        );
                      })}
                    </HStack>
                  </ScrollView>
                );
              }}
            </ScrollViewReader>
          )
          : (
            <VStack frame={{ width: centerWidth, height: props.height }}>
              <Text
                font={props.skin.typography.status.fontSize}
                foregroundStyle={props.colors.secondaryForeground as any}
                lineLimit={1}
              >
                {status}
              </Text>
            </VStack>
          )}

        <ZStack
          frame={{ width: edgeButtonWidth, height: props.height }}
          foregroundStyle={props.colors.foreground as any}
          background={edgeHitSurface as any}
          contentShape="rect"
          onTapGesture={() => hasCandidates ? props.onToggleExpanded() : props.onDismissKeyboard()}
        >
          <Image
            systemName={rightButtonImage}
            font={props.skin.visuals.toolbarIconSize}
            offset={{ x: props.skin.visuals.toolbarTrailingIconOffsetX, y: 0 }}
            allowsHitTesting={false}
          />
        </ZStack>
      </HStack>
      <VStack frame={{ width: horizontalInset, height: props.height }} />
    </HStack>
  );
}
