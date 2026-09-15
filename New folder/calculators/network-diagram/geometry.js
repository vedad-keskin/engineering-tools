/* ===================================================================
   Network Diagram Builder - geometry
   Pure, DOM-free: symbol/terminal table, auto-layout, orthogonal
   routing. Exported for reuse by diagram.js and for Node-based testing.
   =================================================================== */

const DG_UNIT = 8;
const DG_SYM = 56;            // nominal symbol bounding box (roughly same size for every type)
const DG_STROKE_SYM = 2.5;    // symbol stroke weight (thicker than connection lines)
const DG_STROKE_LINK = 1.5;   // connection line weight
const DG_STROKE_BUS = 5;      // busbar weight
const DG_ROUND_R = 5;         // routing corner radius
const DG_LAYER_H = 150;       // vertical pitch between layers
const DG_COL_W = 110;         // horizontal pitch between sibling columns
const DG_MIN_BUS = 64;        // minimum busbar length
const DG_LANDING_PITCH = 14;  // minimum spacing between landing points on a busbar
const DG_LANE_GAP = 10;       // vertical spacing between parallel horizontal routing lanes
const DG_LOAD_BOX = 26;       // load symbol box side

// ------------------------------------------------------------------
// Terminal geometry per type, in LOCAL coordinates (symbol centre = 0,0).
// dir: 'out' (supplies power, always the parent side) | 'in' (consumes).
// approach: 'top' (wire drops vertically into the terminal - default) or
// 'side' (wire arrives horizontally - used only by the UPS battery input).
// mv-dist / dist have no static terminals: landings are computed per
// instance from their actual connections (see dgBusLayout).
// ------------------------------------------------------------------
function dgTerminals(type) {
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

// Bounding half-extents used for layout spacing / hit-testing (local coords).
function dgBounds(node) {
  switch (node.type) {
    case 'utility': return { hw: 28, ht: 24 };
    case 'generator': return { hw: 24, ht: 24 };
    case 'battery': return { hw: 20, ht: 28 };
    case 'transformer': return { hw: 20, ht: 34 };
    case 'ups': return { hw: 28, ht: 20 };
    case 'load': return { hw: DG_LOAD_BOX / 2, ht: DG_LOAD_BOX / 2 };
    case 'mv-dist':
    case 'dist': return { hw: (node.busLen != null ? node.busLen : DG_MIN_BUS) / 2, ht: 6 };
    default: return { hw: 24, ht: 24 };
  }
}

function dgIsBoard(type) { return type === 'mv-dist' || type === 'dist'; }
function dgIsSource(type) { return type === 'utility' || type === 'generator' || type === 'battery'; }

// ------------------------------------------------------------------
// Busbar landing layout: given a board node and the list of {id, dir, x}
// connections (dir 'in' = incoming feed lands on TOP, 'out' = outgoing to a
// child lands on BOTTOM), spread each side's points evenly, respecting a
// minimum pitch, and clamped within the bar's half-length.
// ------------------------------------------------------------------
function dgBusLength(node, feeds, kids) {
  if (node.busLen != null) return Math.max(DG_MIN_BUS, node.busLen);
  const xs = feeds.concat(kids).map(c => c.x);
  if (!xs.length) return DG_MIN_BUS;
  const span = Math.max(...xs) - Math.min(...xs);
  return Math.max(DG_MIN_BUS, span + DG_LANDING_PITCH * 2);
}

function dgSpreadLandings(items, halfLen) {
  // items: [{id, x}] desired local x; returns same array with x snapped to
  // fit within [-halfLen+margin, halfLen-margin] and separated by pitch.
  const margin = 10;
  const lo = -halfLen + margin, hi = halfLen - margin;
  const arr = items.map(it => Object.assign({}, it, { x: Math.max(lo, Math.min(hi, it.x)) }));
  arr.sort((a, b) => a.x - b.x);
  for (let i = 1; i < arr.length; i++) {
    if (arr[i].x - arr[i - 1].x < DG_LANDING_PITCH) arr[i].x = arr[i - 1].x + DG_LANDING_PITCH;
  }
  // if pushed past hi, re-clamp from the right end backwards
  for (let i = arr.length - 1; i > 0; i--) {
    if (arr[i].x > hi) { arr[i].x = hi; if (arr[i - 1].x > arr[i].x - DG_LANDING_PITCH) arr[i - 1].x = arr[i].x - DG_LANDING_PITCH; }
  }
  return arr;
}

// Compute a board's full landing geometry from the live node list.
// Returns { halfLen, top: [{id, kind:'primary'|'redundant', x, nodeId}], bottom: [{id, x, nodeId}] }
function dgBusLayout(node, nodes) {
  const feeds = [];
  if (node.parentId != null) feeds.push({ id: 'p', kind: 'primary', refId: node.parentId });
  if (node.redundantParentId != null) feeds.push({ id: 'r', kind: 'redundant', refId: node.redundantParentId });
  const kids = nodes.filter(n => n.parentId === node.id || n.redundantParentId === node.id);
  const feedXs = feeds.map((f, i) => ({ id: f.id, kind: f.kind, x: (i - (feeds.length - 1) / 2) * DG_LANDING_PITCH * 1.6 }));
  const kidXs = kids.map(k => ({ id: 'k' + k.id + (k.parentId === node.id ? 'p' : 'r'), nodeId: k.id, x: (k.x != null ? k.x - node.x : 0) }));
  const halfLen = dgBusLength(node, feedXs, kidXs) / 2;
  return {
    halfLen,
    top: dgSpreadLandings(feedXs, halfLen),
    bottom: dgSpreadLandings(kidXs, halfLen),
  };
}

// ------------------------------------------------------------------
// Auto-layout: assigns x/y (world units, symbol centre) to every node
// whose x is currently null. Existing positions are left untouched unless
// `force` is passed (used by "Re-layout all").
// ------------------------------------------------------------------
function dgLayout(nodes, systems, force) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const primaryChildren = id => nodes.filter(n => n.parentId === id);
  const roots = nodes.filter(n => n.parentId == null);

  if (force) nodes.forEach(n => { n.x = null; n.y = null; });

  const layerOf = {};
  function walk(n, depth, seen) {
    if (seen.has(n.id)) return;
    seen.add(n.id);
    layerOf[n.id] = layerOf[n.id] == null ? depth : Math.max(layerOf[n.id], depth);
    primaryChildren(n.id).forEach(c => walk(c, depth + 1, seen));
  }
  roots.forEach(r => walk(r, 0, new Set()));

  // Pure-redundant power sources (never anyone's primary) are pulled down to
  // sit at the layer of whatever they feed, instead of floating at the top.
  roots.filter(r => dgIsSource(r.type) && !primaryChildren(r.id).length).forEach(r => {
    const feeds = nodes.filter(n => n.redundantParentId === r.id);
    if (feeds.length) {
      const ls = feeds.map(f => layerOf[f.id]).filter(x => x != null);
      if (ls.length) layerOf[r.id] = Math.max(0, Math.min(...ls));
    }
  });

  const sysOrder = (systems || []).map(s => s.id);
  function sysRank(n) {
    const i = sysOrder.indexOf(n.systemId);
    return n.systemId != null && i >= 0 ? i : sysOrder.length;
  }
  const orderedRoots = roots.slice().sort((a, b) =>
    (sysRank(a) - sysRank(b)) ||
    ((a.order == null ? 1e9 : a.order) - (b.order == null ? 1e9 : b.order)) ||
    (a.id - b.id));

  const widthOf = {};
  const nonLoadWidthOf = {};
  function widthDFS(n) {
    const kids = primaryChildren(n.id).filter(k => k.type !== 'load');
    const loadKids = primaryChildren(n.id).filter(k => k.type === 'load');
    const nonLoadW = kids.length ? kids.reduce((s, k) => s + widthDFS(k), 0) : 0;
    const loadW = loadKids.length;
    const w = Math.max(1, nonLoadW + loadW);
    widthOf[n.id] = w;
    nonLoadWidthOf[n.id] = nonLoadW;
    return w;
  }
  orderedRoots.forEach(r => widthDFS(r));

  let cursor = 0;
  const colOf = {};
  function placeDFS(n, col) {
    colOf[n.id] = col;
    const kids = primaryChildren(n.id).filter(k => k.type !== 'load');
    let c = col;
    kids.forEach(k => { placeDFS(k, c); c += widthOf[k.id]; });
  }
  let prevSys = undefined;
  orderedRoots.forEach(r => {
    const rank = sysRank(r);
    if (prevSys !== undefined) cursor += (rank !== prevSys ? 2 : 1);
    placeDFS(r, cursor);
    cursor += widthOf[r.id];
    prevSys = rank;
  });

  // Loads: given their own dedicated column block immediately after their
  // parent's non-load device subtree, so the two never overlap.
  let strayCursor = cursor + 2;
  nodes.filter(n => n.type === 'load').forEach(n => {
    const p = n.parentId != null ? byId.get(n.parentId) : null;
    if (!p) { colOf[n.id] = strayCursor++; layerOf[n.id] = 0; widthOf[n.id] = 1; return; }
    const siblings = primaryChildren(p.id).filter(k => k.type === 'load');
    const idx = siblings.indexOf(n);
    const pCol = colOf[p.id] || 0;
    const nonLoadW = nonLoadWidthOf[p.id] || 0;
    colOf[n.id] = pCol + nonLoadW + idx;
    layerOf[n.id] = (layerOf[p.id] || 0) + 1;
    widthOf[n.id] = 1;
  });

  nodes.forEach(n => {
    if (n.x != null && n.y != null) return;
    if (colOf[n.id] == null) { colOf[n.id] = strayCursor++; layerOf[n.id] = layerOf[n.id] || 0; }
    const layer = layerOf[n.id] || 0;
    const col = colOf[n.id] || 0;
    const w = widthOf[n.id] || 1;
    const centerCol = col + (w - 1) / 2;
    n.x = Math.round(centerCol * DG_COL_W);
    n.y = Math.round(layer * DG_LAYER_H);
  });

  // Nudge pure-redundant power sources to sit immediately beside whatever
  // they feed (same row), rather than wherever the root ordering placed them.
  nodes.filter(n => dgIsSource(n.type) && n.parentId == null && !primaryChildren(n.id).length).forEach(n => {
    const feeds = nodes.filter(f => f.redundantParentId === n.id);
    if (!feeds.length) return;
    const target = feeds.slice().sort((a, b) => a.x - b.x)[0];
    let x = target.x + DG_COL_W;
    const occupied = new Set(nodes.filter(o => o.id !== n.id && Math.abs(o.y - n.y) < 4).map(o => o.x));
    while (occupied.has(x)) x += DG_COL_W;
    n.x = x;
  });
}

