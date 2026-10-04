export function rimeFileManager(): any {
  return (globalThis as any).FileManager;
}

export function readRimeText(path: string): string {
  try {
    return String(rimeFileManager()?.readAsStringSync?.(path, "utf-8") ?? "");
  } catch {
    return "";
  }
}

export function writeRimeText(path: string, content: string): void {
  const manager = rimeFileManager();
  if (!manager?.writeAsStringSync) throw new Error("当前 FileManager 无法写入 Rime 配置");
  manager.writeAsStringSync(path, content);
}

export function indentationWidth(line: string): number {
  return (line.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "  ").length;
}
