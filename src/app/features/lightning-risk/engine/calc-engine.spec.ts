import { describe, expect, it } from 'vitest';
import { calculateLightningRisk } from './calc-engine';
import { KTC_EXAMPLE } from './data';

describe('calculateLightningRisk', () => {
  it('KTC_EXAMPLE produces finite R1, R2, R3 and acceptable verdict strings', () => {
    const result = calculateLightningRisk(KTC_EXAMPLE);

    expect(result.incomplete).toBe(false);
    if (result.incomplete) {
      return;
    }

    expect(Number.isFinite(result.R1)).toBe(true);
    expect(Number.isFinite(result.R2)).toBe(true);
    expect(Number.isFinite(result.R3)).toBe(true);
    expect(['ACCEPTABLE', 'NOT ACCEPTABLE']).toContain(result.result1);
    expect(['ACCEPTABLE', 'NOT ACCEPTABLE']).toContain(result.result2);
    expect(['ACCEPTABLE', 'NOT ACCEPTABLE']).toContain(result.result3);
  });

  it('returns incomplete when required geometry is missing', () => {
    const result = calculateLightningRisk({ ...KTC_EXAMPLE, L: '' });

    expect(result).toEqual({ incomplete: true });
  });
});
