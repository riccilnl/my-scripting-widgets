import {
  GeometryReader,
  HStack,
  ScrollView,
  Text,
  useColorScheme,
  useEffect,
  useRef,
  useState,
  VStack,
  ZStack
} from "scripting";
import type { KeyboardCommand, SurfaceLayerId } from "../contracts/action";
import type { KeyDefinition } from "../contracts/key";
import type { ChineseLayoutId, KeyboardRuntimeSettings } from "../contracts/preferences";
import type { KeyboardSkin, SkinShapeStyle } from "../contracts/skin";
import { readKeyboardRuntimeSettings } from "./runtime/KeyboardRuntimeSettings";
import { recordClipboardText } from "./runtime/AuxiliaryStorage";
import { FROZEN_NUMERIC_SYMBOLS } from "../layout/numeric";
import { FROZEN_COMMON_SYMBOLS, FROZEN_SYMBOL_CATEGORIES } from "../layout/symbols";
import { projectRecentSymbols, rememberRecentSymbol } from "./symbols/recentSymbols";
import { resolveSkin } from "../skin/registry";
import { resolveEffectiveColorScheme } from "../skin/appearance";
import {
  resolveKeyboardLayout,
  resolveKeyboardMetrics,
  type KeyboardMetrics,
  type ResolvedKeyboardLayout
} from "../layout/metrics";
import { horizontalHitFrame, verticalHitFrame, type HorizontalHitFrame, type VerticalHitFrame } from "../layout/hitGeometry";
import { InputController } from "../core/input/InputController";
import { RimeEngine, type RimeSnapshot } from "../core/rime/RimeEngine";
import { currentPageEntries, type CandidateEntry } from "../core/rime/CandidateView";
import { CandidateBar } from "./components/CandidateBar";
import { AuxiliarySurfaceHost, type AuxiliarySurfaceId } from "./components/AuxiliarySurfaceHost";
import { ExpandedCandidatePanel } from "./components/ExpandedCandidatePanel";
import { KeyView } from "./components/KeyView";
import { T9PinyinColumn } from "./components/T9PinyinColumn";
import { displayedPreeditCursor } from "./preedit/displayedPreeditCursor";
import { t9DisplayedPreedit } from "./preedit/t9DisplayedPreedit";
import { disposeKeyboardHaptics, playKeyboardHaptic } from "./feedback/haptics";
import { prepareKeyboardRimeRuntime } from "./runtime/RimeRuntimeCoordinator";
import { clearKeyboardActionQueue, dispatchKeyboardAction } from "./input/actionQueue";
import { applyRimeHostText } from "./input/RimeHostTextBridge";
import { executeHostCommand, isHostCommand } from "./toolbar/hostCommand";
import { KeyboardEditController } from "./edit/EditController";
import { toolbarItemsForIds } from "./toolbar/toolCatalog";
import { resolveBackspaceSwipeUp } from "./actions/specialKeyActions";
import {
  SPACE_CANDIDATE_DRAG_STEP,
  SPACE_CURSOR_DRAG_STEP
} from "./input/SpaceDragController";
import {
  createKeyboardKeyCatalog,
  spaceKey,
  type KeyboardKeyCatalog
} from "./layout/KeyCatalog";

const EXPANDED_CANDIDATE_BATCH = 96;
const EDIT_EFFECTS = { clipboardText: recordClipboardText } as const;

function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sameCandidateEntries(left: readonly CandidateEntry[], right: readonly CandidateEntry[]): boolean {
  return left.length === right.length && left.every((entry, index) => (
    entry.originalIndex === right[index]?.originalIndex &&
    entry.candidate.text === right[index]?.candidate.text
  ));
}

function keyboardBackgroundStyle(style: SkinShapeStyle): SkinShapeStyle {
  if (typeof style !== "string") return "clear";
  const match = style.match(/^rgba\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\)$/i);
  if (!match) {
    // Material styles (for example iOS 26's regularMaterial) should continue
    // inheriting the native host surface instead of reintroducing a hard seam.
    return "clear";
  }
  const transparent = `rgba(${match[1]},${match[2]},${match[3]},0)`;
  return {
    gradient: [
      { color: transparent, location: 0 },
      { color: style, location: 0.12 },
      { color: style, location: 1 }
    ],
    startPoint: { x: 0.5, y: 0 },
    endPoint: { x: 0.5, y: 1 }
  };
}

