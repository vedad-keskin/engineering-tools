/* ===================================================================
   BLOCK DIAGRAM BUILDER - application logic
   Ported from Capacity Planner (network tab + modal editor), scoped
   to Network + Block Diagram tabs with localStorage autosave.
   =================================================================== */
let state = defaultState();
let editingId = null;
let modalTab = 'details';
let activeView = 'network';
let networkSelectedIds = new Set();
let collapsedGroups = new Set();
let networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
let netFilterOpen = false;
let netSort = null;

const FEEDS = ['primary', 'redundant', '50-50'];
const LS_KEY = 'block-diagram:state';
let _lsTimer = null;

const NETWORK_COLUMNS = [
  { key: 'type', label: 'Type' }, { key: 'tag', label: 'Tag' }, { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' }, { key: 'rating', label: 'Rating' }, { key: 'voltage', label: 'Voltage' },
  { key: 'primary', label: 'Primary supply' }, { key: 'redundant', label: 'Redundant supply' },
  { key: 'feed', label: 'Active Feed' }, { key: 'connloads', label: 'Connected Loads' }, { key: 'connkw', label: 'Connected kW' },
  { key: 'demandkva', label: 'Demand kVA' }, { key: 'pf', label: 'P.F.' }, { key: 'util', label: 'Utilisation' },
];

function colVisible(table, key) { const p = state.columnPrefs[table]; return !p || p[key] !== false; }
function applyColumnVisibility(tableKey, tableEl) {
  if (!tableEl) return;
  $all('[class*="col-"]', tableEl).forEach(cell => {
    const m = cell.className.match(/\bcol-([a-z]+)\b/);
    if (m) cell.style.display = colVisible(tableKey, m[1]) ? '' : 'none';
  });
}
function closeColMenu() { const m = $('#colVisMenu'); if (m) m.remove(); }
function showColumnMenu(evt, tableKey, columns) {
  closeAddMenu(); closeColMenu();
  const menu = el('div', { id: 'colVisMenu' });
  columns.forEach(c => {
    const lab = el('label', {});
    const cb = el('input', { type: 'checkbox' }); cb.checked = colVisible(tableKey, c.key);
    cb.addEventListener('change', () => {
      if (!state.columnPrefs[tableKey]) state.columnPrefs[tableKey] = {};
      state.columnPrefs[tableKey][c.key] = cb.checked ? true : false;
      renderActive(); markAutosave();
    });
    lab.appendChild(cb); lab.appendChild(document.createTextNode(c.label));
    menu.appendChild(lab);
  });
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  let x = evt.clientX, y = evt.clientY;
  if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 8;
  if (y + r.height > window.innerHeight) y = evt.clientY - r.height - 8;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  setTimeout(() => { document.addEventListener('click', function h(ev) { if (!menu.contains(ev.target)) { closeColMenu(); document.removeEventListener('click', h); } }); }, 0);
}

function currentScenario() { return null; }
function scenarioName() { return 'Normal'; }

function findNode(id) { return state.nodes.find(n => n.id === id); }
function label(node) {
  if (!node) return '\u2014';
  return (node.tag ? node.tag + ' \u2014 ' : '') + node.name;
}
function parentOptionLabel(node) {
  return label(node) + ' [' + TYPE_META[node.type].label + ']';
}
function ratingText(node) {
  switch (node.type) {
    case 'utility': return fmt(node.contractKVA, 0) + ' kVA';
    case 'mv-dist':
    case 'dist': return fmt(node.ratingA, 0) + ' A';
    case 'transformer':
    case 'generator':
    case 'ups': return fmt(node.ratingKVA, 0) + ' kVA';
    case 'load': return fmt(node.ratedKW, 1) + ' kW';
    default: return '';
  }
}

const categoryLabel = { critical: 'Critical', essential: 'Essential', 'non-essential': 'Non-essential' };

/* ===================================================================
   TAB NAVIGATION
   =================================================================== */
function renderActive() {
  document.querySelector('main').classList.toggle('wide', activeView === 'network');
  if (activeView === 'network') renderNetwork();
  if (activeView === 'diagram') renderDiagramView();
}
const setView = initTabs(v => { activeView = v; closeAddMenu(); closeDiagramMenus(); renderActive(); });

/* ===================================================================
   NETWORK VIEW
   =================================================================== */
function collectSubtree(nodes, rootId) {
  const out = new Set();
  const walk = (pid) => {
    for (const n of nodes) {
      if (n.parentId === pid || n.redundantParentId === pid) {
        if (!out.has(n.id)) { out.add(n.id); walk(n.id); }
      }
    }
  };
  walk(rootId);
  return out;
}

function networkRows() {
  const nodes = state.nodes;
  const reachable = new Set();
  const rows = [];
  const dfs = (n, depth, ancestors) => {
    if (reachable.has(n.id)) return;
    reachable.add(n.id);
    if (n.type !== 'load') rows.push({ node: n, depth, ancestors: ancestors.slice(), orphan: false });
    childrenOf(nodes, n.id).forEach(c => dfs(c, depth + 1, ancestors.concat(n.id)));
  };
  nodes.filter(n => n.parentId == null).forEach(r => dfs(r, 0, []));
  const orphans = nodes.filter(n => !reachable.has(n.id) && n.type !== 'load');
  if (orphans.length) {
    rows.push({ unassigned: true, orphan: true });
    orphans.forEach(o => rows.push({ node: o, depth: 0, ancestors: [], orphan: true }));
  }
  return rows;
}

function nodeVoltageV(node) {
  if (node.voltageV != null && node.voltageV !== '') return Number(node.voltageV);
  if (node.lvV != null && node.lvV !== '') return Number(node.lvV);
  if (node.voltageKV != null && node.voltageKV !== '') return Number(node.voltageKV) * 1000;
  return null;
}
function fmtVolts(v) { return String(v); }

function systemById(id) {
  if (id == null) return null;
  return state.systems.find(s => s.id === id);
}

function networkFilterBar() {
  fillFilterOptions('#netFilterSystem', state.systems.map(s => [String(s.id), s.name]), networkFilters.system);
}

function makeFilterSelect(colClass, value, options, onChange, field) {
  const th = el('th', { class: colClass ? 'col-' + colClass : '' });
  const sel = el('select', {});
  if (field) sel.dataset.field = field;
  sel.appendChild(el('option', { value: '' }, ['All']));
  options.forEach(([v, txt]) => {
    const o = el('option', { value: v }, [txt]);
    if (String(v) === String(value)) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => { onChange(sel.value); });
  th.appendChild(sel);
  return th;
}
function makeFilterText(colClass, value, placeholder, onChange, field) {
  const th = el('th', { class: colClass ? 'col-' + colClass : '' });
  const inp = el('input', { type: 'text', placeholder: placeholder || '' });
  inp.value = value || '';
  inp.title = 'Filter by displayed text';
  if (field) inp.dataset.field = field;
  inp.addEventListener('input', () => { onChange(inp.value); });
  th.appendChild(inp);
  return th;
}
function noResultsRow(ncols) {
  const tr = el('tr');
  tr.appendChild(el('td', { colspan: ncols, class: 'empty-cell' }, ['No matching results']));
  return tr;
}
function stickFilterRow(tableSel) {
  const t = $(tableSel); if (!t) return;
  const first = t.querySelector('thead tr:first-child');
  if (first) t.style.setProperty('--thead-h', first.getBoundingClientRect().height + 'px');
}
function fillFilterOptions(sel, pairs, current) {
  const s = $(sel);
  s.innerHTML = '';
  const all = el('option', { value: '' }, ['All']);
  all.selected = !current;
  s.appendChild(all);
  pairs.forEach(([v, txt]) => {
    const o = el('option', { value: v }, [txt]);
    if (String(v) === String(current)) o.selected = true;
    s.appendChild(o);
  });
}

function networkNodeMatches(n) {
  if (networkFilters.search) {
    const q = networkFilters.search.toLowerCase();
    const text = ((n.name || '') + ' ' + (n.tag || '')).toLowerCase();
    if (!text.includes(q)) return false;
  }
  if (networkFilters.type && n.type !== networkFilters.type) return false;
  if (networkFilters.system) {
    const sid = parseInt(networkFilters.system, 10);
    if (n.systemId !== sid) return false;
  }
  if (networkFilters.status) {
    const st = nodeEffectiveActive(n) ? 'active' : 'inactive';
    if (st !== networkFilters.status) return false;
  }
  if (networkFilters.voltage && String(nodeVoltageV(n)) !== networkFilters.voltage) return false;
  if (networkFilters.primary) {
    const prim = n.parentId != null ? findNode(n.parentId) : null;
    if (!prim || prim.tag !== networkFilters.primary) return false;
  }
  if (networkFilters.redundant) {
    const red = n.redundantParentId != null ? findNode(n.redundantParentId) : null;
    if (!red || red.tag !== networkFilters.redundant) return false;
  }
  if (networkFilters.feed) {
    const primOk2 = n.parentId != null && effActive(state.nodes, findNode(n.parentId));
    const redOk2 = n.redundantParentId != null && effActive(state.nodes, findNode(n.redundantParentId));
    const feedTxt = (n.parentId == null && n.redundantParentId == null) ? '\u2014'
      : primOk2 ? 'primary' : redOk2 ? 'redundant' : 'none';
    if (feedTxt !== networkFilters.feed) return false;
  }
  const primCount = state.nodes.filter(l => l.parentId === n.id).length;
  const redCount = state.nodes.filter(l => l.redundantParentId === n.id).length;
  const conn = connectedLoadCalc(state.nodes, n);
  const roll = nodeRollup(state.nodes, n, null);
  const pf = nodePowerFactor(state.nodes, n, null);
  if (networkFilters.rating && !ratingText(n).toLowerCase().includes(networkFilters.rating.toLowerCase())) return false;
  if (networkFilters.connloads && !(primCount + '/' + redCount).includes(networkFilters.connloads)) return false;
  if (networkFilters.connkw && !fmt(conn.kW, 1).toLowerCase().includes(networkFilters.connkw.toLowerCase())) return false;
  if (networkFilters.demandkva && !fmt(roll.activeKVA, 1).toLowerCase().includes(networkFilters.demandkva.toLowerCase())) return false;
  if (networkFilters.pf) {
    const txt = pf != null ? fmt(pf, 2) : '\u2014';
    if (!txt.toLowerCase().includes(networkFilters.pf.toLowerCase())) return false;
  }
  if (networkFilters.util) {
    const txt = roll.utilizationPct != null ? fmt(roll.utilizationPct, 0) + '%' : '\u2014';
    if (!txt.toLowerCase().includes(networkFilters.util.toLowerCase())) return false;
  }
  return true;
}

function buildNetworkFilterRow() {
  const row = $('#netColFilters'); if (!row) return;
  row.innerHTML = '';
  const nonLoad = state.nodes.filter(n => n.type !== 'load');
  const volts = Array.from(new Set(nonLoad.map(n => nodeVoltageV(n)).filter(v => v != null))).sort((a, b) => a - b);
  const tags = nonLoad.filter(e => e.tag).map(e => e.tag).sort();
  const setF = (k) => (v) => { networkFilters[k] = v; withFocusPreserved('#netColFilters', renderNetwork); };
  row.appendChild(el('th', { class: 'noprint' }));
  row.appendChild(makeFilterSelect('type', networkFilters.type, Object.keys(TYPE_META).map(t => [t, TYPE_META[t].label]), setF('type'), 'netF.type'));
  row.appendChild(el('th', { class: 'col-tag' }));
  row.appendChild(el('th', { class: 'col-description' }));
  row.appendChild(makeFilterSelect('status', networkFilters.status, [['active', 'Active'], ['inactive', 'Inactive']], setF('status'), 'netF.status'));
  row.appendChild(makeFilterText('rating', networkFilters.rating, 'Rating', setF('rating'), 'netF.rating'));
  row.appendChild(makeFilterSelect('voltage', networkFilters.voltage, volts.map(v => [String(v), v + ' V']), setF('voltage'), 'netF.voltage'));
  row.appendChild(makeFilterSelect('primary', networkFilters.primary, tags.map(t => [t, t]), setF('primary'), 'netF.primary'));
  row.appendChild(makeFilterSelect('redundant', networkFilters.redundant, tags.map(t => [t, t]), setF('redundant'), 'netF.redundant'));
  row.appendChild(makeFilterSelect('feed', networkFilters.feed, [['primary','primary'],['redundant','redundant'],['none','none']], setF('feed'), 'netF.feed'));
  row.appendChild(makeFilterText('connloads', networkFilters.connloads, 'Loads', setF('connloads'), 'netF.connloads'));
  row.appendChild(makeFilterText('connkw', networkFilters.connkw, 'kW', setF('connkw'), 'netF.connkw'));
  row.appendChild(makeFilterText('demandkva', networkFilters.demandkva, 'kVA', setF('demandkva'), 'netF.demandkva'));
  row.appendChild(makeFilterText('pf', networkFilters.pf, 'P.F.', setF('pf'), 'netF.pf'));
  row.appendChild(makeFilterText('util', networkFilters.util, '%', setF('util'), 'netF.util'));
  row.appendChild(el('th', { class: 'noprint' }));
}

function nextUniqueName(name, used) {
  const base = String(name).replace(/^([\s\S]*?)\s*\(\d+\)\s*$/, '$1');
  let k = 1;
  while (used.has(base + ' (' + k + ')')) k++;
  const out = base + ' (' + k + ')';
  used.add(out);
  return out;
}

const COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
  + '<rect x="5.2" y="5.2" width="8.8" height="8.8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
  + '<path d="M10.8 5.2V3.5A1.5 1.5 0 0 0 9.3 2H3.5A1.5 1.5 0 0 0 2 3.5v5.8A1.5 1.5 0 0 0 3.5 10.8h1.7" fill="none" stroke="currentColor" stroke-width="1.5"/>'
  + '</svg>';
function copyIconBtn(title, onClick) {
  const b = el('button', { class: 'iconbtn', title: title, html: COPY_ICON });
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}
function topLevelSelection(ids) {
  const idArr = Array.from(ids);
  return idArr.filter(id => {
    for (const other of idArr) {
      if (other === id) continue;
      if (collectSubtree(state.nodes, other).has(id)) return false;
    }
    return true;
  });
}

function duplicateNodeSubtree(srcId) {
  const src = findNode(srcId); if (!src) return;
  const cross = collectSubtree(state.nodes, srcId);
  const idMap = {};
  cross.forEach(oldId => { idMap[oldId] = state.nextId++; });
  const used = new Set(state.nodes.map(n => n.name));
  const created = [];
  const makeCopy = (oldNode, newId) => {
    const copy = JSON.parse(JSON.stringify(oldNode));
    copy.id = newId;
    copy.parentId = (oldNode.parentId == null) ? null : (idMap[oldNode.parentId] != null ? idMap[oldNode.parentId] : oldNode.parentId);
    copy.redundantParentId = (oldNode.redundantParentId == null) ? null : (idMap[oldNode.redundantParentId] != null ? idMap[oldNode.redundantParentId] : oldNode.redundantParentId);
    copy.name = nextUniqueName(oldNode.name, used);
    copy.order = null;
    if (copy.active == null) copy.active = true;
    copy.x = null; copy.y = null; copy.captionDx = null; copy.captionDy = null; copy.manual = false;
    return copy;
  };
  const srcNewId = state.nextId++;
  created.push(makeCopy(src, srcNewId));
  cross.forEach(oldId => created.push(makeCopy(findNode(oldId), idMap[oldId])));
  state.nodes = state.nodes.concat(created);
}

function toggleCollapseGroup(key) {
  if (collapsedGroups.has(key)) collapsedGroups.delete(key); else collapsedGroups.add(key);
  renderNetwork();
}

function voltageColor(v) {
  if (v == null) return '#5b6675';
  if (v >= 10000) return '#0f5fc9';
  if (v >= 1000) return '#6b46c1';
  if (v === 400) return '#0f7a3d';
  if (v === 230 || v === 240) return '#b26a00';
  return '#b3241c';
}

function nodeEffectiveActive(node) {
  return effActive(state.nodes, node, null);
}
function servingFeed(load, scen) {
  const cc = loadContribution(state.nodes, load, scen);
  if (!cc) return null;
  if (cc.P > 0 && cc.R > 0) return '50-50';
  return cc.P > 0 ? 'primary' : 'redundant';
}

function groupKeyOf(n) {
  if (n == null) return 'none';
  if (n.systemId != null) return 's' + n.systemId;
  return n.redundantParentId == null && n.parentId == null ? 'orphan' : 'unassigned';
}

function supplyTD(ref, cls) {
  const td = el('td', cls ? { class: cls } : {});
  if (!ref || !ref.tag) { td.appendChild(document.createTextNode('\u2014')); return td; }
  const sys = systemById(ref.systemId);
  const col = sys ? sys.color : '#5b6675';
  const badge = el('span', { class: 'badge supply-badge' }, [ref.tag]);
  badge.style.background = col + '1f';
  badge.style.color = col;
  badge.style.border = '1px solid ' + col + '66';
  td.appendChild(badge);
  return td;
}

function dragRowHandlers(tr, id, gkey) {
  tr.draggable = true;
  tr.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(id));
    e.dataTransfer.effectAllowed = 'move';
    tr.classList.add('drag-source');
  });
  tr.addEventListener('dragend', () => tr.classList.remove('drag-source'));
  tr.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.indexOf('text/plain') >= 0) e.preventDefault();
  });
  tr.addEventListener('drop', (e) => {
    e.preventDefault();
    const srcId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const src = findNode(srcId);
    if (!src || groupKeyOf(src) !== gkey) { showToast('Only reorder within the same group.', 'warn'); renderNetwork(); return; }
    const groupIds = $all('#networkBody tr.component-row')
      .map(r => parseInt(r.dataset.id, 10))
      .filter(x => !isNaN(x) && groupKeyOf(findNode(x)) === gkey);
    const from = groupIds.indexOf(srcId), to = groupIds.indexOf(id);
    if (from < 0 || to < 0 || from === to) return;
    groupIds.splice(to, 0, groupIds.splice(from, 1)[0]);
    groupIds.forEach((nid, i) => { const nn = findNode(nid); if (nn) nn.order = i; });
    netSort = null;
    markAutosave();
    renderNetwork();
  });
}

