import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-select-field',
  template: `
    <div class="field">
      <label>{{ label() }}</label>
      <select [value]="value()" (change)="onChange($event)">
        @for (opt of options(); track opt) {
          <option [value]="opt">{{ opt }}</option>
        }
      </select>
      @if (hint()) {
        <div class="hint">{{ hint() }}</div>
      }
    </div>
  `,
})
export class SelectField {
  readonly label = input('');
  readonly value = input<string | number>('');
  readonly options = input<readonly (string | number)[]>([]);
  readonly hint = input('');
  readonly valueChange = output<string>();

  onChange(event: Event): void {
    this.valueChange.emit((event.target as HTMLSelectElement).value);
  }
}
