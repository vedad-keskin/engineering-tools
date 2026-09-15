/* ===================================================================
   Network Diagram Builder - Diagram tab
   SVG scene render, pan/zoom, selection/drag, link drawing, side panel,
   export (SVG/PNG/print sheet). Depends on geometry.js (pure) and on
   app.js globals (state, findNode, TYPE_META, TYPE_FIELDS, etc.).
   =================================================================== */
var Diagram = (function () {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const SHEETS = {
    'A4-landscape': { w: 297, h: 210 },
    'A3-landscape': { w: 420, h: 297 },
    'A0-landscape': { w: 1189, h: 841 },
  };

  let svg = null, wrap = null, world = null, panel = null, emptyEl = null;
  let zoom = 1, panX = 0, panY = 0;
  let selection = new Set();
  let selectedLink = null;      // { childId, role }
  let dragState = null;
  let linkDraw = null;          // { mode: 'supply'|'consume', node, x, y, curX, curY }
  let activeGuides = [];
  let boardLayouts = new Map();
  let initialized = false;

  function svgEl(tag, attrs, children) {
    const e = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    (children || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function textNode(s) { return document.createTextNode(s); }

  function systemColorOf(systemId) {
    if (systemId == null) return '#5b6675';
    const s = state.systems.find(x => x.id === systemId);
    return s ? s.color : '#5b6675';
  }

  /* =================================================================
     INIT
     ================================================================= */
  function init() {
    svg = document.getElementById('dgCanvas');
    wrap = document.getElementById('dgCanvasWrap');
    panel = document.getElementById('dgPanel');
    emptyEl = document.getElementById('dgEmpty');
    if (!svg) return;
    if (state.diagram) { zoom = state.diagram.zoom || 1; }

    svg.addEventListener('pointerdown', onCanvasPointerDown);
    svg.addEventListener('wheel', onWheel, { passive: false });
    svg.addEventListener('contextmenu', (e) => e.preventDefault());
    svg.addEventListener('dblclick', onCanvasDblClick);

    const btn = (id, fn) => { const b = document.getElementById(id); if (b) b.addEventListener('click', fn); };
    btn('btnDgFit', fitToContent);
    btn('btnDgZoomIn', () => zoomBy(1.2));
    btn('btnDgZoomOut', () => zoomBy(1 / 1.2));
    btn('btnDgRelayout', () => { relayoutAll(); });
    btn('btnDgExportSvg', exportSVGFile);
    btn('btnDgExportPng', exportPNGFile);

    const chkGrid = document.getElementById('chkDgGrid');
    if (chkGrid) chkGrid.addEventListener('change', () => { state.diagram.showGrid = chkGrid.checked; render(); History.mark(); });
    const chkTB = document.getElementById('chkDgTitleBlock');
    if (chkTB) chkTB.addEventListener('change', () => { state.diagram.titleBlock = chkTB.checked; render(); History.mark(); });
    const selSheet = document.getElementById('selDgSheet');
    if (selSheet) selSheet.addEventListener('change', () => { state.diagram.sheet = selSheet.value; History.mark(); });

    document.addEventListener('keydown', onKeyDown);
    initialized = true;
  }

  function onKeyDown(e) {
    if (typeof activeView === 'undefined' || activeView !== 'diagram') return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (e.key === 'Escape') { selection.clear(); selectedLink = null; render(); }
    const arrowMap = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (arrowMap[e.key] && selection.size) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const [ddx, ddy] = arrowMap[e.key];
      selection.forEach(id => { const n = findNode(id); if (n) { n.x += ddx * step; n.y += ddy * step; } });
      render();
      History.mark();
    }
  }

  /* =================================================================
     LAYOUT ENTRY POINTS (called from app.js)
     ================================================================= */
  function relayoutAll() {
    dgLayout(state.nodes, state.systems, true);
    state.diagram.laidOut = true;
    History.commit();
    render();
    fitToContent();
    showToast('Diagram re-laid out.', 'success');
  }
  function invalidateLayout() {
    state.nodes.forEach(n => { n.x = null; n.y = null; });
    state.diagram.laidOut = false;
  }
  function onNodesRemoved(idSet) {
    idSet.forEach(id => selection.delete(id));
    if (selectedLink && (idSet.has(selectedLink.childId) || idSet.has(selectedLink.parentId))) selectedLink = null;
  }

  /* =================================================================
     LINK MODEL
     ================================================================= */
  function collectLinks(nodes) {
    const links = [];
    nodes.forEach(n => {
      if (n.parentId != null) links.push({ id: 'l' + n.parentId + '-' + n.id + '-p', parentId: n.parentId, childId: n.id, role: 'primary' });
      if (n.redundantParentId != null) links.push({ id: 'l' + n.redundantParentId + '-' + n.id + '-r', parentId: n.redundantParentId, childId: n.id, role: 'redundant' });
    });
    return links;
  }

  function dgOutTerminal(node) { return dgTerminals(node.type).find(t => t.dir === 'out'); }
  function dgInTerminal(node, role) {
    const ts = dgTerminals(node.type).filter(t => t.dir === 'in');
    if (!ts.length) return null;
    return ts.find(t => t.role === role) || ts[0];
  }

  function sourcePoint(parent, link) {
    if (dgIsBoard(parent.type)) {
      const bl = boardLayouts.get(parent.id);
      const suffix = link.role === 'primary' ? 'p' : 'r';
      const item = bl && bl.bottom.find(b => b.nodeId === link.childId && b.id.slice(-1) === suffix);
      return { x: parent.x + (item ? item.x : 0), y: parent.y };
    }
    const t = dgOutTerminal(parent);
    return { x: parent.x + (t ? t.x : 0), y: parent.y + (t ? t.y : 0) };
  }
  function targetPoint(child, link) {
    if (dgIsBoard(child.type)) {
      const bl = boardLayouts.get(child.id);
      const item = bl && bl.top.find(t => t.kind === link.role);
      return { pt: { x: child.x + (item ? item.x : 0), y: child.y }, approach: 'top' };
    }
    const t = dgInTerminal(child, link.role);
    let x = child.x + (t ? t.x : 0);
    if (child.type === 'load' && link.role === 'redundant') x += 7;
    return { pt: { x, y: child.y + (t ? t.y : 0) }, approach: t ? t.approach : 'top' };
  }

  function linkColor(parent, child) {
    const sid = child.systemId != null ? child.systemId : parent.systemId;
    return systemColorOf(sid);
  }

  function dgLinkEndLabel(node, role) {
    if (node.type === 'transformer') return null;
    if (node.redundantParentId == null) return null;
    return role === 'primary' ? 'P' : 'R';
  }

  /* =================================================================
     SYMBOL DRAWING
     ================================================================= */
  function trianglePathD(hw, h) {
    return 'M ' + (-hw) + ' ' + (-h / 2) + ' L ' + hw + ' ' + (-h / 2) + ' L 0 ' + (h / 2) + ' Z';
  }

  function buildBatterySymbol(color) {
    const g = svgEl('g');
    g.appendChild(svgEl('rect', { x: -20, y: -28, width: 40, height: 56, fill: '#ffffff', stroke: color, 'stroke-width': DG_STROKE_SYM }));
    g.appendChild(svgEl('line', { x1: -12, y1: -6, x2: 12, y2: -6, stroke: color, 'stroke-width': 3 }));
    g.appendChild(svgEl('line', { x1: -7, y1: 6, x2: 7, y2: 6, stroke: color, 'stroke-width': 8 }));
    return g;
  }
  function buildBusSymbol(node, color, halfLen) {
    const g = svgEl('g');
    g.appendChild(svgEl('line', { x1: -halfLen, y1: 0, x2: halfLen, y2: 0, stroke: color, 'stroke-width': DG_STROKE_BUS, 'stroke-linecap': 'butt' }));
    g.appendChild(svgEl('line', { x1: -halfLen, y1: -8, x2: -halfLen, y2: 8, stroke: color, 'stroke-width': DG_STROKE_SYM }));
    g.appendChild(svgEl('line', { x1: halfLen, y1: -8, x2: halfLen, y2: 8, stroke: color, 'stroke-width': DG_STROKE_SYM }));
    return g;
  }
  function buildLoadSymbol(color) {
    const g = svgEl('g');
    const h = DG_LOAD_BOX / 2;
    g.appendChild(svgEl('rect', { x: -h, y: -h, width: h * 2, height: h * 2, fill: '#ffffff', stroke: color, 'stroke-width': DG_STROKE_SYM }));
    g.appendChild(svgEl('line', { x1: -h, y1: -h, x2: h, y2: h, stroke: color, 'stroke-width': DG_STROKE_LINK }));
    g.appendChild(svgEl('line', { x1: h, y1: -h, x2: -h, y2: h, stroke: color, 'stroke-width': DG_STROKE_LINK }));
    return g;
  }

  function buildSymbolShape(node, color) {
    switch (node.type) {
      case 'utility':
        return svgEl('path', { d: trianglePathD(28, 48), fill: color, stroke: '#182230', 'stroke-width': 1.5 });
      case 'generator': {
        const g = svgEl('g');
        g.appendChild(svgEl('circle', { r: 24, fill: '#ffffff', stroke: color, 'stroke-width': DG_STROKE_SYM }));
        g.appendChild(svgEl('text', { x: 0, y: 8, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: color }, ['G']));
        return g;
      }
      case 'battery':
        return buildBatterySymbol(color);
      case 'transformer': {
        const g = svgEl('g');
        g.appendChild(svgEl('circle', { cx: 0, cy: -14, r: 20, fill: '#ffffff', stroke: color, 'stroke-width': DG_STROKE_SYM }));
        g.appendChild(svgEl('circle', { cx: 0, cy: 14, r: 20, fill: '#ffffff', stroke: color, 'stroke-width': DG_STROKE_SYM }));
        return g;
      }
      case 'ups': {
        const g = svgEl('g');
        g.appendChild(svgEl('rect', { x: -28, y: -20, width: 56, height: 40, fill: '#ffffff', stroke: color, 'stroke-width': DG_STROKE_SYM }));
        g.appendChild(svgEl('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-size': 13, 'font-weight': 800, fill: color }, ['UPS']));
        return g;
      }
      case 'mv-dist': case 'dist': {
        const bl = boardLayouts.get(node.id);
        return buildBusSymbol(node, color, bl ? bl.halfLen : DG_MIN_BUS / 2);
      }
      case 'load':
        return buildLoadSymbol(color);
      default:
        return svgEl('circle', { r: 20, fill: '#fff', stroke: color, 'stroke-width': DG_STROKE_SYM });
    }
  }

  function buildSymbol(node, interactive) {
    const g = svgEl('g', { class: 'dg-symbol', transform: 'translate(' + node.x + ',' + node.y + ')' });
    g.dataset.id = String(node.id);
    if (!nodeEffectiveActive(node)) g.setAttribute('opacity', '0.4');
    const color = node.systemId != null ? systemColorOf(node.systemId) : '#5b6675';
    g.appendChild(buildSymbolShape(node, color));
    if (interactive) {
      g.style.cursor = 'move';
      g.addEventListener('pointerdown', (e) => onSymbolPointerDown(e, node));
    }
    return g;
  }

  /* =================================================================
     ANNOTATIONS (draggable independently of the symbol)
     ================================================================= */
  function annotationLine(node, key) {
    if (key === 'tag') return node.tag ? node.tag : null;
    if (key === 'name') return node.name || null;
    const def = (TYPE_FIELDS[node.type] || []).find(f => f.key === key);
    if (!def) return null;
    const v = node[key];
    if (v == null || v === '') return null;
    return def.label + ': ' + v + (def.unit ? ' ' + def.unit : '');
  }

  function defaultLabelOffset(node) {
    const b = dgBounds(node);
    if (node.type === 'load') return { dx: 0, dy: b.ht + 14 };
    const fields = node.showFields || DIAGRAM_DEFAULTS[node.type] || [];
    const rowCount = Math.max(1, fields.filter(k => annotationLine(node, k) != null).length);
    return { dx: -b.hw, dy: -(b.ht + 12 + (rowCount - 1) * 12) };
  }

  function buildAnnotation(node, interactive) {
    const fields = node.showFields || DIAGRAM_DEFAULTS[node.type] || [];
    const isLoad = node.type === 'load';
    const def = defaultLabelOffset(node);
    const dx = node.labelDx != null ? node.labelDx : def.dx;
    const dy = node.labelDy != null ? node.labelDy : def.dy;
    const g = svgEl('g', { class: 'dg-label', transform: 'translate(' + (node.x + dx) + ',' + (node.y + dy) + ')' });
    g.dataset.id = String(node.id);

    if (isLoad) {
      const rows = [];
      if (fields.indexOf('name') !== -1 && node.name) rows.push(node.name);
      if (fields.indexOf('ratedKW') !== -1 && node.ratedKW !== '' && node.ratedKW != null) rows.push(fmt(node.ratedKW, 1) + ' kW');
      let x = 0;
      rows.forEach((txt, i) => {
        g.appendChild(svgEl('text', {
          x: 0, y: 0, transform: 'translate(' + x + ',0) rotate(-90)',
          'font-size': 10, 'font-family': "'SF Mono','Cascadia Mono',Consolas,monospace",
          'font-weight': i === 0 ? 700 : 400, fill: '#182230',
        }, [txt]));
        x += 12;
      });
    } else {
      let y = 0;
      fields.forEach(key => {
        const txt = annotationLine(node, key);
        if (txt == null) return;
        g.appendChild(svgEl('text', {
          x: 0, y, 'font-size': 10, 'font-weight': (key === 'tag' || key === 'name') ? 700 : 400, fill: '#182230',
        }, [txt]));
        y += 12;
      });
    }
    // transparent hit rect so empty gaps between text rows are still draggable
    const hit = svgEl('rect', { x: -4, y: -12, width: 130, height: Math.max(16, (fields.length + 1) * 12), fill: 'transparent' });
    g.insertBefore(hit, g.firstChild);
    if (interactive) {
      g.style.cursor = 'move';
      g.addEventListener('pointerdown', (e) => onLabelPointerDown(e, node));
    }
    return g;
  }

  /* =================================================================
     CONTENT BUILDER (shared by on-screen render + export)
     ================================================================= */
  function buildDiagramContent(nodes, opts) {
    opts = opts || {};
    const interactive = !!opts.interactive;
    boardLayouts = new Map();
    nodes.filter(n => dgIsBoard(n.type)).forEach(n => boardLayouts.set(n.id, dgBusLayout(n, nodes)));

    const content = svgEl('g', { class: 'dg-content' });

    if (opts.grid) content.appendChild(buildGrid(opts.gridBounds));

    const links = collectLinks(nodes);
    let allSegs = [];
    const linkMeta = {};
    links.forEach(link => {
      const parent = findNode(link.parentId), child = findNode(link.childId);
      if (!parent || !child) return;
      const src = sourcePoint(parent, link);
      const tgtInfo = targetPoint(child, link);
      const segs = dgRouteLink(link.id, src, tgtInfo.pt, tgtInfo.approach);
      allSegs = allSegs.concat(segs);
      linkMeta[link.id] = { link, parent, child, src, tgt: tgtInfo.pt, color: linkColor(parent, child) };
    });
    dgAssignLanes(allSegs);

    const vLayer = svgEl('g', { class: 'dg-links-v' });
    allSegs.filter(s => s.kind === 'V').forEach(s => vLayer.appendChild(segLine(s, linkMeta[s.linkId], false, interactive)));
    content.appendChild(vLayer);

    const hLayer = svgEl('g', { class: 'dg-links-h' });
    allSegs.filter(s => s.kind === 'H').forEach(s => hLayer.appendChild(segLine(s, linkMeta[s.linkId], true, false)));
    allSegs.filter(s => s.kind === 'H').forEach(s => hLayer.appendChild(segLine(s, linkMeta[s.linkId], false, interactive)));
    content.appendChild(hLayer);

    const symLayer = svgEl('g', { class: 'dg-symbols' });
    nodes.forEach(n => symLayer.appendChild(buildSymbol(n, interactive)));
    content.appendChild(symLayer);

    const dotLayer = svgEl('g', { class: 'dg-dots', 'pointer-events': 'none' });
    Object.keys(linkMeta).forEach(id => {
      const m = linkMeta[id];
      dotLayer.appendChild(svgEl('circle', { cx: m.src.x, cy: m.src.y, r: 3, fill: m.color }));
      dotLayer.appendChild(svgEl('circle', { cx: m.tgt.x, cy: m.tgt.y, r: 3, fill: m.color }));
      const lbl = dgLinkEndLabel(m.child, m.link.role);
      if (lbl) {
        const t = dgInTerminal(m.child, m.link.role);
        const dx = (t && t.labelDx != null) ? t.labelDx : 7;
        const dy = (t && t.labelDy != null) ? t.labelDy : -6;
        dotLayer.appendChild(svgEl('text', { x: m.tgt.x + dx, y: m.tgt.y + dy, 'font-size': 9, 'font-weight': 800, fill: m.color }, [lbl]));
      }
    });
    // transformer HV/LV labels (always shown, offset to the side)
    nodes.filter(n => n.type === 'transformer').forEach(n => {
      dgTerminals('transformer').forEach(t => {
        dotLayer.appendChild(svgEl('circle', { cx: n.x + t.x, cy: n.y + t.y, r: 3, fill: n.systemId != null ? systemColorOf(n.systemId) : '#5b6675' }));
        dotLayer.appendChild(svgEl('text', { x: n.x + t.x + t.labelDx, y: n.y + t.y + t.labelDy, 'font-size': 9, 'font-weight': 800, fill: '#182230' }, [t.label]));
      });
    });
    content.appendChild(dotLayer);

    const labelLayer = svgEl('g', { class: 'dg-labels' });
    nodes.forEach(n => labelLayer.appendChild(buildAnnotation(n, interactive)));
    content.appendChild(labelLayer);

    return { content, linkMeta };
  }

  function segLine(s, meta, halo, interactive) {
    const color = meta ? meta.color : '#5b6675';
    const dashed = meta && meta.link.role === 'redundant';
    const selected = meta && selectedLink && selectedLink.childId === meta.link.childId && selectedLink.role === meta.link.role;
    const line = svgEl('line', {
      x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
      stroke: halo ? '#ffffff' : (selected ? '#c2185b' : color),
      'stroke-width': halo ? (DG_STROKE_LINK + 5) : (selected ? DG_STROKE_LINK + 1.5 : DG_STROKE_LINK),
      'stroke-linecap': 'round',
    });
    if (!halo && dashed) line.setAttribute('stroke-dasharray', '7 4');
    if (interactive && meta && !halo) {
      line.style.cursor = 'pointer';
      line.style.pointerEvents = 'stroke';
      line.addEventListener('pointerdown', (e) => { e.stopPropagation(); selection.clear(); selectedLink = { parentId: meta.link.parentId, childId: meta.link.childId, role: meta.link.role }; render(); });
    } else if (halo) {
      line.style.pointerEvents = 'none';
    }
    return line;
  }

  /* =================================================================
     GRID
     ================================================================= */
  function buildGrid(bounds) {
    const g = svgEl('g', { class: 'dg-grid', 'pointer-events': 'none' });
    const step = 32;
    const b = bounds || { x1: -400, y1: -200, x2: 2000, y2: 1400 };
    for (let x = Math.floor(b.x1 / step) * step; x <= b.x2; x += step) {
      for (let y = Math.floor(b.y1 / step) * step; y <= b.y2; y += step) {
        g.appendChild(svgEl('circle', { cx: x, cy: y, r: 1, fill: '#c2cad4' }));
      }
    }
    return g;
  }

  /* =================================================================
     MAIN RENDER (screen)
     ================================================================= */
  function contentBBox() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    state.nodes.forEach(n => {
      const b = dgBounds(n);
      minX = Math.min(minX, n.x - b.hw - 90);
      maxX = Math.max(maxX, n.x + b.hw + 90);
      minY = Math.min(minY, n.y - b.ht - 24);
      maxY = Math.max(maxY, n.y + b.ht + 70);
    });
    if (!isFinite(minX)) return { x: -200, y: -200, w: 800, h: 600 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  function render() {
    if (!svg) return;
    dgLayout(state.nodes, state.systems, false);
    if (emptyEl) emptyEl.style.display = state.nodes.length ? 'none' : 'block';
    svg.innerHTML = '';
    world = svgEl('g', { id: 'dgWorld' });
    svg.appendChild(world);
    applyTransform();
    if (!state.nodes.length) { renderPanel(); return; }

    const bbox = contentBBox();
    const { content } = buildDiagramContent(state.nodes, {
      interactive: true,
      grid: state.diagram.showGrid,
      gridBounds: { x1: bbox.x, y1: bbox.y, x2: bbox.x + bbox.w, y2: bbox.y + bbox.h },
    });
    world.appendChild(content);

    // selection halos
    const selLayer = svgEl('g', { class: 'dg-selection', 'pointer-events': 'none' });
    selection.forEach(id => {
      const n = findNode(id); if (!n) return;
      const b = dgBounds(n);
      selLayer.appendChild(svgEl('rect', {
        x: n.x - b.hw - 6, y: n.y - b.ht - 6, width: (b.hw + 6) * 2, height: (b.ht + 6) * 2,
        fill: 'none', stroke: '#0f5fc9', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', rx: 4,
      }));
    });
    world.appendChild(selLayer);

    // generic link handles (top = "needs supply", bottom = "supplies others") — UI only, not exported
    const handleLayer = svgEl('g', { class: 'dg-handles' });
    state.nodes.forEach(n => {
      const b = dgBounds(n);
      if (!dgIsSource(n.type)) {
        const hp = { x: n.x, y: n.y - b.ht - 10 };
        handleLayer.appendChild(handleCircle(hp, n, 'consume'));
      }
      if (n.type !== 'load') {
        const hp = { x: n.x, y: n.y + b.ht + 10 };
        handleLayer.appendChild(handleCircle(hp, n, 'supply'));
      }
    });
    world.appendChild(handleLayer);

    // busbar resize handles when exactly one board is selected
    if (selection.size === 1) {
      const n = findNode(Array.from(selection)[0]);
      if (n && dgIsBoard(n.type)) world.appendChild(buildBusHandles(n));
    }

    // alignment guides
    if (activeGuides.length) {
      const gl = svgEl('g', { class: 'dg-guides', 'pointer-events': 'none' });
      activeGuides.forEach(gd => {
        if (gd.vertical) gl.appendChild(svgEl('line', { x1: gd.x, y1: bbox.y - 40, x2: gd.x, y2: bbox.y + bbox.h + 40, stroke: '#c2185b', 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
        if (gd.horizontal) gl.appendChild(svgEl('line', { x1: bbox.x - 40, y1: gd.y, x2: bbox.x + bbox.w + 40, y2: gd.y, stroke: '#c2185b', 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
      });
      world.appendChild(gl);
    }

    // link-draw rubber line
    if (linkDraw) {
      world.appendChild(svgEl('line', {
        x1: linkDraw.x, y1: linkDraw.y, x2: linkDraw.curX, y2: linkDraw.curY,
        stroke: '#0f5fc9', 'stroke-width': 2, 'stroke-dasharray': '5 4',
      }));
    }

    // rubber-band selection box
    if (dragState && dragState.kind === 'rubber') {
      const x = Math.min(dragState.x0, dragState.x1), y = Math.min(dragState.y0, dragState.y1);
      const w = Math.abs(dragState.x1 - dragState.x0), h = Math.abs(dragState.y1 - dragState.y0);
      world.appendChild(svgEl('rect', { x, y, width: w, height: h, fill: 'rgba(15,95,201,.08)', stroke: '#0f5fc9', 'stroke-width': 1 }));
    }

    updateZoomLabel();
    renderPanel();
  }

  function handleCircle(pt, node, mode) {
    const c = svgEl('circle', { class: 'dg-handle', cx: pt.x, cy: pt.y, r: 4, fill: '#ffffff', stroke: '#8b95a3', 'stroke-width': 1.5 });
    c.dataset.id = String(node.id);
    c.dataset.mode = mode;
    c.style.cursor = 'crosshair';
    c.addEventListener('pointerdown', (e) => onHandlePointerDown(e, node, mode, pt));
    return c;
  }

  function buildBusHandles(node) {
    const g = svgEl('g', { class: 'dg-bus-handles' });
    const bl = boardLayouts.get(node.id);
    const hl = bl ? bl.halfLen : DG_MIN_BUS / 2;
    [-1, 1].forEach(side => {
      const hx = node.x + side * hl;
      const h = svgEl('rect', { x: hx - 5, y: node.y - 5, width: 10, height: 10, fill: '#ffffff', stroke: '#0f5fc9', 'stroke-width': 1.5 });
      h.style.cursor = 'ew-resize';
      h.addEventListener('pointerdown', (e) => onBusHandlePointerDown(e, node, side));
      g.appendChild(h);
    });
    return g;
  }

  /* =================================================================
     PAN / ZOOM
     ================================================================= */
  function applyTransform() {
    if (world) world.setAttribute('transform', 'translate(' + panX + ',' + panY + ') scale(' + zoom + ')');
  }
  function updateZoomLabel() {
    const l = document.getElementById('dgZoomLabel');
    if (l) l.textContent = Math.round(zoom * 100) + '%';
  }
  function zoomBy(factor, cx, cy) {
    const rect = svg.getBoundingClientRect();
    const px = cx != null ? cx - rect.left : rect.width / 2;
    const py = cy != null ? cy - rect.top : rect.height / 2;
    const wx = (px - panX) / zoom, wy = (py - panY) / zoom;
    zoom = Math.max(0.2, Math.min(4, zoom * factor));
    panX = px - wx * zoom;
    panY = py - wy * zoom;
    applyTransform();
    updateZoomLabel();
  }
  function fitToContent() {
    if (!svg || !state.nodes.length) { zoom = 1; panX = 0; panY = 0; applyTransform(); updateZoomLabel(); return; }
    const rect = svg.getBoundingClientRect();
    const bbox = contentBBox();
    const z = Math.max(0.2, Math.min(2, Math.min(rect.width / bbox.w, rect.height / bbox.h)));
    zoom = z;
    panX = rect.width / 2 - (bbox.x + bbox.w / 2) * z;
    panY = rect.height / 2 - (bbox.y + bbox.h / 2) * z;
    applyTransform();
    updateZoomLabel();
  }
  function onWheel(e) {
    e.preventDefault();
    if (e.shiftKey) { panX -= e.deltaY; applyTransform(); return; }
    const factor = Math.pow(1.0015, -e.deltaY);
    zoomBy(factor, e.clientX, e.clientY);
  }

  function screenToWorld(clientX, clientY) {
    const rect = svg.getBoundingClientRect();
    return { x: (clientX - rect.left - panX) / zoom, y: (clientY - rect.top - panY) / zoom };
  }

  /* =================================================================
     SELECTION / DRAG
     ================================================================= */
  function onCanvasPointerDown(e) {
    if (e.target !== svg) return; // symbols/labels/links/handles stop propagation themselves
    if (e.button === 1 || e.button === 2 || e.spaceKeyDown) { beginPan(e); return; }
    selection.clear(); selectedLink = null;
    beginRubberBand(e);
  }
  function onCanvasDblClick(e) {
    const labelGroup = e.target.closest ? e.target.closest('.dg-label') : null;
    if (labelGroup) {
      const id = parseInt(labelGroup.dataset.id, 10);
      const n = findNode(id);
      if (n) { n.labelDx = null; n.labelDy = null; History.commit(); render(); }
    }
  }

  function beginPan(e) {
    const startX = e.clientX, startY = e.clientY, startPanX = panX, startPanY = panY;
    function move(ev) { panX = startPanX + (ev.clientX - startX); panY = startPanY + (ev.clientY - startY); applyTransform(); }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function beginRubberBand(e) {
    const start = screenToWorld(e.clientX, e.clientY);
    dragState = { kind: 'rubber', x0: start.x, y0: start.y, x1: start.x, y1: start.y };
    function move(ev) {
      const p = screenToWorld(ev.clientX, ev.clientY);
      dragState.x1 = p.x; dragState.y1 = p.y;
      render();
    }
    function up() {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (dragState) {
        const x0 = Math.min(dragState.x0, dragState.x1), x1 = Math.max(dragState.x0, dragState.x1);
        const y0 = Math.min(dragState.y0, dragState.y1), y1 = Math.max(dragState.y0, dragState.y1);
        state.nodes.forEach(n => { if (n.x >= x0 && n.x <= x1 && n.y >= y0 && n.y <= y1) selection.add(n.id); });
      }
      dragState = null;
      render();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onSymbolPointerDown(e, node) {
    e.stopPropagation();
    if (e.button === 2) return;
    selectedLink = null;
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (!selection.has(node.id)) {
      if (!additive) selection.clear();
      selection.add(node.id);
    } else if (additive) {
      selection.delete(node.id);
      render();
      return;
    }
    render();
    beginNodeDrag(e);
  }

  function beginNodeDrag(e) {
    History.commit();
    const startX = e.clientX, startY = e.clientY;
    const startPositions = {};
    selection.forEach(id => { const n = findNode(id); if (n) startPositions[id] = { x: n.x, y: n.y }; });
    const primaryId = Array.from(selection)[0];
    dragState = { kind: 'nodes', startX, startY, startPositions, primaryId, moved: false };
    window.addEventListener('pointermove', onNodeDragMove);
    window.addEventListener('pointerup', onNodeDragEnd);
  }
  function onNodeDragMove(e) {
    if (!dragState || dragState.kind !== 'nodes') return;
    dragState.moved = true;
    let dx = (e.clientX - dragState.startX) / zoom;
    let dy = (e.clientY - dragState.startY) / zoom;
    activeGuides = [];
    if (state.diagram.snapGuides && !e.altKey) {
      const snap = computeSnap(dragState, dx, dy);
      dx = snap.dx; dy = snap.dy; activeGuides = snap.lines;
    }
    Object.keys(dragState.startPositions).forEach(idStr => {
      const id = parseInt(idStr, 10), n = findNode(id), sp = dragState.startPositions[id];
      if (n) { n.x = Math.round(sp.x + dx); n.y = Math.round(sp.y + dy); }
    });
    render();
  }
  function onNodeDragEnd() {
    window.removeEventListener('pointermove', onNodeDragMove);
    window.removeEventListener('pointerup', onNodeDragEnd);
    const moved = dragState && dragState.moved;
    dragState = null; activeGuides = [];
    render();
    if (moved) { History.commit(); renderNetworkIfActive(); }
  }
  function renderNetworkIfActive() { /* positions don't affect the tables; nothing to do */ }

  function computeSnap(dragState, dx, dy) {
    const primary = findNode(dragState.primaryId);
    const sp = dragState.startPositions[dragState.primaryId];
    if (!primary || !sp) return { dx, dy, lines: [] };
    let nx = sp.x + dx, ny = sp.y + dy;
    const THRESH = 5 / zoom;
    const lines = [];
    let snappedX = false, snappedY = false;
    state.nodes.forEach(o => {
      if (dragState.startPositions[o.id]) return;
      if (!snappedX && Math.abs(o.x - nx) < THRESH) { dx += (o.x - nx); nx = o.x; snappedX = true; lines.push({ x: o.x, vertical: true }); }
      if (!snappedY && Math.abs(o.y - ny) < THRESH) { dy += (o.y - ny); ny = o.y; snappedY = true; lines.push({ y: o.y, horizontal: true }); }
    });
    return { dx, dy, lines };
  }

  function onLabelPointerDown(e, node) {
    e.stopPropagation();
    History.commit();
    const def = defaultLabelOffset(node);
    const baseDx = node.labelDx != null ? node.labelDx : def.dx;
    const baseDy = node.labelDy != null ? node.labelDy : def.dy;
    const startX = e.clientX, startY = e.clientY;
    function move(ev) {
      const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      node.labelDx = Math.round(baseDx + dx); node.labelDy = Math.round(baseDy + dy);
      render();
    }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); History.commit(); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function onBusHandlePointerDown(e, node, side) {
    e.stopPropagation();
    History.commit();
    const bl = boardLayouts.get(node.id);
    const startLen = (bl ? bl.halfLen : DG_MIN_BUS / 2) * 2;
    const startX = e.clientX;
    function move(ev) {
      const dx = (ev.clientX - startX) / zoom;
      const len = Math.max(DG_MIN_BUS, startLen + Math.abs(dx) * 2 * (dx * side > 0 ? 1 : -1));
      node.busLen = Math.round(len);
      render();
    }
    function up() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); History.commit(); }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  /* =================================================================
     LINK CREATION (drag from a handle onto another symbol)
     ================================================================= */
  function onHandlePointerDown(e, node, mode, pt) {
    e.stopPropagation();
    linkDraw = { mode, node, x: pt.x, y: pt.y, curX: pt.x, curY: pt.y };
    render();
    function move(ev) {
      const p = screenToWorld(ev.clientX, ev.clientY);
      linkDraw.curX = p.x; linkDraw.curY = p.y;
      render();
    }
    function up(ev) {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      const symGroup = target && target.closest ? target.closest('.dg-symbol') : null;
      if (symGroup) {
        const targetId = parseInt(symGroup.dataset.id, 10);
        const targetNode = findNode(targetId);
        if (targetNode && targetNode.id !== node.id) {
          if (mode === 'supply') tryCreateLink(node, targetNode);
          else tryCreateLink(targetNode, node);
        }
      }
      linkDraw = null;
      render();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function tryCreateLink(source, consumer) {
    if (!source || !consumer || source.id === consumer.id) { render(); return; }
    if (dgIsSource(consumer.type)) { showToast(TYPE_META[consumer.type].label + ' is a power source and cannot receive a supply.', 'error'); return; }
    const allowed = ALLOWED_SOURCES[consumer.type] || [];
    if (allowed.indexOf(source.type) === -1) {
      showToast('A ' + TYPE_META[consumer.type].label + ' cannot be fed from a ' + TYPE_META[source.type].label + '.', 'error');
      return;
    }
    if (wouldCreateCycle(state.nodes, consumer.id, source.id)) { showToast('That connection would create a cycle.', 'error'); return; }
    let role;
    if (consumer.parentId == null) role = 'parentId';
    else if (consumer.redundantParentId == null) role = 'redundantParentId';
    else { showToast('Both feeds are already assigned on ' + label(consumer) + ' — remove one first.', 'error'); return; }
    if (role === 'redundantParentId' && source.id === consumer.parentId) { showToast('The redundant supply must differ from the primary supply.', 'error'); return; }
    if (role === 'parentId' && source.id === consumer.redundantParentId) { showToast('The primary supply must differ from the redundant supply.', 'error'); return; }
    consumer[role] = source.id;
    if (role === 'parentId' && (TYPE_FIELDS[consumer.type] || []).some(f => f.key === 'voltageV')) {
      const v = childVoltage(source.type, source);
      if (v != null && v !== '' && (consumer.voltageV === '' || consumer.voltageV == null)) consumer.voltageV = v;
    }
    History.commit();
    renderActive();
    showToast('Connected ' + label(consumer) + ' to ' + label(source) + ' (' + (role === 'parentId' ? 'primary' : 'redundant') + ').', 'success');
  }

  /* =================================================================
     DELETE SELECTION
     ================================================================= */
  function deleteSelection() {
    if (selectedLink) {
      const child = findNode(selectedLink.childId);
      if (child) {
        if (selectedLink.role === 'primary') child.parentId = null; else child.redundantParentId = null;
        History.commit();
      }
      selectedLink = null;
      renderActive();
      return;
    }
    if (selection.size) {
      const ids = new Set(selection);
      deleteSelectedNodes(ids, () => true);
    }
  }

  /* =================================================================
     SIDE PANEL
     ================================================================= */
  function sectionTitleEl(t) { return el('div', { class: 'section-title' }, [t]); }

  function dgActiveField(node) {
    const wrap2 = el('div', { class: 'field' });
    wrap2.appendChild(el('label', {}, ['Active']));
    const row = el('label', { class: 'switch-row' });
    const inp = el('input', { type: 'checkbox' });
    inp.checked = node.active !== false;
    inp.addEventListener('change', () => { node.active = inp.checked; History.commit(); render(); });
    row.appendChild(inp); row.appendChild(el('span', { class: 'switch' }));
    row.appendChild(el('span', { style: 'font-size:12.5px;' }, [node.active !== false ? 'Active' : 'Inactive']));
    wrap2.appendChild(row);
    return wrap2;
  }

  function dgSystemSelect(node) {
    const wrap2 = el('div', { class: 'field' });
    wrap2.appendChild(el('label', {}, ['System']));
    const sel = el('select', {});
    const optNone = el('option', { value: '' }, ['None']);
    if (node.systemId == null) optNone.selected = true;
    sel.appendChild(optNone);
    state.systems.forEach(s => {
      const o = el('option', { value: String(s.id) }, [s.name]);
      if (String(s.id) === String(node.systemId)) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => { node.systemId = sel.value === '' ? null : parseInt(sel.value, 10); History.commit(); render(); });
    wrap2.appendChild(sel);
    return wrap2;
  }

  function dgSupplySelect(labelText, node, key, allowNone) {
    const wrap2 = el('div', { class: 'field' });
    wrap2.appendChild(el('label', {}, [labelText]));
    const sel = el('select', {});
    if (allowNone) sel.appendChild(el('option', { value: '' }, ['None']));
    const allowedTypes = ALLOWED_SOURCES[node.type] || [];
    const banned = new Set([node.id]);
    if (typeof descendantsOf === 'function') descendantsOf(state.nodes, node.id).forEach(d => banned.add(d));
    const otherId = key === 'parentId' ? node.redundantParentId : node.parentId;
    state.nodes.filter(n => allowedTypes.indexOf(n.type) !== -1 && !banned.has(n.id) && n.id !== otherId).forEach(n => {
      const o = el('option', { value: String(n.id) }, [parentOptionLabel(n)]);
      if (String(node[key]) === String(n.id)) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      const raw = sel.value;
      const pid = raw === '' ? null : parseInt(raw, 10);
      if (wouldCreateCycle(state.nodes, node.id, pid)) { showToast('That assignment would create a cycle.', 'error'); render(); return; }
      node[key] = pid;
      if (key === 'redundantParentId' && pid === null) node.activeFeed = 'primary';
      History.commit(); render();
    });
    wrap2.appendChild(sel);
    return wrap2;
  }

  function dgDisplayCheckboxes(node) {
    const wrap2 = el('div', { class: 'dg-display-fields' });
    const opts = diagramFieldOptions(node.type);
    const current = node.showFields || DIAGRAM_DEFAULTS[node.type] || [];
    opts.forEach(o => {
      const row = el('label', { class: 'dg-check' });
      const cb = el('input', { type: 'checkbox' });
      cb.checked = current.indexOf(o.key) !== -1;
      cb.addEventListener('change', () => {
        const base = (node.showFields || DIAGRAM_DEFAULTS[node.type] || []).slice();
        const set = new Set(base);
        if (cb.checked) set.add(o.key); else set.delete(o.key);
        node.showFields = opts.map(x => x.key).filter(k => set.has(k));
        History.commit(); render();
      });
      row.appendChild(cb);
      row.appendChild(document.createTextNode(' ' + o.label));
      wrap2.appendChild(row);
    });
    return wrap2;
  }

  function renderNodePanel(node) {
    panel.appendChild(el('div', { class: 'dg-panel-title' }, [TYPE_META[node.type].label + ': ' + (node.name || '\u2014')]));
    const closeBtn = el('button', { class: 'iconbtn dg-panel-close', title: 'Close' }, ['\u2715']);
    closeBtn.addEventListener('click', () => { selection.clear(); render(); });
    panel.appendChild(closeBtn);

    panel.appendChild(sectionTitleEl('Identity'));
    let g = el('div', { class: 'grid cols-1' });
    g.appendChild(inputField('Name', node.name, v => { node.name = v; History.mark(); render(); }, { field: 'dg.name' }));
    if (node.type !== 'load') g.appendChild(inputField('Tag', node.tag, v => { node.tag = v; History.mark(); render(); }, { field: 'dg.tag' }));
    g.appendChild(dgActiveField(node));
    panel.appendChild(g);
    panel.appendChild(dgSystemSelect(node));

    panel.appendChild(sectionTitleEl(TYPE_META[node.type].label + ' Parameters'));
    g = el('div', { class: 'grid cols-1' });
    (TYPE_FIELDS[node.type] || []).forEach(def => {
      const unit = def.unit ? ' ' + def.unit : '';
      if (def.type === 'select') {
        g.appendChild(selectField(def.label + unit, node[def.key], def.options, v => {
          node[def.key] = (typeof def.options[0] === 'number') ? parseFloat(v) : v; History.commit(); render();
        }, { field: 'dg.' + def.key }));
      } else {
        g.appendChild(inputField(def.label + unit, node[def.key], v => { node[def.key] = v; History.mark(); render(); },
          { type: 'number', step: def.step || 'any', field: 'dg.' + def.key, hint: def.hint }));
      }
    });
    panel.appendChild(g);

    if (!dgIsSource(node.type)) {
      panel.appendChild(sectionTitleEl('Supply'));
      panel.appendChild(dgSupplySelect('Primary supply', node, 'parentId', false));
      if (node.type !== 'transformer') panel.appendChild(dgSupplySelect('Redundant supply', node, 'redundantParentId', true));
    }

    if (dgIsBoard(node.type)) {
      panel.appendChild(sectionTitleEl('Busbar length'));
      const row = el('div', { class: 'dg-buslen-row' });
      row.appendChild(el('span', {}, [node.busLen != null ? ('Manual: ' + node.busLen + ' units') : 'Auto (fits connections)']));
      if (node.busLen != null) {
        const resetBtn = el('button', { class: 'tbtn', style: 'padding:3px 10px;' }, ['Reset to auto']);
        resetBtn.addEventListener('click', () => { node.busLen = null; History.commit(); render(); });
        row.appendChild(resetBtn);
      }
      panel.appendChild(row);
      panel.appendChild(el('div', { class: 'hint' }, ['Drag the small square handles at the ends of a selected busbar to set a manual length.']));
    }

    panel.appendChild(sectionTitleEl('Displayed fields'));
    panel.appendChild(dgDisplayCheckboxes(node));
    const resetLabelBtn = el('button', { class: 'tbtn', style: 'margin-top:8px;' }, ['Reset label position']);
    resetLabelBtn.addEventListener('click', () => { node.labelDx = null; node.labelDy = null; History.commit(); render(); });
    panel.appendChild(resetLabelBtn);

    panel.appendChild(sectionTitleEl('Actions'));
    const actRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;' });
    const dupBtn = el('button', { class: 'tbtn' }, ['Duplicate']);
    dupBtn.addEventListener('click', () => { duplicateNodeSubtree(node.id); History.commit(); renderActive(); });
    const delBtn = el('button', { class: 'tbtn', style: 'background:var(--fail-bg);color:var(--fail-ink);border-color:var(--fail-border);' }, ['Delete']);
    delBtn.addEventListener('click', () => deleteNode(node.id));
    actRow.appendChild(dupBtn); actRow.appendChild(delBtn);
    panel.appendChild(actRow);
  }

  function renderMultiPanel() {
    panel.appendChild(el('div', { class: 'dg-panel-title' }, [selection.size + ' components selected']));
    const closeBtn = el('button', { class: 'iconbtn dg-panel-close', title: 'Close' }, ['\u2715']);
    closeBtn.addEventListener('click', () => { selection.clear(); render(); });
    panel.appendChild(closeBtn);
    panel.appendChild(sectionTitleEl('System'));
    const sel = el('select', {});
    sel.appendChild(el('option', { value: '' }, ['(mixed / none)']));
    state.systems.forEach(s => sel.appendChild(el('option', { value: String(s.id) }, [s.name])));
    sel.addEventListener('change', () => {
      const v = sel.value === '' ? null : parseInt(sel.value, 10);
      selection.forEach(id => { const n = findNode(id); if (n) n.systemId = v; });
      History.commit(); renderActive();
    });
    panel.appendChild(sel);
    panel.appendChild(sectionTitleEl('Actions'));
    const delBtn = el('button', { class: 'tbtn', style: 'background:var(--fail-bg);color:var(--fail-ink);border-color:var(--fail-border);' }, ['Delete selected']);
    delBtn.addEventListener('click', () => deleteSelection());
    panel.appendChild(delBtn);
  }

  function renderLinkPanel() {
    const child = findNode(selectedLink.childId);
    const parent = findNode(selectedLink.parentId);
    panel.appendChild(el('div', { class: 'dg-panel-title' }, [(selectedLink.role === 'primary' ? 'Primary' : 'Redundant') + ' connection']));
    const closeBtn = el('button', { class: 'iconbtn dg-panel-close', title: 'Close' }, ['\u2715']);
    closeBtn.addEventListener('click', () => { selectedLink = null; render(); });
    panel.appendChild(closeBtn);
    panel.appendChild(el('div', { class: 'hint', style: 'margin:8px 0;' }, [
      (parent ? label(parent) : '\u2014') + '  \u2192  ' + (child ? label(child) : '\u2014'),
    ]));
    const delBtn = el('button', { class: 'tbtn', style: 'background:var(--fail-bg);color:var(--fail-ink);border-color:var(--fail-border);' }, ['Remove connection']);
    delBtn.addEventListener('click', () => deleteSelection());
    panel.appendChild(delBtn);
  }

  function renderPanel() {
    if (!panel) return;
    panel.innerHTML = '';
    if (selectedLink) { panel.style.display = ''; renderLinkPanel(); return; }
    if (!selection.size) { panel.style.display = 'none'; return; }
    panel.style.display = '';
    if (selection.size > 1) { renderMultiPanel(); return; }
    const node = findNode(Array.from(selection)[0]);
    if (!node) { panel.style.display = 'none'; return; }
    renderNodePanel(node);
  }

  /* =================================================================
     EXPORT: SVG / PNG / print sheet
     ================================================================= */
  function mmToPx(mm) { return Math.round(mm * 3.7795); }

  function buildTitleBlock(rightX, bottomY, height, sheetLabel) {
    const g = svgEl('g', { class: 'dg-titleblock' });
    const width = 280;
    const x0 = rightX - width, y0 = bottomY - height;
    g.appendChild(svgEl('rect', { x: x0, y: y0, width, height, fill: '#ffffff', stroke: '#182230', 'stroke-width': 1.5 }));
    const p = state.project;
    const rows = [
      ['Project', p.projectName || '\u2014'],
      ['Client', p.client || '\u2014'],
      ['Title', p.title || 'Network Diagram'],
      ['Project No.', p.projectNo || '\u2014'],
      ['Rev.', p.revision || '\u2014'],
      ['Date', p.date || '\u2014'],
      ['Sheet', sheetLabel],
    ];
    let ty = y0 + 14;
    rows.forEach(r => {
      g.appendChild(svgEl('text', { x: x0 + 8, y: ty, 'font-size': 9, 'font-weight': 700, fill: '#5b6675' }, [r[0] + ':']));
      g.appendChild(svgEl('text', { x: x0 + 90, y: ty, 'font-size': 9, fill: '#182230' }, [String(r[1])]));
      ty += Math.floor((height - 16) / rows.length);
    });
    return g;
  }

  function buildExportSVG() {
    dgLayout(state.nodes, state.systems, false);
    const sheetKey = state.diagram.sheet || 'A3-landscape';
    const sheet = SHEETS[sheetKey] || SHEETS['A3-landscape'];
    const pageW = mmToPx(sheet.w), pageH = mmToPx(sheet.h);
    const margin = 24;
    const titleH = state.diagram.titleBlock ? 96 : 0;
    const availW = pageW - margin * 2, availH = pageH - margin * 2 - titleH;
    const bbox = contentBBox();
    const scale = Math.max(0.05, Math.min(availW / bbox.w, availH / bbox.h, 6));
    const svgRoot = svgEl('svg', { xmlns: SVG_NS, width: pageW, height: pageH, viewBox: '0 0 ' + pageW + ' ' + pageH });
    svgRoot.appendChild(svgEl('rect', { x: 0, y: 0, width: pageW, height: pageH, fill: '#ffffff' }));
    const { content } = buildDiagramContent(state.nodes, { interactive: false, grid: false });
    const offX = margin - bbox.x * scale + Math.max(0, (availW - bbox.w * scale) / 2);
    const offY = margin - bbox.y * scale + Math.max(0, (availH - bbox.h * scale) / 2);
    const g = svgEl('g', { transform: 'translate(' + offX + ',' + offY + ') scale(' + scale + ')' });
    g.appendChild(content);
    svgRoot.appendChild(g);
    svgRoot.appendChild(svgEl('rect', { x: margin, y: margin, width: availW, height: availH + titleH, fill: 'none', stroke: '#182230', 'stroke-width': 1.5 }));
    if (state.diagram.titleBlock) svgRoot.appendChild(buildTitleBlock(pageW - margin, pageH - margin, titleH, sheet.w + '\u00d7' + sheet.h + ' mm'));
    return { svgRoot, pageW, pageH };
  }

  function serializeExportSVG() {
    const { svgRoot } = buildExportSVG();
    return new XMLSerializer().serializeToString(svgRoot);
  }

  function exportSVGFile() {
    try {
      const str = serializeExportSVG();
      const blob = new Blob([str], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (state.project.projectNo || state.project.projectName || 'network-diagram') + '.svg';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast('Diagram exported as SVG.', 'success');
    } catch (err) {
      console.error(err); showToast('SVG export failed: ' + err.message, 'error', 6000);
    }
  }

  function exportPNGFile() {
    try {
      const { svgRoot, pageW, pageH } = buildExportSVG();
      const str = new XMLSerializer().serializeToString(svgRoot);
      const blob = new Blob([str], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = pageW * scale; canvas.height = pageH * scale;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(blob2 => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob2);
          a.download = (state.project.projectNo || state.project.projectName || 'network-diagram') + '.png';
          document.body.appendChild(a); a.click(); a.remove();
          URL.revokeObjectURL(url);
        });
        showToast('Diagram exported as PNG.', 'success');
      };
      img.onerror = () => { showToast('PNG export failed to render.', 'error'); URL.revokeObjectURL(url); };
      img.src = url;
    } catch (err) {
      console.error(err); showToast('PNG export failed: ' + err.message, 'error', 6000);
    }
  }

  function sheetSectionHTML() {
    let dataUri = '';
    try {
      const str = serializeExportSVG();
      dataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(str)));
    } catch (err) {
      return '<section class="print-page"><div>Diagram export failed: ' + escapeHtml(err.message) + '</div></section>';
    }
    return '<section class="print-page dg-print-page">' +
      '<img src="' + dataUri + '" style="width:100%;height:auto;display:block;">' +
      '</section>';
  }

  return {
    init, render, relayoutAll, invalidateLayout, onNodesRemoved,
    sheetSectionHTML,
  };
})();

if (typeof module !== 'undefined') { module.exports = Diagram; }
