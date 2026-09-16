import { Component, ElementRef, afterRenderEffect, input, model, viewChild } from '@angular/core';
import { Icon } from './icon';

/** Native `<dialog>` based modal: header, projected body, optional `[footer]` slot. */
@Component({
  selector: 'app-dialog',
  imports: [Icon],
  template: `
    <dialog #dlg [style.width]="width()" (close)="open.set(false)" (cancel)="onCancel($event)" (keydown.escape)="onCancel($event)" (click)="onBackdrop($event)">
      @if (open()) {
        <div class="box">
          <header>
            <div>
              <h3>{{ header() }}</h3>
              @if (sub()) {
                <p class="sub">{{ sub() }}</p>
              }
            </div>
            <button type="button" class="closex" aria-label="Close" (click)="open.set(false)">
              <app-icon name="x" [size]="16" />
            </button>
          </header>
          <div class="body"><ng-content /></div>
          <footer><ng-content select="[footer]" /></footer>
        </div>
      }
    </dialog>
  `,
  styles: `
    dialog {
      padding: 0;
      border: 0;
      border-radius: 14px;
      background: var(--et-surface);
      color: var(--et-ink);
      max-width: min(96vw, var(--dlg-max, 960px));
      max-height: calc(100dvh - 3rem);
      box-shadow: 0 24px 70px rgba(4, 12, 26, 0.35), 0 0 0 1px var(--et-border);
      overflow: hidden;
    }
    dialog[open] { animation: dlg-in var(--dur-2) var(--ease); }
    dialog::backdrop { background: rgba(6, 14, 28, 0.55); backdrop-filter: blur(2px); animation: fade-in var(--dur-2) var(--ease); }
    .box { display: flex; flex-direction: column; max-height: calc(100dvh - 3rem); }
    header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
      padding: 1rem 1.35rem 0.85rem;
      border-bottom: 1px solid var(--et-border);
    }
    h3 { margin: 0; font-size: 0.98rem; font-weight: 650; letter-spacing: -0.01em; }
    .sub { margin: 0.15rem 0 0; font-size: 0.78rem; color: var(--et-ink-soft); }
    .closex {
      border: 0;
      background: transparent;
      color: var(--et-ink-soft);
      width: 1.9rem;
      height: 1.9rem;
      border-radius: 6px;
      display: grid;
      place-items: center;
      cursor: pointer;
      transition: background var(--dur-1) var(--ease), color var(--dur-1) var(--ease);
    }
    .closex:hover { background: var(--et-surface-2); color: var(--et-ink); }
    .body { padding: 1.1rem 1.35rem; overflow-y: auto; min-height: 0; }
    footer { padding: 0.85rem 1.35rem; border-top: 1px solid var(--et-border); background: var(--et-surface-2); }
    footer:empty { display: none; }
    @keyframes dlg-in { from { opacity: 0; transform: translateY(10px) scale(0.98); } to { opacity: 1; transform: none; } }
    @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
  `,
})
export class Dialog {
  readonly open = model(false);
  readonly header = input('');
  readonly sub = input('');
  readonly width = input('min(640px, 96vw)');
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    afterRenderEffect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }

  onCancel(e: Event): void {
    e.preventDefault();
    this.open.set(false);
  }

  onBackdrop(e: MouseEvent): void {
    if (e.target === this.dlg().nativeElement) this.open.set(false);
  }
}