function KeyboardRoot(props: {
  initialSettings: KeyboardRuntimeSettings;
  layout: ResolvedKeyboardLayout;
  skin: KeyboardSkin;
}) {
  const skin = props.skin;
  const colorScheme = useColorScheme();
  const effectiveScheme = resolveEffectiveColorScheme(colorScheme === "dark" ? "dark" : "light");
  const colors = effectiveScheme === "dark" ? skin.dark : skin.light;
  const engineRef = useRef<RimeEngine | null>(null);
  const controllerRef = useRef<InputController | null>(null);
  const editControllerRef = useRef<KeyboardEditController | null>(null);
  if (!editControllerRef.current) editControllerRef.current = new KeyboardEditController();
  const editController = editControllerRef.current;
  const markedTextActiveRef = useRef(false);

  const initialSettings = props.initialSettings;
  const chineseLayoutRef = useRef<ChineseLayoutId>(initialSettings.chineseLayout);
  const keyFacePreferences = initialSettings.keyFacePreferences;
  const actionPreferences = initialSettings.actionPreferences;
  const hapticsEnabled = initialSettings.hapticsEnabled;
  const keyPopupEnabled = initialSettings.keyPopupEnabled;

  const toolbarItemsRef = useRef<ReturnType<typeof toolbarItemsForIds> | null>(null);
  if (!toolbarItemsRef.current) {
    toolbarItemsRef.current = toolbarItemsForIds(initialSettings.toolbarItems);
  }
  const toolbarItems = toolbarItemsRef.current;

  const keyCatalogRef = useRef<KeyboardKeyCatalog | null>(null);
  if (!keyCatalogRef.current) {
    keyCatalogRef.current = createKeyboardKeyCatalog(
      actionPreferences,
      initialSettings.t9CustomKey
    );
  }
  const keyCatalog = keyCatalogRef.current;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateEntry[]>([]);
  const [highlightedCandidateIndex, setHighlightedCandidateIndex] = useState(0);
  const [t9PinyinOptions, setT9PinyinOptions] = useState<string[]>([]);
  const [asciiMode, setAsciiMode] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [capsLocked, setCapsLocked] = useState(false);
  const lastShiftTapRef = useRef(0);
  const [surfaceLayer, setSurfaceLayer] = useState<SurfaceLayerId>("main");
  const effectiveLayout = asciiMode ? "qwerty" : chineseLayoutRef.current;
  const [symbolCategory, setSymbolCategory] = useState("recent");
  const [recentSymbols, setRecentSymbols] = useState<string[]>([]);
  const [auxiliarySurface, setAuxiliarySurface] = useState<AuxiliarySurfaceId | null>(null);
  const [compositionActive, setCompositionActive] = useState(false);
  const [candidateExpanded, setCandidateExpanded] = useState(false);
  const [expandedCandidates, setExpandedCandidates] = useState<CandidateEntry[]>([]);
  const [expandedHasMore, setExpandedHasMore] = useState(false);
  const expandedLoadLimitRef = useRef(EXPANDED_CANDIDATE_BATCH);
  const expandedLoadTriggerCountRef = useRef(-1);

  useEffect(() => {
    let disposed = false;
    clearKeyboardActionQueue();
    const chineseLayout = chineseLayoutRef.current;
    const preferredSchemaId = initialSettings.schemes[chineseLayout];

    void prepareKeyboardRimeRuntime({ chineseLayout, preferredSchemaId })
      .then((engine) => {
        if (disposed) {
          engine.close();
          return;
        }
        engineRef.current = engine;
        controllerRef.current = new InputController(engine);
        setAsciiMode(engine.asciiMode);
        setReady(true);
        publish(engine.peek());
      })
      .catch((error) => {
        if (!disposed) setError((error as Error)?.message ?? String(error));
      });

    return () => {
      disposed = true;
      controllerRef.current = null;
      try { engineRef.current?.close(); } catch {}
      engineRef.current = null;
      try { CustomKeyboard.unmarkText(); } catch {}
      clearKeyboardActionQueue();
      disposeKeyboardHaptics();
    };
  }, []);


  function openAuxiliarySurface(surface: AuxiliarySurfaceId) {
    if (engineRef.current?.hasComposition()) return;
    resetExpandedCandidates();
    setAuxiliarySurface(surface);
  }

  function closeAuxiliarySurface() {
    setAuxiliarySurface(null);
  }

  function resetExpandedCandidates() {
    setCandidateExpanded((value) => value ? false : value);
    setExpandedCandidates((items) => items.length > 0 ? [] : items);
    setExpandedHasMore((value) => value ? false : value);
    expandedLoadLimitRef.current = EXPANDED_CANDIDATE_BATCH;
    expandedLoadTriggerCountRef.current = -1;
  }

  function publish(snapshot: RimeSnapshot) {
    const context = snapshot.context;
    const nextPreedit = context?.preedit ?? "";
    setCompositionActive(Boolean(nextPreedit));
    const nextCandidates = currentPageEntries(context);
    setCandidates((previous) => sameCandidateEntries(previous, nextCandidates) ? previous : nextCandidates);
    setHighlightedCandidateIndex(Math.max(0, context?.menu?.highlightedIndex ?? 0));

    const engine = engineRef.current;
    let t9Options: string[] = [];
    if (engine && !engine.asciiMode && engine.isT9BridgeTargetSchema()) {
      t9Options = engine.queryT9PinyinOptions();
    }
    setT9PinyinOptions((previous) => sameStringList(previous, t9Options) ? previous : t9Options);

    if (!nextPreedit) {
      resetExpandedCandidates();
    }

    const visiblePreedit = engine && !engine.asciiMode && engine.isT9BridgeTargetSchema()
      ? t9DisplayedPreedit(nextPreedit, t9Options)
      : nextPreedit;
    markedTextActiveRef.current = applyRimeHostText({
      snapshot,
      visiblePreedit,
      cursor: displayedPreeditCursor(
        visiblePreedit,
        context?.cursorPos ?? visiblePreedit.length
      ),
      markedTextActive: markedTextActiveRef.current,
      insertCommittedText: (text) => editController.insertTextReplacingSelectAll(text),
      host: CustomKeyboard
    });
    if (engine) setAsciiMode(engine.asciiMode);
  }

  function dispatch(command: KeyboardCommand) {
    if (command.type === "openClipboardHistory") {
      openAuxiliarySurface("clipboard");
      return;
    }
    if (command.type === "openCommonPhrases") {
      openAuxiliarySurface("commonPhrases");
      return;
    }
    if (command.type === "setSurface") {
      setAuxiliarySurface(null);
      if (command.surface === "symbols") setSymbolCategory("recent");
      setSurfaceLayer(command.surface);
      return;
    }
    if (command.type === "selectCandidateOnPage") {
      const engine = engineRef.current;
      if (engine) publish(engine.selectCandidateOnCurrentPage(command.index));
      return;
    }
    if (command.type === "backspaceSwipeUp") {
      dispatch(resolveBackspaceSwipeUp(Boolean(engineRef.current?.hasComposition())));
      return;
    }
    if (isHostCommand(command)) {
      executeHostCommand(command, {
        edit: (editCommand) => editController.execute(editCommand, EDIT_EFFECTS),
        nextKeyboard: () => { try { CustomKeyboard.nextKeyboard(); } catch {} },
        dismissToHome: () => { try { CustomKeyboard.dismissToHome(); } catch {} }
      });
      return;
    }
    if (command.type === "insertLiteral" && surfaceLayer === "symbols") {
      setRecentSymbols((history) => rememberRecentSymbol(history, command.text));
    }
    const controller = controllerRef.current;
    if (!controller) return;
    const effect = controller.dispatch(command, {
      shifted,
      capsLocked,
      lastShiftTapAt: lastShiftTapRef.current
    });
    if (effect.insertText) {
      editController.insertTextReplacingSelectAll(effect.insertText);
    }
    if (effect.deleteBackward) {
      if (!editController.consumeSelectionForDeletion()) {
        const before = CustomKeyboard.textBeforeCursor ?? "";
        editController.rememberDeletedText(before.slice(-1));
        CustomKeyboard.deleteBackward();
      }
    }
    if (effect.shifted !== shifted) setShifted(effect.shifted);
    if (effect.capsLocked !== capsLocked) setCapsLocked(effect.capsLocked);
    if (effect.lastShiftTapAt !== lastShiftTapRef.current) lastShiftTapRef.current = effect.lastShiftTapAt;
    if (command.type === "toggleAscii") setSurfaceLayer("main");
    publish(effect.snapshot);
  }

  function moveSpaceDrag(steps: number) {
    const requested = Math.trunc(steps);
    if (requested === 0) return;

    if (compositionActive && candidates.length > 0) {
      const engine = engineRef.current;
      if (!engine) return;
      const result = engine.moveHighlightedCandidate(requested);
      if (result.movedSteps === 0) return;
      playKeyboardHaptic(hapticsEnabled);
      publish(result.snapshot);
      return;
    }

    const before = CustomKeyboard.textBeforeCursor ?? "";
    const after = CustomKeyboard.textAfterCursor ?? "";
    const available = requested < 0 ? before.length : after.length;
    const distance = Math.min(Math.abs(requested), available);
    if (distance <= 0) return;
    const actual = requested < 0 ? -distance : distance;
    editController.execute({ type: "moveCursor", offset: actual });
    playKeyboardHaptic(hapticsEnabled);
  }

  function executeKeyCommand(
    command: KeyboardCommand,
    options?: { feedback?: boolean }
  ) {
    if (options?.feedback !== false) playKeyboardHaptic(hapticsEnabled);
    dispatchKeyboardAction(() => dispatch(command));
  }

  function pressT9Pinyin(option: string) {
    playKeyboardHaptic(hapticsEnabled);
    dispatchKeyboardAction(() => selectT9Pinyin(option));
  }

  function pressRimeText(text: string) {
    playKeyboardHaptic(hapticsEnabled);
    dispatchKeyboardAction(() => insertRimeText(text));
  }

  function insertLiteral(text: string) {
    dispatch({ type: "insertLiteral", text });
  }

  function insertRimeText(text: string) {
    dispatch({ type: "rimeText", text });
  }

  function selectCandidate(index: number) {
    const engine = engineRef.current;
    if (!engine) return;
    playKeyboardHaptic(hapticsEnabled);
    resetExpandedCandidates();
    publish(engine.selectCandidate(index));
  }

  function selectT9Pinyin(option: string) {
    const engine = engineRef.current;
    if (!engine || asciiMode || effectiveLayout !== "t9") return;
    const result = engine.selectT9Pinyin(option);
    if (result.consumed) publish(result);
  }

  function openExpandedCandidates() {
    const engine = engineRef.current;
    if (!engine) return false;
    const batch = engine.collectCandidateBatch(EXPANDED_CANDIDATE_BATCH);
    expandedLoadLimitRef.current = EXPANDED_CANDIDATE_BATCH;
    expandedLoadTriggerCountRef.current = -1;
    setExpandedCandidates(batch.items);
    setExpandedHasMore(batch.hasMore);
    return batch.items.length > 0;
  }

  function toggleCandidateExpanded() {
    if (candidateExpanded) {
      resetExpandedCandidates();
      return;
    }
    setCandidateExpanded(openExpandedCandidates());
  }

  function loadMoreExpandedCandidates() {
    const engine = engineRef.current;
    if (!engine || !candidateExpanded || !expandedHasMore) return;
    const currentCount = expandedCandidates.length;
    if (expandedLoadTriggerCountRef.current === currentCount) return;
    expandedLoadTriggerCountRef.current = currentCount;

    const nextLimit = expandedLoadLimitRef.current + EXPANDED_CANDIDATE_BATCH;
    const batch = engine.collectCandidateBatch(nextLimit);
    expandedLoadLimitRef.current = nextLimit;
    const madeProgress = batch.items.length > currentCount;
    setExpandedHasMore(batch.hasMore && madeProgress);

    if (!madeProgress) return;
    const appended = batch.items.slice(currentCount);
    setExpandedCandidates((previous) => [...previous, ...appended]);
  }

  function dismissKeyboard() {
    try { CustomKeyboard.dismiss(); } catch {}
  }

  function renderKey(
    definition: KeyDefinition,
    width: number,
    metrics: KeyboardMetrics,
    hit?: Partial<HorizontalHitFrame & VerticalHitFrame>
  ) {
    return (
      <KeyView
        key={definition.id}
        definition={definition}
        preferences={keyFacePreferences}
        actionHints={keyFacePreferences.showActionHints ? keyCatalog.actionHintsByKeyId[definition.id] : undefined}
        skin={skin}
        colors={colors}
        width={width}
        height={metrics.keyHeight}
        touchWidth={hit?.touchWidth}
        touchHeight={hit?.touchHeight}
        visualOffsetX={hit?.visualOffsetX}
        visualOffsetY={hit?.visualOffsetY}
        shifted={shifted}
        capsLocked={capsLocked}
        asciiMode={asciiMode}
        horizontalDrag={definition.semantic.kind === "space"
          ? {
            stepSize: compositionActive && candidates.length > 0
              ? SPACE_CANDIDATE_DRAG_STEP
              : SPACE_CURSOR_DRAG_STEP,
            onSteps: moveSpaceDrag
          }
          : undefined}
        repeatBackspace={definition.actions.tap.type === "backspace"}
        keyPopupEnabled={keyPopupEnabled}
        onTouchStart={() => playKeyboardHaptic(hapticsEnabled)}
        onCommand={executeKeyCommand}
      />
    );
  }

  function renderPartitionedKey(
    definition: KeyDefinition,
    width: number,
    index: number,
    count: number,
    rowIndex: number,
    metrics: KeyboardMetrics,
    leadingInset = 0,
    trailingInset = 0
  ) {
    return renderKey(definition, width, metrics, {
      ...horizontalHitFrame(
        index,
        count,
        width,
        metrics.keySpacing,
        leadingInset,
        trailingInset
      ),
      ...verticalHitFrame(rowIndex, 4, metrics.keyHeight, metrics.rowSpacing)
    });
  }

  function renderQwerty(metrics: KeyboardMetrics) {
    const [row1, row2, row3] = keyCatalog.qwertyRows;
    const row0Touch = verticalHitFrame(0, 4, metrics.keyHeight, metrics.rowSpacing);
    const row1Touch = verticalHitFrame(1, 4, metrics.keyHeight, metrics.rowSpacing);
    const row2Touch = verticalHitFrame(2, 4, metrics.keyHeight, metrics.rowSpacing);
    const row3Touch = verticalHitFrame(3, 4, metrics.keyHeight, metrics.rowSpacing);
    const thirdRowDefinitions: KeyDefinition[] = [
      keyCatalog.qwerty.shift,
      ...row3,
      keyCatalog.qwerty.backspace
    ];
    const thirdRowWidths = [
      metrics.shiftWidth,
      ...row3.map(() => metrics.thirdRowLetterWidth),
      metrics.shiftWidth
    ];
    const bottomDefinitions: KeyDefinition[] = [
      keyCatalog.qwerty.numbers,
      keyCatalog.qwerty.comma,
      spaceKey("space", true, { compositionActive, candidateCount: candidates.length, t9: false }),
      keyCatalog.qwerty.mode,
      keyCatalog.qwerty.enter
    ];
    const bottomWidths = [
      metrics.bottom.numbers,
      metrics.bottom.comma,
      metrics.bottom.space,
      metrics.bottom.mode,
      metrics.bottom.enter
    ];

    return (
      <VStack spacing={0} frame={{ width: metrics.width, height: metrics.bodyHeight }}>
        <HStack spacing={0} frame={{ width: metrics.width, height: row0Touch.touchHeight }}>
          {row1.map((definition, index) =>
            renderPartitionedKey(
              definition,
              metrics.letterWidth,
              index,
              row1.length,
              0,
              metrics
            )
          )}
        </HStack>
        <HStack spacing={0} frame={{ width: metrics.width, height: row1Touch.touchHeight }}>
          {row2.map((definition, index) =>
            renderPartitionedKey(
              definition,
              metrics.secondRowLetterWidth,
              index,
              row2.length,
              1,
              metrics,
              index === 0 ? metrics.secondRowInset : 0,
              index === row2.length - 1 ? metrics.secondRowInset : 0
            )
          )}
        </HStack>
        <HStack spacing={0} frame={{ width: metrics.width, height: row2Touch.touchHeight }}>
          {thirdRowDefinitions.map((definition, index) =>
            renderPartitionedKey(
              definition,
              thirdRowWidths[index],
              index,
              thirdRowDefinitions.length,
              2,
              metrics
            )
          )}
        </HStack>
        <HStack spacing={0} frame={{ width: metrics.width, height: row3Touch.touchHeight }}>
          {bottomDefinitions.map((definition, index) =>
            renderPartitionedKey(
              definition,
              bottomWidths[index],
              index,
              bottomDefinitions.length,
              3,
              metrics
            )
          )}
        </HStack>
      </VStack>
    );
  }

  function renderT9(metrics: KeyboardMetrics) {
    const leftCenterWidth = metrics.width - metrics.t9.rightWidth - metrics.keySpacing;
    const rowTouches = [0, 1, 2, 3].map((index) =>
      verticalHitFrame(index, 4, metrics.keyHeight, metrics.rowSpacing)
    );
    const topTouchHeight = rowTouches[0].touchHeight +
      rowTouches[1].touchHeight + rowTouches[2].touchHeight;
    const bottomDefinitions: KeyDefinition[] = [
      keyCatalog.t9.symbols,
      keyCatalog.t9.numeric,
      spaceKey("t9-space", true, { compositionActive, candidateCount: candidates.length, t9: true }),
      keyCatalog.t9.mode
    ];
    const bottomWidths = [
      metrics.t9.bottomNumbersWidth,
      metrics.t9.bottomCommaWidth,
      metrics.t9.bottomSpaceWidth,
      metrics.t9.bottomModeWidth
    ];
    const enterTouchHeight = rowTouches[2].touchHeight + rowTouches[3].touchHeight;

    return (
      <HStack spacing={metrics.keySpacing} frame={{ width: metrics.width, height: metrics.bodyHeight }}>
        <VStack spacing={0} frame={{ width: leftCenterWidth, height: metrics.bodyHeight }}>
          <HStack spacing={metrics.keySpacing} frame={{ width: leftCenterWidth, height: topTouchHeight, alignment: "topLeading" as any }}>
            <VStack frame={{ width: metrics.t9.leftWidth, height: topTouchHeight, alignment: "topLeading" as any }}>
              <T9PinyinColumn
                options={asciiMode ? [] : t9PinyinOptions}
                skin={skin}
                colors={colors}
                width={metrics.t9.leftWidth}
                height={metrics.t9.panelHeight}
                onSelect={pressT9Pinyin}
                onPunctuation={pressRimeText}
              />
            </VStack>
            <VStack spacing={0} frame={{ width: metrics.t9.centerWidth, height: topTouchHeight }}>
              {keyCatalog.t9Rows.map((row, rowIndex) => (
                <HStack key={`t9-row-${rowIndex}`} spacing={0} frame={{ width: metrics.t9.centerWidth, height: rowTouches[rowIndex].touchHeight }}>
                  {row.map((definition, index) =>
                    renderKey(definition, metrics.t9.keyWidth, metrics, {
                      ...horizontalHitFrame(index, row.length, metrics.t9.keyWidth, metrics.keySpacing),
                      ...rowTouches[rowIndex]
                    })
                  )}
                </HStack>
              ))}
            </VStack>
          </HStack>
          <HStack spacing={0} frame={{ width: leftCenterWidth, height: rowTouches[3].touchHeight }}>
            {bottomDefinitions.map((definition, index) =>
              renderPartitionedKey(
                definition,
                bottomWidths[index],
                index,
                bottomDefinitions.length,
                3,
                metrics
              )
            )}
          </HStack>
        </VStack>
        <VStack spacing={0} frame={{ width: metrics.t9.rightWidth, height: metrics.bodyHeight }}>
          {renderKey(
            keyCatalog.t9.backspace,
            metrics.t9.rightWidth,
            metrics,
            rowTouches[0]
          )}
          {renderKey(
            keyCatalog.t9.delimiter,
            metrics.t9.rightWidth,
            metrics,
            rowTouches[1]
          )}
          <ZStack frame={{ width: metrics.t9.rightWidth, height: enterTouchHeight, alignment: "topLeading" as any }}>
            <KeyView
              definition={keyCatalog.t9.enter}
              preferences={keyFacePreferences}
              skin={skin}
              colors={colors}
              width={metrics.t9.rightWidth}
              height={metrics.t9.enterOverlayHeight}
              touchWidth={metrics.t9.rightWidth}
              touchHeight={enterTouchHeight}
              visualOffsetX={0}
              visualOffsetY={rowTouches[2].visualOffsetY}
              shifted={false}
              asciiMode={asciiMode}
              keyPopupEnabled={keyPopupEnabled}
              onTouchStart={() => playKeyboardHaptic(hapticsEnabled)}
              onCommand={executeKeyCommand}
            />
          </ZStack>
        </VStack>
      </HStack>
    );
  }

  function renderNumeric(metrics: KeyboardMetrics) {
    const rowTouches = [0, 1, 2, 3].map((index) =>
      verticalHitFrame(index, 4, metrics.keyHeight, metrics.rowSpacing)
    );
    const leftTopHeight = rowTouches[0].touchHeight + rowTouches[1].touchHeight + rowTouches[2].touchHeight;
    const visibleSymbols = FROZEN_NUMERIC_SYMBOLS;
    return (
      <HStack spacing={metrics.keySpacing} frame={{ width: metrics.width, height: metrics.bodyHeight }}>
        <VStack spacing={0} frame={{ width: metrics.numeric.leftWidth, height: metrics.bodyHeight }}>
          <ZStack
            frame={{ width: metrics.numeric.leftWidth, height: leftTopHeight }}
            background={colors.keyBackgrounds.normal as any}
            foregroundStyle={colors.foreground as any}
            clipShape={{ type: "rect", cornerRadius: skin.visuals.keyCornerRadius } as any}
          >
            <ScrollView axes="vertical" scrollIndicator="hidden" frame={{ width: metrics.numeric.leftWidth, height: leftTopHeight }}>
              <VStack spacing={0} frame={{ width: metrics.numeric.leftWidth, alignment: "top" as any }}>
                {visibleSymbols.map((item) => (
                  <Text
                    key={`numeric-symbol-${item.label}`}
                    font={18}
                    frame={{ width: metrics.numeric.leftWidth, height: leftTopHeight / 4, alignment: "center" as any }}
                    contentShape="rect"
                    onTapGesture={() => {
                      playKeyboardHaptic(hapticsEnabled);
                      dispatchKeyboardAction(() => insertLiteral(item.value));
                    }}
                  >
                    {item.label}
                  </Text>
                ))}
              </VStack>
            </ScrollView>
          </ZStack>
          {renderKey(
            keyCatalog.numeric.symbols,
            metrics.numeric.leftWidth,
            metrics,
            rowTouches[3]
          )}
        </VStack>
        <VStack spacing={0} frame={{ width: metrics.numeric.centerWidth, height: metrics.bodyHeight }}>
          {keyCatalog.numericRows.map((row, rowIndex) => (
            <HStack key={`numeric-row-${rowIndex}`} spacing={0} frame={{ width: metrics.numeric.centerWidth, height: rowTouches[rowIndex].touchHeight }}>
              {row.map((definition, index) =>
                renderKey(definition, metrics.numeric.keyWidth, metrics, {
                  ...horizontalHitFrame(index, row.length, metrics.numeric.keyWidth, metrics.keySpacing),
                  ...rowTouches[rowIndex]
                })
              )}
            </HStack>
          ))}
          <HStack spacing={0} frame={{ width: metrics.numeric.centerWidth, height: rowTouches[3].touchHeight }}>
            {[
              keyCatalog.numeric.abc,
              keyCatalog.numeric.zero,
              spaceKey("numeric-space", false, { compositionActive, candidateCount: candidates.length, t9: false })
            ].map((definition, index) =>
              renderKey(definition, metrics.numeric.keyWidth, metrics, {
                ...horizontalHitFrame(index, 3, metrics.numeric.keyWidth, metrics.keySpacing),
                ...rowTouches[3]
              })
            )}
          </HStack>
        </VStack>
        <VStack spacing={0} frame={{ width: metrics.numeric.rightWidth, height: metrics.bodyHeight }}>
          {[
            keyCatalog.numeric.backspace,
            keyCatalog.numeric.dot,
            keyCatalog.numeric.equal,
            keyCatalog.numeric.enter
          ].map((definition, index) =>
            renderKey(definition, metrics.numeric.rightWidth, metrics, rowTouches[index])
          )}
        </VStack>
      </HStack>
    );
  }

  function renderSymbols(metrics: KeyboardMetrics) {
    const category = FROZEN_SYMBOL_CATEGORIES.find((item) => item.id === symbolCategory);
    const symbols = symbolCategory === "recent"
      ? projectRecentSymbols(recentSymbols, FROZEN_COMMON_SYMBOLS)
      : category?.symbols ?? [...FROZEN_COMMON_SYMBOLS];
    const row0 = symbols.slice(0, 10);
    const row1 = symbols.slice(10, 19);
    const row2 = symbols.slice(19, 26);
    const rowTouches = [0, 1, 2, 3].map((index) =>
      verticalHitFrame(index, 4, metrics.keyHeight, metrics.rowSpacing)
    );
    const categoryItems = [
      { id: "back", label: "←" },
      { id: "recent", label: "◷" },
      ...FROZEN_SYMBOL_CATEGORIES.map((item) => ({ id: item.id, label: item.label }))
    ];
    const categoryWidth = metrics.width / categoryItems.length;
    const sym = (symbol: string, id: string): KeyDefinition => ({
      id,
      semantic: { kind: "text", text: symbol, textRole: "function" },
      actions: { tap: { type: "insertLiteral", text: symbol } },
      visualRole: "normal"
    });
    const thirdRowDefinitions: KeyDefinition[] = [
      keyCatalog.symbols.numbers,
      ...row2.map((symbol, index) => sym(symbol, `symbol-r2-${index}`)),
      keyCatalog.symbols.backspace
    ];
    const thirdRowWidths = [
      metrics.shiftWidth,
      ...row2.map(() => metrics.thirdRowLetterWidth),
      metrics.shiftWidth
    ];

    return (
      <VStack spacing={0} frame={{ width: metrics.width, height: metrics.bodyHeight }}>
        <HStack spacing={0} frame={{ width: metrics.width, height: rowTouches[0].touchHeight }}>
          {row0.map((symbol, index) =>
            renderKey(sym(symbol, `symbol-r0-${index}`), metrics.letterWidth, metrics, {
              ...horizontalHitFrame(index, row0.length, metrics.letterWidth, metrics.keySpacing),
              ...rowTouches[0]
            })
          )}
        </HStack>
        <HStack spacing={0} frame={{ width: metrics.width, height: rowTouches[1].touchHeight }}>
          {row1.map((symbol, index) =>
            renderKey(sym(symbol, `symbol-r1-${index}`), metrics.secondRowLetterWidth, metrics, {
              ...horizontalHitFrame(
                index,
                row1.length,
                metrics.secondRowLetterWidth,
                metrics.keySpacing,
                index === 0 ? metrics.secondRowInset : 0,
                index === row1.length - 1 ? metrics.secondRowInset : 0
              ),
              ...rowTouches[1]
            })
          )}
        </HStack>
        <HStack spacing={0} frame={{ width: metrics.width, height: rowTouches[2].touchHeight }}>
          {thirdRowDefinitions.map((definition, index) =>
            renderKey(definition, thirdRowWidths[index], metrics, {
              ...horizontalHitFrame(index, thirdRowDefinitions.length, thirdRowWidths[index], metrics.keySpacing),
              ...rowTouches[2]
            })
          )}
        </HStack>
        <HStack spacing={0} frame={{ width: metrics.width, height: rowTouches[3].touchHeight }}>
          {categoryItems.map((item) => (
            <ZStack
              key={`symbol-category-${item.id}`}
              alignment="topLeading"
              frame={{ width: categoryWidth, height: rowTouches[3].touchHeight }}
              background={"rgba(0,0,0,0.001)" as any}
              contentShape="rect"
              onTapGesture={() => {
                playKeyboardHaptic(hapticsEnabled);
                if (item.id === "back") setSurfaceLayer("main");
                else setSymbolCategory(item.id);
              }}
            >
              <VStack spacing={0} frame={{ width: categoryWidth, height: rowTouches[3].touchHeight, alignment: "topLeading" as any }}>
                {rowTouches[3].visualOffsetY > 0
                  ? <VStack frame={{ width: categoryWidth, height: rowTouches[3].visualOffsetY }} />
                  : null}
                <Text
                  font={item.label.length > 1 ? 14 : 18}
                  foregroundStyle={(item.id === "back" || item.id === symbolCategory ? colors.foreground : colors.secondaryForeground) as any}
                  frame={{ width: categoryWidth, height: metrics.keyHeight, alignment: "center" as any }}
                  allowsHitTesting={false}
                >
                  {item.label}
                </Text>
              </VStack>
            </ZStack>
          ))}
        </HStack>
      </VStack>
    );
  }

  return (
    <GeometryReader>
      {(proxy: any) => {
        const width = Math.max(240, Number(proxy.size?.width ?? 390));
        const metrics = resolveKeyboardMetrics(width, props.layout, skin.geometry);
        const totalHeight = props.layout.requestedHeight;
        return (
          <ZStack
            frame={{ width, height: totalHeight, alignment: "center" as any }}
          >
            <VStack
              frame={{ width, height: totalHeight }}
              background={keyboardBackgroundStyle(colors.keyboardBackground) as any}
              allowsHitTesting={false}
            />
            {auxiliarySurface
              ? (
                <AuxiliarySurfaceHost
                  key={`aux-${auxiliarySurface}`}
                  surface={auxiliarySurface}
                  skin={skin}
                  colors={colors}
                  width={metrics.width}
                  height={totalHeight}
                  onClose={closeAuxiliarySurface}
                  onInsertText={(text) => editController.insertTextReplacingSelectAll(text)}
                  onHaptic={() => playKeyboardHaptic(hapticsEnabled)}
                />
              )
              : (
            <VStack spacing={metrics.rowSpacing} frame={{ width: metrics.width }}>
              <CandidateBar
                candidates={candidates}
                compositionActive={compositionActive}
                highlightedIndex={highlightedCandidateIndex}
                ready={ready}
                error={error}
                skin={skin}
                colors={colors}
                width={metrics.width}
                height={metrics.candidateHeight}
                expanded={candidateExpanded}
                onSelect={selectCandidate}
                onToggleExpanded={toggleCandidateExpanded}
                onDismissKeyboard={dismissKeyboard}
                onCommand={executeKeyCommand}
                toolbarItems={toolbarItems}
              />
              {candidateExpanded
                ? (
                  <ExpandedCandidatePanel
                    candidates={expandedCandidates}
                    skin={skin}
                    colors={colors}
                    width={metrics.width}
                    height={metrics.bodyHeight}
                    hasMore={expandedHasMore}
                    onSelect={selectCandidate}
                    onLoadMore={loadMoreExpandedCandidates}
                  />
                )
                : surfaceLayer === "numeric"
                ? renderNumeric(metrics)
                : surfaceLayer === "symbols"
                ? renderSymbols(metrics)
                : effectiveLayout === "t9"
                ? renderT9(metrics)
                : renderQwerty(metrics)}
            </VStack>
              )}
          </ZStack>
        );
      }}
    </GeometryReader>
  );
}

function main() {
  const initialSettings = readKeyboardRuntimeSettings();
  const skin = resolveSkin(initialSettings.skinId);
  const layout = resolveKeyboardLayout(initialSettings.layoutPreferences, skin.layoutDefaults);
  try { CustomKeyboard.setToolbarVisible(false); } catch {}
  try {
    const keyboard = CustomKeyboard as any;
    if (typeof keyboard.setHasDictationKey === "function") keyboard.setHasDictationKey(false);
    else keyboard.hasDictationKey = false;
  } catch {}
  try { CustomKeyboard.requestHeight(layout.requestedHeight); } catch {}
  CustomKeyboard.present(<KeyboardRoot initialSettings={initialSettings} layout={layout} skin={skin} />);
}

main();
