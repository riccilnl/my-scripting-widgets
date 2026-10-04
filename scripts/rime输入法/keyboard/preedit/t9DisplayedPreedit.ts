// Display-only T9 projection. Rime keeps the real composition/input.
// The only synthetic case is a naked first digit that has no Wanxiang preedit
// yet; use the first legal left-panel initial instead of exposing the digit.
export function t9DisplayedPreedit(rawPreedit: string, options: readonly string[]): string {
  const value = String(rawPreedit ?? "");
  if (!/^[2-9]$/.test(value)) return value;
  const first = options.find((item) => /^[a-zv]+$/.test(String(item ?? "")));
  return first ?? value;
}