function componentRow(r, ncols) {
  const n = r.node;
  const system = systemById(n.systemId);
  const color = system ? system.color : '#5b6675';
  const tr = el('tr', { class: 'component-row' });
  tr.dataset.id = String(n.id);
  const effective = nodeEffectiveActive(n);
  if (!effective) tr.classList.add('row-inactive');

  const selTd = el('td', { class: 'noprint' });
  const cb = el('input', { type: 'checkbox' });
  cb.dataset.id = String(n.id);
  cb.checked = networkSelectedIds.has(n.id);
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    if (cb.checked) networkSelectedIds.add(n.id); else networkSelectedIds.delete(n.id);
    updateNetworkSelectionUI();
  });
  selTd.appendChild(cb); tr.appendChild(selTd);

  const typeTd = el('td', { class: 'col-type' });
  typeTd.style.borderLeft = '4px solid ' + color;
  const typeBadge = el('span', { class: 'node-badge' }, [TYPE_META[n.type].short]);
  typeBadge.style.background = voltageColor(nodeVoltageV(n));
  typeTd.appendChild(typeBadge);
  tr.appendChild(typeTd);

  const tagTd = el('td', { class: 'col-tag' });
  tagTd.appendChild(el('span', { style: 'font-weight:600;' }, [n.tag || '\u2014']));
  tr.appendChild(tagTd);

  const nameTd = el('td', { class: 'col-description' });
  nameTd.appendChild(el('span', { style: 'font-weight:600;' }, [n.name || '\u2014']));
  tr.appendChild(nameTd);

  const statusTd = el('td', { class: 'col-status' });
  statusTd.appendChild(el('span', { class: 'badge ' + (effective ? 'ok' : 'warn') }, [effective ? 'Active' : 'Inactive']));
  tr.appendChild(statusTd);

  tr.appendChild(el('td', { class: 'num col-rating' }, [ratingText(n)]));
  const v = nodeVoltageV(n);
  tr.appendChild(el('td', { class: 'num col-voltage' }, [v != null ? fmtVolts(v) + ' V' : '\u2014']));

  const prim = n.parentId != null ? findNode(n.parentId) : null;
  const red = n.redundantParentId != null ? findNode(n.redundantParentId) : null;
  tr.appendChild(supplyTD(prim, 'col-primary'));
  tr.appendChild(supplyTD(red, 'col-redundant'));

  const primOk = n.parentId != null && effActive(state.nodes, prim, null);
  const redOk = n.redundantParentId != null && effActive(state.nodes, red, null);
  const feedTxt = (n.parentId == null && n.redundantParentId == null) ? '\u2014'
    : primOk ? 'primary' : redOk ? 'redundant' : 'none';
  tr.appendChild(el('td', { class: 'num col-feed' }, [feedTxt]));

  const primCount = state.nodes.filter(l => l.parentId === n.id).length;
  const redCount = state.nodes.filter(l => l.redundantParentId === n.id).length;
  tr.appendChild(el('td', { class: 'num col-connloads' }, [primCount + '/' + redCount]));
  const conn = connectedLoadCalc(state.nodes, n);
  tr.appendChild(el('td', { class: 'num col-connkw' }, [fmt(conn.kW, 1)]));
  const roll = nodeRollup(state.nodes, n, null);
  tr.appendChild(el('td', { class: 'num col-demandkva' }, [fmt(roll.activeKVA, 1)]));

  const pf = nodePowerFactor(state.nodes, n, null);
  tr.appendChild(el('td', { class: 'num col-pf' }, [pf != null ? fmt(pf, 2) : '\u2014']));

  const utilTd = el('td', { class: 'col-util' });
  if (roll.utilizationPct != null) utilTd.appendChild(el('span', { class: 'badge ' + roll.badge }, [fmt(roll.utilizationPct, 0) + '%']));
  else utilTd.appendChild(el('span', { class: 'badge warn' }, ['\u2014']));
  tr.appendChild(utilTd);

  const acts = el('td', { class: 'noprint' });
  if (n.type !== 'load') {
    const actWrap = el('div', { class: 'rowactions' });
    const addBtn = el('button', { class: 'iconbtn', title: 'Add child' }, ['+']);
    addBtn.addEventListener('click', (e) => { e.stopPropagation(); showAddTypeMenu(e, { parentNode: n }); });
    const dupBtn = copyIconBtn('Duplicate subtree', () => { duplicateNodeSubtree(n.id); renderActive(); markAutosave(); showToast('Duplicated.', 'success'); });
    const delBtn = el('button', { class: 'iconbtn danger', title: 'Delete' }, ['\u2715']);
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(n.id); });
    actWrap.appendChild(addBtn); actWrap.appendChild(dupBtn); actWrap.appendChild(delBtn);
    acts.appendChild(actWrap);
  }
  tr.appendChild(acts);

  dragRowHandlers(tr, n.id, groupKeyOf(n));
  tr.addEventListener('click', () => openModal(n.id));
  return tr;
}

