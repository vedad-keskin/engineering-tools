import { Component, computed, input } from '@angular/core';

const BAR_WIDTHS = [72, 48, 36, 58, 42, 64, 30, 80];

/** Placeholder table that matches `.tablewrap` / `table.sched` chrome while IndexedDB hydrates. */
@Component({
  selector: 'app-skeleton-table',
  template: `
    <div class="tablewrap">
      <table class="sched">
        <thead>
          <tr>
            @for (col of colIndexes(); track col) {
              <th>
                @if (headers()[col]; as label) {
                  {{ label }}
                } @else {
                  <span class="bar" aria-hidden="true" [style.width]="barWidth(0, col)"></span>
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rowIndexes(); track row) {
            <tr>
              @for (col of colIndexes(); track col) {
                <td><span class="bar" aria-hidden="true" [style.width]="barWidth(row + 1, col)"></span></td>
              }
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  host: {
    role: 'status',
    '[attr.aria-busy]': 'true',
    '[attr.aria-label]': 'label() || null',
  },
  styles: `
    :host { display: block; }
    .bar {
      display: inline-block;
      height: 0.65rem;
      max-width: 100%;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--et-surface-2) 25%, var(--et-border) 50%, var(--et-surface-2) 75%);
      background-size: 200% 100%;
      animation: sk-shimmer 1.2s var(--ease) infinite;
      vertical-align: middle;
    }
    @keyframes sk-shimmer {
      from { background-position: 100% 0; }
      to { background-position: -100% 0; }
    }
  `,
})
export class SkeletonTable {
  readonly columns = input(4);
  readonly rows = input(5);
  readonly headers = input<readonly string[]>([]);
  readonly label = input('');

  readonly colCount = computed(() => this.headers().length || this.columns());
  readonly colIndexes = computed(() => Array.from({ length: this.colCount() }, (_, i) => i));
  readonly rowIndexes = computed(() => Array.from({ length: this.rows() }, (_, i) => i));

  barWidth(row: number, col: number): string {
    return BAR_WIDTHS[(row * 3 + col) % BAR_WIDTHS.length] + '%';
  }
}

/** Short inline shimmer used for a single pending number (home project count). */
@Component({
  selector: 'app-skeleton-bar',
  template: `<span class="bar" aria-hidden="true" [style.width]="width()"></span>`,
  styles: `
    :host { display: inline-flex; align-items: center; }
    .bar {
      display: inline-block;
      height: 0.7rem;
      border-radius: 4px;
      background: linear-gradient(90deg, rgba(255, 255, 255, 0.12) 25%, rgba(255, 255, 255, 0.28) 50%, rgba(255, 255, 255, 0.12) 75%);
      background-size: 200% 100%;
      animation: sk-shimmer 1.2s var(--ease) infinite;
    }
    @keyframes sk-shimmer {
      from { background-position: 100% 0; }
      to { background-position: -100% 0; }
    }
  `,
})
export class SkeletonBar {
  readonly width = input('1.4rem');
}
