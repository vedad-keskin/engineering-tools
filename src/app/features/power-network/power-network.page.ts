import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ProjectInfoForm } from '../../shared/project-info-form';
import { NumberField } from '../../shared/number-field';
import { SelectField } from '../../shared/select-field';
import { EmptyState } from '../../shared/empty-state';
import { StatusBadge } from '../../shared/status-badge';
import { NumPipe } from '../../shared/num.pipe';
import { PrintService, escapeHtml } from '../../core/export/print.service';
import { downloadCsv, downloadJson, pickJsonFile, readJsonFile } from '../../core/export/file-export';
import { ShortcutsService } from '../../core/shortcuts.service';
import { Button, ConfirmService, Dialog, Icon, Progress, SkeletonTable, Tab, Tabs, ToastService } from '../../ui';
import { TYPE_FIELDS, TYPE_META, type NodeType, type PowerNode } from './engine/data';
import { PowerStore } from './power.store';
import { NetworkDiagramComponent } from './network-diagram';
import { CategoryChart } from './category-chart';

@Component({
  selector: 'app-power-network-page',
  imports: [
    TranslocoPipe,
    Button,
    Tabs,
    Tab,
    Dialog,
    Progress,
    Icon,
    ProjectInfoForm,
    NumberField,
    SelectField,
    EmptyState,
    StatusBadge,
    NumPipe,
    NetworkDiagramComponent,
    CategoryChart,
    SkeletonTable,
  ],
  providers: [PowerStore],
  templateUrl: './power-network.page.html',
  styleUrl: './power-network.page.css',
})
export class PowerNetworkPage implements OnInit {
  readonly store = inject(PowerStore);
  readonly print = inject(PrintService);
  readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly shortcuts = inject(ShortcutsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly types = Object.keys(TYPE_META) as NodeType[];
  readonly typeMeta = TYPE_META;
  readonly typeFields = TYPE_FIELDS;
  readonly tab = signal('project');
  readonly editing = signal<PowerNode | null>(null);
  readonly editorOpen = computed(() => this.editing() !== null);
  readonly addType = signal<NodeType>('load');

  readonly catPct = computed(() => {
    const t = this.store.totals();
    const pct = (kw: number) => (t.demandKW ? (100 * kw) / t.demandKW : 0);
    return {
      critical: pct(t.cat.critical.kW),
      essential: pct(t.cat.essential.kW),
      nonEssential: pct(t.cat['non-essential'].kW),
    };
  });

  ngOnInit(): void {
    void this.store.loadLatest();
    this.shortcuts.commands.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => {
      if (c.id === 'undo') this.store.undo();
      if (c.id === 'redo') this.store.redo();
      if (c.id === 'save') void this.store.saveNow(true);
    });
  }

  closeEditor(open: boolean): void {
    if (!open) this.editing.set(null);
  }

  add(): void {
    const node = this.store.addNode(this.addType());
    this.editing.set(node);
  }

  saveEditor(): void {
    const node = this.editing();
    if (node) this.store.updateNode(node);
    this.editing.set(null);
  }

  async deleteNode(node: PowerNode): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `${this.transloco.translate('common.delete')} ${node.tag || node.name}?`,
      confirmLabel: this.transloco.translate('common.delete'),
      danger: true,
    });
    if (!ok) return;
    this.store.deleteNode(node.id);
    this.editing.set(null);
  }

  patchNode(key: string, value: unknown): void {
    const node = this.editing();
    if (!node) return;
    this.editing.set({ ...node, [key]: value } as PowerNode);
  }

  parentTag(node: PowerNode): string {
    return this.store.state().nodes.find((n) => n.id === node.parentId)?.tag || '—';
  }

  parentOptions(): { label: string; value: number | null }[] {
    return [
      { label: '—', value: null },
      ...this.store.state().nodes
        .filter((n) => n.type !== 'load')
        .map((n) => ({ label: n.tag || n.name, value: n.id })),
    ];
  }

  utilTone(node: PowerNode): 'ok' | 'fail' | 'warn' | 'muted' {
    const r = this.store.rollupOf(node);
    return r.badge ?? 'muted';
  }

  async importJson(): Promise<void> {
    const file = await pickJsonFile();
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      if (!this.store.importUnknown(data)) {
        this.toast.error(this.transloco.translate('common.importFail'));
        return;
      }
      this.toast.success(this.transloco.translate('common.imported'));
    } catch {
      this.toast.error(this.transloco.translate('common.importFail'));
    }
  }

  exportJson(): void {
    const s = this.store.state();
    downloadJson(s.project.projectName || 'power-network', { tool: 'power-network', ...s });
  }

  exportCsv(): void {
    const s = this.store.state();
    downloadCsv(s.project.projectName || 'power-schedule', [
      ['Tag', 'Name', 'Type', 'kW', 'Category'],
      ...s.nodes.map((n) => [
        n.tag,
        n.name,
        n.type,
        String(n.ratedKW ?? ''),
        n.type === 'load' ? this.store.categoryOf(n) : '',
      ]),
    ]);
  }

  exportPdf(): void {
    const s = this.store.state();
    const t = this.store.totals();
    const rows = s.nodes
      .map((n) => {
        const r = this.store.rollupOf(n);
        return `<tr><td>${escapeHtml(n.tag)}</td><td>${escapeHtml(n.name)}</td><td>${n.type}</td><td>${r.activeKVA.toFixed(1)}</td><td>${r.utilizationPct?.toFixed(0) ?? '–'}%</td></tr>`;
      })
      .join('');
    this.print.printHtml(
      s.project.title,
      `<h1>${escapeHtml(s.project.title)}</h1>
       <div class="meta">${escapeHtml(s.project.projectName)} · ${escapeHtml(s.project.date)}</div>
       <h2>Summary</h2>
       <div class="grid">
         <div>Demand kW <strong>${t.demandKW.toFixed(1)}</strong></div>
         <div>Demand kVA <strong>${t.demandKVA.toFixed(1)}</strong></div>
         <div>Critical kW <strong>${t.cat.critical.kW.toFixed(1)}</strong></div>
         <div>Essential kW <strong>${t.cat.essential.kW.toFixed(1)}</strong></div>
         <div>Non-essential kW <strong>${t.cat['non-essential'].kW.toFixed(1)}</strong></div>
       </div>
       <h2>Equipment</h2>
       <table><thead><tr><th>Tag</th><th>Name</th><th>Type</th><th>kVA</th><th>Util</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  typeLabel(type: NodeType): string {
    return TYPE_META[type].label;
  }
}