function renderNetwork() {
  const tbody = $('#networkBody'); tbody.innerHTML = '';
  $('#networkEmpty').style.display = state.nodes.length ? 'none' : 'block';
  $('#networkTable').style.display = state.nodes.length ? 'table' : 'none';
  networkFilterBar();
  buildNetworkFilterRow();

  const filtersActive = !!(
    networkFilters.search || networkFilters.type || networkFilters.system || networkFilters.status ||
    networkFilters.voltage || networkFilters.primary || networkFilters.redundant || networkFilters.feed || networkFilters.rating ||
    networkFilters.connloads || networkFilters.connkw || networkFilters.demandkva || networkFilters.pf || networkFilters.util
  );
  const rows = networkRows();
  const ncols = 16;

  const treeRows = rows.filter(r => !r.orphan && r.node);
  const orphanRows = rows.filter(r => r.orphan);
  const groups = [];
  state.systems.forEach(s => {
    const comps = treeRows.filter(r => r.node.systemId === s.id);
    if (comps.length) groups.push({ label: s.name, color: s.color, key: 's' + s.id, components: comps });
  });
  const unassigned = treeRows.filter(r => r.node.systemId == null);
  if (unassigned.length) groups.push({ label: 'Unassigned to system', color: '#5b6675', key: 'unassigned', components: unassigned });

  let rendered = 0;
  groups.forEach(g => {
    const collapsed = !filtersActive && collapsedGroups.has(g.key);
    let shown = g.components.filter(r => networkNodeMatches(r.node));
    if (netSort) shown = shown.slice().sort((a, b) => networkSortCompare(a.node, b.node));
    else if (!filtersActive) shown = shown.slice().sort((a, b) => (a.node.order == null ? 1e9 : a.node.order) - (b.node.order == null ? 1e9 : b.node.order));
    if (!shown.length) return;

    const head = el('tr', { class: 'system-group-header' });
    const headTd = el('td', { colspan: ncols });
    const caret = el('span', { class: 'collapse-caret' }, [collapsed ? '\u25B8' : '\u25BE']);
    const sw = el('span', { class: 'vl-swatch' }); sw.style.background = g.color;
    caret.addEventListener('click', (e) => { e.stopPropagation(); toggleCollapseGroup(g.key); });
    const nameSpan = el('span', { style: 'font-weight:800;font-size:12px;letter-spacing:.4px;text-transform:uppercase;padding-left:8px;' }, [g.label]);
    headTd.appendChild(caret); headTd.appendChild(sw); headTd.appendChild(nameSpan);
    head.addEventListener('click', () => toggleCollapseGroup(g.key));
    head.appendChild(headTd);
    tbodyAppend(tbody, head);

    if (!collapsed) shown.forEach(r => { rendered++; tbodyAppend(tbody, componentRow(r)); });
  });

  if (orphanRows.length) {
    const kept = orphanRows.filter(r => r.node && networkNodeMatches(r.node));
    if (kept.length) {
      const m = el('tr', { class: 'unassigned-marker' });
      m.appendChild(el('td', { colspan: ncols }, ['Unassigned']));
      tbodyAppend(tbody, m);
      if (netSort) kept.sort((a, b) => networkSortCompare(a.node, b.node));
      else kept.sort((a, b) => ((a.node.order == null ? 1e9 : a.node.order)) - (b.node.order == null ? 1e9 : b.node.order));
      kept.forEach(r => { rendered++; tbodyAppend(tbody, componentRow(r)); });
    }
  }

  if (state.nodes.length && rendered === 0) tbodyAppend(tbody, noResultsRow(ncols));

  updateNetworkSortBar();

  const legend = $('#networkLegend'); legend.innerHTML = '';
  if (state.systems.length) {
    state.systems.forEach(s => {
      const item = el('span', { class: 'vl-item' });
      const sw = el('span', { class: 'vl-swatch' });
      sw.style.background = s.color;
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.name));
      tbodyAppend(legend, item);
    });
  }
  updateNetworkSelectionUI();
  applyColumnVisibility('network', $('#networkTable'));
  stickFilterRow('#networkTable');
}
function tbodyAppend(parent, child) { parent.appendChild(child); }

