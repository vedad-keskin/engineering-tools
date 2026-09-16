import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../ui/toast.service';
import { HistoryStack } from '../power-network/engine/history';
import { ProjectRepository } from '../../core/storage/project-repository';
import { calculateLightningRisk } from './engine/calc-engine';
import { KTC_EXAMPLE } from './engine/data';
import {
  defaultLightningState,
  migrateLegacyLightning,
  type LightningState,
} from './engine/state';

@Injectable()
export class LightningStore {
  private readonly repo = inject(ProjectRepository);
  private readonly toast = inject(ToastService);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  private readonly history = new HistoryStack<LightningState>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly projectId = signal<string | null>(null);
  readonly state = signal<LightningState>(defaultLightningState());
  readonly result = computed(() => calculateLightningRisk(this.state()));

  async loadLatest(): Promise<void> {
    const list = await this.repo.list('lightning-risk');
    if (!list.length) {
      this.history.reset(this.state());
      this.syncHistory();
      return;
    }
    const stored = await this.repo.get<LightningState>(list[0].id);
    if (!stored) return;
    this.projectId.set(stored.id);
    this.state.set(stored.data);
    this.history.reset(stored.data);
    this.syncHistory();
  }

  patch(partial: Partial<LightningState>): void {
    this.history.mark(this.state());
    this.syncHistory();
    this.state.update((s) => ({ ...s, ...partial }));
    this.queueSave();
  }

  loadExample(): void {
    this.patch({ ...defaultLightningState(), ...KTC_EXAMPLE, project: { ...KTC_EXAMPLE.project } });
  }

  importUnknown(raw: unknown): boolean {
    const migrated = migrateLegacyLightning(raw);
    if (!migrated) return false;
    this.history.mark(this.state());
    this.syncHistory();
    this.state.set(migrated);
    this.queueSave();
    return true;
  }

  newProject(): void {
    this.projectId.set(null);
    const next = defaultLightningState();
    this.state.set(next);
    this.history.reset(next);
    this.syncHistory();
  }

  undo(): void {
    const prev = this.history.undo(this.state());
    this.syncHistory();
    if (prev) this.state.set(prev);
  }

  redo(): void {
    const next = this.history.redo(this.state());
    this.syncHistory();
    if (next) this.state.set(next);
  }

  async saveNow(notify = false): Promise<void> {
    const s = this.state();
    const name = s.project.name || 'Lightning Risk';
    const id = this.projectId();
    if (id) {
      await this.repo.save({
        id,
        toolId: 'lightning-risk',
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: s,
      });
    } else {
      const created = await this.repo.create('lightning-risk', name, s);
      this.projectId.set(created.id);
    }
    if (notify) this.toast.success('Saved');
  }

  private syncHistory(): void {
    this.canUndo.set(this.history.canUndo);
    this.canRedo.set(this.history.canRedo);
  }

  private queueSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => void this.saveNow(), 900);
  }
}
