export type CandidateEntry = {
  candidate: Rime.Candidate;
  originalIndex: number;
};

// Display projection only. Never mutates or filters the Rime candidate itself.
export function firstDisplayLine(value: string): string {
  const text = String(value ?? "");
  if (!text.includes("\n") && !text.includes("\r")) return text;
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const firstLine = lines[0] ?? "";
  if (firstLine.length > 0) return firstLine;
  return lines.find((line) => line.trim().length > 0) ?? "";
}

export function currentPageEntries(context: Rime.Context | null): CandidateEntry[] {
  const menu = context?.menu;
  if (!menu) return [];
  const base = Math.max(0, menu.pageNo ?? 0) * Math.max(1, menu.pageSize ?? 1);
  return (menu.candidates ?? []).map((candidate, index) => ({
    candidate,
    originalIndex: base + index
  }));
}
