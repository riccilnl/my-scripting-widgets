export type KeyPressVisualState = {
  scale: number;
};

export function keyPressVisualState(
  pressed: boolean,
  pressedScale: number
): KeyPressVisualState {
  return { scale: pressed ? pressedScale : 1 };
}
