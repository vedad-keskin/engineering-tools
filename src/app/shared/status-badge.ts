import { Component, input } from '@angular/core';

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge" [class]="tone()">{{ label() }}</span>
  `,
})
export class StatusBadge {
  readonly label = input('');
  readonly tone = input<'ok' | 'fail' | 'warn' | 'muted'>('muted');
}
