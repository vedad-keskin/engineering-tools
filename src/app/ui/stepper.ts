import { Component, computed, contentChildren, inject, input, model } from '@angular/core';
import { Icon } from './icon';

@Component({
  selector: 'app-step',
  template: `
    @if (active()) {
      <div class="step-panel"><ng-content /></div>
    }
  `,
  styles: `
    :host { display: block; }
    .step-panel { animation: step-in var(--dur-2) var(--ease); }
    @keyframes step-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  `,
})
export class Step {
  private readonly parent = inject(Stepper);
  readonly value = input.required<number>();
  readonly label = input('');
  readonly active = computed(() => this.parent.value() === this.value());
}

@Component({
  selector: 'app-stepper',
  imports: [Icon],
  template: `
    <ol class="steps">
      @for (s of steps(); track s.value(); let i = $index; let last = $last) {
        <li [class.active]="s.active()" [class.done]="s.value() < value()">
          <button type="button" class="step-btn" (click)="value.set(s.value())">
            <span class="dot">
              @if (s.value() < value()) {
                <app-icon name="check" [size]="13" [stroke]="2.5" />
              } @else {
                {{ i + 1 }}
              }
            </span>
            <span class="lbl">{{ s.label() }}</span>
          </button>
          @if (!last) {
            <span class="line"><span class="fill"></span></span>
          }
        </li>
      }
    </ol>
    <ng-content />
    <div class="step-nav">
      <button type="button" class="nav-btn" [disabled]="isFirst()" (click)="prev()">
        <app-icon name="chevron-right" [size]="14" class="flip" /> {{ prevLabel() }}
      </button>
      <span class="pos">{{ index() + 1 }} / {{ steps().length }}</span>
      <button type="button" class="nav-btn primary" [disabled]="isLast()" (click)="next()">
        {{ nextLabel() }} <app-icon name="chevron-right" [size]="14" />
      </button>
    </div>
  `,
  styles: `
    :host { display: block; }
    .steps {
      list-style: none;
      margin: 0 0 1.25rem;
      padding: 0;
      display: flex;
      align-items: center;
    }
    li { display: flex; align-items: center; flex: 1; min-width: 0; }
    li:last-child { flex: 0 0 auto; }
    .step-btn {
      background: none;
      border: 0;
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      cursor: pointer;
      color: var(--et-ink-soft);
      font: inherit;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.25rem 0.4rem;
      border-radius: 6px;
      white-space: nowrap;
      transition: color var(--dur-1) var(--ease);
    }
    .dot {
      width: 1.7rem;
      height: 1.7rem;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-family: var(--et-mono);
      font-size: 0.75rem;
      border: 1.5px solid var(--et-border-strong);
      background: var(--et-surface);
      color: var(--et-ink-soft);
      transition: background var(--dur-2) var(--ease), border-color var(--dur-2) var(--ease),
        color var(--dur-2) var(--ease), transform var(--dur-2) var(--ease);
    }
    li.active .dot { background: var(--et-accent); border-color: var(--et-accent); color: #fff; transform: scale(1.08); }
    li.active .step-btn { color: var(--et-ink); }
    li.done .dot { border-color: var(--et-accent); color: var(--et-accent); background: var(--et-accent-soft); }
    .line { flex: 1; height: 2px; background: var(--et-border); margin: 0 0.5rem; border-radius: 2px; overflow: hidden; }
    .fill { display: block; height: 100%; width: 0; background: var(--et-accent); transition: width var(--dur-2) var(--ease); }
    li.done .fill { width: 100%; }

    .step-nav {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 1rem;
      padding-top: 0.85rem;
      border-top: 1px solid var(--et-border);
    }
    .pos { font-family: var(--et-mono); font-size: 0.75rem; color: var(--et-ink-faint); }
    .nav-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      border: 1px solid var(--et-border-strong);
      background: var(--et-surface);
      color: var(--et-ink);
      border-radius: 7px;
      padding: 0.45rem 0.8rem;
      font: inherit;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: background var(--dur-1) var(--ease);
    }
    .nav-btn:hover:not(:disabled) { background: var(--et-surface-2); }
    .nav-btn:disabled { opacity: 0.4; cursor: default; }
    .nav-btn.primary { background: var(--et-accent); border-color: var(--et-accent); color: #fff; }
    .nav-btn.primary:hover:not(:disabled) { background: var(--et-accent-dark); }
    .flip { transform: rotate(180deg); }
    @media (max-width: 720px) {
      .step-btn .lbl { display: none; }
      li.active .step-btn .lbl { display: inline; }
    }
  `,
})
export class Stepper {
  readonly value = model<number>(1);
  readonly prevLabel = input('Back');
  readonly nextLabel = input('Next');
  readonly steps = contentChildren(Step);
  readonly index = computed(() => Math.max(0, this.steps().findIndex((s) => s.value() === this.value())));
  readonly isFirst = computed(() => this.index() === 0);
  readonly isLast = computed(() => this.index() >= this.steps().length - 1);

  next(): void {
    const s = this.steps()[this.index() + 1];
    if (s) this.value.set(s.value());
  }

  prev(): void {
    const s = this.steps()[this.index() - 1];
    if (s) this.value.set(s.value());
  }
}
