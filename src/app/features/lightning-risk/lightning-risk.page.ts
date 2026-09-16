import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { NumberField } from '../../shared/number-field';
import { SelectField } from '../../shared/select-field';
import { ProjectInfoForm } from '../../shared/project-info-form';
import { StatusBadge } from '../../shared/status-badge';
import { MetricStrip } from '../../shared/metric-strip';
import { PrintService, escapeHtml } from '../../core/export/print.service';
import { downloadJson, pickJsonFile, readJsonFile } from '../../core/export/file-export';
import { ShortcutsService } from '../../core/shortcuts.service';
import { Button, Icon, Step, Stepper, ToastService } from '../../ui';
import { RT, STANDARD_EDITION, TABLES } from './engine/data';
import { LightningStore } from './lightning.store';

@Component({
  selector: 'app-lightning-risk-page',
  imports: [
    TranslocoPipe,
    Button,
    Icon,
    Stepper,
    Step,
    NumberField,
    SelectField,
    ProjectInfoForm,
    StatusBadge,
    MetricStrip,
  ],
  providers: [LightningStore],
  templateUrl: './lightning-risk.page.html',
  styleUrl: './lightning-risk.page.css',
})
export class LightningRiskPage implements OnInit {
  readonly store = inject(LightningStore);
  readonly print = inject(PrintService);
  readonly transloco = inject(TranslocoService);
  private readonly toast = inject(ToastService);
  private readonly shortcuts = inject(ShortcutsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly edition = STANDARD_EDITION;
  readonly rt = RT;
  readonly tables = TABLES;
  readonly step = signal(1);

  ngOnInit(): void {
    void this.store.loadLatest();
    this.shortcuts.commands.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((c) => {
      if (c.id === 'undo') this.store.undo();
      if (c.id === 'redo') this.store.redo();
      if (c.id === 'save') void this.store.saveNow(true);
    });
  }

  labels(table: readonly { label: string }[]): string[] {
    return table.map((r) => r.label);
  }

  txt(v: unknown): string {
    return String(v ?? '');
  }

  tone(result: string): 'ok' | 'fail' | 'warn' {
    return result === 'ACCEPTABLE' ? 'ok' : 'fail';
  }

  barPct(value: number, limit: number): number {
    return Math.min(100, (value / limit) * 100);
  }

  exp(v: number): string {
    return Number.isFinite(v) ? v.toExponential(2) : '–';
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
    downloadJson(this.store.state().project.name || 'lightning-risk', this.store.state());
  }

  exportPdf(): void {
    const s = this.store.state();
    const r = this.store.result();
    const body = r.incomplete
      ? '<p>Incomplete inputs.</p>'
      : `<h1>${escapeHtml(s.project.name)}</h1>
         <div class="meta">${this.edition.label}</div>
         <div class="grid">
           <div>R1 ${r.R1.toExponential(3)} <span class="${r.result1 === 'ACCEPTABLE' ? 'ok' : 'fail'}">${r.result1}</span></div>
           <div>R2 ${r.R2.toExponential(3)} <span class="${r.result2 === 'ACCEPTABLE' ? 'ok' : 'fail'}">${r.result2}</span></div>
           <div>R3 ${r.R3.toExponential(3)} <span class="${r.result3 === 'ACCEPTABLE' ? 'ok' : 'fail'}">${r.result3}</span></div>
         </div>
         <p>ND ${r.ND.toExponential(3)} · NM ${r.NM.toExponential(3)} · PA ${r.PA} · PB ${r.PB}</p>`;
    this.print.printHtml(s.project.name || 'Lightning risk', body);
  }
}
