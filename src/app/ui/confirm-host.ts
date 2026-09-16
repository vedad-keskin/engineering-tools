import { Component, computed, inject } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
import { Button } from './button';
import { ConfirmService } from './confirm.service';
import { Dialog } from './dialog';

@Component({
  selector: 'app-confirm-host',
  imports: [Dialog, Button, TranslocoPipe],
  template: `
    <app-dialog [open]="isOpen()" (openChange)="onOpenChange($event)" [header]="p()?.title ?? ''" width="min(420px, 94vw)">
      @if (p()?.body) {
        <p class="body">{{ p()?.body }}</p>
      }
      <div footer class="row">
        <app-button variant="ghost" [label]="p()?.cancelLabel || ('common.cancel' | transloco)" (clicked)="svc.answer(false)" />
        <app-button
          [variant]="p()?.danger ? 'danger' : 'primary'"
          [label]="p()?.confirmLabel || ('common.confirm' | transloco)"
          (clicked)="svc.answer(true)"
        />
      </div>
    </app-dialog>
  `,
  styles: `
    .body { margin: 0; color: var(--et-ink-soft); font-size: 0.88rem; line-height: 1.5; }
    .row { display: flex; justify-content: flex-end; gap: 0.5rem; }
  `,
})
export class ConfirmHost {
  readonly svc = inject(ConfirmService);
  readonly p = this.svc.pending;
  readonly isOpen = computed(() => this.p() !== null);

  onOpenChange(open: boolean): void {
    if (!open && this.p()) this.svc.answer(false);
  }
}