// ------------------------------------------------------------------
// Routing: builds the segment list for one link (source -> target world
// points). `sourceApproach`/`targetApproach` of 'side' means that end is
// approached/left horizontally rather than vertically.
// ------------------------------------------------------------------
function dgRouteLink(linkId, sourcePt, targetPt, targetApproach) {
  const segs = [];
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
    segs.push({ kind: 'V', x1: sourcePt.x, y1: sourcePt.y, x2: targetPt.x, y2: targetPt.y, linkId, midY: (sourcePt.y + targetPt.y) / 2 });
    return segs;
  }
  const midY = Math.round((sourcePt.y + targetPt.y) / 2);
  segs.push({ kind: 'V', x1: sourcePt.x, y1: sourcePt.y, x2: sourcePt.x, y2: midY, linkId, midY });
  segs.push({ kind: 'H', x1: sourcePt.x, y1: midY, x2: targetPt.x, y2: midY, linkId, midY });
  segs.push({ kind: 'V', x1: targetPt.x, y1: midY, x2: targetPt.x, y2: targetPt.y, linkId, midY });
  return segs;
}

// Nudge each horizontal segment's y within its layer "channel" so parallel
// runs whose x-ranges overlap don't sit on the exact same pixel row.
function dgAssignLanes(allSegments) {
  const hs = allSegments.filter(s => s.kind === 'H');
  const byBand = {};
  hs.forEach(h => { const band = Math.round(h.midY / 4) * 4; (byBand[band] = byBand[band] || []).push(h); });
  Object.keys(byBand).forEach(band => {
    const group = byBand[band];
    group.sort((a, b) => Math.min(a.x1, a.x2) - Math.min(b.x1, b.x2));
    const lanesEnd = [];
    group.forEach(h => {
      const lo = Math.min(h.x1, h.x2), hi = Math.max(h.x1, h.x2);
      let lane = lanesEnd.findIndex(end => lo > end + 6);
      if (lane === -1) { lane = lanesEnd.length; lanesEnd.push(hi); }
      else lanesEnd[lane] = hi;
      h.lane = lane;
    });
    const n = group.length;
    group.forEach(h => {
      const off = (h.lane - (n - 1) / 2) * DG_LANE_GAP;
      h.y1 += off; h.y2 += off;
    });
    // propagate the shift to the connected vertical segments of the same link
    group.forEach(h => {
      allSegments.forEach(v => {
        if (v.kind === 'V' && v.linkId === h.linkId) {
          if (Math.abs(v.y2 - h.midY) < 0.5) v.y2 = h.y1;
          if (Math.abs(v.y1 - h.midY) < 0.5) v.y1 = h.y1;
        }
      });
    });
  });
  return allSegments;
}

if (typeof module !== 'undefined') {
  module.exports = {
    DG_UNIT, DG_SYM, DG_STROKE_SYM, DG_STROKE_LINK, DG_STROKE_BUS, DG_ROUND_R,
    DG_LAYER_H, DG_COL_W, DG_MIN_BUS, DG_LANDING_PITCH, DG_LANE_GAP, DG_LOAD_BOX,
    dgTerminals, dgBounds, dgIsBoard, dgIsSource, dgBusLength, dgSpreadLandings,
    dgBusLayout, dgLayout, dgRouteLink, dgAssignLanes,
  };
}
