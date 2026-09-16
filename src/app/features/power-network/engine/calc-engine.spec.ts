import { describe, expect, it } from 'vitest';
import { loadExample } from './data';
import {
  deriveCategory,
  nodeRollup,
  stateNode,
  systemTotals,
  wouldCreateCycle,
} from './calc-engine';

describe('calc-engine', () => {
  it('loadExample systemTotals and nodeRollup produce numbers', () => {
    const state = loadExample();
    const totals = systemTotals(state.nodes, null);

    expect(totals.demandKW).toBeGreaterThan(0);
    expect(totals.demandKVA).toBeGreaterThan(0);
    expect(totals.connectedKW).toBeGreaterThan(0);
    expect(totals.utilityContract).toBe(40000);

    const utilityA = stateNode(state.nodes, 1)!;
    const roll = nodeRollup(state.nodes, utilityA, null);

    expect(roll.ratingKVA).toBe(20000);
    expect(roll.activeKVA).toBeGreaterThan(0);
    expect(roll.sizingKVA).toBeGreaterThan(0);
    expect(roll.utilizationPct).not.toBeNull();
  });

  it('detects cycles when re-parenting', () => {
    const state = loadExample();
    const nodes = state.nodes;

    expect(wouldCreateCycle(nodes, 5, 15)).toBe(true);
    expect(wouldCreateCycle(nodes, 5, 2)).toBe(false);
    expect(wouldCreateCycle(nodes, 5, 5)).toBe(true);
    expect(wouldCreateCycle(nodes, 5, null)).toBe(false);
  });

  it('derives critical category for UPS-fed loads', () => {
    const state = loadExample();
    const upsFedLoad = stateNode(state.nodes, 23)!;

    expect(deriveCategory(state.nodes, upsFedLoad, null)).toBe('critical');
  });

  it('derives non-essential when no UPS or generator upstream', () => {
    const nodes = [
      { id: 1, type: 'utility' as const, name: 'Utility', tag: '', parentId: null, redundantParentId: null, activeFeed: 'primary', systemId: null },
      { id: 2, type: 'dist' as const, name: 'LVDB', tag: '', parentId: 1, redundantParentId: null, activeFeed: 'primary', systemId: null, voltageV: 400, ratingA: 1000 },
      { id: 3, type: 'load' as const, name: 'Load', tag: '', parentId: 2, redundantParentId: null, activeFeed: 'primary', systemId: null, ratedKW: 10, pf: 0.9, demandFactor: 1, phases: 3, voltageV: 400 },
    ];
    expect(deriveCategory(nodes, nodes[2], null)).toBe('non-essential');
  });
});
