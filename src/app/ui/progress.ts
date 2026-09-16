import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress',
  template: `
    <div class="bar" role="progressbar" [attr.aria-valuenow]="pct()" aria-valuemin="0" aria-valuemax="100">
      <span [style.transform]="'scaleX(' + pct() / 100 + ')'" [style.background]="color() || null"></span>
    </div>
  `,
  styles: `
    :host { display: block; }
    .bar { height: 7px; border-radius: 99px; background: var(--et-surface-2); overflow: hidden; }
    span {
      display: block;
      height: 100%;
      width: 100%;
      transform-origin: left;
      background: var(--et-accent);
      border-radius: 99px;
      transition: transform var(--dur-2) var(--ease);
    }
  `,
})
export class Progress {
  readonly value = input(0);
  readonly color = input('');
  readonly pct = computed(() => Math.min(100, Math.max(0, Number.isFinite(this.value()) ? this.value() : 0)));
}
