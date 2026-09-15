/* ===================================================================
   BLOCK DIAGRAM BUILDER - diagram engine
   Renders the supply network as an editable block diagram:
   - auto-layout (systems as columns, layered top-down)
   - orthogonal routing, busbar connection dots, crossing gaps,
     dashed redundant feeds, P / R / MV / LV labels
   - drag blocks / captions, pan/zoom, context menu, click-to-reconnect
   =================================================================== */

const SVGNS = 'http://www.w3.org/2000/svg';
const RR = 132;            // row height (logical units)
const LINE_W = 44;         // horizontal gap between subtree blocks
const CLUSTER_GAP = 96;    // gap between system columns
const GRID_DRAW = 24;      // spacing of faint grid dots
const GRID_SNAP = 8;       // drag snap step

let diagramGridVisible = true;
let selectedDiagramId = null;
let diagramContextMenu = null;
let reconnect = null;            // { nodeId, key } - click-to-reconnect
let _layoutDirty = true;
let _drag = null;
let _hitList = [];
let _spans = new Map();          // id -> {lo,hi} bar span
let panX = 80, panY = 60, zoom = 1;
let _host = null;
let _worldG = null;
let _diagBounds = null;
let _firstFitDone = false;

/* ---------------- SVG builder ---------------- */
function sv(tag, attrs, text) {
  const e = document.createElementNS(SVGNS, tag);
  if (attrs) for (const k in attrs) { const v = attrs[k]; if (v != null) e.setAttribute(k, v); }
  if (text != null) e.appendChild(document.createTextNode(String(text)));
  return e;
}

/* ---------------- symbol dimensions ---------------- */
function symW(n) {
  if (n.type === 'mv-dist' || n.type === 'dist') return 96;
  if (n.type === 'transformer') return 56;
  if (n.type === 'load') return 36;
  return 52;
}
function symH(n) {
  if (n.type === 'mv-dist' || n.type === 'dist') return 18;
  if (n.type === 'transformer') return 64;
  if (n.type === 'load') return 24;
  if (n.type === 'utility') return 44;
  if (n.type === 'battery') return 42;
  return 40;
}
function orderOf(n) { return (n.order == null ? 1e9 : n.order); }

/* ===================================================================
   AUTO-LAYOUT (pure; assigns x/y onto nodes)
   =================================================================== */
function solveLayout(nodes, systems) {
  const byId = new Map(nodes.map(n => [n.id, n]));
  const childrenMap = new Map();
  nodes.forEach(n => {
    if (n.parentId != null) {
      if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
      childrenMap.get(n.parentId).push(n);
    }
  });
  const kidsOf = (id) => (childrenMap.get(id) || []).slice().sort((a, b) => orderOf(a) - orderOf(b) || (a.id - b.id));

  const columns = (systems || []).map(s => ({ name: s.name, color: s.color, sysId: s.id, ids: nodes.filter(n => n.systemId === s.id) }));
  columns.push({ name: 'Unassigned', color: '#5b6675', sysId: null, ids: nodes.filter(n => n.systemId == null) });
  const live = columns.filter(c => c.ids.length);

  let cursor = 0;
  live.forEach(col => {
    const colSet = new Set(col.ids.map(n => n.id));
    const comps = col.ids.filter(n => n.type !== 'load');
    if (!comps.length) return;

    // roots: top of each chain within this column (parent null or foreign)
    const roots = [];
    const seenRoot = new Set();
    comps.forEach(n => {
      let cur = n;
      const guard = new Set();
      while (cur && colSet.has(cur.id) && cur.parentId != null && !guard.has(cur.id)) {
        guard.add(cur.id);
        const par = byId.get(cur.parentId);
        if (!par || !colSet.has(par.id)) break;
        cur = par;
      }
      if (!seenRoot.has(cur.id)) { seenRoot.add(cur.id); roots.push(cur.id); }
    });

    // depth over the primary forest
    const depth = {};
    const guard = new Set();
    const walk = (id, d) => {
      if (depth[id] == null || d < depth[id]) depth[id] = d;
      if (guard.has(id)) return;
      guard.add(id);
      kidsOf(id).forEach(k => walk(k.id, d + 1));
    };
    roots.forEach(r => walk(r, 0));

    // subtree widths
    const width = new Map();
    const sw = (id) => {
      if (width.has(id)) return width.get(id);
      const n = byId.get(id);
      const kids = kidsOf(id);
      let w = symW(n);
      if (kids.length) {
        const sum = kids.reduce((s, k) => s + sw(k.id) + LINE_W, -LINE_W);
        if (n.type === 'mv-dist' || n.type === 'dist') w = Math.max(96, sum);
        else w = Math.max(symW(n), sum);
      }
      width.set(id, w);
      return w;
    };
    comps.forEach(n => sw(n.id));

    // left-to-right packing
    const xOf = new Map();
    const place = (id, left) => {
      const n = byId.get(id);
      const kids = kidsOf(id);
      if (!kids.length) { xOf.set(id, left + symW(n) / 2); return left + symW(n); }
      let right = left;
      kids.forEach(k => { right = place(k.id, right + LINE_W); });
      const span = right - LINE_W - left;
      xOf.set(id, left + span / 2);
      return right - LINE_W;
    };
    let colRight = cursor;
    roots.forEach(r => { place(r, colRight); colRight += width.get(r) + LINE_W; });

    // final coordinates
    col.ids.forEach(n => {
      if (n.x == null || !n.manual) {
        if (n.type === 'load') {
          const par = n.parentId != null ? byId.get(n.parentId) : null;
          const sib = par ? kidsOf(par.id) : [];
          const i = sib.findIndex(c => c.id === n.id);
          const idx = i < 0 ? 0 : i;
          const baseX = par ? par.x : (cursor + (colRight - cursor) / 2);
          const off = idx - (sib.length - 1) / 2;
          n.x = Math.round(baseX + off * LINE_W);
          n.y = 60 + (par ? (depth[par.id] == null ? 0 : depth[par.id] + 1) : 1) * RR;
        } else {
          n.x = Math.round(xOf.get(n.id) == null ? cursor : xOf.get(n.id));
          n.y = 60 + (depth[n.id] == null ? 0 : depth[n.id]) * RR;
        }
      }
    });
    cursor = colRight + CLUSTER_GAP;
  });
}

