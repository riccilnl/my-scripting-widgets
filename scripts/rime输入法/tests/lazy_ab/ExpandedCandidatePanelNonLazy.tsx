import { Button, HStack, ScrollView, Text, useEffect, useMemo, useRef, VStack, ZStack } from "scripting";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";
import { firstDisplayLine, type CandidateEntry } from "../../core/rime/CandidateView";

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

const COLUMN_COUNT = 4;
const PREFETCH_ROWS = 3;
const LOAD_MORE_DELAY_MS = 180;
const HIT_SURFACE = "rgba(0,0,0,0.001)";

/**
 * Isolated A/B control: non-lazy candidate grid.
 * Not part of the production source and never published to main.
 * Every cell retains its entire hit rectangle and original index.
 */
export function ExpandedCandidatePanel(props: Props) {
  const contentWidth = props.width;
  const cellWidth = contentWidth / COLUMN_COUNT;
  const visualGap = Math.max(0, props.skin.visuals.expandedCandidateItemSpacing);
  const cellHeight = props.skin.visuals.expandedCandidateHeight + visualGap;

  const rows = useMemo(() => {
    const cells: Array<CandidateEntry | null> = [...props.candidates];
    while (cells.length % COLUMN_COUNT !== 0) cells.push(null);
    const result: Array<Array<CandidateEntry | null>> = [];
    for (let start = 0; start < cells.length; start += COLUMN_COUNT) {
      result.push(cells.slice(start, start + COLUMN_COUNT));
    }
    return result;
  }, [props.candidates]);

  const loadTimerRef = useRef<any>(null);
  const loadRequestedCountRef = useRef(-1);
  const onLoadMoreRef = useRef(props.onLoadMore);
  onLoadMoreRef.current = props.onLoadMore;

  function cancelPendingLoad() {
    if (loadTimerRef.current != null) {
      clearTimeout(loadTimerRef.current);
      loadTimerRef.current = null;
    }
  }

  useEffect(() => () => cancelPendingLoad(), []);

  function onVisibleRowsChanged(visibleIds: number[]) {
    const count = props.candidates.length;
    const prefetchFromRow = Math.floor(Math.max(0, count - COLUMN_COUNT * (PREFETCH_ROWS + 1)) / COLUMN_COUNT);
    const nearEnd = visibleIds.some((index) =>
      Number.isInteger(index) && index >= prefetchFromRow && index < rows.length
    );
    if (!props.hasMore || count === 0 || !nearEnd) {
      cancelPendingLoad();
      return;
    }
    if (loadTimerRef.current != null || loadRequestedCountRef.current === count) return;
    loadTimerRef.current = setTimeout(() => {
      loadTimerRef.current = null;
      loadRequestedCountRef.current = count;
      onLoadMoreRef.current();
    }, LOAD_MORE_DELAY_MS);
  }

  return (
    <ScrollView
      axes="vertical"
      scrollIndicator="hidden"
      frame={{ width: contentWidth, height: props.height }}
      background={HIT_SURFACE as any}
      contentShape="rect"
      onScrollTargetVisibilityChange={{
        idType: "number",
        threshold: 0.5,
        onChanged: (ids) => onVisibleRowsChanged(ids as number[])
      }}
    >
      <VStack
        spacing={0}
        frame={{ width: contentWidth }}
        background={HIT_SURFACE as any}
        contentShape="rect"
        scrollTargetLayout
      >
        {rows.map((row, rowIndex) => (
          <HStack
            key={rowIndex}
            spacing={0}
            frame={{ width: contentWidth, height: cellHeight }}
            background={HIT_SURFACE as any}
            contentShape="rect"
          >
            {row.map((entry, columnIndex) =>
              entry
                ? (
                  <Button
                    key={rowIndex * COLUMN_COUNT + columnIndex}
                    action={() => props.onSelect(entry.originalIndex)}
                    buttonStyle="plain"
                    contentShape="rect"
                    frame={{ width: cellWidth, height: cellHeight }}
                  >
                    <ZStack
                      frame={{ width: cellWidth, height: cellHeight }}
                      background={HIT_SURFACE as any}
                      contentShape="rect"
                      foregroundStyle={props.colors.foreground as any}
                    >
                      <Text
                        font={props.skin.typography.candidate.fontSize}
                        lineLimit={1}
                        minimumScaleFactor={0.65}
                        frame={{
                          width: Math.max(0, cellWidth - visualGap),
                          height: Math.max(0, cellHeight - visualGap)
                        }}
                      >
                        {firstDisplayLine(entry.candidate.text)}
                      </Text>
                    </ZStack>
                  </Button>
                )
                : (
                  <ZStack
                    key={rowIndex * COLUMN_COUNT + columnIndex}
                    frame={{ width: cellWidth, height: cellHeight }}
                    background={HIT_SURFACE as any}
                    contentShape="rect"
                  />
                )
            )}
          </HStack>
        ))}
      </VStack>
    </ScrollView>
  );
}