const NET_SORT_KEYS = {
  tag: { get: n => (n.tag || '').toLowerCase(), numeric: false, label: 'Tag' },
  name: { get: n => (n.name || '').toLowerCase(), numeric: false, label: 'Description' },
  rating: { get: n => nodeRatingKVA(n) || 0, numeric: true, label: 'Rating' },
  voltage: { get: n => nodeVoltageV(n) || 0, numeric: true, label: 'Voltage' },
  feed: { get: n => { const pOk = n.parentId != null && effActive(state.nodes, findNode(n.parentId), null); const rOk = n.redundantParentId != null && effActive(state.nodes, findNode(n.redundantParentId), null); if (n.parentId == null && n.redundantParentId == null) return '\u2014'; return pOk ? 'primary' : rOk ? 'redundant' : 'none'; }, numeric: false, label: 'Active Feed' },
  connkw: { get: n => connectedLoadCalc(state.nodes, n).kW || 0, numeric: true, label: 'Connected kW' },
  demandkva: { get: n => nodeRollup(state.nodes, n, null).activeKVA || 0, numeric: true, label: 'Demand kVA' },
  pf: { get: n => nodePowerFactor(state.nodes, n, null) || 0, numeric: true, label: 'P.F.' },
  util: { get: n => nodeRollup(state.nodes, n, null).utilizationPct || 0, numeric: true, label: 'Utilisation' },
};

function networkSortCompare(a, b) {
  if (!netSort) return 0;
  const mk = NET_SORT_KEYS[netSort.key];
  if (!mk) return 0;
  const av = mk.get(a), bv = mk.get(b);
  const dir = netSort.dir === 'desc' ? -1 : 1;
  if (mk.numeric) return ((av || 0) - (bv || 0)) * dir;
  return String(av).localeCompare(String(bv)) * dir;
}

function updateNetworkSortBar() {
  const bar = $('#netSortBar');
  if (!bar) return;
  if (!netSort) { bar.style.display = 'none'; return; }
  const mk = NET_SORT_KEYS[netSort.key];
  bar.style.display = 'flex';
  $('#netSortLabel').textContent = 'Sorted by ' + (mk ? mk.label : netSort.key) + (netSort.dir === 'desc' ? ' (desc)' : ' (asc)');
}

function applyNetSort(key) {
  const dir = (!netSort || netSort.key !== key) ? 'asc' : (netSort.dir === 'asc' ? 'desc' : 'asc');
  netSort = { key, dir };
  renderNetwork();
}
function makePermanentOrder() { if (!netSort) return; commitDomOrder(); showToast('Manual order updated to match the current sort.', 'success'); }
function cancelTempSort() { netSort = null; renderNetwork(); }
function commitDomOrder() {
  const ids = $all('#networkBody tr.component-row').map(r => parseInt(r.dataset.id, 10)).filter(x => !isNaN(x));
  const counters = {};
  const out = {};
  ids.forEach(id => {
    const g = groupKeyOf(findNode(id));
    if (counters[g] == null) counters[g] = 0;
    out[id] = counters[g]++;
  });
  ids.forEach(id => { const nn = findNode(id); if (nn) nn.order = out[id]; });
  markAutosave();
  netSort = null;
  renderNetwork();
}

function attachNetworkHeaderSort() {
  const ths = $all('#networkTable thead tr:first-child th');
  const map = { 2: 'tag', 3: 'name', 5: 'rating', 6: 'voltage', 9: 'feed', 11: 'connkw', 12: 'demandkva', 13: 'pf', 14: 'util' };
  ths.forEach((th, i) => {
    if (!map[i]) return;
    th.style.cursor = 'pointer';
    th.title = 'Click to sort (temporary)';
    th.addEventListener('click', () => applyNetSort(map[i]));
  });
}

function updateNetworkSelectionUI() {
  const n = networkSelectedIds.size;
  const boxes = $all('#networkBody tr.component-row input[type="checkbox"]');
  const total = boxes.length;
  const selectAll = $('#networkSelectAllCb');
  if (selectAll) {
    selectAll.checked = total > 0 && Array.from(boxes).every(c => c.checked);
    selectAll.indeterminate = total > 0 && !selectAll.checked && Array.from(boxes).some(c => c.checked);
  }
  const clearBtn = $('#btnNetDeleteSel'), dupBtn = $('#btnNetDuplicateSel');
  if (clearBtn) clearBtn.style.display = n ? '' : 'none';
  if (dupBtn) dupBtn.style.display = n ? '' : 'none';
}

function closeAddMenu() { const m = $('#addChildMenu'); if (m) m.remove(); }
const ADD_GROUPS = [
  { caption: 'Power sources', types: ['utility', 'generator', 'battery'] },
  { caption: 'Distribution', types: ['mv-dist', 'transformer', 'ups', 'dist'] },
  { caption: 'Load', types: ['load'] },
];

function addMenuTypeItem(labelText, badge, short, onClick) {
  const it = el('button', { class: 'am-item' });
  it.appendChild(el('span', {}, [labelText]));
  it.appendChild(el('span', { class: 'node-badge ' + badge }, [short]));
  it.addEventListener('click', () => { closeAddMenu(); onClick(); });
  return it;
}

function showAddTypeMenu(evt, opts) {
  opts = opts || {};
  closeAddMenu();
  const menu = el('div', { id: 'addChildMenu' });
  const parentNode = opts.parentNode || null;
  const isSource = parentNode && (parentNode.type === 'utility' || parentNode.type === 'generator');

  if (parentNode && !isSource) {
    menu.appendChild(addMenuTypeItem('Generator (standby source)', 'gen', 'GEN', () => addNodeOfType('generator', parentNode)));
  }

  let allow = null;
  if (parentNode) allow = CHILD_TYPES[parentNode.type] || [];
  ADD_GROUPS.forEach(group => {
    let types = allow ? group.types.filter(t => allow.indexOf(t) !== -1 && (!parentNode || t !== 'generator' || isSource)) : group.types.slice();
    if (activeView === 'network') types = types.filter(t => t !== 'load');
    if (!types.length) return;
    menu.appendChild(el('div', { class: 'am-caption' }, [group.caption]));
    types.forEach(t => menu.appendChild(addMenuTypeItem(TYPE_META[t].label, TYPE_META[t].badge, TYPE_META[t].short, () => addNodeOfType(t, parentNode))));
  });

  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  let x = evt.clientX, y = evt.clientY;
  if (x + r.width > window.innerWidth) x = window.innerWidth - r.width - 8;
  if (y + r.height > window.innerHeight) y = evt.clientY - r.height - 8;
  menu.style.left = x + 'px'; menu.style.top = y + 'px';
  setTimeout(() => { document.addEventListener('click', function h(ev) { if (!menu.contains(ev.target)) { closeAddMenu(); document.removeEventListener('click', h); } }); }, 0);
}

