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
  createKeyboardMetricsResolver,
  type KeyboardMetrics,
  type ResolvedKeyboardLayout
} from "../layout/metrics";
import { horizontalHitFrame, verticalHitFrame, type HorizontalHitFrame, type VerticalHitFrame } from "../layout/hitGeometry";
import { InputController } from "../core/input/InputController";
import { RimeEngine, type RimeSnapshot } from "../core/rime/RimeEngine";
import { currentPageEntries, type CandidateEntry } from "../core/rime/CandidateView";
import { CandidateBarSubscriber } from "./components/CandidateBarSubscriber";
import { shouldRenderKeyboardHeader } from "./toolbar/headerMode";
import { CandidateViewStore } from "./runtime/CandidateViewStore";
import { AuxiliarySurfaceHost, type AuxiliarySurfaceId } from "./components/AuxiliarySurfaceHost";
import { ExpandedCandidatePanel } from "./components/ExpandedCandidatePanel";
import { KeyView } from "./components/KeyView";
import { T9PinyinColumnSubscriber } from "./components/T9PinyinColumnSubscriber";
import { T9PinyinViewStore } from "./runtime/T9PinyinViewStore";
import { displayedPreeditCursor } from "./preedit/displayedPreeditCursor";
import { t9DisplayedPreedit } from "./preedit/t9DisplayedPreedit";
import { disposeKeyboardHaptics, playKeyboardHaptic } from "./feedback/haptics";
import { prepareKeyboardRimeRuntime } from "./runtime/RimeRuntimeCoordinator";
import { createStartupTrace, type StartupTrace } from "./runtime/StartupTrace";
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
  startupTrace: StartupTrace | null;
}) {
  const startupRenderMarked = useRef<"new" | "started" | "done">("new");
  if (startupRenderMarked.current === "new") {
    startupRenderMarked.current = "started";
    props.startupTrace?.mark("ui.root.render.begin");
  }
  const skin = props.skin;
  const colorScheme = useColorScheme();
  const effectiveScheme = resolveEffectiveColorScheme(colorScheme === "dark" ? "dark" : "light");
  const colors = effectiveScheme === "dark" ? skin.dark : skin.light;
  const metricsResolverRef = useRef<ReturnType<typeof createKeyboardMetricsResolver> | null>(null);
  if (!metricsResolverRef.current) metricsResolverRef.current = createKeyboardMetricsResolver();
  const engineRef = useRef<RimeEngine | null>(null);
  const controllerRef = useRef<InputController | null>(null);
  const candidateStoreRef = useRef<CandidateViewStore | null>(null);
  if (!candidateStoreRef.current) candidateStoreRef.current = new CandidateViewStore();
  const candidateStore = candidateStoreRef.current;
  const t9PinyinStoreRef = useRef<T9PinyinViewStore | null>(null);
  if (!t9PinyinStoreRef.current) t9PinyinStoreRef.current = new T9PinyinViewStore();
  const t9PinyinStore = t9PinyinStoreRef.current;
  const editControllerRef = useRef<KeyboardEditController | null>(null);
  if (!editControllerRef.current) editControllerRef.current = new KeyboardEditController();
  const editController = editControllerRef.current;
  const markedTextActiveRef = useRef(false);

  const initialSettings = props.initialSettings;
  const showToolbar = initialSettings.showToolbar;
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
  // Diagnostic-only timestamp for the first Rime-bound tap before setup ends.
  const firstInputBeforeReadyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Only root-level space-gesture thresholds 0, 1, 2, 3+ need a rerender.
  // Candidate texts and highlight are published to the separate candidate bar.
  const [candidateActionCount, setCandidateActionCount] = useState(0);
  const [asciiMode, setAsciiMode] = useState(false);
  const [shifted, setShifted] = useState(false);
  const shiftedRef = useRef(false);
  const [capsLocked, setCapsLocked] = useState(false);
  const capsLockedRef = useRef(false);
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

  if (startupRenderMarked.current === "started") {
    props.startupTrace?.mark("ui.root.hooksReady");
    startupRenderMarked.current = "done";
  }
  useEffect(() => {
    let disposed = false;
    const startupTrace = props.startupTrace;
    startupTrace?.mark("ui.effect.begin");
    clearKeyboardActionQueue();
    const chineseLayout = chineseLayoutRef.current;
    const preferredSchemaId = initialSettings.schemes[chineseLayout];

    void prepareKeyboardRimeRuntime({
      chineseLayout,
      preferredSchemaId,
      isCancelled: () => disposed,
      startupTrace
    })
      .then((engine) => {
        if (disposed) {
          engine.close();
          return;
        }
        engineRef.current = engine;
        controllerRef.current = new InputController(engine);
        setAsciiMode(engine.asciiMode);
        setReady(true);
        startupTrace?.mark("ui.readyRequested");
        publish(engine.peek());
        startupTrace?.mark("ui.firstPublished");
        startupTrace?.finish("ready");
      })
      .catch((error) => {
        if (!disposed) {
          setError((error as Error)?.message ?? String(error));
          startupTrace?.finish("error");
        }
      });

    return () => {
      disposed = true;
      startupTrace?.finish("cancelled");
      controllerRef.current = null;
      candidateStore.dispose();
      t9PinyinStore.dispose();
      try { engineRef.current?.close(); } catch {}
      engineRef.current = null;
      try { CustomKeyboard.unmarkText(); } catch {}
      markedTextActiveRef.current = false;
      editController.dispose();
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
    candidateStore.publish(nextCandidates, Math.max(0, context?.menu?.highlightedIndex ?? 0));
    // Preserve swipe-up (>1) and swipe-down (>2) availability on the space key.
    setCandidateActionCount(Math.min(3, nextCandidates.length));

    const engine = engineRef.current;
    // F23 is essential after mutations, but the same mode/schema should not
    // be re-read just to derive the visible preedit later in this publish.
    const t9Active = Boolean(engine && !engine.asciiMode && engine.isT9BridgeTargetSchema());
    let t9Options: string[] = [];
    if (t9Active && engine) t9Options = engine.queryT9PinyinOptions();
    // Nine-key pinyin choices only repaint their own subscribed column.
    // Rendering the root again on each choice list change recreates unaffected key rows.
    t9PinyinStore.publish(t9Options);

    if (!nextPreedit) {
      resetExpandedCandidates();
    }

    const visiblePreedit = t9Active
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
      return executeHostCommand(command, {
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
    if (!controller) {
      if (!firstInputBeforeReadyRef.current) {
        firstInputBeforeReadyRef.current = true;
        props.startupTrace?.mark("input.firstBeforeReady");
      }
      return;
    }
    const effect = controller.dispatch(command, {
      shifted: shiftedRef.current,
      capsLocked: capsLockedRef.current,
      lastShiftTapAt: lastShiftTapRef.current
    });
    if (effect.steps) {
      for (const step of effect.steps) {
        if (step.insertText) editController.insertTextReplacingSelectAll(step.insertText);
        publish(step.snapshot);
      }
    } else if (effect.insertText) {
      editController.insertTextReplacingSelectAll(effect.insertText);
    }
    if (effect.deleteBackward) {
      if (!editController.consumeSelectionForDeletion()) {
        const before = CustomKeyboard.textBeforeCursor ?? "";
        editController.rememberDeletedText(before.slice(-1));
        CustomKeyboard.deleteBackward();
      }
    }
    if (effect.shifted !== shiftedRef.current) {
      shiftedRef.current = effect.shifted;
      setShifted(effect.shifted);
    }
    if (effect.capsLocked !== capsLockedRef.current) {
      capsLockedRef.current = effect.capsLocked;
      setCapsLocked(effect.capsLocked);
    }
    if (effect.lastShiftTapAt !== lastShiftTapRef.current) lastShiftTapRef.current = effect.lastShiftTapAt;
    if (command.type === "toggleAscii") setSurfaceLayer("main");
    // Shift/Caps modifies only keyboard-side state: Rime, its candidates and
    // host marked text have not changed. Avoid an extra T9 Lua probe and
    // native marked-text write on every Shift tap.
    if (!effect.steps && command.type !== "toggleShift") publish(effect.snapshot);
  }

  function moveSpaceDrag(steps: number) {
    const requested = Math.trunc(steps);
    if (requested === 0) return;

    if (compositionActive && candidateActionCount > 0) {
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
    dispatchKeyboardAction(() => {
      const engine = engineRef.current;
      if (!engine) return;
      playKeyboardHaptic(hapticsEnabled);
      resetExpandedCandidates();
      publish(engine.selectCandidate(index));
    });
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
    // Native Rime pages still need traversing, but avoid rebuilding all
    // previously rendered candidate wrappers on every incremental load.
    const batch = engine.collectCandidateBatch(nextLimit, currentCount);
    expandedLoadLimitRef.current = nextLimit;
    const madeProgress = batch.items.length > 0;
    setExpandedHasMore(batch.hasMore && madeProgress);

    if (!madeProgress) return;
    setExpandedCandidates((previous) => [...previous, ...batch.items]);
  }

  function dismissKeyboard() {
    try {
      CustomKeyboard.dismiss();
      // iOS may keep the keyboard extension process alive after dismissing
      // its view. Release Core Haptics without waiting for an unmount event.
      disposeKeyboardHaptics();
    } catch {}
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
            stepSize: compositionActive && candidateActionCount > 0
              ? SPACE_CANDIDATE_DRAG_STEP
              : SPACE_CURSOR_DRAG_STEP,
            onSteps: (steps: number) => dispatchKeyboardAction(() => moveSpaceDrag(steps))
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
      spaceKey("space", true, { compositionActive, candidateCount: candidateActionCount, t9: false }),
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
      spaceKey("t9-space", true, { compositionActive, candidateCount: candidateActionCount, t9: true }),
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
              <T9PinyinColumnSubscriber
                store={t9PinyinStore}
                asciiMode={asciiMode}
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
              spaceKey("numeric-space", false, { compositionActive, candidateCount: candidateActionCount, t9: false })
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
        const metrics = metricsResolverRef.current!(width, props.layout, skin.geometry);
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
              {shouldRenderKeyboardHeader({
                showToolbar,
                ready,
                error,
                compositionActive,
                candidateCount: candidateActionCount
              }) ? (
                <CandidateBarSubscriber
                  store={candidateStore}
                  compositionActive={compositionActive}
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
              ) : (
                // Diagnostic comparison: no idle toolbar, home/dismiss icons,
                // or candidate-bar subscriber nodes. Preserve keyboard geometry.
                <VStack frame={{ width: metrics.width, height: metrics.candidateHeight }} />
              )}
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
  // Opt-in only: tracing begins when the JS entrypoint executes, not while
  // Scripting loads/parses its statically imported modules.
  const startupTrace = createStartupTrace();
  try {
    startupTrace?.mark("ui.settings.begin");
    const initialSettings = readKeyboardRuntimeSettings();
    startupTrace?.setLayout(initialSettings.chineseLayout);
    startupTrace?.mark("ui.settings.end");
    const skin = resolveSkin(initialSettings.skinId);
    const layout = resolveKeyboardLayout(initialSettings.layoutPreferences, skin.layoutDefaults);
    startupTrace?.mark("ui.layoutReady");
    try { CustomKeyboard.setToolbarVisible(false); } catch {}
    try {
      const keyboard = CustomKeyboard as any;
      if (typeof keyboard.setHasDictationKey === "function") keyboard.setHasDictationKey(false);
      else keyboard.hasDictationKey = false;
    } catch {}
    try { CustomKeyboard.requestHeight(layout.requestedHeight); } catch {}
    startupTrace?.mark("ui.present.begin");
    CustomKeyboard.present(<KeyboardRoot initialSettings={initialSettings} layout={layout} skin={skin} startupTrace={startupTrace} />);
    startupTrace?.mark("ui.present.return");
  } catch (error) {
    startupTrace?.finish("error");
    throw error;
  }
}

main();
