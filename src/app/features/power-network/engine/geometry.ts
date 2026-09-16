/* ===================================================================
   Network Diagram Builder - geometry
   Pure, DOM-free: symbol/terminal table, auto-layout, orthogonal
   routing.
   =================================================================== */

import type { NodeType, PowerNode, PowerSystem } from './data';

export const DG_UNIT = 8;
export const DG_SYM = 56;
export const DG_STROKE_SYM = 2.5;
export const DG_STROKE_LINK = 1.5;
export const DG_STROKE_BUS = 5;
export const DG_ROUND_R = 5;
export const DG_LAYER_H = 150;
export const DG_COL_W = 110;
export const DG_MIN_BUS = 64;
export const DG_LANDING_PITCH = 14;
export const DG_LANE_GAP = 10;
export const DG_LOAD_BOX = 26;

export interface DgTerminal {
  id: string;
  dir: 'in' | 'out';
  x: number;
  y: number;
  approach: 'top' | 'side';
  role?: string;
  label?: string;
  labelDx?: number;
  labelDy?: number;
}

export interface DgBounds {
  hw: number;
  ht: number;
}

export interface DgBusLanding {
  id: string;
  kind?: 'primary' | 'redundant';
  x: number;
  nodeId?: number;
}

export interface DgBusLayout {
  halfLen: number;
  top: DgBusLanding[];
  bottom: DgBusLanding[];
}

export interface DgRouteSegment {
  kind: 'V' | 'H';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  linkId: string;
  midY: number;
  lane?: number;
}

export function dgTerminals(type: NodeType): DgTerminal[] {
  switch (type) {
    case 'utility':
      return [{ id: 'out', dir: 'out', x: 0, y: DG_SYM * 0.5, approach: 'top' }];
    case 'generator':
      return [{ id: 'out', dir: 'out', x: 0, y: DG_SYM * 0.42, approach: 'top' }];
    case 'battery':
      return [{ id: 'out', dir: 'out', x: 0, y: DG_SYM * 0.42, approach: 'top' }];
    case 'transformer':
      return [
        { id: 'hv', dir: 'in', x: 0, y: -34, approach: 'top', label: 'HV', labelDx: 16, labelDy: -2 },
        { id: 'lv', dir: 'out', x: 0, y: 34, approach: 'top', label: 'LV', labelDx: 16, labelDy: 2 },
      ];
    case 'ups':
      return [
        { id: 'p', dir: 'in', x: 0, y: -20, approach: 'top', role: 'primary', label: 'P', labelDx: 8, labelDy: -4 },
        { id: 'r', dir: 'in', x: 28, y: 0, approach: 'side', role: 'redundant', label: 'R', labelDx: 6, labelDy: -8 },
        { id: 'out', dir: 'out', x: 0, y: 20, approach: 'top' },
      ];
    case 'load':
      return [{ id: 'in', dir: 'in', x: 0, y: -DG_LOAD_BOX / 2, approach: 'top' }];
    default:
      return [];
  }
}

export function dgBounds(node: PowerNode): DgBounds {
  switch (node.type) {
    case 'utility':
      return { hw: 28, ht: 24 };
    case 'generator':
      return { hw: 24, ht: 24 };
    case 'battery':
      return { hw: 20, ht: 28 };
    case 'transformer':
      return { hw: 20, ht: 34 };
    case 'ups':
      return { hw: 28, ht: 20 };
    case 'load':
      return { hw: DG_LOAD_BOX / 2, ht: DG_LOAD_BOX / 2 };
    case 'mv-dist':
    case 'dist':
      return { hw: (node.busLen != null ? (node.busLen as number) : DG_MIN_BUS) / 2, ht: 6 };
    default:
      return { hw: 24, ht: 24 };
  }
}

export function dgIsBoard(type: NodeType): boolean {
  return type === 'mv-dist' || type === 'dist';
}

export function dgIsSource(type: NodeType): boolean {
  return type === 'utility' || type === 'generator' || type === 'battery';
}

export function dgBusLength(
  node: PowerNode,
  feeds: { x: number }[],
  kids: { x: number }[],
): number {
  if (node.busLen != null) return Math.max(DG_MIN_BUS, node.busLen as number);
  const xs = feeds.concat(kids).map((c) => c.x);
  if (!xs.length) return DG_MIN_BUS;
  const span = Math.max(...xs) - Math.min(...xs);
  return Math.max(DG_MIN_BUS, span + DG_LANDING_PITCH * 2);
}

export function dgSpreadLandings<T extends { id: string; x: number }>(
  items: T[],
  halfLen: number,
): T[] {
  const margin = 10;
  const lo = -halfLen + margin;
  const hi = halfLen - margin;
  const arr = items.map((it) =>
    Object.assign({}, it, { x: Math.max(lo, Math.min(hi, it.x)) }),
  ) as T[];
  arr.sort((a, b) => a.x - b.x);
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].x - arr[i - 1].x < DG_LANDING_PITCH) {
      arr[i].x = arr[i - 1].x + DG_LANDING_PITCH;
    }
  }
  for (let i = arr.length - 1; i > 0; i--) {
    if (arr[i].x > hi) {
      arr[i].x = hi;
      if (arr[i - 1].x > arr[i].x - DG_LANDING_PITCH) {
        arr[i - 1].x = arr[i].x - DG_LANDING_PITCH;
      }
    }
  }
  return arr;
}

