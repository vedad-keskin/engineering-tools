import {
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  contentChildren,
  inject,
  input,
  model,
  signal,
  viewChildren,
} from '@angular/core';

@Component({
  selector: 'app-tab',
  template: `
    @if (active()) {
      <div class="tab-panel"><ng-content /></div>
    }
  `,
  styles: `
    :host { display: block; }
    .tab-panel { animation: tab-in var(--dur-2) var(--ease); }
    @keyframes tab-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  `,
})
export class Tab {
  private readonly parent = inject(Tabs);
  readonly value = input.required<string>();
  readonly label = input('');
  readonly icon = input('');
  readonly badge = input<string | number | null>(null);
  readonly active = computed(() => this.parent.value() === this.value());
}

@Component({
  selector: 'app-tabs',
  template: `
    <div class="tablist" role="tablist">
      @for (t of tabs(); track t.value()) {
        <button
          #btn
          type="button"
          role="tab"
          class="tab"
          [class.active]="t.active()"
          [attr.aria-selected]="t.active()"
          (click)="value.set(t.value())"
        >
          {{ t.label() }}
          @if (t.badge() !== null && t.badge() !== undefined) {
            <span class="count">{{ t.badge() }}</span>
          }
        </button>
      }
      <span class="ink" [style.transform]="'translateX(' + ink().x + 'px)'" [style.width.px]="ink().w"></span>
    </div>
    <ng-content />
  `,
  styles: `
    :host { display: block; }
    .tablist {
      position: relative;
      display: flex;
      gap: 0.25rem;
      border-bottom: 1px solid var(--et-border);
      margin-bottom: 1rem;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tab {
      background: none;
      border: 0;
      padding: 0.6rem 0.85rem;
      font-size: 0.84rem;
      font-weight: 600;
      color: var(--et-ink-soft);
      cursor: pointer;
      border-radius: 6px 6px 0 0;
      display: inline-flex;
      gap: 0.4rem;
      align-items: center;
      white-space: nowrap;
      transition: color var(--dur-1) var(--ease), background var(--dur-1) var(--ease);
    }
    .tab:hover { color: var(--et-ink); background: var(--et-surface-2); }
    .tab.active { color: var(--et-accent); }
    .count {
      font-family: var(--et-mono);
      font-size: 0.66rem;
      padding: 0.05rem 0.4rem;
      border-radius: 999px;
      background: var(--et-surface-2);
      color: var(--et-ink-soft);
    }
    .tab.active .count { background: var(--et-accent-soft); color: var(--et-accent-dark); }
    .ink {
      position: absolute;
      left: 0;
      bottom: -1px;
      height: 2px;
      border-radius: 2px;
      background: var(--et-accent);
      transition: transform var(--dur-2) var(--ease), width var(--dur-2) var(--ease);
    }
  `,
})
export class Tabs {
  readonly value = model<string>('');
  readonly tabs = contentChildren(Tab);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('btn');
  readonly ink = signal({ x: 0, w: 0 });

  constructor() {
    afterRenderEffect(() => {
      const list = this.tabs();
      const idx = list.findIndex((t) => t.value() === this.value());
      const btn = this.buttons()[idx]?.nativeElement;
      if (!btn) return;
      const next = { x: btn.offsetLeft, w: btn.offsetWidth };
      const cur = this.ink();
      if (cur.x !== next.x || cur.w !== next.w) this.ink.set(next);
    });
  }
}
