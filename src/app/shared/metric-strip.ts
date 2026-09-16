import { Component, input } from '@angular/core';

export interface MetricChip {
  label: string;
  value: string;
  strong?: boolean;
}

@Component({
  selector: 'app-metric-strip',
  template: `
    <div class="metric-strip">
      @for (chip of chips(); track chip.label) {
        <div class="metric-chip">
          <div class="lbl">{{ chip.label }}</div>
          <div class="val" [style.color]="chip.strong ? 'var(--et-accent)' : null">{{ chip.value }}</div>
        </div>
      }
    </div>
  `,
})
export class MetricStrip {
  readonly chips = input<MetricChip[]>([]);
}