function diagramNeedsLayout() { _layoutDirty = true; }
function diagramLayoutAll(force) {
  if (force) state.nodes.forEach(n => { n.manual = false; n.x = null; n.y = null; });
  _layoutDirty = true;
}
function ensureLayout() {
  if (!_layoutDirty) return;
  _layoutDirty = false;
  const anyManual = state.nodes.some(n => n.manual && n.x != null);
  if (anyManual) {
    state.nodes.filter(n => n.x == null).forEach(n => {
      if (n.parentId != null) {
        const p = findNode(n.parentId);
        if (p) { n.x = (p.x || 0) + ((n.id % 3) - 1) * 60; n.y = (p.y || 0) + RR * 0.7; }
        else { n.x = 120 + (n.id % 5) * 140; n.y = 90 + Math.floor(n.id / 5) * 100; }
      } else {
        n.x = 120 + (n.id % 4) * 150; n.y = 90 + Math.floor(n.id / 4) * 100;
      }
    });
  } else {
    solveLayout(state.nodes, state.systems || []);
    state.nodes.forEach(n => { if (n.x == null) { n.x = 120 + (n.id % 4) * 150; n.y = 90 + Math.floor(n.id / 4) * 100; } });
  }
  recomputeSpans();
}
function recomputeSpans() {
  const memo = new Map();
  const rec = (id) => {
    if (memo.has(id)) return memo.get(id);
    const n = findNode(id);
    if (!n) { memo.set(id, { lo: 0, hi: 0 }); return { lo: 0, hi: 0 }; }
    const kids = kidsOf(id);
    let lo = n.x - symW(n) / 2, hi = n.x + symW(n) / 2;
    if (kids.length) {
      let cl = Infinity, ch = -Infinity;
      kids.forEach(k => { const s = rec(k); cl = Math.min(cl, s.lo); ch = Math.max(ch, s.hi); });
      if (n.type === 'mv-dist' || n.type === 'dist') { lo = cl; hi = ch; }
    }
    const r = { lo: Math.min(lo), hi: Math.max(hi, lo + symW(n)) };
    memo.set(id, r);
    return r;
  };
  state.nodes.forEach(n => rec(n.id));
  _spans = memo;
}
function kidsOf(id) { return childrenOf(state.nodes, id).slice().sort((a, b) => orderOf(a) - orderOf(b) || (a.id - b.id)); }
function boardSpan(n) {
  const s = _spans.get(n.id);
  return s || { lo: n.x - 48, hi: n.x + 48 };
}

/* ===================================================================
   SYMBOL DRAWING
   =================================================================== */
