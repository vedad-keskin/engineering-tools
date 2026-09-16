import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../ui/toast.service';
import { HistoryStack } from '../power-network/engine/history';
import { ProjectRepository } from '../../core/storage/project-repository';
import { computeGeneral, computeRow } from './engine/calc-engine';
import {
  blankLvRow,
  defaultLvState,
  exampleLvRow,
  migrateLegacyLv,
  type LvCableRow,
  type LvState,
} from './engine/state';

@Injectable()
export class LvStore {
  private readonly repo = inject(ProjectRepository);
  private readonly toast = inject(ToastService);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  private readonly history = new HistoryStack<LvState>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly projectId = signal<string | null>(null);
  readonly state = signal<LvState>(defaultLvState());
  readonly selectedIds = signal<number[]>([]);
  readonly dirty = signal(false);

  readonly derating = computed(() => computeGeneral(this.state().general));
  readonly rowResults = computed(() => {
    const s = this.state();
    const d = this.derating();
    return new Map(s.rows.map((r) => [r.id, computeRow(r, d, s.general)]));
  });

  init(): void {
    this.history.reset(this.state());
    this.syncHistory();
  }

  async loadLatest(): Promise<void> {
    const list = await this.repo.list('lv-cable-sizing');
    if (!list.length) {
      this.init();
      return;
    }
    const stored = await this.repo.get<LvState>(list[0].id);
    if (!stored) return;
    this.projectId.set(stored.id);
    this.state.set(stored.data);
    this.history.reset(stored.data);
    this.syncHistory();
    this.dirty.set(false);
  }

  patch(partial: Partial<LvState>): void {
    this.history.mark(this.state());
    this.syncHistory();
    this.state.update((s) => ({ ...s, ...partial }));
    this.dirty.set(true);
    this.queueSave();
  }

  updateProject(project: LvState['project']): void {
    this.patch({ project });
  }

  updateGeneral(general: LvState['general']): void {
    this.patch({ general });
  }

  addRow(example = false): LvCableRow {
    const s = this.state();
    const row = example ? exampleLvRow(s.nextId) : blankLvRow(s.nextId);
    row.no = s.rows.length + 1;
    this.patch({ rows: [...s.rows, row], nextId: s.nextId + 1 });
    return row;
  }

  updateRow(row: LvCableRow): void {
    this.patch({ rows: this.state().rows.map((r) => (r.id === row.id ? row : r)) });
  }

  deleteRow(id: number): void {
    this.patch({ rows: this.state().rows.filter((r) => r.id !== id) });
  }

  duplicateRow(id: number): void {
    const s = this.state();
    const src = s.rows.find((r) => r.id === id);
    if (!src) return;
    const copy = { ...structuredClone(src), id: s.nextId, no: s.rows.length + 1 };
    this.patch({ rows: [...s.rows, copy], nextId: s.nextId + 1 });
  }

  replaceState(next: LvState): void {
    this.history.mark(this.state());
    this.syncHistory();
    this.state.set(next);
    this.dirty.set(true);
    this.queueSave();
  }

  importUnknown(raw: unknown): boolean {
    const migrated = migrateLegacyLv(raw);
    if (!migrated) return false;
    this.replaceState(migrated);
    return true;
  }

  undo(): void {
    const prev = this.history.undo(this.state());
    this.syncHistory();
    if (prev) {
      this.state.set(prev);
      this.dirty.set(true);
      this.queueSave();
    }
  }

  redo(): void {
    const next = this.history.redo(this.state());
    this.syncHistory();
    if (next) {
      this.state.set(next);
      this.dirty.set(true);
      this.queueSave();
    }
  }

  async saveNow(notify = false): Promise<void> {
    const s = this.state();
    const name = s.project.projectName || s.project.title || 'LV Cable Sizing';
    const id = this.projectId();
    if (id) {
      await this.repo.save({
        id,
        toolId: 'lv-cable-sizing',
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: s,
      });
    } else {
      const created = await this.repo.create('lv-cable-sizing', name, s);
      this.projectId.set(created.id);
    }
    this.dirty.set(false);
    if (notify) this.toast.success('Saved');
  }

  newProject(): void {
    this.projectId.set(null);
    this.state.set(defaultLvState());
    this.history.reset(this.state());
    this.syncHistory();
    this.dirty.set(false);
  }

  private syncHistory(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  private queueSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void this.saveNow();
    }, 900);
  }
}
