// ============================================================
// Capacity Planner - calculation engine (pure functions)
// ============================================================

import type { PowerNode, PowerScenario } from './data';

export function stateNode(nodes: PowerNode[], id: number): PowerNode | undefined {
  return nodes.find((n) => n.id === id);
}

export function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v));
  return isNaN(n) ? 0 : n;
}

export function childrenOf(nodes: PowerNode[], id: number): PowerNode[] {
  return nodes.filter((n) => n.parentId === id);
}

export function ancestorsOf(nodes: PowerNode[], node: PowerNode | null | undefined): PowerNode[] {
  if (!node) return [];
  const acc: PowerNode[] = [];
  const seen = new Set<number>();
  function visit(n: PowerNode | null | undefined): void {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    acc.push(n);
    if (n.parentId != null) visit(stateNode(nodes, n.parentId));
    if (n.redundantParentId != null) visit(stateNode(nodes, n.redundantParentId));
  }
  visit(node);
  return acc;
}

export function walkUp(
  nodes: PowerNode[],
  node: PowerNode | null | undefined,
  key: 'parentId' | 'redundantParentId',
): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  let cur: PowerNode | null | undefined = node;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const pid = cur[key];
    if (pid == null) break;
    ids.push(pid);
    cur = stateNode(nodes, pid);
  }
  return ids;
}

export function passesThroughKey(
  nodes: PowerNode[],
  device: PowerNode,
  load: PowerNode,
  key: 'parentId' | 'redundantParentId',
): boolean {
  return walkUp(nodes, load, key).indexOf(device.id) >= 0;
}

export function passesThrough(nodes: PowerNode[], node: PowerNode, load: PowerNode): boolean {
  return (
    passesThroughKey(nodes, node, load, 'parentId') ||
    passesThroughKey(nodes, node, load, 'redundantParentId')
  );
}

export function effActive(
  nodes: PowerNode[],
  n: PowerNode | null | undefined,
  scenario: PowerScenario | null | undefined,
  memo?: Map<number, boolean>,
): boolean {
  const m = memo ?? new Map<number, boolean>();
  if (!n) return false;
  if (m.has(n.id)) return m.get(n.id)!;
  m.set(n.id, false);
  let ok = false;
  if (scenarioOverrideActive(n, scenario)) {
    if (n.parentId == null) {
      ok = true;
    } else {
      const prim = stateNode(nodes, n.parentId);
      const red =
        n.redundantParentId != null ? stateNode(nodes, n.redundantParentId) : null;
      ok =
        (prim ? effActive(nodes, prim, scenario, m) : false) ||
        (red ? effActive(nodes, red, scenario, m) : false);
    }
  }
  m.set(n.id, ok);
  return ok;
}

export function scenarioOverrideActive(
  n: PowerNode | null | undefined,
  scenario: PowerScenario | null | undefined,
): boolean {
  if (n == null) return false;
  if (scenario?.overrides && scenario.overrides[n.id] != null) {
    return scenario.overrides[n.id] === 'active';
  }
  return n.active !== false;
}

export function pathUsable(
  nodes: PowerNode[],
  load: PowerNode,
  key: 'parentId' | 'redundantParentId',
  scenario: PowerScenario | null | undefined,
  memo?: Map<number, boolean>,
): boolean {
  const pid = load[key];
  if (pid == null) return false;
  const parent = stateNode(nodes, pid);
  return parent != null && effActive(nodes, parent, scenario, memo);
}

export interface LoadContribution {
  P: number;
  R: number;
}

export function loadContribution(
  nodes: PowerNode[],
  load: PowerNode,
  scenario: PowerScenario | null | undefined,
): LoadContribution | null {
  if (!scenarioOverrideActive(load, scenario)) return null;
  const memo = new Map<number, boolean>();
  const pu = pathUsable(nodes, load, 'parentId', scenario, memo);
  const ru =
    load.redundantParentId != null
      ? pathUsable(nodes, load, 'redundantParentId', scenario, memo)
      : false;
  if (!pu && !ru) return null;
  const feed = load.activeFeed || 'primary';
  let P = 0;
  let R = 0;
  if (pu && ru) {
    if (feed === 'redundant') {
      R = 1;
    } else if (feed === '50-50') {
      P = 0.5;
      R = 0.5;
    } else {
      P = 1;
    }
  } else if (pu) {
    P = 1;
  } else {
    R = 1;
  }
  return { P, R };
}

export function passesActiveThrough(
  nodes: PowerNode[],
  node: PowerNode,
  load: PowerNode,
): boolean {
  if (load.activeFeed === 'redundant') {
    if (load.redundantParentId == null) return false;
    return walkUp(nodes, load, 'redundantParentId').includes(node.id);
  }
  return walkUp(nodes, load, 'parentId').includes(node.id);
}

