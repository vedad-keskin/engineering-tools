import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-number-field',
  template: `
    <div class="field">
      <label>{{ label() }}</label>
      <div class="num-wrap">
        <input
          class="num-input"
          type="text"
          inputmode="decimal"
          [value]="display()"
          [readonly]="readonly()"
          [placeholder]="placeholder()"
          (input)="onInput($event)"
        />
        @if (unit()) {
          <span class="unit">{{ unit() }}</span>
        }
      </div>
      @if (hint()) {
        <div class="hint">{{ hint() }}</div>
      }
    </div>
  `,
  styles: `
    .num-wrap { position: relative; }
    .unit {
      position: absolute;
      right: 0.6rem;
      top: 50%;
      transform: translateY(-50%);
      color: var(--et-ink-faint);
      font-size: 0.75rem;
    }
    .num-input { padding-right: 2.2rem; }
  `,
})
export class NumberField {
  readonly label = input('');
  readonly value = input<number | '' | null>(null);
  readonly unit = input('');
  readonly hint = input('');
  readonly placeholder = input('');
  readonly readonly = input(false);
  readonly valueChange = output<number | ''>();

  display(): string {
    const v = this.value();
    return v === null || v === undefined ? '' : String(v);
  }

  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value.trim();
    if (raw === '' || raw === '-' || raw === '.' || raw === '-.') {
      this.valueChange.emit('');
      return;
    }
    const n = parseFloat(raw);
    this.valueChange.emit(Number.isNaN(n) ? '' : n);
  }
}
