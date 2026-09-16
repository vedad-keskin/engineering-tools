import { Injectable, computed, inject, signal } from '@angular/core';
import { ToastService } from '../../ui/toast.service';
import { HistoryStack } from './engine/history';
import { ProjectRepository } from '../../core/storage/project-repository';
import {
  blankNode,
  defaultPowerState,
  loadExample,
  SYSTEM_COLORS,
  type NodeType,
  type PowerNode,
  type PowerScenario,
  type PowerState,
  type PowerSystem,
} from './engine/data';
import { migrateLegacyPower } from './engine/migrate';
import { deriveCategory, nodeRollup, systemTotals } from './engine/calc-engine';
import { dgLayout } from './engine/geometry';

@Injectable()
export class PowerStore {
  private readonly repo = inject(ProjectRepository);
  private readonly toast = inject(ToastService);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  private readonly history = new HistoryStack<PowerState>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  readonly projectId = signal<string | null>(null);
  readonly state = signal<PowerState>(defaultPowerState());
  readonly dirty = signal(false);
  readonly ready = signal(false);

  readonly scenario = computed(() => {
    const s = this.state();
    return s.scenarios.find((x) => x.id === s.activeScenarioId) ?? null;
  });
  readonly totals = computed(() => systemTotals(this.state().nodes, this.scenario()));
  readonly loads = computed(() => this.state().nodes.filter((n) => n.type === 'load'));
  readonly equipment = computed(() => this.state().nodes.filter((n) => n.type !== 'load'));

  async loadLatest(): Promise<void> {
    try {
      const list = await this.repo.list('power-network');
      if (!list.length) {
        this.history.reset(this.state());
        this.syncHistory();
        return;
      }
      const stored = await this.repo.get<PowerState>(list[0].id);
      if (!stored) return;
      this.projectId.set(stored.id);
      this.state.set(stored.data);
      this.history.reset(stored.data);
      this.syncHistory();
    } finally {
      this.ready.set(true);
    }
  }

  patch(partial: Partial<PowerState>): void {
    this.history.mark(this.state());
    this.syncHistory();
    this.state.update((s) => ({ ...s, ...partial }));
    this.dirty.set(true);
    this.queueSave();
  }

  replace(next: PowerState): void {
    this.history.mark(this.state());
    this.syncHistory();
    this.state.set(next);
    this.dirty.set(true);
    this.queueSave();
  }

  importUnknown(raw: unknown): boolean {
    const migrated = migrateLegacyPower(raw);
    if (!migrated) return false;
    this.replace(migrated);
    return true;
  }

  loadDemo(): void {
    this.replace(loadExample());
    this.relayout(true);
  }

  newProject(): void {
    this.projectId.set(null);
    const next = defaultPowerState();
    this.state.set(next);
    this.history.reset(next);
    this.syncHistory();
    this.dirty.set(false);
  }

  addNode(type: NodeType, parentId: number | null = null): PowerNode {
    const s = this.state();
    const node = blankNode(type, s.nextId, s.defaults);
    node.parentId = parentId;
    if (parentId != null) {
      const parent = s.nodes.find((n) => n.id === parentId);
      if (parent?.systemId) node.systemId = parent.systemId;
    }
    this.patch({ nodes: [...s.nodes, node], nextId: s.nextId + 1 });
    return node;
  }

  updateNode(node: PowerNode): void {
    this.patch({ nodes: this.state().nodes.map((n) => (n.id === node.id ? node : n)) });
  }

  deleteNode(id: number): void {
    this.patch({
      nodes: this.state().nodes.filter((n) => n.id !== id).map((n) => ({
        ...n,
        parentId: n.parentId === id ? null : n.parentId,
        redundantParentId: n.redundantParentId === id ? null : n.redundantParentId,
      })),
    });
  }

  addSystem(name: string): void {
    const s = this.state();
    const sys: PowerSystem = {
      id: s.nextSystemId,
      name,
      color: SYSTEM_COLORS[s.systems.length % SYSTEM_COLORS.length],
    };
    this.patch({ systems: [...s.systems, sys], nextSystemId: s.nextSystemId + 1 });
  }

  addScenario(name: string): void {
    const s = this.state();
    const sc: PowerScenario = { id: s.nextScenarioId, name, overrides: {} };
    this.patch({
      scenarios: [...s.scenarios, sc],
      nextScenarioId: s.nextScenarioId + 1,
      activeScenarioId: sc.id,
    });
  }

  setActiveScenario(id: number | null): void {
    this.patch({ activeScenarioId: id });
  }

  relayout(force = true): void {
    const s = structuredClone(this.state());
    dgLayout(s.nodes, s.systems, force);
    s.diagram = { ...s.diagram, laidOut: true };
    this.replace(s);
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

  categoryOf(node: PowerNode): string {
    return deriveCategory(this.state().nodes, node, this.scenario());
  }

  rollupOf(node: PowerNode) {
    return nodeRollup(this.state().nodes, node, this.scenario());
  }

  async saveNow(notify = false): Promise<void> {
    const s = this.state();
    const name = s.project.projectName || s.project.title || 'Power Network';
    const id = this.projectId();
    if (id) {
      await this.repo.save({
        id,
        toolId: 'power-network',
        name,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        data: s,
      });
    } else {
      const created = await this.repo.create('power-network', name, s);
      this.projectId.set(created.id);
    }
    this.dirty.set(false);
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
