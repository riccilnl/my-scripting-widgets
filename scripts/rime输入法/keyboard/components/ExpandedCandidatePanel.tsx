import { HStack, LazyVStack, ScrollView, Text, useEffect, useRef, VStack, ZStack } from "scripting";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";
import { firstDisplayLine, type CandidateEntry } from "../../core/rime/CandidateView";

function chunk<T>(items: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

type Props = {
  candidates: CandidateEntry[];
  skin: KeyboardSkin;
  colors: SkinColors;
  width: number;
  height: number;
  hasMore: boolean;
  onSelect: (originalIndex: number) => void;
  onLoadMore: () => void;
};

const LOAD_MORE_DEBOUNCE_MS = 180;

export function ExpandedCandidatePanel(props: Props) {
  const columns = 4;
  const spacing = props.skin.visuals.expandedCandidateItemSpacing;
  const cellHeight = props.skin.visuals.expandedCandidateHeight;
  const contentWidth = props.width;
  const cellWidth = Math.max(0, (contentWidth - spacing * (columns - 1)) / columns);
  const rows = chunk(props.candidates, columns);
  const lastRowIndex = rows.length - 1;
  const loadMoreTimerRef = useRef<any>(null);

  useEffect(() => {
    return () => {
      if (loadMoreTimerRef.current != null) {
        clearTimeout(loadMoreTimerRef.current);
        loadMoreTimerRef.current = null;
      }
    };
  }, []);

  function scheduleLoadMore(visibleIds: number[]) {
    if (loadMoreTimerRef.current != null) {
      clearTimeout(loadMoreTimerRef.current);
      loadMoreTimerRef.current = null;
    }
    if (!props.hasMore || lastRowIndex < 0 || !visibleIds.includes(lastRowIndex)) return;
    loadMoreTimerRef.current = setTimeout(() => {
      loadMoreTimerRef.current = null;
      props.onLoadMore();
    }, LOAD_MORE_DEBOUNCE_MS);
  }

  return (
    <ScrollView
      axes="vertical"
      scrollIndicator="hidden"
      frame={{ width: contentWidth, height: props.height }}
      onScrollTargetVisibilityChange={{
        idType: "number",
        threshold: 0.5,
        onChanged: (ids) => scheduleLoadMore(ids as number[])
      }}
    >
      <LazyVStack spacing={spacing} frame={{ width: contentWidth }} scrollTargetLayout>
        {rows.map((row, rowIndex) => (
          <HStack
            key={rowIndex}
            spacing={spacing}
            frame={{ width: contentWidth, height: cellHeight }}
          >
            {row.map((entry) => (
              <ZStack
                key={`candidate-${entry.originalIndex}-${entry.candidate.text}`}
                frame={{ width: cellWidth, height: cellHeight }}
                foregroundStyle={props.colors.foreground as any}
                contentShape="rect"
                onTapGesture={() => props.onSelect(entry.originalIndex)}
              >
                <Text
                  font={props.skin.typography.candidate.fontSize}
                  lineLimit={1}
                  minimumScaleFactor={0.65}
                >
                  {firstDisplayLine(entry.candidate.text)}
                </Text>
              </ZStack>
            ))}
            {row.length < columns
              ? Array.from({ length: columns - row.length }).map((_, index) => (
                  <VStack key={`candidate-empty-${rowIndex}-${index}`} frame={{ width: cellWidth, height: cellHeight }} />
                ))
              : null}
          </HStack>
        ))}
      </LazyVStack>
    </ScrollView>
  );
}