export function dgBusLayout(node: PowerNode, nodes: PowerNode[]): DgBusLayout {
  const feeds: { id: string; kind: 'primary' | 'redundant'; refId: number }[] = [];
  if (node.parentId != null) feeds.push({ id: 'p', kind: 'primary', refId: node.parentId });
  if (node.redundantParentId != null) {
    feeds.push({ id: 'r', kind: 'redundant', refId: node.redundantParentId });
  }
  const kids = nodes.filter((n) => n.parentId === node.id || n.redundantParentId === node.id);
  const feedXs = feeds.map((f, i) => ({
    id: f.id,
    kind: f.kind,
    x: (i - (feeds.length - 1) / 2) * DG_LANDING_PITCH * 1.6,
  }));
  const kidXs = kids.map((k) => ({
    id: 'k' + k.id + (k.parentId === node.id ? 'p' : 'r'),
    nodeId: k.id,
    x: k.x != null && node.x != null ? k.x - node.x : 0,
  }));
  const halfLen = dgBusLength(node, feedXs, kidXs) / 2;
  return {
    halfLen,
    top: dgSpreadLandings(feedXs, halfLen),
    bottom: dgSpreadLandings(kidXs, halfLen),
  };
}

export function dgLayout(nodes: PowerNode[], systems: PowerSystem[] | null | undefined, force?: boolean): void {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const primaryChildren = (id: number) => nodes.filter((n) => n.parentId === id);
  const roots = nodes.filter((n) => n.parentId == null);

  if (force) nodes.forEach((n) => { n.x = null; n.y = null; });

  const layerOf: Record<number, number> = {};
  function walk(n: PowerNode, depth: number, seen: Set<number>): void {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    layerOf[n.id] = layerOf[n.id] == null ? depth : Math.max(layerOf[n.id], depth);
    primaryChildren(n.id).forEach((c) => walk(c, depth + 1, seen));
  }
  roots.forEach((r) => walk(r, 0, new Set()));

  roots
    .filter((r) => dgIsSource(r.type) && !primaryChildren(r.id).length)
    .forEach((r) => {
      const feeds = nodes.filter((n) => n.redundantParentId === r.id);
      if (feeds.length) {
        const ls = feeds.map((f) => layerOf[f.id]).filter((x) => x != null);
        if (ls.length) layerOf[r.id] = Math.max(0, Math.min(...ls));
      }
    });

  const sysOrder = (systems || []).map((s) => s.id);
  function sysRank(n: PowerNode): number {
    const i = sysOrder.indexOf(n.systemId as number);
    return n.systemId != null && i >= 0 ? i : sysOrder.length;
  }
  const orderedRoots = roots.slice().sort(
    (a, b) =>
      sysRank(a) - sysRank(b) ||
      (a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order) ||
      a.id - b.id,
  );

  const widthOf: Record<number, number> = {};
  const nonLoadWidthOf: Record<number, number> = {};
  function widthDFS(n: PowerNode): number {
    const kids = primaryChildren(n.id).filter((k) => k.type !== 'load');
    const loadKids = primaryChildren(n.id).filter((k) => k.type === 'load');
    const nonLoadW = kids.length ? kids.reduce((s, k) => s + widthDFS(k), 0) : 0;
    const loadW = loadKids.length;
    const w = Math.max(1, nonLoadW + loadW);
    widthOf[n.id] = w;
    nonLoadWidthOf[n.id] = nonLoadW;
    return w;
  }
  orderedRoots.forEach((r) => widthDFS(r));

  let cursor = 0;
  const colOf: Record<number, number> = {};
  function placeDFS(n: PowerNode, col: number): void {
    colOf[n.id] = col;
    const kids = primaryChildren(n.id).filter((k) => k.type !== 'load');
    let c = col;
    kids.forEach((k) => {
      placeDFS(k, c);
      c += widthOf[k.id];
    });
  }
  let prevSys: number | undefined;
  orderedRoots.forEach((r) => {
    const rank = sysRank(r);
    if (prevSys !== undefined) cursor += rank !== prevSys ? 2 : 1;
    placeDFS(r, cursor);
    cursor += widthOf[r.id];
    prevSys = rank;
  });

  let strayCursor = cursor + 2;
  nodes.filter((n) => n.type === 'load').forEach((n) => {
    const p = n.parentId != null ? byId.get(n.parentId) : null;
    if (!p) {
      colOf[n.id] = strayCursor++;
      layerOf[n.id] = 0;
      widthOf[n.id] = 1;
      return;
    }
    const siblings = primaryChildren(p.id).filter((k) => k.type === 'load');
    const idx = siblings.indexOf(n);
    const pCol = colOf[p.id] || 0;
    const nonLoadW = nonLoadWidthOf[p.id] || 0;
    colOf[n.id] = pCol + nonLoadW + idx;
    layerOf[n.id] = (layerOf[p.id] || 0) + 1;
    widthOf[n.id] = 1;
  });

  nodes.forEach((n) => {
    if (n.x != null && n.y != null) return;
    if (colOf[n.id] == null) {
      colOf[n.id] = strayCursor++;
      layerOf[n.id] = layerOf[n.id] || 0;
    }
    const layer = layerOf[n.id] || 0;
    const col = colOf[n.id] || 0;
    const w = widthOf[n.id] || 1;
    const centerCol = col + (w - 1) / 2;
    n.x = Math.round(centerCol * DG_COL_W);
    n.y = Math.round(layer * DG_LAYER_H);
  });

  nodes
    .filter((n) => dgIsSource(n.type) && n.parentId == null && !primaryChildren(n.id).length)
    .forEach((n) => {
      const feeds = nodes.filter((f) => f.redundantParentId === n.id);
      if (!feeds.length) return;
      const target = feeds.slice().sort((a, b) => (a.x ?? 0) - (b.x ?? 0))[0];
      let x = (target.x ?? 0) + DG_COL_W;
      const occupied = new Set(
        nodes
          .filter((o) => o.id !== n.id && Math.abs((o.y ?? 0) - (n.y ?? 0)) < 4)
          .map((o) => o.x),
      );
      while (occupied.has(x)) x += DG_COL_W;
      n.x = x;
    });
}

