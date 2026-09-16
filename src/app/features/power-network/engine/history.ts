/**
 * Snapshot-based undo/redo stack.
 *
 * Call `mark(stateBeforeChange)` right before mutating state; `undo(current)` /
 * `redo(current)` return the state to restore, or `null` when nothing is available.
 */
export class HistoryStack<T> {
  private readonly max: number;
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  constructor(max = 60) {
    this.max = max;
  }

  private snapshot(state: T): string {
    return JSON.stringify(state);
  }

  reset(_state: T): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  mark(stateBeforeChange: T): void {
    const cur = this.snapshot(stateBeforeChange);
    if (this.undoStack[this.undoStack.length - 1] !== cur) {
      this.undoStack.push(cur);
      if (this.undoStack.length > this.max) this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(current: T): T | null {
    const prev = this.undoStack.pop();
    if (prev === undefined) return null;
    this.redoStack.push(this.snapshot(current));
    return JSON.parse(prev) as T;
  }

  redo(current: T): T | null {
    const next = this.redoStack.pop();
    if (next === undefined) return null;
    this.undoStack.push(this.snapshot(current));
    if (this.undoStack.length > this.max) this.undoStack.shift();
    return JSON.parse(next) as T;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
