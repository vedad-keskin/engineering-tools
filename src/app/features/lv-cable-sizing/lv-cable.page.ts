import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NumberField } from '../../shared/number-field';
import { SelectField } from '../../shared/select-field';
import { MetricStrip } from '../../shared/metric-strip';
import { StatusBadge } from '../../shared/status-badge';
import { EmptyState } from '../../shared/empty-state';
import { ProjectInfoForm } from '../../shared/project-info-form';
import { NumPipe } from '../../shared/num.pipe';
import { LocaleService } from '../../core/locale.service';
import { PrintService, escapeHtml } from '../../core/export/print.service';
import { downloadCsv, downloadJson, pickJsonFile, readJsonFile } from '../../core/export/file-export';
import { ShortcutsService } from '../../core/shortcuts.service';
import { Button, Checkbox, ConfirmService, Dialog, Icon, Tab, Tabs, ToastService } from '../../ui';
import { ENUMS } from './engine/data';
import { LvStore } from './lv.store';
import type { LvCableRow, LvState } from './engine/state';

@Component({
  selector: 'app-lv-cable-page',
  imports: [
    TranslocoPipe,
    Button,
    Tabs,
    Tab,
    Dialog,
    Checkbox,
    Icon,
    NumberField,
    SelectField,
    MetricStrip,
    StatusBadge,
    EmptyState,
    ProjectInfoForm,
    NumPipe,
  ],
  providers: [LvStore],
  templateUrl: './lv-cable.page.html',
  styleUrl: './lv-cable.page.css',
})
export class LvCablePage implements OnInit {
  readonly store = inject(LvStore);
  readonly locale = inject(LocaleService);
  readonly print = inject(PrintService);
  readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly shortcuts = inject(ShortcutsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly enums = ENUMS;
  readonly tab = signal('project');
  readonly editing = signal<LvCableRow | null>(null);
  readonly editorOpen = computed(() => this.editing() !== null);
  readonly pdfOpen = signal(false);
  readonly pdfOpts = signal({ cover: true, params: true, schedule: true, detailed: false });

  readonly summary = computed(() => {
    const results = [...this.store.rowResults().values()];
    const ok = results.filter((r) => r.remarks === 'ACCEPTABLE').length;
    const fail = results.filter((r) => r.remarks === 'NOT ACCEPTABLE').length;
    return { total: results.length, ok, fail, other: results.length - ok - fail };
  });

  ngOnInit(): void {
    void this.store.loadLatest();
    this.shortcuts.commands.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => {
      if (c.id === 'undo') this.store.undo();
      if (c.id === 'redo') this.store.redo();
      if (c.id === 'save') void this.store.saveNow(true);
    });
  }

  statusTone(remarks: string | null | undefined): 'ok' | 'fail' | 'warn' | 'muted' {
    if (remarks === 'ACCEPTABLE') return 'ok';
    if (remarks === 'NOT ACCEPTABLE') return 'fail';
    if (remarks === 'INCOMPLETE') return 'warn';
    return 'muted';
  }

  openEditor(row: LvCableRow): void {
    this.editing.set(structuredClone(row));
  }

  closeEditor(open: boolean): void {
    if (!open) this.editing.set(null);
  }

  saveEditor(): void {
    const row = this.editing();
    if (row) this.store.updateRow(row);
    this.editing.set(null);
  }

  addAndEdit(): void {
    this.tab.set('schedule');
    this.openEditor(this.store.addRow());
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
    downloadJson(s.project.projectName || 'lv-cable-sizing', s);
  }

  exportCsv(): void {
    const s = this.store.state();
    const results = this.store.rowResults();
    const rows = [
      ['#', 'Tag', 'Load', 'kW', 'Size', 'FLC', "Iz'", 'VD%', 'Status'],
      ...s.rows.map((r) => {
        const res = results.get(r.id);
        return [
          String(r.no),
          r.panel,
          r.loadName,
          String(r.ratedLoadKW),
          `${r.noCores}x${r.cableSize}`,
          String(res?.flc ?? ''),
          String(res?.deratedAmpacity ?? ''),
          String(res?.cableVDPct ?? ''),
          String(res?.remarks ?? ''),
        ];
      }),
    ];
    downloadCsv(s.project.projectName || 'lv-schedule', rows);
  }