export function dgRouteLink(
  linkId: string,
  sourcePt: { x: number; y: number },
  targetPt: { x: number; y: number },
  targetApproach?: 'top' | 'side',
): DgRouteSegment[] {
  const segs: DgRouteSegment[] = [];
  if (targetApproach === 'side') {
    const y = targetPt.y;
    if (Math.abs(sourcePt.x - targetPt.x) < 0.01) {
      segs.push({ kind: 'V', x1: sourcePt.x, y1: sourcePt.y, x2: sourcePt.x, y2: y, linkId, midY: y });
    } else {
      segs.push({ kind: 'V', x1: sourcePt.x, y1: sourcePt.y, x2: sourcePt.x, y2: y, linkId, midY: y });
      segs.push({ kind: 'H', x1: sourcePt.x, y1: y, x2: targetPt.x, y2: y, linkId, midY: y });
    }
    return segs;
  }
  if (Math.abs(sourcePt.x - targetPt.x) < 0.01) {
    segs.push({
      kind: 'V',
      x1: sourcePt.x,
      y1: sourcePt.y,
      x2: targetPt.x,
      y2: targetPt.y,
      linkId,
      midY: (sourcePt.y + targetPt.y) / 2,
    });
    return segs;
  }
  const midY = Math.round((sourcePt.y + targetPt.y) / 2);
  segs.push({ kind: 'V', x1: sourcePt.x, y1: sourcePt.y, x2: sourcePt.x, y2: midY, linkId, midY });
  segs.push({ kind: 'H', x1: sourcePt.x, y1: midY, x2: targetPt.x, y2: midY, linkId, midY });
  segs.push({ kind: 'V', x1: targetPt.x, y1: midY, x2: targetPt.x, y2: targetPt.y, linkId, midY });
  return segs;
}

export function dgAssignLanes(allSegments: DgRouteSegment[]): DgRouteSegment[] {
  const hs = allSegments.filter((s) => s.kind === 'H');
  const byBand: Record<string, DgRouteSegment[]> = {};
  hs.forEach((h) => {
    const band = String(Math.round(h.midY / 4) * 4);
    (byBand[band] = byBand[band] || []).push(h);
  });
  Object.keys(byBand).forEach((band) => {
    const group = byBand[band];
    group.sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));
    const lanesEnd: number[] = [];
    group.forEach((h) => {
      const lo = Math.min(h.x1, h.x2);
      const hi = Math.max(h.x1, h.x2);
      let lane = lanesEnd.findIndex((end) => lo > end + 6);
      if (lane === -1) {
        lane = lanesEnd.length;
        lanesEnd.push(hi);
      } else {
        lanesEnd[lane] = hi;
      }
      h.lane = lane;
    });
    const n = group.length;
    group.forEach((h) => {
      const off = ((h.lane ?? 0) - (n - 1) / 2) * DG_LANE_GAP;
      h.y1 += off;
      h.y2 += off;
    });
    group.forEach((h) => {
      allSegments.forEach((v) => {
        if (v.kind === 'V' && v.linkId === h.linkId) {
          if (Math.abs(v.y2 - h.midY) < 0.5) v.y2 = h.y1;
          if (Math.abs(v.y1 - h.midY) < 0.5) v.y1 = h.y1;
        }
      });
    });
  });
  return allSegments;
}
