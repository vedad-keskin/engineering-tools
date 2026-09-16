import { Component, input, output } from '@angular/core';
import { Icon } from './icon';

export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'danger' | 'soft';

@Component({
  selector: 'app-button',
  imports: [Icon],
  template: `
    <button
      class="btn"
      [class]="'btn ' + variant() + ' ' + size() + (label() ? '' : ' icon-only')"
      [type]="type()"
      [disabled]="disabled()"
      [attr.title]="title() || null"
      [attr.aria-label]="title() || label() || null"
      (click)="clicked.emit($event)"
    >
      @if (icon()) {
        <app-icon [name]="icon()" [size]="size() === 'sm' ? 15 : 17" />
      }
      @if (label()) {
        <span class="lbl">{{ label() }}</span>
      }
      @if (kbd()) {
        <kbd>{{ kbd() }}</kbd>
      }
    </button>
  `,
  styles: `
    :host { display: inline-flex; }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.45rem;
      border-radius: 7px;
      border: 1px solid transparent;
      padding: 0.48rem 0.85rem;
      font-size: 0.82rem;
      font-weight: 600;
      line-height: 1.1;
      cursor: pointer;
      white-space: nowrap;
      color: var(--et-ink);
      background: var(--et-surface);
      transition: background var(--dur-1) var(--ease), border-color var(--dur-1) var(--ease),
        color var(--dur-1) var(--ease), transform var(--dur-1) var(--ease), box-shadow var(--dur-1) var(--ease);
    }
    .btn:active:not(:disabled) { transform: translateY(1px) scale(0.985); }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--et-accent-soft); border-color: var(--et-accent); }
    .btn.sm { padding: 0.32rem 0.6rem; font-size: 0.76rem; border-radius: 6px; }
    .btn.icon-only { padding: 0.45rem; width: 2.1rem; height: 2.1rem; }
    .btn.icon-only.sm { width: 1.75rem; height: 1.75rem; padding: 0.3rem; }

    .primary { background: var(--et-accent); border-color: var(--et-accent); color: #fff; }
    .primary:hover:not(:disabled) { background: var(--et-accent-dark); border-color: var(--et-accent-dark); }

    .outline { border-color: var(--et-border-strong); }
    .outline:hover:not(:disabled) { background: var(--et-surface-2); border-color: var(--et-accent); color: var(--et-accent); }

    .soft { background: var(--et-accent-soft); color: var(--et-accent-dark); }
    .soft:hover:not(:disabled) { background: color-mix(in srgb, var(--et-accent-soft) 80%, var(--et-accent)); }

    .ghost { background: transparent; color: var(--et-ink-soft); }
    .ghost:hover:not(:disabled) { background: var(--et-surface-2); color: var(--et-ink); }

    .danger { background: transparent; border-color: var(--et-fail-border); color: var(--et-fail); }
    .danger:hover:not(:disabled) { background: var(--et-fail-bg); }

    kbd {
      font-family: var(--et-mono);
      font-size: 0.65rem;
      padding: 0 0.3rem;
      border-radius: 4px;
      border: 1px solid currentColor;
      opacity: 0.6;
      line-height: 1.3;
    }
  `,
})
export class Button {
  readonly label = input('');
  readonly icon = input('');
  readonly kbd = input('');
  readonly title = input('');
  readonly variant = input<ButtonVariant>('outline');
  readonly size = input<'sm' | 'md'>('md');
  readonly type = input<'button' | 'submit'>('button');
  readonly disabled = input(false);
  readonly clicked = output<MouseEvent>();
}
