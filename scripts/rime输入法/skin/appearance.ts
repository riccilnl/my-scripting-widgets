type EffectiveColorScheme = "light" | "dark";

export function resolveEffectiveColorScheme(
  systemScheme: EffectiveColorScheme
): EffectiveColorScheme {
  const appearance = String(
    (globalThis as any).CustomKeyboard?.traits?.keyboardAppearance ?? ""
  ).toLowerCase();
  if (appearance === "light" || appearance === "dark") return appearance;
  return systemScheme;
}