  exportPdf(): void {
    const s = this.store.state();
    const opts = this.pdfOpts();
    const d = this.store.derating();
    const results = this.store.rowResults();
    const parts: string[] = [];
    if (opts.cover) {
      parts.push(`<section class="page"><h1>${escapeHtml(s.project.title)}</h1>
        <div class="meta">${escapeHtml(s.project.projectName)} · ${escapeHtml(s.project.projectNo)} · ${escapeHtml(s.project.date)}</div>
        <div class="grid">
          <div>Client<br><strong>${escapeHtml(s.project.client)}</strong></div>
          <div>Prepared<br><strong>${escapeHtml(s.project.preparedBy)}</strong></div>
          <div>Checked<br><strong>${escapeHtml(s.project.checkedBy)}</strong></div>
          <div>Approved<br><strong>${escapeHtml(s.project.approvedBy)}</strong></div>
          <div>Code<br><strong>${escapeHtml(s.project.code)}</strong></div>
          <div>Revision<br><strong>${escapeHtml(s.project.revision)}</strong></div>
        </div></section>`);
    }
    if (opts.params) {
      parts.push(`<section class="page"><h2>Design conditions</h2>
        <div class="grid">
          <div>Indoor ${s.general.site.maxIndoorTemp} °C</div>
          <div>Outdoor ${s.general.site.maxOutdoorTemp} °C</div>
          <div>Ground ${s.general.site.maxGroundTemp} °C</div>
          <div>Soil ${s.general.site.soilResistivity} K·m/W</div>
          <div>Insulation ${s.general.site.insulationType}</div>
          <div>Bunched indoor k ${d.bunched.indoor.total}</div>
          <div>Bunched outdoor k ${d.bunched.outdoor.total}</div>
          <div>UG k ${d.underground.total}</div>
        </div></section>`);
    }
    if (opts.schedule) {
      parts.push(`<section class="page"><h2>Cable schedule</h2>
        <table><thead><tr><th>#</th><th>Tag</th><th>Load</th><th>kW</th><th>Size</th><th>FLC</th><th>Iz'</th><th>VD%</th><th>Status</th></tr></thead><tbody>
        ${s.rows
          .map((r) => {
            const res = results.get(r.id);
            return `<tr><td>${r.no}</td><td>${escapeHtml(r.panel)}</td><td>${escapeHtml(r.loadName)}</td><td>${r.ratedLoadKW}</td><td>${r.noCores}×${r.cableSize}</td><td>${res?.flc?.toFixed(1) ?? '–'}</td><td>${res?.deratedAmpacity?.toFixed(1) ?? '–'}</td><td>${res?.cableVDPct?.toFixed(2) ?? '–'}</td><td>${res?.remarks ?? ''}</td></tr>`;
          })
          .join('')}
        </tbody></table></section>`);
    }
    if (opts.detailed) {
      for (const r of s.rows) {
        const res = results.get(r.id);
        parts.push(`<section class="page"><h2>${escapeHtml(r.panel)} ${escapeHtml(r.loadName)}</h2>
          <div class="grid">
            <div>FLC ${res?.flc?.toFixed(2) ?? '–'} A</div>
            <div>Iz' ${res?.deratedAmpacity?.toFixed(2) ?? '–'} A</div>
            <div>VD ${res?.cableVDPct?.toFixed(2) ?? '–'} %</div>
            <div>Start VD ${res?.startVDPct ?? '–'}</div>
            <div>Max EFL ${res?.maxCableLength ?? '–'}</div>
            <div>Status ${res?.remarks ?? ''}</div>
          </div></section>`);
      }
    }
    this.print.printHtml(s.project.title, parts.join(''));
    this.pdfOpen.set(false);
  }

  async confirmDelete(id: number): Promise<void> {
    const ok = await this.confirm.confirm({
      title: this.transloco.translate('lv.deleteCable'),
      confirmLabel: this.transloco.translate('common.delete'),
      danger: true,
    });
    if (!ok) return;
    this.store.deleteRow(id);
    this.editing.set(null);
  }

  setPdfOpt(key: keyof ReturnType<LvCablePage['pdfOpts']>, value: boolean): void {
    this.pdfOpts.update((o) => ({ ...o, [key]: value }));
  }

  patchRow<K extends keyof LvCableRow>(key: K, value: LvCableRow[K]): void {
    const row = this.editing();
    if (!row) return;
    this.editing.set({ ...row, [key]: value });
  }

  patchGeneral(path: string, value: string | number): void {
    const g = structuredClone(this.store.state().general) as unknown as Record<string, unknown>;
    const parts = path.split('.');
    let cur: Record<string, unknown> = g;
    for (let i = 0; i < parts.length - 1; i++) {
      cur = cur[parts[i]] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
    this.store.updateGeneral(g as unknown as LvState['general']);
  }

  chip(label: string, value: unknown, digits = 3) {
    return { label, value: this.locale.formatNumber(typeof value === 'number' ? value : Number(value), digits) };
  }

  txt(v: unknown): string {
    return String(v ?? '');
  }
}
