import { Button, LazyVGrid, ScrollView, Text, useEffect, useRef, ZStack } from "scripting";
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
 * A single, gapless scroll-target grid. Each cell owns its entire rectangle,
 * including the visual space between neighboring words and rows. We do not
 * create actual HStack/LazyVStack spacing gaps that cannot receive touches.
 */
export function ExpandedCandidatePanel(props: Props) {
  const contentWidth = props.width;
  const cellWidth = contentWidth / COLUMN_COUNT;
  const visualGap = Math.max(0, props.skin.visuals.expandedCandidateItemSpacing);
  const cellHeight = props.skin.visuals.expandedCandidateHeight + visualGap;
  const columns = Array.from({ length: COLUMN_COUNT }, () => ({
    size: cellWidth,
    spacing: 0
  }));

  // Fill the final row with inert cells so even its unused area participates
  // in the ScrollView's hit-testing surface.
  const cells: Array<CandidateEntry | null> = [...props.candidates];
  while (cells.length % COLUMN_COUNT !== 0) cells.push(null);

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

  function onVisibleCandidatesChanged(visibleIds: number[]) {
    const count = props.candidates.length;
    const prefetchFrom = Math.max(0, count - COLUMN_COUNT * (PREFETCH_ROWS + 1));
    const nearEnd = visibleIds.some((index) =>
      Number.isInteger(index) && index >= prefetchFrom && index < count
    );

    if (!props.hasMore || count === 0 || !nearEnd) {
      cancelPendingLoad();
      return;
    }
    if (loadTimerRef.current != null || loadRequestedCountRef.current === count) return;

    // Visibility updates are synchronous during dragging. Do not run Rime's
    // potentially expensive page scan directly inside the scroll callback.
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
        onChanged: (ids) => onVisibleCandidatesChanged(ids as number[])
      }}
    >
      <LazyVGrid
        columns={columns}
        alignment="leading"
        spacing={0}
        frame={{ width: contentWidth }}
        background={HIT_SURFACE as any}
        contentShape="rect"
        scrollTargetLayout
      >
        {cells.map((entry, index) =>
          entry
            ? (
              <Button
                key={index}
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
                key={index}
                frame={{ width: cellWidth, height: cellHeight }}
                background={HIT_SURFACE as any}
                contentShape="rect"
              />
            )
        )}
      </LazyVGrid>
    </ScrollView>
  );
}
