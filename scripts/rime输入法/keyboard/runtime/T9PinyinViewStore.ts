/**
 * Transient nine-key pinyin-option projection.
 * It neither owns the Rime Session nor persists user input.
 */
export class T9PinyinViewStore {
  private options: string[] = [];
  private readonly listeners = new Set<(options: string[]) => void>();
  private disposed = false;

  getSnapshot(): string[] {
    return this.options;
  }

  publish(options: string[]): boolean {
    if (this.disposed) return false;
    if (this.options.length === options.length &&
        this.options.every((value, index) => value === options[index])) {
      return false;
    }
    this.options = options;
    for (const listener of this.listeners) listener(options);
    return true;
  }

  subscribe(listener: (options: string[]) => void): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.listeners.clear();
    this.options = [];
  }
}