function addNodeOfType(type, parentNode) {
  const node = blankNode(type, state.nextId++, state.defaults);
  if (parentNode && (type === 'generator' || type === 'battery')) {
    node.parentId = null;
    state.nodes.push(node);
    parentNode.redundantParentId = node.id;
    markAutosave();
    renderActive();
    openModal(node.id);
    showToast(TYPE_META[type].label + ' added and set as redundant supply of ' + label(parentNode) + '.', 'success');
    return;
  }
  node.parentId = parentNode ? parentNode.id : null;
  const hasVoltage = (TYPE_FIELDS[type] || []).some(f => f.key === 'voltageV');
  if (parentNode && hasVoltage) {
    const v = childVoltage(parentNode.type, parentNode);
    if (v != null && v !== '') node.voltageV = v;
  }
  state.nodes.push(node);
  markAutosave();
  renderActive();
  openModal(node.id);
}

function deleteNode(id) {
  const node = findNode(id); if (!node) return;
  const subtree = collectSubtree(state.nodes, id);
  const n = subtree.size;
  const msg = 'Delete ' + TYPE_META[node.type].label + ' "' + label(node) + '"' + (n ? ' and its ' + n + ' descendant' + (n === 1 ? '' : 's') : '') + '? This cannot be undone.';
  showConfirm(msg, 'Delete', () => {
    subtree.add(id);
    state.nodes = state.nodes.filter(x => !subtree.has(x.id));
    subtree.forEach(i => { networkSelectedIds.delete(i); });
    if (editingId && subtree.has(editingId)) closeModal();
    if (selectedDiagramId != null && subtree.has(selectedDiagramId)) selectedDiagramId = null;
    markAutosave();
    renderActive();
  });
}

function deleteSelectedNodes(idSet, typeFilter) {
  const top = topLevelSelection(idSet);
  const targets = state.nodes.filter(n => top.indexOf(n.id) !== -1 && typeFilter(n));
  if (!targets.length) return;
  const doomed = new Set();
  targets.forEach(n => { doomed.add(n.id); collectSubtree(state.nodes, n.id).forEach(i => doomed.add(i)); });
  showConfirm('Delete ' + targets.length + ' selected item' + (targets.length === 1 ? '' : 's') +
    (doomed.size > targets.length ? ' and their ' + (doomed.size - targets.length) + ' descendant(s)' : '') +
    '? This cannot be undone.', 'Delete', () => {
    state.nodes = state.nodes.filter(x => !doomed.has(x.id));
    doomed.forEach(i => { networkSelectedIds.delete(i); });
    if (editingId && doomed.has(editingId)) closeModal();
    if (selectedDiagramId != null && doomed.has(selectedDiagramId)) selectedDiagramId = null;
    markAutosave();
    renderActive();
    showToast('Deleted ' + targets.length + ' item' + (targets.length === 1 ? '' : 's') + '.', 'success');
  });
}

$('#btnAddComponent').addEventListener('click', (evt) => showAddTypeMenu(evt, { parentNode: null }));
$('#btnDoneAddAnother').addEventListener('click', () => {
  const cur = findNode(editingId);
  if (!cur) return;
  const copy = blankNode('load', state.nextId++, state.defaults);
  copy.parentId = cur.parentId;
  copy.redundantParentId = cur.redundantParentId;
  copy.activeFeed = cur.activeFeed;
  if (copy.parentId != null && copy.redundantParentId === copy.parentId) copy.redundantParentId = null;
  if (copy.parentId != null) {
    const p = findNode(copy.parentId);
    if (p) {
      const v = childVoltage(p.type, p);
      if (v != null && v !== '') copy.voltageV = v;
    }
  }
  state.nodes.push(copy);
  markAutosave();
  renderActive();
  openModal(copy.id);
});
$('#btnLoadExample').addEventListener('click', () => {
  state = loadExample();
  networkSelectedIds = new Set();
  collapsedGroups = new Set();
  networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
  netSort = null;
  diagramNeedsLayout();
  markAutosave();
  renderActive();
  showToast('Example project loaded.', 'success');
});

$('#networkSelectAllCb').addEventListener('change', (e) => {
  $all('#networkBody tr.component-row input[type="checkbox"]').forEach(c => {
    c.checked = e.target.checked;
    const id = parseInt(c.dataset.id, 10);
    if (e.target.checked) networkSelectedIds.add(id); else networkSelectedIds.delete(id);
  });
  updateNetworkSelectionUI();
});
$('#btnNetDeleteSel').addEventListener('click', () => deleteSelectedNodes(networkSelectedIds, n => n.type !== 'load'));
$('#btnNetDuplicateSel').addEventListener('click', () => {
  const top = topLevelSelection(networkSelectedIds);
  const sel = state.nodes.filter(n => n.type !== 'load' && top.indexOf(n.id) !== -1);
  if (!sel.length) return;
  sel.forEach(n => duplicateNodeSubtree(n.id));
  networkSelectedIds.clear();
  markAutosave();
  renderActive();
  showToast('Duplicated ' + sel.length + ' component' + (sel.length === 1 ? '' : 's') + ' and their sub-trees.', 'success');
});
$('#netFilterSearch').addEventListener('input', (e) => { networkFilters.search = e.target.value; renderNetwork(); });
$('#netFilterSystem').addEventListener('change', (e) => { networkFilters.system = e.target.value; renderNetwork(); });
$('#netResetFilters').addEventListener('click', () => {
  networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
  $('#netFilterSearch').value = '';
  $('#netFilterSystem').value = '';
  renderNetwork();
});
$('#btnToggleNetFilters').addEventListener('click', () => {
  netFilterOpen = !netFilterOpen;
  const bar = $('#netFilterBar');
  if (bar) bar.style.display = netFilterOpen ? '' : 'none';
});
$('#btnNetColumns').addEventListener('click', (e) => showColumnMenu(e, 'network', NETWORK_COLUMNS));
$('#btnMakePerm').addEventListener('click', makePermanentOrder);
$('#btnCancelSort').addEventListener('click', cancelTempSort);

function openSystems() { $('#systemsOverlay').classList.add('open'); renderSystemsModal(); }
function closeSystems() { $('#systemsOverlay').classList.remove('open'); }
$('#btnSystems').addEventListener('click', openSystems);
$('#systemsClose').addEventListener('click', closeSystems);
$('#systemsCancel').addEventListener('click', closeSystems);
$('#systemsOverlay').addEventListener('click', (e) => { if (e.target.id === 'systemsOverlay') closeSystems(); });

function renderSystemsModal() {
  const c = $('#systemsList'); c.innerHTML = '';
  if (!state.systems.length) c.appendChild(el('div', { class: 'hint' }, ['No systems defined yet \u2014 add one below.']));
  state.systems.forEach(s => {
    const row = el('div', { class: 'system-edit-row' });
    const nameIn = el('input', { type: 'text', value: s.name });
    nameIn.style.flex = '1';
    nameIn.addEventListener('input', () => { s.name = nameIn.value; markAutosave(); renderNetwork(); });
    const colIn = el('input', { type: 'color', value: s.color });
    colIn.addEventListener('input', () => { s.color = colIn.value; markAutosave(); renderNetwork(); });
    const del = el('button', { class: 'tbtn', title: 'Delete system' }, ['\u2715']);
    del.style.cssText = 'background:var(--fail-bg);color:var(--fail-ink);border-color:var(--fail-border);';
    del.addEventListener('click', () => deleteSystem(s.id));
    row.appendChild(nameIn); row.appendChild(colIn); row.appendChild(del);
    c.appendChild(row);
  });
}
$('#btnAddSystem').addEventListener('click', () => {
  const color = SYSTEM_COLORS[(state.systems.length) % SYSTEM_COLORS.length];
  state.systems.push({ id: state.nextSystemId++, name: 'New system', color });
  renderSystemsModal();
  markAutosave();
  renderNetwork();
});
function deleteSystem(id) {
  const sys = state.systems.find(s => s.id === id);
  if (!sys) return;
  const n = state.nodes.filter(x => x.systemId === id).length;
  showConfirm('Delete system "' + sys.name + '"' + (n ? ' and unassign it from ' + n + ' component' + (n === 1 ? '' : 's') + '?' : '?'), 'Delete', () => {
    state.systems = state.systems.filter(s => s.id !== id);
    state.nodes.forEach(x => { if (x.systemId === id) x.systemId = null; });
    collapsedGroups.delete('s' + id);
    markAutosave();
    renderSystemsModal();
    renderActive();
    showToast('System deleted.', 'success');
  });
}

