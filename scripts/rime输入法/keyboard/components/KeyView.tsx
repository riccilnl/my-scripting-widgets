import {
  DragGesture,
  HStack,
  Image,
  Text,
  useEffect,
  useMemo,
  useRef,
  useState,
  VStack,
  ZStack
} from "scripting";
import type { KeyboardCommand } from "../../contracts/action";
import type { KeyDefinition } from "../../contracts/key";
import type { KeyActionHints, KeyFacePreferences } from "../../contracts/keyface";
import type { KeyboardSkin, SkinColors } from "../../contracts/skin";
import {
  createTouchIntentMachine,
  LONG_PRESS_DURATION,
  type TouchIntentResolution,
  type TouchTranslation
} from "../input/TouchIntentMachine";
import { commandForTouchResolution } from "../input/keyActionResolver";
import {
  BACKSPACE_LONG_PRESS_DURATION,
  createBackspaceRepeatController,
  shouldCancelBackspaceRepeat
} from "../input/BackspaceRepeatController";
import { createSpaceDragController } from "../input/SpaceDragController";
import { keyPressVisualState } from "../feedback/keyPressVisual";
import { projectBaseKeyFace } from "../keyface/BaseKeyFaceProjector";

const HIT_TEST_BACKGROUND = "rgba(0,0,0,0.001)";

type Props = {
  definition: KeyDefinition;
  preferences: KeyFacePreferences;
  actionHints?: KeyActionHints;
  skin: KeyboardSkin;
  colors: SkinColors;
  width: number;
  height: number;
  touchWidth?: number;
  touchHeight?: number;
  visualOffsetX?: number;
  visualOffsetY?: number;
  shifted?: boolean;
  capsLocked?: boolean;
  asciiMode?: boolean;
  horizontalDrag?: {
    stepSize: number;
    onSteps: (steps: number) => void;
  };
  repeatBackspace?: boolean;
  keyPopupEnabled: boolean;
  onTouchStart?: () => void;
  onCommand: (command: KeyboardCommand, options?: { feedback?: boolean }) => void;
};

function dragTranslation(details: any): TouchTranslation {
  return {
    dx: Number(details?.translation?.width ?? 0),
    dy: Number(details?.translation?.height ?? 0)
  };
}