function symbolDraw(n) {
  switch (n.type) {
    case 'utility': {
      const g = sv('g', {});
      g.appendChild(sv('polygon', { points: '0,-26 -28,6 28,6', fill: '#1d2b3d', stroke: '#0f5fc9', 'stroke-width': 1.4 }));
      return g;
    }
    case 'generator': {
      const g = sv('g', {});
      g.appendChild(sv('circle', { cx: 0, cy: 0, r: 21, fill: 'none', stroke: '#0f7a3d', 'stroke-width': 2.6 }));
      g.appendChild(sv('text', { x: 0, y: 6, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': '19', 'font-weight': '800', fill: '#0f7a3d' }, 'G'));
      return g;
    }
    case 'battery': {
      const g = sv('g', {});
      g.appendChild(sv('rect', { x: -26, y: -21, width: 52, height: 42, rx: 4, fill: 'none', stroke: '#00838f', 'stroke-width': 2.2 }));
      g.appendChild(sv('line', { x1: -12, y1: 0, x2: 12, y2: 0, stroke: '#00838f', 'stroke-width': 2.6 }));   // long line
      g.appendChild(sv('line', { x1: -12, y1: 9, x2: -5, y2: 9, stroke: '#00838f', 'stroke-width': 2.6 }));   // short line
      return g;
    }
    case 'transformer': {
      const g = sv('g', {});
      g.appendChild(sv('circle', { cx: 0, cy: -10, r: 15, fill: 'none', stroke: '#b3241c', 'stroke-width': 2.4 }));
      g.appendChild(sv('circle', { cx: 0, cy: 10, r: 15, fill: 'none', stroke: '#b3241c', 'stroke-width': 2.4 }));
      g.appendChild(sv('text', { x: 0, y: -32, 'text-anchor': 'middle', 'font-size': '10', 'font-weight': '800', fill: '#b3241c' }, 'MV'));
      g.appendChild(sv('text', { x: 0, y: 39, 'text-anchor': 'middle', 'font-size': '10', 'font-weight': '800', fill: '#b3241c' }, 'LV'));
      return g;
    }
    case 'ups': {
      const g = sv('g', {});
      g.appendChild(sv('rect', { x: -26, y: -20, width: 52, height: 40, rx: 4, fill: 'none', stroke: '#b26a00', 'stroke-width': 2.6 }));
      g.appendChild(sv('text', { x: 0, y: 6, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-size': '13', 'font-weight': '800', fill: '#b26a00' }, 'UPS'));
      return g;
    }
    case 'mv-dist': case 'dist': {
      const g = sv('g', {});
      const span = boardSpan(n);
      const x1 = span.lo - 4, x2 = span.hi + 4;
      const col = n.type === 'mv-dist' ? '#0f5fc9' : '#0a4a9e';
      g.appendChild(sv('line', { x1, y1: 0, x2, y2: 0, stroke: col, 'stroke-width': 5, 'stroke-linecap': 'round' }));
      g.appendChild(sv('line', { x1, y1: -7, x2, y2: 7, stroke: col, 'stroke-width': 5 }));
      g.appendChild(sv('line', { x2, y1: -7, x2, y2: 7, stroke: col, 'stroke-width': 5 }));
      return g;
    }
    case 'load': {
      const g = sv('g', {});
      g.appendChild(sv('line', { x1: -17, y1: 0, x2: 17, y2: 0, stroke: '#5b6675', 'stroke-width': 5, 'stroke-linecap': 'round' }));
      return g;
    }
    default: return sv('g', {});
  }
}
function captionData(n) {
  const f = (v, dp) => (v === '' || v == null) ? '\u2014' : fmt(parseFloat(v), dp == null ? 0 : dp);
  switch (n.type) {
    case 'utility': return { lines: [n.name, f(n.contractKVA, 0) + ' kVA', f(n.voltageKV, 0) + ' kV'] };
    case 'generator': return { lines: [n.name, f(n.ratingKVA, 0) + ' kVA', 'PF ' + f(n.pf, 2), f(n.voltageV, 0) + ' V'] };
    case 'battery': return { lines: [n.name, f(n.ratingKVA, 0) + ' kVA', f(n.voltageV, 0) + ' V'] };
    case 'transformer': return { lines: [n.name, f(n.ratingKVA, 0) + ' kVA', 'MV ' + f(n.hvV, 0) + ' V', 'LV ' + f(n.lvV, 0) + ' V'] };
    case 'ups': return { lines: [n.name, f(n.ratingKVA, 0) + ' kVA', f(n.voltageV, 0) + ' V'] };
    case 'mv-dist': case 'dist': return { lines: [n.name, f(n.voltageV, 0) + ' V', f(n.ratingA, 0) + ' A'] };
    default: return { lines: [n.name] };
  }
}
function captionAnchorX(n) {
  if (n.type === 'mv-dist' || n.type === 'dist') return boardSpan(n).hi + 26;
  return n.x + symW(n) / 2 + 22;
}

/* ===================================================================
   LINE ROUTING
   =================================================================== */
function cInput(c, r) {
  if (c.type === 'mv-dist' || c.type === 'dist') {
    return { x: c.x + (r ? 28 : (c.redundantParentId != null ? -28 : 0)), y: c.y };
  }
  return { x: c.x + (r ? 14 : (c.redundantParentId != null ? -14 : 0)), y: c.y - symH(c) / 2 };
}
function pOutY(p) { return p.type === 'mv-dist' || p.type === 'dist' ? p.y + 12 : p.y + symH(p) / 2; }

function pushSeg(segs, x1, y1, x2, y2, dashed) {
  if (Math.abs(x1 - x2) < 1e-9 && Math.abs(y1 - y2) < 1e-9) return;
  segs.push({ x1, y1, x2, y2, vertical: Math.abs(x1 - x2) < 1e-9, dashed: !!dashed });
}
function routeElbow(segs, sx, sy, tx, ty, dashed) {
  if (Math.abs(sx - tx) < 1e-9) { pushSeg(segs, sx, sy, tx, ty, dashed); return; }
  const lane = (sy + ty) / 2;
  pushSeg(segs, sx, sy, sx, lane, dashed);
  pushSeg(segs, sx, lane, tx, lane, dashed);
  pushSeg(segs, tx, lane, tx, ty, dashed);
}
function routePrimary(segs, dots, labels, parent, child) {
  const p = parent, c = child;
  if (p.type === 'mv-dist' || p.type === 'dist') {
    // board parent: straight drop from the bar to the child input point
    const ix = cInputX(c);
    const iy = cInputY(c, false);
    pushSeg(segs, ix, p.y + 12, ix, iy, false);
    dots.push({ x: ix, y: p.y + 12, tone: 'feed' });
    dots.push({ x: ix, y: iy, tone: 'feed' });
    if (c.redundantParentId != null) {
      labels.push({ x: ix + (ix < c.x ? -14 : 14), y: p.y + 2, text: 'P' });
    }
    return;
  }
  const sx = p.x, sy = pOutY(p);
  const inn = cInput(c, false);
  routeElbow(segs, sx, sy, inn.x, inn.y, false);
  dots.push({ x: inn.x, y: inn.y, tone: 'feed' });
  if (c.redundantParentId != null) {
    const lx = inn.x + (inn.x < c.x ? -12 : 12);
    labels.push({ x: lx, y: inn.y - 14, text: 'P' });
  }
}
function routeRedundant(segs, dots, labels, parent, child) {
  const c = child;
  const sx = parent.x, sy = pOutY(parent);
  const inn = cInput(c, true);
  routeElbow(segs, sx, sy, inn.x, inn.y, true);
  dots.push({ x: inn.x, y: inn.y, tone: 'feed' });
  labels.push({ x: inn.x + (c.type === 'mv-dist' || c.type === 'dist' ? -8 : 10), y: inn.y - 14, text: 'R' });
}
function cInputX(c, r) {
  if (c.type === 'mv-dist' || c.type === 'dist') return c.x + (r ? 28 : (c.redundantParentId != null ? -28 : 0));
  return c.x + (r ? 14 : (c.redundantParentId != null ? -14 : 0));
}
function cInputY(c, r) {
  if (c.type === 'mv-dist' || c.type === 'dist') return c.y;
  return c.y - symH(c) / 2;
}

/* Does this line cross another (strictly, not sharing endpoints)? */
function segCross(a, b) {
  if (a.vertical === b.vertical) return null;
  const h = a.vertical ? b : a;
  const v = a.vertical ? a : b;
  const hx1 = Math.min(h.x1, h.x2), hx2 = Math.max(h.x1, h.x2);
  const vy1 = Math.min(v.y1, v.y2), vy2 = Math.max(v.y1, v.y2);
  const px = v.x1, py = h.y1;
  if (px > hx1 + 0.6 && px < hx2 - 0.6 && py > vy1 + 0.6 && py < vy2 - 0.6) return { x: px, y: py };
  return null;
}

/* ===================================================================
   CONTENT BUILD (symbols, lines, captions on the world plane)
   =================================================================== */
function buildContent(g) {
  _hitList = [];
  const b = computeBounds();
  // faint grid
  if (diagramGridVisible) {
    for (let x = Math.floor(b.minX / GRID_DRAW) * GRID_DRAW; x <= b.maxX; x += GRID_DRAW)
      for (let y = Math.floor(b.minY / GRID_DRAW) * GRID_DRAW; y <= b.maxY; y += GRID_DRAW)
        g.appendChild(sv('circle', { cx: x, cy: y, r: 1.05, fill: '#cbd3dd' }));
  }
  // cluster boxes
  columnBoxes().forEach(c => {
    if (!c.box) return;
    g.appendChild(sv('rect', { x: c.box.lo, y: c.box.top, width: c.box.hi - c.box.lo, height: c.box.bot - c.box.top, rx: 7, fill: c.color + '08' }));
    g.appendChild(sv('text', { x: c.box.lo + 14, y: c.box.top + 20, 'font-family': 'sans-serif', 'font-size': '11', 'font-weight': '700', fill: '#5b6675' }, c.label.toUpperCase()));
  });

  // routing
  const segs = [], dots = [], labels = [];
  state.nodes.forEach(n => {
    if (n.parentId != null) {
      const p = findNode(n.parentId);
      if (p) routePrimary(segs, dots, labels, p, n);
    }
    if (n.redundantParentId != null) {
      const p = findNode(n.redundantParentId);
      if (p) routeRedundant(segs, dots, labels, p, n);
    }
  });

  // draw lines
  const st = '#33415a', ds = '#66707a';
  segs.forEach(s => {
    g.appendChild(sv('line', { x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, stroke: s.dashed ? ds : st, 'stroke-width': 2, 'stroke-dasharray': s.dashed ? '7 5' : null, 'stroke-linecap': 'round' }));
  });
  // crossing gaps (later segment in pairs list yields a white gap)
  for (let i = 0; i < segs.length; i++) {
    for (let j = i + 1; j < segs.length; j++) {
      const cr = segCross(segs[i], segs[j]);
      if (!cr) continue;
      const cut = segs[j];
      if (cut.vertical) g.appendChild(sv('line', { x1: cr.x, y1: cr.y - 5, x2: cr.x, y2: cr.y + 5, stroke: '#ffffff', 'stroke-width': 5.4, 'stroke-linecap': 'round' }));
      else g.appendChild(sv('line', { x1: cr.x - 5, y1: cr.y, x2: cr.x + 5, y2: cr.y, stroke: '#ffffff', 'stroke-width': 5.4, 'stroke-linecap': 'round' }));
    }
  }
  dots.forEach(d => g.appendChild(sv('circle', { cx: d.x, cy: d.y, r: 3.4, fill: '#0f5fc9' })));
  labels.forEach(l => g.appendChild(sv('text', { x: l.x, y: l.y, 'font-family': 'sans-serif', 'font-size': '10', 'font-weight': '800', fill: '#0a4a9e', 'text-anchor': 'middle' }, l.text)));

  // symbols (boards drawn early so child lines paint over their runs)
  state.nodes.slice().sort((a, b) => {
    const ab = (a.type === 'mv-dist' || a.type === 'dist') ? 0 : 1;
    const bb = (b.type === 'mv-dist' || b.type === 'dist') ? 0 : 1;
    return (ab - bb) || (a.id - b.id);
  }).forEach(n => {
    const sym = sv('g', {});
    sym.appendChild(symbolDraw(n));
    sym.setAttribute('transform', 'translate(' + n.x + ' ' + n.y + ')');
    if (n.id === selectedDiagramId) {
      sym.appendChild(sv('rect', { x: -symW(n) / 2 - 5, y: -symH(n) / 2 - 5, width: symW(n) + 10, height: symH(n) + 10, rx: 6, fill: 'rgba(15,95,201,.05)', stroke: '#0f5fc9', 'stroke-width': '1.6', 'stroke-dasharray': '6 3' }));
    }
    if (!nodeEffectiveActive(n)) {
      sym.appendChild(sv('rect', { x: -symW(n) / 2, y: -symH(n) / 2, width: symW(n), height: symH(n), rx: 5, fill: 'rgba(91,102,117,.20)' }));
    }
    g.appendChild(sym);
    if (n.type === 'load') {
      const lab = sv('g', {});
      lab.appendChild(sv('text', { x: 0, y: 16, 'font-family': 'sans-serif', 'font-size': '11', 'font-weight': '600', fill: '#182230' }, n.name || ''));
      lab.setAttribute('transform', 'translate(' + n.x + ' ' + (n.y + 12) + ') rotate(90)');
      g.appendChild(lab);
    }
    _hitList.push({ kind: 'node', id: n.id, x: n.x, y: n.y, w: symW(n), h: symH(n) });
  });

  // captions
  state.nodes.forEach(n => {
    if (n.type === 'load') return;
    const dd = captionData(n);
    const g2 = sv('g', {});
    let yy = 0;
    dd.lines.forEach((ln, i) => {
      const t = sv('text', { x: 0, y: yy, 'font-family': 'sans-serif', 'font-size': i === 0 ? '12.5' : '10.5', 'font-weight': i === 0 ? '700' : '400', fill: i === 0 ? '#0b1c33' : '#5b6675' }, ln);
      g2.appendChild(t);
      yy += i === 0 ? 14 : 12;
    });
    g2.setAttribute('transform', 'translate(' + (captionAnchorX(n) + (n.captionDx || 0)) + ' ' + (n.y - 18 + (n.captionDy || 0)) + ')');
    g.appendChild(g2);
    _hitList.push({ kind: 'caption', id: n.id, x: captionAnchorX(n) + (n.captionDx || 0) + 20, y: n.y - 18 + (n.captionDy || 0), w: 120, h: 44 });
  });
}
function columnBoxes() {
  const out = [];
  state.systems.forEach(s => {
    const ids = state.nodes.filter(n => n.systemId === s.id);
    if (!ids.length) return;
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    ids.forEach(n => {
      const sp = _spans.get(n.id);
      const l = sp ? sp.lo : n.x - symW(n) / 2, h = sp ? sp.hi : n.x + symW(n) / 2;
      lo = Math.min(lo, l); hi = Math.max(hi, h);
      top = Math.min(top, n.y - 26); bot = Math.max(bot, n.y + 30);
    });
    out.push({ box: { lo: lo - 30, hi: hi + 30, top: top - 34, bot: bot + 42 }, label: s.name, color: s.color });
  });
  const un = state.nodes.filter(n => n.systemId == null);
  if (un.length) {
    let lo = Infinity, hi = -Infinity, top = Infinity, bot = -Infinity;
    un.forEach(n => {
      lo = Math.min(lo, n.x - symW(n) / 2); hi = Math.max(hi, n.x + symW(n) / 2);
      top = Math.min(top, n.y - 26); bot = Math.max(bot, n.y + 30);
    });
    out.push({ box: { lo: lo - 30, hi: hi + 30, top: top - 34, bot: bot + 42 }, label: 'Unassigned', color: '#5b6675' });
  }
  return out;
}
function computeBounds() {
  if (!state.nodes.length) return { minX: 0, minY: 0, maxX: 520, maxY: 320 };
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  state.nodes.forEach(n => {
    const sp = _spans.get(n.id);
    const l = sp ? sp.lo : n.x - symW(n) / 2, h = sp ? sp.hi : n.x + symW(n) / 2;
    minX = Math.min(minX, l - 90); maxX = Math.max(maxX, h + 100);
    minY = Math.min(minY, n.y - symH(n) - 60); maxY = Math.max(maxY, n.y + 120);
  });
  if (minX > maxX) { minX = 0; maxX = 520; }
  if (minY > maxY) { minY = 0; maxY = 320; }
  return { minX, minY, maxX, maxY };
}

/* ===================================================================
   VIEW / CAMERA
   =================================================================== */
function renderDiagramView() {
  if (activeView !== 'diagram') return;
  ensureLayout();
  const svgEl = $('#diagramSvg');
  if (!svgEl) return;
  svgEl.innerHTML = '';
  if (!state.nodes.length) {
    svgEl.appendChild(sv('text', { x: 36, y: 44, 'font-family': 'sans-serif', 'font-size': '15', fill: '#5b6675' }, 'No components yet - add one (Network tab or + Add component) to build the diagram.'));
    diagNotePanel();
    return;
  }
  const world = sv('g', { transform: 'translate(' + panX + ' ' + panY + ') scale(' + zoom + ')' });
  buildContent(world);
  svgEl.appendChild(world);
  _worldG = world;
  _diagBounds = computeBounds();
  if (!_firstFitDone) { _firstFitDone = true; fitView(); }
  updateViewInfo();
  diagramNotePanelIf();
}
function diagramNotePanelIf() {
  if (typeof diagramPanelRender === 'function') diagramPanelRender();
}
function updateViewInfo() {
  const el = $('#diagramViewInfo');
  if (el) el.textContent = Math.round(zoom * 100) + '%';
}
function updateCameraTransform() {
  if (_worldG) _worldG.setAttribute('transform', 'translate(' + panX + ' ' + panY + ') scale(' + zoom + ')');
}
function diagramFitView() { fitView(); }
function fitView() {
  if (!_diagBounds) return;
  const svgEl = $('#diagramSvg');
  if (!svgEl) return;
  const r = svgEl.getBoundingClientRect();
  const W = _diagBounds.maxX - _diagBounds.minX, H = _diagBounds.maxY - _diagBounds.minY;
  if (W <= 0 || H <= 0) return;
  const availW = r.width - 60, availH = r.height - 60;
  zoom = Math.min(1.5, Math.max(0.12, Math.min(availW / W, availH / H)));
  panX = r.width / 2 - ((_diagBounds.minX + _diagBounds.maxX) / 2) * zoom;
  panY = r.height / 2 - ((_diagBounds.minY + _diagBounds.maxY) / 2) * zoom;
  updateCameraTransform();
}
function zoomBy(f) {
  zoom = Math.min(4, Math.max(0.12, zoom * f));
  updateCameraTransform();
  updateViewInfo();
}
function diagramZoomBy(f) { zoomBy(f); }
function diagramFitView() { fitView(); }

/* ===================================================================
   POINTER / CONTEXT INTERACTIONS
   =================================================================== */
function svgWorldPoint(evt) {
  const r = $('#diagramSvg').getBoundingClientRect();
  return { x: (evt.clientX - r.left - panX) / zoom, y: (evt.clientY - r.top - panY) / zoom };
}
function hitAt(p) {
  for (let i = _hitList.length - 1; i >= 0; i--) {
    const h = _hitList[i];
    if (Math.abs(p.x - h.x) <= h.w / 2 + 8 && Math.abs(p.y - h.y) <= h.h / 2 + 8) return h;
  }
  return null;
}
function pointerDown(e) {
  const p = svgWorldPoint(e);
  const hit = hitAt(p);
  if (hit && hit.kind === 'caption') {
    selectedDiagramId = hit.id;
    const n = findNode(hit.id);
    _drag = { mode: 'caption', id: hit.id, gx: p.x, gy: p.y, ox: n.captionDx || 0, oy: n.captionDy || 0 };
    diagramNotePanelIf();
    renderDiagramView();
    return;
  }
  if (hit && hit.kind === 'node') {
    if (diagramReconnectActive()) { reconnectApply(hit.id, p); return; }
    selectedDiagramId = hit.id;
    const n = findNode(hit.id);
    _drag = { mode: 'node', id: hit.id, gx: p.x, gy: p.y, ox: n.x - p.x, oy: n.y - p.y, moved: false };
    diagramNotePanelIf();
    renderDiagramView();
    return;
  }
  if (diagramReconnectActive()) { reconnectCancel(); return; }
  selectedDiagramId = null;
  diagramNotePanelIf();
  _drag = { mode: 'pan', px: e.clientX, py: e.clientY, ox: panX, oy: panY };
  renderDiagramView();
}
function pointerMove(e) {
  if (!_drag) return;
  if (_drag.mode === 'pan') {
    panX = _drag.ox + (e.clientX - _drag.px);
    panY = _drag.oy + (e.clientY - _drag.py);
    updateCameraTransform();
    return;
  }
  const p = svgWorldPoint(e);
  const n = findNode(_drag.id);
  if (!n) return;
  if (_drag.mode === 'node') {
    _drag.moved = true;
    n.x = Math.round((p.x + _drag.ox) / GRID_SNAP) * GRID_SNAP;
    n.y = Math.round((p.y + _drag.oy) / GRID_SNAP) * GRID_SNAP;
    n.manual = true;
    renderDiagramView();
  } else {
    n.captionDx = _drag.ox + (p.x - _drag.gx);
    n.captionDy = _drag.oy + (p.y - _drag.gy);
    renderDiagramView();
  }
}
function pointerUp() {
  if (!_drag) return;
  _drag = null;
  markAutosave();
}
function wheel(e) {
  if (!e.deltaY) return;
  const before = svgWorldPoint(e);
  zoom *= e.deltaY < 0 ? 1.12 : 1 / 1.12;
  if (zoom < 0.12) zoom = 0.12;
  if (zoom > 6) zoom = 6;
  const r = $('#diagramSvg').getBoundingClientRect();
  const sx = e.clientX - r.left, sy = e.clientY - r.top;
  panX = sx - before.x * zoom;
  panY = sy - before.y * zoom;
  updateCameraTransform();
  updateViewInfo();
  e.preventDefault();
}
function contextMenu(e) {
  e.preventDefault();
  closeDiagramMenus();
  const p = svgWorldPoint(e);
  const hit = hitAt(p);
  if (!hit || hit.kind !== 'node') return;
  openContextMenu(e, hit.id);
}
function closeDiagramMenus() {
  if (diagramContextMenu && diagramContextMenu.remove) diagramContextMenu.remove();
  diagramContextMenu = null;
}
function openContextMenu(evt, id) {
  const node = findNode(id); if (!node) return;
  const menu = el('div', { class: 'diagram-contextmenu' });
  const item = (t, cb, danger) => {
    const b = el('button', { class: 'dcm-item' + (danger ? ' dcm-danger' : '') }, [t]);
    b.addEventListener('click', () => { closeDiagramMenus(); cb(); });
    menu.appendChild(b);
  };
  item('Add child', () => showAddTypeMenu(evt, { parentNode: node }));
  if (node.type !== 'generator' && node.type !== 'battery') {
    item('Change primary source', () => reconnectStart(node.id, 'primary'));
    item(node.redundantParentId != null ? 'Change redundant source' : 'Add redundant supply', () => reconnectStart(node.id, 'redundant'));
    if (node.redundantParentId != null) {
      item('Remove redundant feed', () => { node.redundantParentId = null; if (node.activeFeed === 'redundant') node.activeFeed = 'primary'; markAutosave(); renderDiagramView(); });
    }
  }
  if (node.type !== 'load') item('Duplicate subtree', () => { duplicateNodeSubtree(node.id); markAutosave(); renderActive(); showToast('Duplicated.', 'success'); });
  item('Delete', () => deleteNode(node.id), true);
  document.body.appendChild(menu);
  const rr = menu.getBoundingClientRect();
  menu.style.left = Math.min(evt.clientX, window.innerWidth - rr.width - 8) + 'px';
  menu.style.top = Math.min(evt.clientY, window.innerHeight - rr.height - 8) + 'px';
  diagramContextMenu = menu;
  setTimeout(() => {
    document.addEventListener('click', (h) => {
      if (!menu.contains(h.target)) { closeDiagramMenus(); document.removeEventListener('click', h); }
    });
  }, 0);
}
function diagramReconnectActive() { return reconnect != null; }
function reconnectStart(nodeId, key) {
  reconnect = { nodeId, key };
  showToast(key === 'primary' ? 'Primary source - click a component to re-connect.' : 'Redundant supply - click a component to add / change the redundant feed.', 'warn');
  renderDiagramView();
}
function reconnectCancel() {
  reconnect = null;
  renderDiagramView();
}
function reconnectApply(targetId, p) {
  const node = reconnect ? findNode(reconnect.nodeId) : null;
  const key = reconnect ? reconnect.key : null;
  const target = findNode(targetId);
  reconnect = null;
  if (!node || !target || target === node) { showToast('Pick a different component.', 'error'); renderDiagramView(); return; }
  if (target.type === 'load') { showToast('Loads cannot supply other components.', 'error'); renderDiagramView(); return; }
  const pid = target.id;
  if (key === 'redundant' && pid === node.parentId) { showToast('Redundant supply must differ from the primary.', 'error'); renderDiagramView(); return; }
  if (key === 'primary' && pid === node.redundantParentId) { showToast('Primary supply must differ from the redundant.', 'error'); renderDiagramView(); return; }
  if (wouldCreateCycle(state.nodes, node.id, pid)) { showToast('That would create a cycle.', 'error'); renderDiagramView(); return; }
  if (key === 'primary') {
    node.parentId = pid;
    if (node.redundantParentId === pid) node.redundantParentId = null;
  } else {
    node.redundantParentId = pid;
    if (node.parentId === pid) { showToast('Redundant supply must differ from primary.', 'error'); return; }
  }
  markAutosave();
  renderDiagramView();
  showToast('Supply updated.', 'success');
}

/* ===================================================================
   WIRE-UP
   =================================================================== */
function diagramPanelRenderIf() {
  if (typeof diagramPanelRender === 'function') diagramPanelRender();
}
function diagramNotePanel() {}

/* ===================================================================
   EXPORT (SVG string / PNG raster)
   =================================================================== */
function exportDiagramImage(kind) {
  if (!_diagBounds) return;
  try {
    const svgStr = standaloneSVG();
    if (kind === 'svg') {
      saveBlob('block-diagram.svg', new Blob([svgStr], { type: 'image/svg+xml' }));
    } else {
      pngFromSVG(svgStr);
    }
    showToast('Diagram exported.', 'success');
  } catch (err) {
    console.error('diagram export failed', err);
    showToast('Export failed: ' + err.message, 'error', 8000);
  }
}
function standaloneSVG() {
  const b = computedSVGBounds();
  const pad = 50;
  const W = Math.round(b.maxX - b.minX + pad * 2);
  const H = Math.round(b.maxY - b.minY + pad * 2);
  const doc = sv('svg', { xmlns: SVGNS, width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'font-family': 'sans-serif' });
  doc.appendChild(sv('rect', { width: W, height: H, fill: '#ffffff' }));
  const g = sv('g', { transform: 'translate(' + (pad - b.minX) + ' ' + (pad - b.minY) + ')' });
  const prevGrid = diagramGridVisible;
  diagramGridVisible = false;
  buildContent(g);
  diagramGridVisible = prevGrid;
  doc.appendChild(g);
  return new XMLSerializer().serializeToString(doc);
}
function computedSVGBounds() {
  return _diagBounds || computeBounds();
}
function pngFromSVG(svgString) {
  const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml' }));
  const img = new Image();
  img.onload = () => {
    try {
      const w = Math.max(1, Math.round(img.width));
      const hh = Math.max(1, Math.round(img.height));
      const canvas = new Canvas(w, hh);
      canvas.drawImage(img, 0, 0);
      canvas.toBlob('image/png').then(blob => saveBlob('block-diagram.png', blob));
    } catch (e) { showToast('PNG export failed: ' + e.message, 'error', 7000); }
    URL.revokeObjectURL(url);
  };
  img.onError = () => { URL.revokeObjectURL(url); showToast('PNG export failed - could not rasterise the SVG.', 'error', 7000); };
  img.src = url;
}
function saveBlob(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
}

/* bind svg events */
(function bindDiagramEvents() {
  if (typeof document === 'undefined') return;
  const s = $('#diagramSvg');
  if (!s) return;
  s.addEventListener('pointerdown', (e) => pointerDown(e));
  s.addEventListener('pointermove', (e) => pointerMove(e));
  s.addEventListener('pointerup', (e) => pointerUp(e));
  s.addEventListener('contextmenu', (e) => contextMenu(e));
  s.addEventListener('wheel', (e) => wheel(e));
})();

if (typeof module !== 'undefined') {
  module.exports = { solveLayout, symW, symH };
}