/* ===================================================================
   NODE MODAL EDITOR
   =================================================================== */
function openModal(id) {
  editingId = id;
  $('#overlay').classList.add('open');
  renderModal();
}
function closeModal() {
  editingId = null;
  $('#overlay').classList.remove('open');
  renderActive();
}
$('#modalClose').addEventListener('click', closeModal);
$('#btnCloseModal').addEventListener('click', closeModal);
$('#btnDeleteNode').addEventListener('click', () => { if (editingId != null) deleteNode(editingId); });
$('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });

function renderModal() {
  const node = findNode(editingId);
  if (!node) return;
  $('#modalTitle').textContent = TYPE_META[node.type].label + ': ' + (node.name || '\u2014');
  const da = $('#btnDoneAddAnother');
  if (da) da.style.display = node.type === 'load' ? '' : 'none';
  const tabsEl = $('#modalTabs');
  if (tabsEl) {
    if (node.type === 'load') { modalTab = 'details'; tabsEl.style.display = 'none'; }
    else { tabsEl.style.display = 'flex'; renderModalTabs(node); }
  }
  updateModalNav(node);
  const body = $('#modalBody'); body.innerHTML = '';

  if (node.type !== 'load' && modalTab === 'loads') {
    renderModalLoadsTab(body, node);
    return;
  }

  body.appendChild(sectionTitle('Identity'));
  let g = el('div', { class: 'grid cols-2' });
  g.appendChild(inputField('Name', node.name, v => updateNodeField(node, 'name', v), { field: 'name' }));
  g.appendChild(inputField('Tag', node.tag, v => updateNodeField(node, 'tag', v), { field: 'tag' }));
  g.appendChild(activeField(node));
  body.appendChild(g);
  body.appendChild(systemSelect(node));

  body.appendChild(sectionTitle(TYPE_META[node.type].label + ' Parameters'));
  g = el('div', { class: 'grid cols-2' });
  (TYPE_FIELDS[node.type] || []).forEach(def => g.appendChild(buildField(node, def)));
  body.appendChild(g);

  body.appendChild(sectionTitle('Supply'));
  buildSupplySection(body, node);

  body.appendChild(sectionTitle('Computed'));
  buildComputed(body, node);
}

function modalNavIds() {
  const node = findNode(editingId);
  if (!node) return [];
  const isLoad = node.type === 'load';
  const ids = $all('#networkBody tr.component-row')
    .map(r => parseInt(r.dataset.id, 10))
    .filter(id => !isNaN(id));
  if (ids.indexOf(node.id) >= 0) return ids;
  return state.nodes.filter(n => isLoad ? n.type === 'load' : n.type !== 'load').map(n => n.id);
}

function updateModalNav(node) {
  const list = modalNavIds();
  const idx = list.indexOf(node.id);
  const prev = $('#modalPrev'), next = $('#modalNext'), pos = $('#modalNavPos');
  if (!prev || !next || !pos) return;
  if (!list.length) { prev.disabled = true; next.disabled = true; pos.textContent = ''; return; }
  prev.disabled = idx <= 0;
  next.disabled = idx >= list.length - 1;
  pos.textContent = (idx >= 0 ? idx + 1 : '\u2014') + ' / ' + list.length;
}

function navModal(dir) {
  const list = modalNavIds();
  const idx = list.indexOf(editingId);
  const target = list[idx + dir];
  if (target != null) openModal(target);
}
$('#modalPrev').addEventListener('click', () => navModal(-1));
$('#modalNext').addEventListener('click', () => navModal(1));

function renderModalTabs(node) {
  const tabsEl = $('#modalTabs');
  if (!tabsEl) return;
  tabsEl.innerHTML = '';
  const mk = (key, label) => {
    const b = el('button', { class: 'modaltab' + (modalTab === key ? ' active' : '') }, [label]);
    b.addEventListener('click', () => { modalTab = key; renderModal(); });
    return b;
  };
  tabsEl.appendChild(mk('details', 'Component details'));
  tabsEl.appendChild(mk('loads', 'Load schedule'));
}

function renderModalLoadsTab(body, node) {
  const kids = state.nodes.filter(c => c.parentId === node.id || c.redundantParentId === node.id);
  const primCount = state.nodes.filter(c => c.parentId === node.id).length;
  const redCount = state.nodes.filter(c => c.redundantParentId === node.id).length;
  const connKW = kids.reduce((s, c) => s + (c.type === 'load' ? num(c.ratedKW) : 0), 0);
  body.appendChild(el('div', { class: 'hint', style: 'margin-bottom:10px;' }, [
    'Primary: ' + primCount + ' \u00b7 Redundant: ' + redCount + ' \u00b7 Connected load: ' + fmt(connKW, 1) + ' kW',
  ]));
  if (!kids.length) {
    body.appendChild(el('div', { class: 'hint' }, ['No loads or equipment directly connected to this component.']));
    return;
  }
  const order = c => (c.order == null ? 1e9 : c.order);
  const rank = c => {
    const onP = c.parentId === node.id, onR = c.redundantParentId === node.id;
    return onP && onR ? 2 : onR ? 1 : 0;
  };
  kids.sort((a, b) => (rank(a) - rank(b)) || (order(a) - order(b)) || (a.id - b.id));

  const table = el('table', { class: 'modaltable' });
  table.appendChild(el('thead', {}, [el('tr', {}, [
    el('th', {}, ['Connection']), el('th', {}, ['Type']), el('th', {}, ['Tag']),
    el('th', {}, ['Name']), el('th', {}, ['Rating']), el('th', {}, ['Voltage']),
  ])]));
  const tbody = el('tbody');
  kids.forEach(c => {
    const onP = c.parentId === node.id, onR = c.redundantParentId === node.id;
    const which = onP && onR ? 'both' : onR ? 'redundant' : 'primary';
    const connLabel = onP && onR ? 'P+R' : onR ? 'Redundant' : 'Primary';
    const tr = el('tr');
    if (!nodeEffectiveActive(c)) tr.classList.add('row-inactive');
    tr.appendChild(el('td', {}, [el('span', { class: 'conn-badge ' + which }, [connLabel])]));
    tr.appendChild(el('td', {}, [el('span', { class: 'node-badge ' + TYPE_META[c.type].badge }, [TYPE_META[c.type].short])]));
    tr.appendChild(el('td', {}, [c.tag || '\u2014']));
    tr.appendChild(el('td', {}, [c.name || '\u2014']));
    tr.appendChild(el('td', { class: 'num' }, [c.type === 'load' ? fmt(num(c.ratedKW), 1) + ' kW' : ratingText(c)]));
    const v = nodeVoltageV(c);
    tr.appendChild(el('td', { class: 'num' }, [v != null ? fmtVolts(v) + ' V' : '\u2014']));
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  body.appendChild(table);
}

function buildField(node, def) {
  const unit = def.unit ? ' ' + def.unit : '';
  const labelText = def.label + unit;
  if (def.type === 'select') {
    return selectField(labelText, node[def.key], def.options,
      v => { node[def.key] = (typeof def.options[0] === 'number') ? parseFloat(v) : v; markAutosave(); renderModal(); },
      { field: def.key });
  }
  return inputField(labelText, node[def.key], v => updateNodeField(node, def.key, v),
    { type: 'number', step: def.step || 'any', field: def.key, hint: def.hint });
}

function updateNodeField(node, key, v) { node[key] = v; markAutosave(); withFocusPreserved('#modal', renderModal); }

function activeField(node) {
  const baseOn = node.active !== false;
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, ['Active']));
  const row = el('label', { class: 'switch-row' });
  const inp = el('input', { type: 'checkbox' });
  inp.checked = baseOn;
  inp.addEventListener('change', () => { node.active = inp.checked; markAutosave(); renderModal(); });
  const sw = el('span', { class: 'switch' });
  const txt = el('span', { style: 'font-size:12.5px;' }, [baseOn ? 'Active' : 'Inactive']);
  row.appendChild(inp); row.appendChild(sw); row.appendChild(txt);
  wrap.appendChild(row);
  return wrap;
}

function systemSelect(node) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, ['System']));
  const sel = el('select', {});
  const optNone = el('option', { value: '' }, ['None']);
  if (node.systemId == null) optNone.selected = true;
  sel.appendChild(optNone);
  state.systems.forEach(s => {
    const o = el('option', { value: String(s.id) }, [s.name]);
    if (String(s.id) === String(node.systemId)) o.selected = true;
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    const val = sel.value;
    node.systemId = (val === '' || val == null) ? null : parseInt(val, 10);
    markAutosave(); renderModal();
    if (activeView === 'diagram') renderDiagramView();
  });
  wrap.appendChild(sel);
  return wrap;
}