export type LoadCategory = 'critical' | 'essential' | 'non-essential';

export function deriveCategory(
  nodes: PowerNode[],
  node: PowerNode,
  scenario: PowerScenario | null | undefined,
): LoadCategory {
  const chain = ancestorsOf(nodes, node);
  const memo = new Map<number, boolean>();
  const act = chain.filter((n) => effActive(nodes, n, scenario, memo));
  if (act.some((n) => n.type === 'ups')) return 'critical';
  if (act.some((n) => n.type === 'generator' || n.type === 'battery')) return 'essential';
  return 'non-essential';
}

export interface LoadCalcResult {
  kva: number | null;
  demandKW: number | null;
  demandKVA: number | null;
  flc: number | null;
  pf: number | null;
}

export function loadCalc(load: PowerNode): LoadCalcResult {
  const ksv = parseFloat(String(load.pf));
  const pf = ksv > 0 ? ksv : null;
  const rated = num(load.ratedKW);
  const df =
    load.demandFactor === '' || load.demandFactor === null || load.demandFactor === undefined
      ? null
      : parseFloat(String(load.demandFactor));
  const kva = rated > 0 && pf ? rated / pf : null;
  const demandKW = rated > 0 && df !== null && !isNaN(df) ? rated * df : null;
  const demandKVA = demandKW != null && pf ? demandKW / pf : null;
  const phaseFactor = Number(load.phases) === 3 ? Math.sqrt(3) : 1;
  const flc =
    kva != null && num(load.voltageV) > 0
      ? (kva * 1000) / (phaseFactor * num(load.voltageV))
      : null;
  return { kva, demandKW, demandKVA, flc, pf };
}

export function threePhaseKVA(V: unknown, A: unknown): number | null {
  const v = num(V);
  const a = num(A);
  return v > 0 && a > 0 ? (Math.sqrt(3) * v * a) / 1000 : null;
}

export function nodeRatingKVA(node: PowerNode): number | null {
  switch (node.type) {
    case 'utility':
      return num(node.contractKVA) > 0 ? num(node.contractKVA) : null;
    case 'transformer':
    case 'generator':
    case 'ups':
      return num(node.ratingKVA) > 0 ? num(node.ratingKVA) : null;
    case 'mv-dist':
    case 'dist':
      return threePhaseKVA(node.voltageV, node.ratingA);
    default:
      return null;
  }
}

export interface NodeRollupResult {
  sizingKVA: number;
  activeKVA: number;
  ratingKVA: number | null;
  utilizationPct: number | null;
  badge: 'fail' | 'warn' | 'ok' | null;
}

export function nodeRollup(
  nodes: PowerNode[],
  node: PowerNode,
  scenario: PowerScenario | null | undefined,
): NodeRollupResult {
  let sizingKVA = 0;
  let activeKVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load') continue;
    if (l.active === false && !(scenario?.overrides && scenario.overrides[l.id] != null)) continue;
    const c = loadCalc(l);
    if (c.demandKVA == null) continue;
    const cc = loadContribution(nodes, l, scenario);
    if (!cc) continue;
    const onP = passesThroughKey(nodes, node, l, 'parentId');
    const onR = passesThroughKey(nodes, node, l, 'redundantParentId');
    if (onP && l.parentId != null) sizingKVA += c.demandKVA;
    if (onR && l.redundantParentId != null) sizingKVA += c.demandKVA;
    if (onP && cc.P > 0) activeKVA += c.demandKVA * cc.P;
    if (onR && cc.R > 0) activeKVA += c.demandKVA * cc.R;
  }
  const ratingKVA = nodeRatingKVA(node);
  let utilizationPct: number | null = null;
  let badge: 'fail' | 'warn' | 'ok' | null = null;
  if (ratingKVA != null && ratingKVA > 0) {
    utilizationPct = (sizingKVA / ratingKVA) * 100;
    badge = utilizationPct > 100 ? 'fail' : utilizationPct > 80 ? 'warn' : 'ok';
  }
  return { sizingKVA, activeKVA, ratingKVA, utilizationPct, badge };
}

export function nodePowerFactor(
  nodes: PowerNode[],
  node: PowerNode,
  scenario: PowerScenario | null | undefined,
): number | null {
  let sumKW = 0;
  let sumKVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load') continue;
    const c = loadCalc(l);
    if (c.demandKVA == null || c.demandKW == null) continue;
    const cc = loadContribution(nodes, l, scenario);
    if (!cc) continue;
    const onP = passesThroughKey(nodes, node, l, 'parentId');
    const onR = passesThroughKey(nodes, node, l, 'redundantParentId');
    if ((onP && cc.P > 0) || (onR && cc.R > 0)) {
      sumKW += c.demandKW;
      sumKVA += c.demandKVA;
    }
  }
  return sumKVA > 0 ? sumKW / sumKVA : null;
}

