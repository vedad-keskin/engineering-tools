import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  template: `
    <div class="empty">
      <div style="font-size:1.1rem;font-weight:650;margin-bottom:.35rem">{{ title() }}</div>
      <div>{{ body() }}</div>
    </div>
  `,
})
export class EmptyState {
  readonly title = input('');
  readonly body = input('');
}
