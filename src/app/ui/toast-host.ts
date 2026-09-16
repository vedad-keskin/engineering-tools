import { Component, inject } from '@angular/core';
import { Icon } from './icon';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [Icon],
  template: `
    <div class="stack" aria-live="polite">
      @for (t of svc.toasts(); track t.id) {
        <div class="toast" [class]="'toast ' + t.severity" role="status">
          <span class="ic">
            <app-icon [name]="icon(t.severity)" [size]="17" />
          </span>
          <div class="txt">
            <strong>{{ t.summary }}</strong>
            @if (t.detail) {
              <span>{{ t.detail }}</span>
            }
          </div>
          @if (t.action; as a) {
            <button type="button" class="act" (click)="a.run(); svc.dismiss(t.id)">{{ a.label }}</button>
          }
          <button type="button" class="x" aria-label="Dismiss" (click)="svc.dismiss(t.id)">
            <app-icon name="x" [size]="14" />
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .stack {
      position: fixed;
      right: 1rem;
      bottom: 1rem;
      z-index: 200;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      width: min(360px, calc(100vw - 2rem));
      pointer-events: none;
    }
    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 0.65rem;
      padding: 0.7rem 0.75rem 0.7rem 0.85rem;
      border-radius: 10px;
      background: var(--et-surface);
      border: 1px solid var(--et-border);
      border-left: 3px solid var(--tone);
      box-shadow: 0 12px 30px rgba(4, 12, 26, 0.18);
      animation: toast-in var(--dur-2) var(--ease);
      font-size: 0.82rem;
    }
    .toast.success { --tone: var(--et-ok); }
    .toast.info { --tone: var(--et-accent); }
    .toast.warn { --tone: var(--et-warn); }
    .toast.error { --tone: var(--et-fail); }
    .ic { color: var(--tone); display: inline-flex; margin-top: 0.05rem; }
    .txt { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
    .txt span { color: var(--et-ink-soft); }
    .x, .act {
      border: 0;
      background: transparent;
      color: var(--et-ink-soft);
      cursor: pointer;
      border-radius: 5px;
      display: grid;
      place-items: center;
      padding: 0.2rem;
      font: inherit;
    }
    .act { color: var(--et-accent); font-weight: 650; font-size: 0.78rem; padding: 0.15rem 0.45rem; }
    .x:hover, .act:hover { background: var(--et-surface-2); }
    @keyframes toast-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
  `,
})
export class ToastHost {
  readonly svc = inject(ToastService);

  icon(sev: string): string {
    if (sev === 'success') return 'check-circle';
    if (sev === 'warn') return 'alert';
    if (sev === 'error') return 'alert';
    return 'info';
  }
}