export function loadCounted(
  nodes: PowerNode[],
  load: PowerNode,
  scenario: PowerScenario | null | undefined,
): boolean {
  return loadContribution(nodes, load, scenario) != null;
}

export interface SystemTotalsResult {
  connectedKW: number;
  connectedKVA: number;
  demandKW: number;
  demandKVA: number;
  cat: Record<LoadCategory, { kW: number; kVA: number }>;
  utilityActive: number;
  utilityContract: number;
  utilityPct: number | null;
  overloaded: PowerNode[];
}

export function systemTotals(
  nodes: PowerNode[],
  scenario: PowerScenario | null | undefined,
): SystemTotalsResult {
  const cat: Record<LoadCategory, { kW: number; kVA: number }> = {
    critical: { kW: 0, kVA: 0 },
    essential: { kW: 0, kVA: 0 },
    'non-essential': { kW: 0, kVA: 0 },
  };
  let connectedKW = 0;
  let connectedKVA = 0;
  let demandKW = 0;
  let demandKVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load' || !loadCounted(nodes, l, scenario)) continue;
    const c = loadCalc(l);
    connectedKW += num(l.ratedKW);
    connectedKVA += c.kva || 0;
    demandKW += c.demandKW || 0;
    demandKVA += c.demandKVA || 0;
    const ct = deriveCategory(nodes, l, scenario);
    cat[ct].kW += c.demandKW || 0;
    cat[ct].kVA += c.demandKVA || 0;
  }

  let utilityActive = 0;
  let utilityContract = 0;
  for (const u of nodes) {
    if (u.type !== 'utility') continue;
    const r = nodeRollup(nodes, u, scenario);
    utilityActive += r.activeKVA;
    utilityContract += num(u.contractKVA);
  }
  const utilityPct = utilityContract > 0 ? (utilityActive / utilityContract) * 100 : null;

  const overloaded = nodes
    .filter((n) => n.type !== 'load')
    .map((n) => ({ node: n, roll: nodeRollup(nodes, n, scenario) }))
    .filter((x) => x.roll.utilizationPct != null && x.roll.utilizationPct > 100)
    .map((x) => x.node);

  return {
    connectedKW,
    connectedKVA,
    demandKW,
    demandKVA,
    cat,
    utilityActive,
    utilityContract,
    utilityPct,
    overloaded,
  };
}

export function wouldCreateCycle(
  nodes: PowerNode[],
  nodeId: number,
  newParentId: number | null,
): boolean {
  if (newParentId == null || nodeId === newParentId) return nodeId === newParentId;
  const start = stateNode(nodes, newParentId);
  if (!start) return false;
  let seen = new Set<number>();
  let cur: PowerNode | null | undefined = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.id === nodeId) return true;
    cur = cur.parentId != null ? stateNode(nodes, cur.parentId) : null;
  }
  seen = new Set();
  cur = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.id === nodeId) return true;
    cur = cur.redundantParentId != null ? stateNode(nodes, cur.redundantParentId) : null;
  }
  return false;
}

export function descendantsOf(nodes: PowerNode[], id: number): number[] {
  const out: number[] = [];
  function walk(pid: number): void {
    for (const c of childrenOf(nodes, pid)) {
      out.push(c.id);
      walk(c.id);
    }
  }
  walk(id);
  return out;
}

export interface EligibleParentsOpts {
  [key: string]: unknown;
}

export function eligibleParents(
  nodes: PowerNode[],
  node: PowerNode,
  opts?: EligibleParentsOpts,
): PowerNode[] {
  void opts;
  const banned = new Set<number>([node.id]);
  descendantsOf(nodes, node.id).forEach((d) => banned.add(d));
  return nodes.filter((n) => n.type !== 'load' && !banned.has(n.id));
}

export function passThroughLoads(
  nodes: PowerNode[],
  node: PowerNode,
  scenario: PowerScenario | null | undefined,
): PowerNode[] {
  return nodes.filter((l) => {
    if (l.type !== 'load') return false;
    const cc = loadContribution(nodes, l, scenario);
    if (!cc) return false;
    if (passesThroughKey(nodes, node, l, 'parentId') && cc.P > 0) return true;
    if (passesThroughKey(nodes, node, l, 'redundantParentId') && cc.R > 0) return true;
    return false;
  });
}

export interface ConnectedLoadCalcResult {
  count: number;
  kW: number;
  kVA: number;
}

export function connectedLoadCalc(
  nodes: PowerNode[],
  node: PowerNode,
): ConnectedLoadCalcResult {
  let count = 0;
  let kW = 0;
  let kVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load') continue;
    if (passesThrough(nodes, node, l)) {
      const c = loadCalc(l);
      count++;
      kW += num(l.ratedKW);
      kVA += c.kva || 0;
    }
  }
  return { count, kW, kVA };
}
