export type HorizontalHitFrame = {
  touchWidth: number;
  visualOffsetX: number;
};

export type VerticalHitFrame = {
  touchHeight: number;
  visualOffsetY: number;
};

/**
 * Partition visual spacing at the midpoint between adjacent keys so every
 * point in a row belongs to exactly one key. Optional outer insets can be
 * absorbed by the first / last key without moving the visual key itself.
 */
export function horizontalHitFrame(
  index: number,
  count: number,
  visualWidth: number,
  spacing: number,
  leadingInset = 0,
  trailingInset = 0
): HorizontalHitFrame {
  const leading = index === 0 ? leadingInset : spacing / 2;
  const trailing = index === count - 1 ? trailingInset : spacing / 2;
  return {
    touchWidth: visualWidth + leading + trailing,
    visualOffsetX: leading
  };
}

/**
 * Same midpoint partition for vertical row spacing. Using these touch frames
 * with a zero-spacing parent preserves the exact visual row positions while
 * removing dead strips between rows.
 */
export function verticalHitFrame(
  index: number,
  count: number,
  visualHeight: number,
  spacing: number
): VerticalHitFrame {
  const top = index === 0 ? 0 : spacing / 2;
  const bottom = index === count - 1 ? 0 : spacing / 2;
  return {
    touchHeight: visualHeight + top + bottom,
    visualOffsetY: top
  };
}