function buildSupplySection(body, node) {
  if (POWER_SOURCES.includes(node.type)) {
    body.appendChild(inputField('Supply source', TYPE_META[node.type].label + ' \u2014 power source (no upstream supply)', () => {}, { readonly: true }));
  } else {
    body.appendChild(supplyField('Primary supply', supplyCombo('f_parentId', node.parentId, supplyOptions(node, node.parentId), null, v => onParentChange(node, 'parentId', v))));
  }
  if (node.type !== 'generator' && node.type !== 'battery') {
    body.appendChild(supplyField('Redundant supply', supplyCombo('f_redundantParentId', node.redundantParentId, supplyOptions(node, node.redundantParentId), 'None', v => onParentChange(node, 'redundantParentId', v))));
  }
  if (node.activeFeed === '50-50') {
    body.appendChild(selectField('Active feed', node.activeFeed, FEEDS,
      v => { node.activeFeed = v; markAutosave(); renderModal(); }, { field: 'activeFeed', hint: '50/50 splits the single-count load between primary & redundant; each feed still sizes at 100%.' }));
  } else if (node.redundantParentId != null) {
    body.appendChild(selectField('Active feed', node.activeFeed, FEEDS,
      v => { node.activeFeed = v; markAutosave(); renderModal(); }, { field: 'activeFeed', hint: 'The feed used for single-count building totals & category branding.' }));
  }
  if (!POWER_SOURCES.includes(node.type) && node.parentId == null) {
    body.appendChild(el('div', { class: 'hint', style: 'color:var(--warn-ink);' }, ['No primary supply assigned \u2014 excluded from totals until set.']));
  }
  if (node.type === 'load' && node.parentId != null) {
    const p = findNode(node.parentId);
    if (p && p.voltageV && node.voltageV && Number(p.voltageV) !== Number(node.voltageV)) {
      body.appendChild(el('div', { class: 'hint', style: 'color:var(--warn-ink);' }, ['Note: load voltage (' + node.voltageV + ' V) differs from its parent supply voltage (' + p.voltageV + ' V).']));
    }
  }
}

function supplyOptions(node, currentId) {
  const opts = eligibleParents(state.nodes, node, {}).map(p => ({ id: p.id, label: parentOptionLabel(p) }));
  if (currentId != null && !opts.some(o => String(o.id) === String(currentId))) {
    const p = findNode(currentId);
    if (p) opts.push({ id: p.id, label: parentOptionLabel(p) });
  }
  return opts;
}
function supplyField(labelText, combo) {
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, [labelText]));
  wrap.appendChild(combo);
  return wrap;
}

function supplyCombo(fieldId, currentId, options, allowNoneLabel, onPick) {
  const wrap = el('div', { class: 'combo' });
  const hidden = el('input', { type: 'hidden', id: fieldId });
  hidden.value = currentId == null ? '' : String(currentId);
  wrap.appendChild(hidden);

  const text = el('input', { type: 'text', autocomplete: 'off', spellcheck: 'false' });
  const cur = options.find(o => String(o.id) === String(currentId));
  text.value = cur ? cur.label : (allowNoneLabel || '');
  wrap.appendChild(text);

  const list = el('div', { class: 'combo-list' });
  wrap.appendChild(list);

  let open = false;
  let active = -1;
  const entries = () => {
    const q = text.value.toLowerCase();
    const out = [];
    if (allowNoneLabel) out.push({ id: '', label: allowNoneLabel });
    options.forEach(o => { if (o.label.toLowerCase().includes(q)) out.push({ id: o.id, label: o.label }); });
    return out;
  };

  function closeList() { open = false; wrap.classList.remove('open'); list.innerHTML = ''; active = -1; }
  function openList() { open = true; wrap.classList.add('open'); active = -1; renderList(); }

  function renderList() {
    const items = entries();
    list.innerHTML = '';
    if (!items.length) {
      list.appendChild(el('div', { class: 'combo-item', style: 'color:var(--ink-faint);cursor:default;' }, ['No matches']));
      return;
    }
    items.forEach((it, i) => {
      const d = el('div', { class: 'combo-item' + (i === active ? ' active' : '') }, [it.label]);
      d.addEventListener('mousedown', (e) => { e.preventDefault(); pick(it); });
      list.appendChild(d);
    });
  }

  function pick(it) {
    hidden.value = it.id == null ? '' : String(it.id);
    text.value = it.label;
    closeList();
    if (onPick) onPick(hidden.value);
  }

  text.addEventListener('focus', () => { if (!open) openList(); });
  text.addEventListener('input', () => { if (!open) openList(); else renderList(); });
  text.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      if (!open) { openList(); return; }
      const items = entries();
      if (items.length) { active = Math.min(active + 1, items.length - 1); renderList(); }
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      if (open) { active = Math.max(active - 1, 0); renderList(); }
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (!open) return;
      e.preventDefault();
      const items = entries();
      if (items.length) {
        const idx = active >= 0 && active < items.length ? active : 0;
        pick(items[idx]);
      }
    } else if (e.key === 'Escape') {
      if (open) { e.stopPropagation(); closeList(); text.value = cur ? cur.label : (allowNoneLabel || ''); }
    }
  });
  text.addEventListener('blur', () => { if (open) closeList(); });

  return wrap;
}

function onParentChange(node, key, raw) {
  const pid = (raw === '' || raw == null) ? null : parseInt(raw, 10);
  if (wouldCreateCycle(state.nodes, node.id, pid)) {
    showToast('That assignment would create a cycle and was not applied.', 'error'); renderModal(); return;
  }
  if (pid != null) {
    if (key === 'redundantParentId' && pid === node.parentId) {
      showToast('The redundant supply must differ from the primary supply.', 'error'); renderModal(); return;
    }
    if (key === 'parentId' && pid === node.redundantParentId) {
      showToast('The primary supply must differ from the redundant supply.', 'error'); renderModal(); return;
    }
  }
  node[key] = pid;
  if (key === 'redundantParentId' && pid === null) node.activeFeed = 'primary';
  markAutosave();
  renderModal();
}

function buildComputed(body, node) {
  if (node.type === 'load') {
    const c = loadCalc(node);
    const cat = deriveCategory(state.nodes, node, null);
    const bar = el('div', { class: 'resultsbar' });
    bar.appendChild(resultCard('Rated / Demand kVA', fmt(c.kva, 2) + ' / ' + fmt(c.demandKVA, 2)));
    bar.appendChild(resultCard('Demand kW', fmt(c.demandKW, 2)));
    bar.appendChild(resultCard('Full Load Current', fmt(c.flc, 1) + ' A'));
    bar.appendChild(resultCard('Category', categoryLabel[cat], '', 'badge ' + cat));
    body.appendChild(bar);
  } else {
    const r = nodeRollup(state.nodes, node, null);
    const bar = el('div', { class: 'resultsbar' });
    bar.appendChild(resultCard('Rating', r.ratingKVA != null ? fmt(r.ratingKVA, 0) + ' kVA' : '\u2014'));
    bar.appendChild(resultCard('Sizing kVA', fmt(r.sizingKVA, 1)));
    bar.appendChild(resultCard('Active kVA', fmt(r.activeKVA, 1)));
    const pf = nodePowerFactor(state.nodes, node, null);
    bar.appendChild(resultCard('Power Factor', pf != null ? fmt(pf, 2) : '\u2014'));
    bar.appendChild(resultCard('Utilisation', r.utilizationPct != null ? fmt(r.utilizationPct, 0) + '%' : '\u2014', r.utilizationPct != null ? r.badge : ''));
    body.appendChild(bar);
  }
}

