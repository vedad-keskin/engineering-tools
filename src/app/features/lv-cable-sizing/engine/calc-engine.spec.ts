import { describe, expect, it } from 'vitest';
import { computeGeneral, computeRow } from './calc-engine';
import { defaultLvState, exampleLvRow, blankLvRow } from './state';

describe('computeGeneral', () => {
  it('produces numeric totals for default site values', () => {
    const state = defaultLvState();
    const derating = computeGeneral(state.general);

    expect(typeof derating.bunched.indoor.total).toBe('number');
    expect(typeof derating.bunched.outdoor.total).toBe('number');
    expect(typeof derating.nonBunched.indoor.total).toBe('number');
    expect(typeof derating.nonBunched.outdoor.total).toBe('number');
    expect(typeof derating.underground.total).toBe('number');

    expect(derating.bunched.indoor.total).toBeGreaterThan(0);
    expect(derating.bunched.outdoor.total).toBeGreaterThan(0);
    expect(derating.nonBunched.indoor.total).toBeGreaterThan(0);
    expect(derating.nonBunched.outdoor.total).toBeGreaterThan(0);
    expect(derating.underground.total).toBeGreaterThan(0);
  });
});

describe('computeRow', () => {
  it('computes example chiller pump row with numeric results', () => {
    const state = defaultLvState();
    const derating = computeGeneral(state.general);
    const row = exampleLvRow(1);
    const result = computeRow(row, derating, state.general);

    expect(typeof result.flc).toBe('number');
    expect(typeof result.deratedAmpacity).toBe('number');
    expect(typeof result.cableVDPct).toBe('number');
    expect(result.flc).toBeGreaterThan(0);
    expect(result.deratedAmpacity).toBeGreaterThan(0);
    expect(result.cableVDPct).toBeGreaterThan(0);
    expect(['ACCEPTABLE', 'NOT ACCEPTABLE']).toContain(result.remarks);
  });

  it('marks incomplete row missing cableSize as INCOMPLETE', () => {
    const state = defaultLvState();
    const derating = computeGeneral(state.general);
    const row = blankLvRow(1);
    row.ratedLoadKW = 10;
    row.pdTripSetting = 16;
    row.pdTripType = 'Thermal';
    row.cableLength = 20;

    const result = computeRow(row, derating, state.general);

    expect(result.remarks).toBe('INCOMPLETE');
  });
});