export function KeyView(props: Props) {
  const { definition, preferences, skin, colors, width, height } = props;
  const touchWidth = props.touchWidth ?? width;
  const touchHeight = props.touchHeight ?? height;
  const visualOffsetX = props.visualOffsetX ?? Math.max(0, (touchWidth - width) / 2);
  const visualOffsetY = props.visualOffsetY ?? Math.max(0, (touchHeight - height) / 2);
  const face = projectBaseKeyFace(
    definition,
    {
      shifted: props.shifted === true,
      capsLocked: props.capsLocked === true,
      asciiMode: props.asciiMode === true
    },
    preferences
  );
  const typography = skin.typography.keys[face.centerTextRole];
  const visualRole = skin.keyVisualRoleOverrides?.[definition.id] ?? definition.visualRole;
  const keyBackground = colors.keyBackgroundOverrides?.[definition.id] ?? colors.keyBackgrounds[visualRole];
  const foreground = visualRole === "accent"
    ? "rgba(255,255,255,1)"
    : colors.foreground;
  const [pressed, setPressed] = useState(false);
  const pressedRef = useRef(false);
  const machineRef = useRef<ReturnType<typeof createTouchIntentMachine> | null>(null);
  const spaceDragRef = useRef<ReturnType<typeof createSpaceDragController> | null>(null);
  const backspaceRepeatRef = useRef<ReturnType<typeof createBackspaceRepeatController> | null>(null);
  const backspaceRepeatConsumedRef = useRef(false);
  const backspaceRepeatStartTimerRef = useRef<any>(null);
  const longPressTimerRef = useRef<any>(null);
  const actionsRef = useRef(definition.actions);
  const horizontalDragRef = useRef(props.horizontalDrag);
  const onCommandRef = useRef(props.onCommand);
  const onTouchStartRef = useRef(props.onTouchStart);
  actionsRef.current = definition.actions;
  horizontalDragRef.current = props.horizontalDrag;
  onCommandRef.current = props.onCommand;
  onTouchStartRef.current = props.onTouchStart;
  if (!machineRef.current) machineRef.current = createTouchIntentMachine();
  if (!spaceDragRef.current) spaceDragRef.current = createSpaceDragController();
  if (!backspaceRepeatRef.current) backspaceRepeatRef.current = createBackspaceRepeatController();
  const pressVisual = keyPressVisualState(pressed, skin.visuals.keyPressScale);
  const keyHintHorizontalInset = definition.semantic.kind === "t9"
    ? skin.visuals.keyHintT9HorizontalInset
    : skin.visuals.keyHintQwertyHorizontalInset;
  const keyHintTrackWidth = Math.max(16, width - keyHintHorizontalInset * 2);
  const keyHintHalfWidth = Math.max(8, keyHintTrackWidth / 2);
  const popupLabel = definition.semantic.kind === "letter"
    || definition.semantic.kind === "t9"
    || (definition.semantic.kind === "text"
      && definition.semantic.textRole === "numeric"
      && /^\d$/.test(definition.semantic.text))
    ? face.centerText
    : undefined;
  const popupVisible = props.keyPopupEnabled && pressed && !!popupLabel;
  const popupWidth = width + skin.visuals.keyPopupExtraWidth;
  const popupEdge = visualOffsetX <= 0.5
    ? "left"
    : touchWidth - (visualOffsetX + width) <= 0.5
    ? "right"
    : "center";
  const popupOffsetX = popupEdge === "left"
    ? skin.visuals.keyPopupExtraWidth / 2
    : popupEdge === "right"
    ? -skin.visuals.keyPopupExtraWidth / 2
    : 0;


  function setPressedVisual(next: boolean) {
    if (pressedRef.current === next) return;
    pressedRef.current = next;
    setPressed(next);
  }

  function clearLongPressTimer() {
    if (longPressTimerRef.current == null) return;
    clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  }

  function clearBackspaceRepeatStartTimer() {
    if (backspaceRepeatStartTimerRef.current == null) return;
    clearTimeout(backspaceRepeatStartTimerRef.current);
    backspaceRepeatStartTimerRef.current = null;
  }

  function stopBackspaceRepeat() {
    backspaceRepeatRef.current?.stop();
  }

  function startBackspaceRepeat() {
    if (!props.repeatBackspace) return;
    const machine = machineRef.current;
    const controller = backspaceRepeatRef.current;
    if (!machine || !controller || backspaceRepeatConsumedRef.current) return;
    const snapshot = machine.snapshot();
    if (snapshot.state !== "pending" || snapshot.exceededSwipeThreshold) return;
    clearBackspaceRepeatStartTimer();
    backspaceRepeatConsumedRef.current = true;
    machine.cancel();
    setPressedVisual(true);
    controller.start(
      () => onCommandRef.current({ type: "backspace" }),
      () => setPressedVisual(false)
    );
  }

  function scheduleBackspaceRepeatStart() {
    clearBackspaceRepeatStartTimer();
    if (!props.repeatBackspace) return;
    backspaceRepeatStartTimerRef.current = setTimeout(() => {
      backspaceRepeatStartTimerRef.current = null;
      startBackspaceRepeat();
    }, BACKSPACE_LONG_PRESS_DURATION);
  }

  function emitResolution(resolution: TouchIntentResolution) {
    const command = commandForTouchResolution(actionsRef.current, resolution);
    if (command) onCommandRef.current(command, { feedback: false });
  }

  function scheduleLongPress() {
    clearLongPressTimer();
    if (!actionsRef.current.longPress) return;
    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      const machine = machineRef.current;
      if (!machine) return;
      emitResolution(machine.longPressElapsed());
    }, LONG_PRESS_DURATION);
  }

  const manualGesture = useMemo(() => ({
    gesture: DragGesture({ minDistance: 0, coordinateSpace: "local" })
      .onChanged((details: any) => {
        const machine = machineRef.current;
        const spaceDrag = spaceDragRef.current;
        if (!machine || !spaceDrag) return;
        const translation = dragTranslation(details);
        const horizontalDrag = horizontalDragRef.current;

        if (horizontalDrag && spaceDrag.isConsumed()) {
          const drag = spaceDrag.update(translation, horizontalDrag.stepSize);
          if (drag.steps !== 0) horizontalDrag.onSteps(drag.steps);
          return;
        }

        if (props.repeatBackspace && backspaceRepeatConsumedRef.current) {
          if (shouldCancelBackspaceRepeat(details)) stopBackspaceRepeat();
          return;
        }

        if (machine.begin()) {
          setPressedVisual(true);
          onTouchStartRef.current?.();
          spaceDrag.begin();
          scheduleLongPress();
          scheduleBackspaceRepeatStart();
          backspaceRepeatConsumedRef.current = false;
        }

        if (horizontalDrag) {
          const drag = spaceDrag.update(translation, horizontalDrag.stepSize);
          if (drag.consumed) {
            clearLongPressTimer();
            clearBackspaceRepeatStartTimer();
            stopBackspaceRepeat();
            machine.cancel();
            if (drag.steps !== 0) horizontalDrag.onSteps(drag.steps);
            return;
          }
        }

        machine.update(translation);
        const snapshot = machine.snapshot();
        if (snapshot.state !== "pending" || !snapshot.longPressEligible) {
          clearLongPressTimer();
        }
        if (snapshot.state !== "pending" || snapshot.exceededSwipeThreshold) {
          clearBackspaceRepeatStartTimer();
        }
      })
      .onEnded((details: any) => {
        clearLongPressTimer();
        clearBackspaceRepeatStartTimer();
        backspaceRepeatRef.current?.stop();
        const machine = machineRef.current;
        const spaceDrag = spaceDragRef.current;
        if (!machine || !spaceDrag) return;
        const translation = dragTranslation(details);
        const horizontalDrag = horizontalDragRef.current;

        if (backspaceRepeatConsumedRef.current) {
          backspaceRepeatConsumedRef.current = false;
          setPressedVisual(false);
          machine.cancel();
          spaceDrag.reset();
          return;
        }

        if (horizontalDrag) {
          const drag = spaceDrag.update(translation, horizontalDrag.stepSize);
          if (drag.consumed) {
            if (drag.steps !== 0) horizontalDrag.onSteps(drag.steps);
            setPressedVisual(false);
            machine.cancel();
            spaceDrag.reset();
            return;
          }
        }

        const resolution = machine.end(translation);
        spaceDrag.reset();
        setPressedVisual(false);
        emitResolution(resolution);
      }),
    mask: "gesture" as any
  }), []);

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      clearBackspaceRepeatStartTimer();
      stopBackspaceRepeat();
      backspaceRepeatConsumedRef.current = false;
      machineRef.current?.cancel();
      spaceDragRef.current?.reset();
    };
  }, []);

  return (
    <ZStack
      alignment="topLeading"
      frame={{ width: touchWidth, height: touchHeight }}
      background={HIT_TEST_BACKGROUND as any}
      contentShape="rect"
      zIndex={popupVisible ? 50 : pressed ? 5 : 0}
      highPriorityGesture={manualGesture}
    >
      <VStack
        spacing={0}
        frame={{ width: touchWidth, height: touchHeight, alignment: "topLeading" as any }}
      >
        {visualOffsetY > 0
          ? <VStack frame={{ width: touchWidth, height: visualOffsetY }} />
          : null}
        <HStack
          spacing={0}
          frame={{ width: touchWidth, height, alignment: "leading" as any }}
        >
          {visualOffsetX > 0
            ? <VStack frame={{ width: visualOffsetX, height }} />
            : null}
          <ZStack
            alignment="topLeading"
            frame={{ width, height }}
          >
            <ZStack
              frame={{ width, height }}
              background={keyBackground as any}
            scaleEffect={pressVisual.scale}
            foregroundStyle={foreground as any}
            clipShape={{ type: "rect", cornerRadius: skin.visuals.keyCornerRadius } as any}
            shadow={skin.visuals.keyShadow as any}
            overlay={pressed
              ? {
                alignment: "center" as any,
                content: (
                  <ZStack
                    frame={{ width, height }}
                    background={{
                      style: foreground as any,
                      shape: { type: "rect", cornerRadius: skin.visuals.keyCornerRadius }
                    } as any}
                    opacity={skin.visuals.keyPressOverlayOpacity}
                    allowsHitTesting={false}
                  />
                )
              }
              : undefined}
          >
            {face.centerImage
              ? <Image systemName={face.centerImage} font={skin.visuals.iconSize} />
              : face.centerText
              ? (
                <Text
                  font={face.centerFontSizeOverride ?? typography.fontSize}
                  fontWeight={typography.fontWeight as any}
                  lineLimit={1}
                  minimumScaleFactor={0.72}
                >
                  {face.centerText}
                </Text>
              )
              : null}

            {props.actionHints?.topLeft || props.actionHints?.topRight
              ? (
                <HStack
                  spacing={0}
                  frame={{
                    width: keyHintTrackWidth,
                    height,
                    alignment: "top" as any
                  }}
                  offset={{ x: 0, y: skin.visuals.keyHintTopInset }}
                >
                  <ZStack
                    frame={{
                      width: keyHintHalfWidth,
                      alignment: "leading" as any
                    }}
                  >
                    {props.actionHints?.topLeft?.kind === "symbol"
                      ? (
                        <Image
                          systemName={props.actionHints.topLeft.systemImage}
                          font={skin.visuals.keyHintSymbolSize}
                          foregroundStyle={colors.secondaryForeground as any}
                        />
                      )
                      : props.actionHints?.topLeft?.kind === "text"
                      ? (
                        <Text
                          font={definition.semantic.kind === "t9" && /^\d$/.test(props.actionHints.topLeft.text)
                            ? skin.typography.t9DigitHint.fontSize
                            : skin.typography.keyHint.fontSize}
                          fontWeight={(definition.semantic.kind === "t9" && /^\d$/.test(props.actionHints.topLeft.text)
                            ? skin.typography.t9DigitHint.fontWeight
                            : skin.typography.keyHint.fontWeight) as any}
                          foregroundStyle={colors.secondaryForeground as any}
                          lineLimit={1}
                          minimumScaleFactor={skin.visuals.keyHintMinScaleFactor}
                        >
                          {props.actionHints.topLeft.text}
                        </Text>
                      )
                      : null}
                  </ZStack>
                  <ZStack
                    frame={{
                      width: keyHintHalfWidth,
                      alignment: "trailing" as any
                    }}
                  >
                    {props.actionHints?.topRight?.kind === "symbol"
                      ? (
                        <Image
                          systemName={props.actionHints.topRight.systemImage}
                          font={skin.visuals.keyHintSymbolSize}
                          foregroundStyle={colors.secondaryForeground as any}
                        />
                      )
                      : props.actionHints?.topRight?.kind === "text"
                      ? (
                        <Text
                          font={definition.semantic.kind === "t9" && /^\d$/.test(props.actionHints.topRight.text)
                            ? skin.typography.t9DigitHint.fontSize
                            : skin.typography.keyHint.fontSize}
                          fontWeight={(definition.semantic.kind === "t9" && /^\d$/.test(props.actionHints.topRight.text)
                            ? skin.typography.t9DigitHint.fontWeight
                            : skin.typography.keyHint.fontWeight) as any}
                          foregroundStyle={colors.secondaryForeground as any}
                          lineLimit={1}
                          minimumScaleFactor={skin.visuals.keyHintMinScaleFactor}
                        >
                          {props.actionHints.topRight.text}
                        </Text>
                      )
                      : null}
                  </ZStack>
                </HStack>
              )
              : null}

            {face.bottomRightText
              ? (
                <Text
                  font={face.bottomRightFontSize ?? skin.typography.keys.mode.fontSize}
                  fontWeight={skin.typography.keys.mode.fontWeight as any}
                  foregroundStyle={(face.bottomRightActive ? colors.foreground : colors.secondaryForeground) as any}
                  frame={{ width, height, alignment: "bottomTrailing" as any }}
                  padding={{ trailing: 8, bottom: 5 }}
                >
                  {face.bottomRightText}
                </Text>
              )
              : null}
          </ZStack>

          {popupVisible
            ? (
              <ZStack
                frame={{ width: popupWidth, height }}
                background={keyBackground as any}
                foregroundStyle={foreground as any}
                clipShape={{ type: "rect", cornerRadius: skin.visuals.keyPopupCornerRadius } as any}
                shadow={skin.visuals.keyPopupShadow as any}
                position={{
                  x: width / 2 + popupOffsetX,
                  y: -(height / 2 + skin.visuals.keyPopupGap)
                }}
                zIndex={100}
                allowsHitTesting={false}
              >
                <Text
                  font={skin.visuals.keyPopupFontSize}
                  lineLimit={1}
                  minimumScaleFactor={0.52}
                >
                  {popupLabel}
                </Text>
              </ZStack>
            )
            : null}
          </ZStack>
        </HStack>
      </VStack>
    </ZStack>
  );
}