function resultCard(l, value, tone, badgeClass) {
  const c = el('div', { class: 'rc' });
  c.appendChild(el('div', { class: 'l' }, [l]));
  if (badgeClass) {
    c.appendChild(el('div', { class: 'badge ' + badgeClass, style: 'margin-top:4px;' }, [value]));
  } else {
    const v = el('div', { class: 'v' }, [value]);
    if (tone === 'ok') v.style.color = 'var(--ok-ink)';
    if (tone === 'warn') v.style.color = 'var(--warn-ink)';
    if (tone === 'fail') v.style.color = 'var(--fail-ink)';
    c.appendChild(v);
  }
  return c;
}
function sectionTitle(t) { return el('div', { class: 'section-title' }, [t]); }

/* ===================================================================
   DIAGRAM INTEGRATION & PROPERTY PANEL
   =================================================================== */
function diagramPanelRender() {
  const panel = $('#diagramPanel');
  if (!panel) return;
  panel.innerHTML = '';
  const node = selectedDiagramId != null ? findNode(selectedDiagramId) : null;
  if (!node) {
    panel.appendChild(el('div', { class: 'diagram-panel-empty' }, [
      el('div', { class: 'big' }, ['No selection']),
      el('div', { class: 'small' }, ['Click a symbol in the diagram to edit it here.']),
    ]));
    if (panel.classList.contains('open-select')) panel.classList.remove('open');
    return;
  }
  if (!panel.classList.contains('open')) panel.classList.add('open');

  const head = el('div', { class: 'diagram-panel-head' });
  head.appendChild(el('h3', {}, [TYPE_META[node.type].label]));
  const tv = el('span', { class: 'node-badge ' + TYPE_META[node.type].badge, style: 'background:' + voltageColor(nodeVoltageV(node)) }, [TYPE_META[node.type].short]);
  head.appendChild(tv);
  panel.appendChild(head);

  const body = el('div', { class: 'diagram-panel-body' });
  body.appendChild(sectionTitle('Identity'));
  let g = el('div', { class: 'grid cols-1' });
  g.appendChild(inputField('Name', node.name, v => { node.name = v; markAutosave(); renderDiagramView(); }, { field: 'name' }));
  g.appendChild(inputField('Tag', node.tag, v => { node.tag = v; markAutosave(); renderDiagramView(); }, { field: 'tag', placeholder: 'e.g. ' + TYPE_META[node.type].short + '-1' }));
  body.appendChild(g);
  body.appendChild(activeField(node));

  body.appendChild(sectionTitle(TYPE_META[node.type].label + ' Parameters'));
  g = el('div', { class: 'grid cols-1' });
  (TYPE_FIELDS[node.type] || []).forEach(def => g.appendChild(buildField(node, def)));
  body.appendChild(g);

  body.appendChild(sectionTitle('Supply'));
  buildSupplySection(body, node);

  body.appendChild(sectionTitle('Computed'));
  buildComputed(body, node);
  panel.appendChild(body);

  const foot = el('div', { class: 'diagram-panel-foot' });
  const btn = el('button', { class: 'tbtn', style: 'background:var(--fail-bg);color:var(--fail-ink);border-color:var(--fail-border);' }, ['Delete \u2014 ' + label(node)]);
  btn.addEventListener('click', () => deleteNode(node.id));
  foot.appendChild(btn);
  panel.appendChild(foot);
}

/* ===================================================================
   PERSISTENCE: localStorage autosave
   =================================================================== */
function markAutosave() {
  if (state && state.nodes) {
    clearTimeout(_lsTimer);
    _lsTimer = setTimeout(saveLocal, 300);
  }
}
function saveLocal() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
  catch (e) { /* workspace storage unavailable */ }
}
function loadLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) { state = defaultState(); return; }
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.nodes)) { normalizeState(data); state = data; }
    else state = defaultState();
  } catch (e) { state = defaultState(); }
}
function normalizeState(s) {
  s.project = Object.assign(defaultState().project, s.project || {});
  s.nextId = (Math.max(0, ...(s.nodes || []).map(x => x.id || 0)) + 1);
  if (!Array.isArray(s.systems)) s.systems = [];
  if (s.nextSystemId == null || !(s.nextSystemId > 0)) s.nextSystemId = Math.max(0, ...(s.systems || []).map(x => x.id || 0)) + 1;
  (s.nodes || []).forEach(n => {
    if (n.activeFeed == null || FEEDS.indexOf(n.activeFeed) < 0) n.activeFeed = 'primary';
    if (n.active == null) n.active = true;
    if (n.order == null) n.order = null;
    if (n.systemId == null) n.systemId = null;
    if ((n.type === 'generator' || n.type === 'battery') && n.parentId != null) n.parentId = null;
    if (n.type === 'load' && !n.loadType) n.loadType = 'General House Loads';
    if (n.x == null) n.x = null;
    if (n.y == null) n.y = null;
    if (n.captionDx == null) n.captionDx = 0;
    if (n.captionDy == null) n.captionDy = 0;
  });
  const defs = defaultsCopy();
  Object.keys(FIELD_DEFAULTS).forEach(t => { defs[t] = Object.assign({}, FIELD_DEFAULTS[t], (s.defaults && s.defaults[t]) || {}); });
  s.defaults = defs;
  if (!s.columnPrefs || typeof s.columnPrefs !== 'object') s.columnPrefs = {};
}
function resetLocalData() {
  showConfirm('Reset local data? This clears the autosaved diagram and network and starts fresh. Export JSON first if you need a copy.', 'Reset', () => {
    try { localStorage.removeItem(LS_KEY); } catch (e) {}
    state = defaultState();
    networkSelectedIds = new Set();
    collapsedGroups = new Set();
    networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
    netSort = null;
    selectedDiagramId = null;
    diagramNeedsLayout();
    renderActive();
    showToast('Local data cleared.', 'success');
  });
}
$('#btnResetData').addEventListener('click', resetLocalData);

/* ===================================================================
   EXPORT / IMPORT
   =================================================================== */
$('#btnExport').addEventListener('click', () => {
  try {
    const out = { tool: 'block-diagram', version: 1, state: state };
    const name = state.project.projectNo || state.project.projectName || 'block-diagram';
    downloadJSON(name, out);
    showToast('Project exported.', 'success');
  } catch (err) {
    console.error('JSON export failed:', err);
    showToast('Export JSON failed: ' + err.message + ' \u2014 if you are viewing this inside an embedded preview, downloads are usually blocked there; open this HTML file directly in your browser instead.', 'error', 8000);
  }
});
$('#btnImport').addEventListener('click', () => $('#filein').click());
$('#filein').addEventListener('change', (e) => {
  importJSONFile($('#filein'), {
    validate(data) {
      if (!data || data.tool !== 'block-diagram') throw new Error('wrong tool');
      if (!data.state || !Array.isArray(data.state.nodes)) throw new Error('missing fields');
    },
    onLoaded(data) {
      state = data.state;
      normalizeState(state);
      networkSelectedIds = new Set();
      collapsedGroups = new Set();
      networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
      netSort = null;
      selectedDiagramId = null;
      diagramNeedsLayout();
      markAutosave();
      renderActive();
      showToast('Project loaded.', 'success');
    },
  });
});
$('#btnExportSvg').addEventListener('click', () => exportDiagramImage('svg'));
$('#btnExportPng').addEventListener('click', () => exportDiagramImage('png'));

/* =====================================================================
   DIAGRAM EVENTS WIRED INTO APP
   ===================================================================== */
$('#btnDiagramAdd').addEventListener('click', (evt) => showAddTypeMenu(evt, { parentNode: null }));
$('#btnDiagramAutoLayout').addEventListener('click', () => { diagramNeedsLayout(true); renderDiagramView(); showToast('Diagram re-laid out.', 'success'); });
$('#btnDiagramFit').addEventListener('click', () => { diagramFitView(); });
$('#btnZoomIn').addEventListener('click', () => diagramZoomBy(1.25));
$('#btnZoomOut').addEventListener('click', () => diagramZoomBy(0.8));
$('#chkGrid').addEventListener('change', () => { diagramGridVisible = $('#chkGrid').checked; renderDiagramView(); });

/* =====================================================================
   INIT
   ===================================================================== */
loadLocal();
normalizeState(state);
const _wantExample = new URLSearchParams(window.location.search).has('example') || /example/i.test(window.location.hash || '');
if (!state.nodes.length && _wantExample) {
  state = loadExample();
}
attachNetworkHeaderSort();
initEmbeddedPreviewBanner();
setView('network');
markAutosave();