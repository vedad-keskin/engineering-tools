import { Pipe, PipeTransform, inject } from '@angular/core';
import { LocaleService } from '../core/locale.service';

@Pipe({ name: 'num' })
export class NumPipe implements PipeTransform {
  private readonly locale = inject(LocaleService);

  transform(value: unknown, digits = 2): string {
    if (value === null || value === undefined || value === '' || value === 'N.A.' || value === 'N/A') {
      return value === 'N.A.' || value === 'N/A' ? String(value) : '–';
    }
    if (typeof value === 'number') return this.locale.formatNumber(value, digits);
    const n = Number(value);
    return Number.isFinite(n) ? this.locale.formatNumber(n, digits) : String(value);
  }
}
