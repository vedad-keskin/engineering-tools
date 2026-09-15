/* ===================================================================
   NETWORK DIAGRAM BUILDER - application logic
   (ported from Capacity Planner: Project/Settings/Network/Load Schedule
   tabs + modal editor + systems manager + import/export/print, minus
   Scenarios & Summary; plus a new Diagram tab in diagram.js)
   =================================================================== */
let state = defaultState();
let editingId = null;
let modalTab = 'details';
let activeView = 'project';
let selectedIds = new Set();
let filters = { search: '', category: '', loadtype: '', v: '', pf: '', kw: '', df: '', kva: '', flc: '', primary: '', redundant: '', feed: '' };
let networkSelectedIds = new Set();
let collapsedGroups = new Set();
let collapsedSchedGroups = new Set();
let networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
let netFilterOpen = false;
let schedFilterOpen = false;
let netSort = null;             // { key, dir } for temporary table sort
let schedSort = null;           // { key, dir } for load schedule sort (asc/desc, no "off" via bar)
let netGroupBy = 'none';        // load schedule grouping

const FEEDS = ['primary', 'redundant', '50-50'];

/* ---- per-table column registries (key: hideable column; used by the Columns popover) ---- */
const NETWORK_COLUMNS = [
  { key: 'type', label: 'Type' }, { key: 'tag', label: 'Tag' }, { key: 'description', label: 'Description' },
  { key: 'status', label: 'Status' }, { key: 'rating', label: 'Rating' }, { key: 'voltage', label: 'Voltage' },
  { key: 'primary', label: 'Primary supply' }, { key: 'redundant', label: 'Redundant supply' },
  { key: 'feed', label: 'Active Feed' }, { key: 'connloads', label: 'Connected Loads' }, { key: 'connkw', label: 'Connected kW' },
  { key: 'demandkva', label: 'Demand kVA' }, { key: 'pf', label: 'P.F.' }, { key: 'util', label: 'Utilisation' },
];
const SCHEDULE_COLUMNS = [
  { key: 'num', label: '#' }, { key: 'tag', label: 'Tag' }, { key: 'name', label: 'Name' },
  { key: 'category', label: 'Category' }, { key: 'loadtype', label: 'Load Type' }, { key: 'v', label: 'V' }, { key: 'pf', label: 'PF' },
  { key: 'kw', label: 'kW' }, { key: 'df', label: 'DF' }, { key: 'kva', label: 'kVA' },
  { key: 'flc', label: 'FLC (A)' }, { key: 'primary', label: 'Primary supply' },
  { key: 'redundant', label: 'Redundant supply' }, { key: 'feed', label: 'Active feed' },
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
      renderActive();
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
  document.querySelector('main').classList.toggle('wide',
    ['network', 'schedule', 'diagram'].indexOf(activeView) >= 0);
  if (activeView === 'project') renderProject();
  if (activeView === 'settings') renderSettings();
  if (activeView === 'network') renderNetwork();
  if (activeView === 'schedule') renderLoadSchedule();
  if (activeView === 'diagram' && window.Diagram) Diagram.render();
  if (window.History) History.mark();
}
const setView = initTabs(v => { activeView = v; closeAddMenu(); renderActive(); });

/* ===================================================================
   PROJECT VIEW
   =================================================================== */
function renderProject() {
  const c = $('#projectFields'); c.innerHTML = '';
  const p = state.project;
  const defs = [
    ['client', 'Client'], ['projectName', 'Project Name'], ['projectNo', 'Project Number'],
    ['title', 'Document Title'], ['preparedBy', 'Prepared By'], ['checkedBy', 'Checked By'],
    ['approvedBy', 'Approved By'], ['date', 'Date', 'date'], ['revision', 'Revision'],
  ];
  defs.forEach(([key, l, type]) => {
    c.appendChild(inputField(l, p[key], v => { p[key] = v; }, { type: type || 'text', field: 'project.' + key }));
  });
}

/* ===================================================================
   SETTINGS VIEW
   =================================================================== */
function renderSettings() {
  const c = $('#settingsFields'); c.innerHTML = '';
  const order = ['utility', 'mv-dist', 'transformer', 'generator', 'battery', 'ups', 'dist', 'load'];
  order.forEach(t => {
    c.appendChild(sectionTitle(TYPE_META[t].label));
    const g = el('div', { class: 'grid cols-2' });
    g.appendChild(inputField('Default Tag', (state.defaults[t] && state.defaults[t].tag) || '',
      v => { state.defaults[t].tag = v; withFocusPreserved('#settingsFields', renderSettings); },
      { field: 'settings.' + t + '.tag', placeholder: 'e.g. ' + TYPE_META[t].short + '-1' }));
    g.appendChild(inputField('Default Name', (state.defaults[t] && state.defaults[t].name) || TYPE_META[t].label,
      v => { state.defaults[t].name = v; withFocusPreserved('#settingsFields', renderSettings); },
      { field: 'settings.' + t + '.name' }));
    (TYPE_FIELDS[t] || []).forEach(def => {
      const cur = (state.defaults[t] && state.defaults[t][def.key] != null) ? state.defaults[t][def.key] : FIELD_DEFAULTS[t][def.key];
      if (def.type === 'select') {
        g.appendChild(selectField(def.label, cur, def.options,
          v => { state.defaults[t][def.key] = (typeof def.options[0] === 'number') ? parseFloat(v) : v; renderSettings(); },
          { field: 'settings.' + t + '.' + def.key }));
      } else {
        g.appendChild(inputField(def.label + (def.unit ? ' ' + def.unit : ''), cur,
          v => { state.defaults[t][def.key] = v; withFocusPreserved('#settingsFields', renderSettings); },
          { type: 'number', step: def.step || 'any', field: 'settings.' + t + '.' + def.key, hint: def.hint }));
      }
    });
    c.appendChild(g);
  });
}

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
  fillSelectOptions('#netFilterSystem', state.systems.map(s => [String(s.id), s.name]), networkFilters.system);
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
  const scen = currentScenario();
  if (networkFilters.feed) {
    const primOk2 = n.parentId != null && effActive(state.nodes, findNode(n.parentId), scen);
    const redOk2 = n.redundantParentId != null && effActive(state.nodes, findNode(n.redundantParentId), scen);
    const feedTxt = (n.parentId == null && n.redundantParentId == null) ? '\u2014'
      : primOk2 ? 'primary' : redOk2 ? 'redundant' : 'none';
    if (feedTxt !== networkFilters.feed) return false;
  }
  const primCount = state.nodes.filter(l => l.parentId === n.id).length;
  const redCount = state.nodes.filter(l => l.redundantParentId === n.id).length;
  const conn = connectedLoadCalc(state.nodes, n);
  const roll = nodeRollup(state.nodes, n, scen);
  const pf = nodePowerFactor(state.nodes, n, scen);
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

// Standard double-sheet copy icon used by every duplicate button.
const COPY_ICON = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">'
  + '<rect x="5.2" y="5.2" width="8.8" height="8.8" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.5"/>'
  + '<path d="M10.8 5.2V3.5A1.5 1.5 0 0 0 9.3 2H3.5A1.5 1.5 0 0 0 2 3.5v5.8A1.5 1.5 0 0 0 3.5 10.8h1.7" fill="none" stroke="currentColor" stroke-width="1.5"/>'
  + '</svg>';
function copyIconBtn(title, onClick) {
  const b = el('button', { class: 'iconbtn', title: title, html: COPY_ICON });
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}
// Reduce a set of selected ids to the "top-most" ones: drop any id that lies
// inside the subtree of another selected id (prevents exponential duplication).
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
  return effActive(state.nodes, node, currentScenario());
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
  const nameSpan = el('span', { style: 'font-weight:600;' });
  nameSpan.appendChild(el('span', {}, [n.name || '\u2014']));
  nameTd.appendChild(nameSpan);
  tr.appendChild(nameTd);

  const statusTd = el('td', { class: 'col-status' });
  statusTd.appendChild(el('span', { class: 'badge ' + (effective ? 'ok' : 'warn') }, [effective ? 'Active' : 'Inactive']));
  tr.appendChild(statusTd);

  tr.appendChild(el('td', { class: 'num col-rating' }, [ratingText(n)]));
  const v = nodeVoltageV(n);
  tr.appendChild(el('td', { class: 'num col-voltage' }, [v != null ? fmtVolts(v) + ' V' : '\u2014']));

  const scen = currentScenario();
  const prim = n.parentId != null ? findNode(n.parentId) : null;
  const red = n.redundantParentId != null ? findNode(n.redundantParentId) : null;
  tr.appendChild(supplyTD(prim, 'col-primary'));
  tr.appendChild(supplyTD(red, 'col-redundant'));

  const primOk = n.parentId != null && effActive(state.nodes, prim, scen);
  const redOk = n.redundantParentId != null && effActive(state.nodes, red, scen);
  const feedTxt = (n.parentId == null && n.redundantParentId == null) ? '\u2014'
    : primOk ? 'primary' : redOk ? 'redundant' : 'none';
  tr.appendChild(el('td', { class: 'num col-feed' }, [feedTxt]));

  const primCount = state.nodes.filter(l => l.parentId === n.id).length;
  const redCount = state.nodes.filter(l => l.redundantParentId === n.id).length;
  tr.appendChild(el('td', { class: 'num col-connloads' }, [primCount + '/' + redCount]));
  const conn = connectedLoadCalc(state.nodes, n); // installed kW of every load wired via primary OR redundant feed
  tr.appendChild(el('td', { class: 'num col-connkw' }, [fmt(conn.kW, 1)]));
  const roll = nodeRollup(state.nodes, n, scen);
  tr.appendChild(el('td', { class: 'num col-demandkva' }, [fmt(roll.activeKVA, 1)]));

  const pf = nodePowerFactor(state.nodes, n, scen);
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
    const dupBtn = copyIconBtn('Duplicate subtree', () => { duplicateNodeSubtree(n.id); renderActive(); showToast('Duplicated.', 'success'); });
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

  // Root the render at system groups (in creation order), then the
  // "Unassigned to system" group, then any orphan (parentless) nodes.
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
    tbody.appendChild(head);

    if (!collapsed) shown.forEach(r => { rendered++; tbody.appendChild(componentRow(r, ncols)); });
  });

  if (orphanRows.length) {
    const kept = orphanRows.filter(r => r.node && networkNodeMatches(r.node));
    if (kept.length) {
      const m = el('tr', { class: 'unassigned-marker' });
      m.appendChild(el('td', { colspan: ncols }, ['Unassigned']));
      tbody.appendChild(m);
      if (netSort) kept.sort((a, b) => networkSortCompare(a.node, b.node));
      else kept.sort((a, b) => ((a.node.order == null ? 1e9 : a.node.order)) - (b.node.order == null ? 1e9 : b.node.order));
      kept.forEach(r => { rendered++; tbody.appendChild(componentRow(r, ncols)); });
    }
  }

  if (state.nodes.length && rendered === 0) tbody.appendChild(noResultsRow(ncols));

  updateNetworkSortBar();

  const legend = $('#networkLegend'); legend.innerHTML = '';
  if (state.systems.length) {
    state.systems.forEach(s => {
      const item = el('span', { class: 'vl-item' });
      const sw = el('span', { class: 'vl-swatch' });
      sw.style.background = s.color;
      item.appendChild(sw);
      item.appendChild(document.createTextNode(s.name));
      legend.appendChild(item);
    });
  }
  updateNetworkSelectionUI();
  applyColumnVisibility('network', $('#networkTable'));
  stickFilterRow('#networkTable');
}

const NET_SORT_KEYS = {
  tag: { get: n => (n.tag || '').toLowerCase(), numeric: false, label: 'Tag' },
  name: { get: n => (n.name || '').toLowerCase(), numeric: false, label: 'Description' },
  rating: { get: n => nodeRatingKVA(n) || 0, numeric: true, label: 'Rating' },
  voltage: { get: n => nodeVoltageV(n) || 0, numeric: true, label: 'Voltage' },
  feed: { get: n => { const sc = currentScenario(); const pOk = n.parentId != null && effActive(state.nodes, findNode(n.parentId), sc); const rOk = n.redundantParentId != null && effActive(state.nodes, findNode(n.redundantParentId), sc); if (n.parentId == null && n.redundantParentId == null) return '\u2014'; return pOk ? 'primary' : rOk ? 'redundant' : 'none'; }, numeric: false, label: 'Active Feed' },
  connkw: { get: n => connectedLoadCalc(state.nodes, n).kW || 0, numeric: true, label: 'Connected kW' },
  demandkva: { get: n => nodeRollup(state.nodes, n, currentScenario()).activeKVA || 0, numeric: true, label: 'Demand kVA' },
  pf: { get: n => nodePowerFactor(state.nodes, n, currentScenario()) || 0, numeric: true, label: 'P.F.' },
  util: { get: n => nodeRollup(state.nodes, n, currentScenario()).utilizationPct || 0, numeric: true, label: 'Utilisation' },
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
  const mk = NET_SORT_KEYS[key];
  const dir = (!netSort || netSort.key !== key) ? 'asc' : (netSort.dir === 'asc' ? 'desc' : 'asc');
  netSort = { key, dir };
  renderNetwork();
}
function makePermanentOrder() {
  if (!netSort) return;
  commitDomOrder();
  showToast('Manual order updated to match the current sort.', 'success');
}
function cancelTempSort() {
  netSort = null;
  renderNetwork();
}
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
    if (activeView === 'network') types = types.filter(t => t !== 'load');       // no loads in Network tab
    if (activeView === 'schedule') types = types.filter(t => t === 'load');      // only loads in Load Schedule tab
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
    subtree.forEach(i => { selectedIds.delete(i); networkSelectedIds.delete(i); });
    if (editingId && subtree.has(editingId)) closeModal();
    renderActive();
    if (window.Diagram) Diagram.onNodesRemoved(subtree);
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
    doomed.forEach(i => { selectedIds.delete(i); networkSelectedIds.delete(i); });
    if (editingId && doomed.has(editingId)) closeModal();
    renderActive();
    if (window.Diagram) Diagram.onNodesRemoved(doomed);
    showToast('Deleted ' + targets.length + ' item' + (targets.length === 1 ? '' : 's') + '.', 'success');
  });
}

$('#btnAddComponent').addEventListener('click', (evt) => showAddTypeMenu(evt, { parentNode: null }));
$('#btnAddSchedule').addEventListener('click', (evt) => showAddTypeMenu(evt, { parentNode: null }));
$('#btnDoneAddAnother').addEventListener('click', () => {
  const cur = findNode(editingId);
  if (!cur) return;
  const copy = blankNode('load', state.nextId++, state.defaults);
  copy.parentId = cur.parentId;
  copy.redundantParentId = cur.redundantParentId;
  copy.activeFeed = cur.activeFeed;
  if (copy.parentId != null) {
    const p = findNode(copy.parentId);
    if (p) {
      const v = childVoltage(p.type, p);
      if (v != null && v !== '') copy.voltageV = v;
    }
  }
  state.nodes.push(copy);
  renderActive();
  openModal(copy.id);
});
$('#btnLoadExample').addEventListener('click', () => {
  state = loadExample();
  selectedIds = new Set();
  networkSelectedIds = new Set();
  collapsedGroups = new Set();
  collapsedSchedGroups = new Set();
  filters = { search: '', category: '', loadtype: '', v: '', pf: '', kw: '', df: '', kva: '', flc: '', primary: '', redundant: '', feed: '' };
  networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
  netSort = null; schedSort = null; netGroupBy = 'none';
  if (window.Diagram) Diagram.invalidateLayout();
  renderActive();
  showToast('Example project loaded.', 'success');
});

/* ---- network tab: selection, filters, systems ---- */
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
$('#btnToggleFilters').addEventListener('click', () => {
  schedFilterOpen = !schedFilterOpen;
  const bar = $('#schedFilterBar');
  if (bar) bar.style.display = schedFilterOpen ? '' : 'none';
});
$('#btnNetColumns').addEventListener('click', (e) => showColumnMenu(e, 'network', NETWORK_COLUMNS));
$('#btnSchedColumns').addEventListener('click', (e) => showColumnMenu(e, 'schedule', SCHEDULE_COLUMNS));
$('#filterGroup').addEventListener('change', (e) => { netGroupBy = e.target.value; renderLoadSchedule(); });
$('#btnMakePerm').addEventListener('click', makePermanentOrder);
$('#btnCancelSort').addEventListener('click', cancelTempSort);

function openSystems() {
  $('#systemsOverlay').classList.add('open');
  renderSystemsModal();
}
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
    nameIn.addEventListener('input', () => { s.name = nameIn.value; renderNetwork(); });
    const colIn = el('input', { type: 'color', value: s.color });
    colIn.addEventListener('input', () => { s.color = colIn.value; renderNetwork(); });
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
    renderSystemsModal();
    renderNetwork();
    showToast('System deleted.', 'success');
  });
}

/* ===================================================================
   MODAL EDITOR
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

// Ordered ids of the table rows the edited item belongs to: the Load Schedule
// table for loads, the Network table for components. DOM-derived so the arrows
// follow exactly what is visible (filters, temp sort, grouping, collapsed
// groups). Falls back to the full item list when the edited item is not in the
// visible rows (e.g. a just-added item hidden by a filter).
function modalNavIds() {
  const node = findNode(editingId);
  if (!node) return [];
  const isLoad = node.type === 'load';
  const ids = (isLoad ? $all('#schedBody tr[data-id]') : $all('#networkBody tr.component-row'))
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

// Read-only table of every node directly wired to the edited component:
// loads and downstream equipment whose primary or redundant feed is this node.
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
      v => { node[def.key] = (typeof def.options[0] === 'number') ? parseFloat(v) : v; renderModal(); },
      { field: def.key });
  }
  return inputField(labelText, node[def.key], v => updateNodeField(node, def.key, v),
    { type: 'number', step: def.step || 'any', field: def.key, hint: def.hint });
}

function updateNodeField(node, key, v) {
  node[key] = v;
  withFocusPreserved('#modal', renderModal);
}

function activeField(node) {
  const on = node.active !== false;
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, ['Active']));
  const row = el('label', { class: 'switch-row' });
  const inp = el('input', { type: 'checkbox' });
  inp.checked = on;
  inp.addEventListener('change', () => {
    node.active = inp.checked;
    renderModal();
  });
  const sw = el('span', { class: 'switch' });
  const txt = el('span', { style: 'font-size:12.5px;' }, [on ? 'Active' : 'Inactive']);
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
    renderModal();
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
      v => { node.activeFeed = v; renderModal(); }, { field: 'activeFeed', hint: '50/50 splits the single-count load between primary & redundant; each feed still sizes at 100%.' }));
  } else if (node.redundantParentId != null) {
    body.appendChild(selectField('Active feed', node.activeFeed, FEEDS,
      v => { node.activeFeed = v; renderModal(); }, { field: 'activeFeed', hint: 'The feed used for single-count building totals & category branding.' }));
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
  renderModal();
}

function buildComputed(body, node) {
  const scen = currentScenario();
  if (node.type === 'load') {
    const c = loadCalc(node);
    const cat = deriveCategory(state.nodes, node, scen);
    const bar = el('div', { class: 'resultsbar' });
    bar.appendChild(resultCard('Rated / Demand kVA', fmt(c.kva, 2) + ' / ' + fmt(c.demandKVA, 2)));
    bar.appendChild(resultCard('Demand kW', fmt(c.demandKW, 2)));
    bar.appendChild(resultCard('Full Load Current', fmt(c.flc, 1) + ' A'));
    bar.appendChild(resultCard('Category', categoryLabel[cat], '', 'badge ' + cat));
    body.appendChild(bar);
  } else {
    const r = nodeRollup(state.nodes, node, scen);
    const bar = el('div', { class: 'resultsbar' });
    bar.appendChild(resultCard('Rating', r.ratingKVA != null ? fmt(r.ratingKVA, 0) + ' kVA' : '\u2014'));
    bar.appendChild(resultCard('Sizing kVA', fmt(r.sizingKVA, 1)));
    bar.appendChild(resultCard('Active kVA', fmt(r.activeKVA, 1)));
    const pf = nodePowerFactor(state.nodes, node, scen);
    bar.appendChild(resultCard('Power Factor', pf != null ? fmt(pf, 2) : '\u2014'));
    const util = r.utilizationPct != null ? fmt(r.utilizationPct, 0) + '%' : '\u2014';
    bar.appendChild(resultCard('Utilisation', util, r.utilizationPct != null ? r.badge : ''));
    body.appendChild(bar);

    body.appendChild(sectionTitle('Connected loads by classification'));
    const groups = { critical: { count: 0, kW: 0, kVA: 0 }, essential: { count: 0, kW: 0, kVA: 0 }, 'non-essential': { count: 0, kW: 0, kVA: 0 } };
    passThroughLoads(state.nodes, node, scen).forEach(l => {
      const c = loadCalc(l);
      const ct = deriveCategory(state.nodes, l, scen);
      groups[ct].count++;
      groups[ct].kW += c.demandKW || 0;
      groups[ct].kVA += c.demandKVA || 0;
    });
    const clTable = el('table', { class: 'print-table', style: 'width:100%;' });
    const tHead = el('thead', {}, [el('tr', {}, [
      el('th', {}, ['Category']), el('th', {}, ['Count']), el('th', {}, ['Demand kW']), el('th', {}, ['Demand kVA']),
    ])]);
    clTable.appendChild(tHead);
    const tBody = el('tbody', {});
    ['critical', 'essential', 'non-essential'].forEach(ct => {
      const g = groups[ct];
      tBody.appendChild(el('tr', {}, [
        el('td', {}, [categoryLabel[ct]]),
        el('td', { class: 'num' }, [String(g.count)]),
        el('td', { class: 'num' }, [fmt(g.kW, 1)]),
        el('td', { class: 'num' }, [fmt(g.kVA, 1)]),
      ]));
    });
    clTable.appendChild(tBody);
    body.appendChild(clTable);
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
   LOAD SCHEDULE VIEW
   =================================================================== */
function buildFilterOptions() {
  const scen = currentScenario();
  const loads = state.nodes.filter(n => n.type === 'load');
  const cats = Array.from(new Set(loads.map(l => deriveCategory(state.nodes, l, scen))));
  const equip = state.nodes.filter(n => n.type !== 'load');
  const volts = Array.from(new Set(loads.map(l => l.voltageV).filter(v => v != null && v !== ''))).sort((a, b) => a - b);
  return { cats, equip, volts };
}

function filteredLoads() {
  const scen = currentScenario();
  const all = state.nodes.filter(n => n.type === 'load');
  return all.filter(l => {
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const text = ((l.name || '') + ' ' + (l.tag || '')).toLowerCase();
      if (!text.includes(q)) return false;
    }
    if (filters.category && deriveCategory(state.nodes, l, scen) !== filters.category) return false;
    if (filters.loadtype && (l.loadType || 'General House Loads') !== filters.loadtype) return false;
    const primary = l.parentId != null ? findNode(l.parentId) : null;
    const redundant = l.redundantParentId != null ? findNode(l.redundantParentId) : null;
    if (filters.primary && (!primary || primary.tag !== filters.primary)) return false;
    if (filters.redundant && (!redundant || redundant.tag !== filters.redundant)) return false;
    if (filters.v && String(l.voltageV) !== String(filters.v)) return false;
    const c = loadCalc(l);
    if (filters.pf && !fmt(c.pf, 2).toLowerCase().includes(filters.pf.toLowerCase())) return false;
    if (filters.kw) {
      const txt = l.ratedKW === '' ? '\u2013' : String(l.ratedKW);
      if (!txt.toLowerCase().includes(filters.kw.toLowerCase())) return false;
    }
    if (filters.df) {
      const txt = l.demandFactor === '' ? '\u2013' : String(l.demandFactor);
      if (!txt.toLowerCase().includes(filters.df.toLowerCase())) return false;
    }
    if (filters.kva && !fmt(c.kva, 1).toLowerCase().includes(filters.kva.toLowerCase())) return false;
    if (filters.flc && !fmt(c.flc, 1).toLowerCase().includes(filters.flc.toLowerCase())) return false;
    if (filters.feed) {
      const feed = servingFeed(l, scen);
      if ((feed || 'none') !== filters.feed) return false;
    }
    return true;
  });
}

function buildScheduleFilterRow() {
  const row = $('#schedColFilters'); if (!row) return;
  row.innerHTML = '';
  const { cats, equip, volts } = buildFilterOptions();
  const tags = equip.filter(e => e.tag).map(e => e.tag).sort();
  const setF = (k) => (v) => { filters[k] = v; withFocusPreserved('#schedColFilters', renderLoadSchedule); };
  row.appendChild(el('th', { class: 'noprint' }));
  row.appendChild(el('th', { class: 'col-num' }));
  row.appendChild(el('th', { class: 'col-tag' }));
  row.appendChild(el('th', { class: 'col-name' }));
  row.appendChild(makeFilterSelect('category', filters.category, cats.map(c => [c, categoryLabel[c]]), setF('category'), 'schedF.category'));
  row.appendChild(makeFilterSelect('loadtype', filters.loadtype, LOAD_TYPES.map(t => [t, t]), setF('loadtype'), 'schedF.loadtype'));
  row.appendChild(makeFilterSelect('v', filters.v, volts.map(v => [String(v), v + ' V']), setF('v'), 'schedF.v'));
  row.appendChild(makeFilterText('pf', filters.pf, 'PF', setF('pf'), 'schedF.pf'));
  row.appendChild(makeFilterText('kw', filters.kw, 'kW', setF('kw'), 'schedF.kw'));
  row.appendChild(makeFilterText('df', filters.df, 'DF', setF('df'), 'schedF.df'));
  row.appendChild(makeFilterText('kva', filters.kva, 'kVA', setF('kva'), 'schedF.kva'));
  row.appendChild(makeFilterText('flc', filters.flc, 'FLC', setF('flc'), 'schedF.flc'));
  row.appendChild(makeFilterSelect('primary', filters.primary, tags.map(t => [t, t]), setF('primary'), 'schedF.primary'));
  row.appendChild(makeFilterSelect('redundant', filters.redundant, tags.map(t => [t, t]), setF('redundant'), 'schedF.redundant'));
  row.appendChild(makeFilterSelect('feed', filters.feed, [['primary', 'primary'], ['redundant', 'redundant'], ['50-50', '50-50'], ['none', 'none']], setF('feed'), 'schedF.feed'));
  row.appendChild(el('th', {}));
}

const SCHED_SORT_KEYS = {
  tag: { get: l => (l.tag || '').toLowerCase(), numeric: false },
  name: { get: l => (l.name || '').toLowerCase(), numeric: false },
  category: { get: l => deriveCategory(state.nodes, l, currentScenario()), numeric: false },
  loadtype: { get: l => (l.loadType || 'General House Loads').toLowerCase(), numeric: false },
  v: { get: l => num(l.voltageV), numeric: true },
  pf: { get: l => loadCalc(l).pf || 0, numeric: true },
  kw: { get: l => num(l.ratedKW), numeric: true },
  df: { get: l => num(l.demandFactor), numeric: true },
  kva: { get: l => loadCalc(l).kva || 0, numeric: true },
  flc: { get: l => loadCalc(l).flc || 0, numeric: true },
  feed: { get: l => servingFeed(l, currentScenario()) || 'none', numeric: false },
};

function schedSortCompare(a, b) {
  if (!schedSort) return 0;
  const mk = SCHED_SORT_KEYS[schedSort.key];
  if (!mk) return 0;
  const av = mk.get(a), bv = mk.get(b);
  const dir = schedSort.dir === 'desc' ? -1 : 1;
  if (mk.numeric) return ((av || 0) - (bv || 0)) * dir;
  return String(av).localeCompare(String(bv)) * dir;
}

function applySchedSort(key) {
  const mk = SCHED_SORT_KEYS[key];
  if (!mk) return;
  if (!schedSort || schedSort.key !== key) schedSort = { key, dir: 'asc' };
  else if (schedSort.dir === 'asc') schedSort.dir = 'desc';
  else schedSort = null;
  renderLoadSchedule();
}

function schedSortInd(th, i, map) {
  $all('.sort-ind', th).forEach(s => s.remove());
  if (!schedSort || map[i] !== schedSort.key) return;
  const ind = el('span', { class: 'sort-ind' }, [schedSort.dir === 'asc' ? '\u25B2' : '\u25BC']);
  th.appendChild(ind);
}

function attachScheduleHeaderSort() {
  const ths = $all('#schedTable thead tr:first-child th');
  const map = { 2: 'tag', 3: 'name', 4: 'category', 5: 'loadtype', 6: 'v', 7: 'pf', 8: 'kw', 9: 'df', 10: 'kva', 11: 'flc', 14: 'feed' };
  ths.forEach((th, i) => {
    if (!map[i]) return;
    th.style.cursor = 'pointer';
    th.title = 'Click to sort';
    th.addEventListener('click', () => applySchedSort(map[i]));
  });
}

function renderLoadSchedule() {
  const scen = currentScenario();
  buildScheduleFilterRow();
  const grpSel = $('#filterGroup');
  if (grpSel) grpSel.value = netGroupBy;

  const allLoads = state.nodes.filter(n => n.type === 'load');
  const loads = filteredLoads();
  if (schedSort) loads.sort(schedSortCompare);
  const body = $('#schedBody'); body.innerHTML = '';
  $('#emptyState').style.display = allLoads.length ? 'none' : 'block';
  $('#schedTable').style.display = allLoads.length ? 'table' : 'none';

  const liveIds = new Set(loads.map(l => l.id));
  Array.from(selectedIds).forEach(id => { if (!liveIds.has(id)) selectedIds.delete(id); });

  const renderLoadRow = (l, idx) => {
    const c = loadCalc(l);
    const cat = deriveCategory(state.nodes, l, scen);
    const effective = nodeEffectiveActive(l);
    const tr = el('tr');
    tr.dataset.id = String(l.id);
    if (!effective) tr.classList.add('row-inactive');
    const selTd = el('td', { class: 'noprint' });
    const cb = el('input', { type: 'checkbox' });
    cb.checked = selectedIds.has(l.id);
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => { if (cb.checked) selectedIds.add(l.id); else selectedIds.delete(l.id); updateSelectionUI(); });
    selTd.appendChild(cb); tr.appendChild(selTd);

    tr.appendChild(el('td', { class: 'col-num' }, [String(idx + 1)]));
    tr.appendChild(el('td', { class: 'col-tag' }, [l.tag || '\u2014']));
    const nameTd = el('td', { class: 'col-name' });
    nameTd.appendChild(el('span', {}, [l.name || '\u2014']));
    if (!effective) nameTd.appendChild(el('span', { class: 'badge warn', style: 'margin-left:6px;' }, ['Inactive']));
    tr.appendChild(nameTd);
    tr.appendChild(el('td', { class: 'col-category' }, [el('span', { class: 'badge ' + cat }, [categoryLabel[cat]])]));
    tr.appendChild(el('td', { class: 'col-loadtype' }, [l.loadType || 'General House Loads']));
    tr.appendChild(el('td', { class: 'num col-v' }, [String(l.voltageV || '\u2013')]));
    tr.appendChild(el('td', { class: 'num col-pf' }, [fmt(c.pf, 2)]));
    tr.appendChild(el('td', { class: 'num col-kw' }, [l.ratedKW === '' ? '\u2013' : String(l.ratedKW)]));
    tr.appendChild(el('td', { class: 'num col-df' }, [l.demandFactor === '' ? '\u2013' : String(l.demandFactor)]));
    tr.appendChild(el('td', { class: 'num col-kva' }, [fmt(c.kva, 1)]));
    tr.appendChild(el('td', { class: 'num col-flc' }, [fmt(c.flc, 1)]));
    tr.appendChild(supplyTD(l.parentId != null ? findNode(l.parentId) : null, 'col-primary'));
    tr.appendChild(supplyTD(l.redundantParentId != null ? findNode(l.redundantParentId) : null, 'col-redundant'));
    const feed = servingFeed(l, scen);
    tr.appendChild(el('td', { class: 'num col-feed' }, [feed ? feed : el('span', { class: 'badge fail' }, ['none'])]));
    const acts = el('td', { class: 'noprint' });
    const actWrap = el('div', { class: 'rowactions' });
    const dup = copyIconBtn('Duplicate', () => duplicateLoad(l.id));
    const del = el('button', { class: 'iconbtn danger', title: 'Delete' }, ['\u2715']);
    del.addEventListener('click', (e) => { e.stopPropagation(); deleteNode(l.id); });
    actWrap.appendChild(dup); actWrap.appendChild(del); acts.appendChild(actWrap);
    tr.appendChild(acts);
    tr.addEventListener('click', () => openModal(l.id));
    return tr;
  };

  const ncols = 16;
  if (grpSel && netGroupBy !== 'none') {
    const groups = {};
    loads.forEach(l => {
      const key = l.systemId == null ? '' : String(l.systemId);
      (groups[key] = groups[key] || []).push(l);
    });
    Object.keys(groups).sort((a, b) => (a === '' ? 1 : 0) - (b === '' ? 1 : 0)).forEach(key => {
      const list = groups[key];
      const sys = key === '' ? null : systemById(parseInt(key, 10));
      const collapsed = collapsedSchedGroups.has(key);
      const head = el('tr', { class: 'system-group-header' });
      const headTd = el('td', { colspan: ncols });
      const caret = el('span', { class: 'collapse-caret' }, [collapsed ? '\u25B8' : '\u25BE']);
      const sw = el('span', { class: 'vl-swatch' }); sw.style.background = sys ? sys.color : '#5b6675';
      const nameSpan = el('span', { style: 'font-weight:800;font-size:12px;letter-spacing:.4px;text-transform:uppercase;padding-left:8px;' }, [sys ? sys.name : 'Unassigned']);
      caret.addEventListener('click', (e) => { e.stopPropagation(); if (collapsedSchedGroups.has(key)) collapsedSchedGroups.delete(key); else collapsedSchedGroups.add(key); renderLoadSchedule(); });
      headTd.appendChild(caret); headTd.appendChild(sw); headTd.appendChild(nameSpan);
      head.addEventListener('click', () => { if (collapsedSchedGroups.has(key)) collapsedSchedGroups.delete(key); else collapsedSchedGroups.add(key); renderLoadSchedule(); });
      head.appendChild(headTd);
      body.appendChild(head);
      let idx = 0;
      if (!collapsed) list.forEach(l => { body.appendChild(renderLoadRow(l, idx)); idx++; });
    });
  } else {
    loads.forEach((l, idx) => body.appendChild(renderLoadRow(l, idx)));
  }
  if (allLoads.length && !loads.length) body.appendChild(noResultsRow(ncols));
  updateSelectionUI();
  // update sort indicators
  const ths = $all('#schedTable thead tr:first-child th');
  const map = { 2: 'tag', 3: 'name', 4: 'category', 5: 'loadtype', 6: 'v', 7: 'pf', 8: 'kw', 9: 'df', 10: 'kva', 11: 'flc', 14: 'feed' };
  ths.forEach((th, i) => schedSortInd(th, i, map));
  applyColumnVisibility('schedule', $('#schedTable'));
  stickFilterRow('#schedTable');
}

function fillSelectOptions(sel, pairs, current) {
  const s = $(sel);
  const curVal = current;
  s.innerHTML = '';
  const all = el('option', { value: '' }, ['All']);
  all.selected = !curVal;
  s.appendChild(all);
  pairs.forEach(([v, txt]) => {
    const o = el('option', { value: v }, [txt]);
    if (String(v) === String(curVal)) o.selected = true;
    s.appendChild(o);
  });
}

function updateSelectionUI() {
  const n = selectedIds.size;
  const sels = $all('#schedBody tr[data-id]').length;
  const selectAllCb = $('#selectAllCb');
  if (selectAllCb) {
    selectAllCb.checked = sels > 0 && n === sels;
    selectAllCb.indeterminate = n > 0 && n < sels;
  }
  const info = $('#selectionInfo'), clearBtn = $('#btnDeleteSel');
  const dupBtn = $('#btnDuplicateSel'), reassignBtn = $('#btnReassignSel');
  if (info) { info.style.display = n ? '' : 'none'; info.textContent = n + ' selected'; }
  if (clearBtn) clearBtn.style.display = n ? '' : 'none';
  if (dupBtn) dupBtn.style.display = n ? '' : 'none';
  if (reassignBtn) reassignBtn.style.display = n ? '' : 'none';
}

function duplicateLoad(id) {
  const src = findNode(id); if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = state.nextId++;
  copy.name = src.name + ' (copy)';
  copy.order = null;
  if (copy.active == null) copy.active = true;
  state.nodes.push(copy);
  renderLoadSchedule();
}

$('#btnDeleteSel').addEventListener('click', () => deleteSelectedNodes(selectedIds, n => n.type === 'load'));
$('#btnDuplicateSel').addEventListener('click', () => {
  const top = topLevelSelection(selectedIds);
  const sel = state.nodes.filter(l => l.type === 'load' && top.indexOf(l.id) !== -1);
  if (!sel.length) return;
  sel.forEach(src => {
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = state.nextId++;
    copy.name = src.name + ' (copy)';
    copy.order = null;
    if (copy.active == null) copy.active = true;
    state.nodes.push(copy);
  });
  renderLoadSchedule();
  showToast('Duplicated ' + sel.length + ' load' + (sel.length === 1 ? '' : 's') + '.', 'success');
});

$('#selectAllCb').addEventListener('change', (e) => {
  const loads = filteredLoads();
  if (e.target.checked) loads.forEach(l => selectedIds.add(l.id));
  else selectedIds.clear();
  renderLoadSchedule();
});
$('#filterSearch').addEventListener('input', (e) => { filters.search = e.target.value; renderLoadSchedule(); });
$('#btnResetFilters').addEventListener('click', () => {
  filters = { search: '', category: '', loadtype: '', v: '', pf: '', kw: '', df: '', kva: '', flc: '', primary: '', redundant: '', feed: '' };
  $('#filterSearch').value = '';
  renderLoadSchedule();
});

/* ---- bulk reassign ---- */
$('#btnReassignSel').addEventListener('click', openReassign);
$('#reassignClose').addEventListener('click', closeReassign);
$('#reassignCancel').addEventListener('click', closeReassign);
$('#reassignOverlay').addEventListener('click', (e) => { if (e.target.id === 'reassignOverlay') closeReassign(); });

function openReassign() {
  const sel = state.nodes.filter(l => l.type === 'load' && selectedIds.has(l.id));
  if (!sel.length) return;
  $('#reassignCount').textContent = 'Apply to ' + sel.length + ' selected load(s).';
  const c = $('#reassignFields'); c.innerHTML = '';

  const equip = state.nodes.filter(n => n.type !== 'load');
  const opts = equip.map(p => ({ id: p.id, label: parentOptionLabel(p) }));
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, ['Primary supply']));
  wrap.appendChild(supplyCombo('raPrimary', '', opts, '(leave unchanged)'));
  c.appendChild(wrap);

  const wr = el('div', { class: 'field' });
  wr.appendChild(el('label', {}, ['Redundant supply']));
  wr.appendChild(supplyCombo('raRedundant', '', opts, 'None'));
  c.appendChild(wr);

  const wa = el('div', { class: 'field' });
  wa.appendChild(el('label', {}, ['Active feed']));
  const actSel = el('select', { id: 'raActive' });
  actSel.appendChild(el('option', { value: 'primary' }, ['primary']));
  actSel.appendChild(el('option', { value: 'redundant' }, ['redundant']));
  actSel.appendChild(el('option', { value: '50-50' }, ['50-50']));
  wa.appendChild(actSel);
  c.appendChild(wa);

  window._raSel = sel;
  $('#reassignOverlay').classList.add('open');
}
function closeReassign() { $('#reassignOverlay').classList.remove('open'); window._raSel = null; }
$('#reassignApply').addEventListener('click', () => {
  const sel = state.nodes.filter(l => l.type === 'load' && selectedIds.has(l.id));
  if (!sel.length) return;
  const pv = $('#raPrimary').value;
  const rv = $('#raRedundant').value;
  const av = $('#raActive').value;
  let ok = true;
  sel.forEach(l => {
    if (pv !== '') { l.parentId = parseInt(pv, 10); }
    if (rv !== '') {
      const rid = parseInt(rv, 10);
      if (rid === l.parentId) { showToast('Redundant equals primary for at least one load \u2014 change skipped.', 'error'); l.redundantParentId = null; }
      else l.redundantParentId = rid;
    }
    l.activeFeed = av;
    if (av === 'redundant' && l.redundantParentId == null) ok = false;
  });
  closeReassign();
  renderActive();
  if (!ok) showToast('Some loads have no redundant supply \u2014 they are now excluded from totals until one is set.', 'warn', 6000);
  else showToast('Reassigned ' + sel.length + ' load(s).', 'success');
});

/* ===================================================================
   IMPORT / EXPORT JSON
   =================================================================== */

// Bring a loaded/restored state up to the current shape: fills in every
// field this tool relies on (diagram geometry, systems, defaults, feeds)
// regardless of whether the source was our own export, a Capacity Planner
// export, or an older/partial autosave.
function normalizeState() {
  if (!state.project) state.project = defaultState().project;
  else state.project = Object.assign(defaultState().project, state.project);
  if (!Array.isArray(state.nodes)) state.nodes = [];
  state.nextId = Math.max(1, ...state.nodes.map(x => (x.id || 0) + 1));
  if (!Array.isArray(state.systems)) state.systems = [];
  if (state.nextSystemId == null || !(state.nextSystemId > 0)) {
    state.nextSystemId = Math.max(1, ...state.systems.map(s => (s.id || 0) + 1));
  }
  state.nodes.forEach(n => {
    if (n.activeFeed == null) n.activeFeed = 'primary';
    if (FEEDS.indexOf(n.activeFeed) < 0) n.activeFeed = 'primary';
    if (n.active == null) n.active = true;
    if (n.order == null) n.order = null;
    if (n.systemId == null) n.systemId = null;
    if ((n.type === 'generator' || n.type === 'battery' || n.type === 'utility') && n.parentId != null) n.parentId = null;
    if (n.type === 'load' && !n.loadType) n.loadType = 'General House Loads';
    if (n.x === undefined) n.x = null;
    if (n.y === undefined) n.y = null;
    if (n.labelDx === undefined) n.labelDx = null;
    if (n.labelDy === undefined) n.labelDy = null;
    if (n.showFields === undefined) n.showFields = null;
    if (n.busLen === undefined) n.busLen = null;
  });
  const defs = defaultsCopy();
  Object.keys(FIELD_DEFAULTS).forEach(t => {
    defs[t] = Object.assign({}, FIELD_DEFAULTS[t], (state.defaults && state.defaults[t]) || {});
  });
  state.defaults = defs;
  if (!state.columnPrefs || typeof state.columnPrefs !== 'object') state.columnPrefs = {};
  // Scenarios are not used by this tool, but kept as empty/nullable shapes so
  // files can round-trip with the Capacity Planner.
  if (!Array.isArray(state.scenarios)) state.scenarios = [];
  if (state.activeScenarioId === undefined) state.activeScenarioId = null;
  if (state.nextScenarioId == null || !(state.nextScenarioId > 0)) state.nextScenarioId = 1;
  const dd = defaultState().diagram;
  state.diagram = Object.assign({}, dd, state.diagram || {});
}

function resetAllViewState() {
  selectedIds = new Set();
  networkSelectedIds = new Set();
  collapsedGroups = new Set();
  collapsedSchedGroups = new Set();
  filters = { search: '', category: '', loadtype: '', v: '', pf: '', kw: '', df: '', kva: '', flc: '', primary: '', redundant: '', feed: '' };
  networkFilters = { search: '', type: '', system: '', status: '', voltage: '', primary: '', redundant: '', feed: '', rating: '', connloads: '', connkw: '', demandkva: '', pf: '', util: '' };
  netSort = null; schedSort = null; netGroupBy = 'none';
}

$('#btnNewProject').addEventListener('click', () => { if (window.History) History.reset(); });

$('#btnExport').addEventListener('click', () => {
  try {
    const out = { tool: 'network-diagram', version: 1, state: state };
    const name = state.project.projectNo || state.project.projectName || 'network-diagram';
    downloadJSON(name, out);
    showToast('Project exported.', 'success');
  } catch (err) {
    console.error('JSON export failed:', err);
    showToast('Export JSON failed: ' + err.message + ' \u2014 if you are viewing this inside an embedded preview, downloads are usually blocked there; open this HTML file directly in your browser instead.', 'error', 8000);
  }
});
// Secondary export that stamps the Capacity Planner's own tool tag + adds
// the scenario fields it expects, so that tool's importer will accept the
// file unmodified.
const btnExportCP = $('#btnExportCP');
if (btnExportCP) btnExportCP.addEventListener('click', () => {
  try {
    const cpState = JSON.parse(JSON.stringify(state));
    if (!Array.isArray(cpState.scenarios)) cpState.scenarios = [];
    if (cpState.activeScenarioId === undefined) cpState.activeScenarioId = null;
    if (!cpState.nextScenarioId) cpState.nextScenarioId = 1;
    const out = { tool: 'capacity-planner', version: 2, state: cpState };
    const name = (state.project.projectNo || state.project.projectName || 'network-diagram') + '-cp';
    downloadJSON(name, out);
    showToast('Exported for Capacity Planner.', 'success');
  } catch (err) {
    console.error('CP export failed:', err);
    showToast('Export failed: ' + err.message, 'error', 6000);
  }
});
$('#btnImport').addEventListener('click', () => $('#filein').click());
$('#filein').addEventListener('change', (e) => {
  importJSONFile($('#filein'), {
    validate(data) {
      if (!data || (data.tool !== 'network-diagram' && data.tool !== 'capacity-planner')) throw new Error('wrong tool');
      if (!data.state || !Array.isArray(data.state.nodes)) throw new Error('missing fields');
    },
    onLoaded(data) {
      const fromCP = data.tool === 'capacity-planner';
      state = data.state;
      normalizeState();
      resetAllViewState();
      renderActive();
      if (window.Diagram) {
        if (fromCP || !state.diagram.laidOut) { Diagram.relayoutAll(); state.diagram.laidOut = true; }
        Diagram.render();
      }
      showToast(fromCP ? 'Capacity Planner project imported and laid out.' : 'Project loaded.', 'success');
    },
  });
});

/* ===================================================================
   PDF EXPORT
   =================================================================== */
function coverSectionHTML() {
  const p = state.project;
  const rows = [
    ['Client', p.client], ['Project', p.projectName], ['Project No.', p.projectNo],
    ['Revision', p.revision], ['Date', p.date], ['Prepared by', p.preparedBy],
    ['Checked by', p.checkedBy], ['Approved by', p.approvedBy],
  ];
  return '<section class="print-page">' +
    '<div class="cover-title">' + escapeHtml(p.title || 'Network Diagram') + '</div>' +
    '<table class="print-kv-table">' +
      rows.map(r => '<tr><th>' + escapeHtml(r[0]) + '</th><td>' + escapeHtml(pv(r[1])) + '</td></tr>').join('') +
    '</table></section>';
}

function equipmentSectionHTML() {
  const rows = state.nodes.filter(n => n.type !== 'load').sort((a, b) => a.id - b.id);
  const tbody = rows.length ? rows.map(n => {
    const r = nodeRollup(state.nodes, n, currentScenario());
    return '<tr>' +
      '<td>' + escapeHtml(TYPE_META[n.type].label) + '</td>' +
      '<td>' + escapeHtml(pv(n.tag)) + '</td>' +
      '<td>' + escapeHtml(pv(n.name)) + '</td>' +
      '<td>' + fmt(r.ratingKVA, 0) + '</td>' +
      '<td>' + fmt(r.sizingKVA, 1) + '</td>' +
      '<td>' + fmt(r.activeKVA, 1) + '</td>' +
      '<td>' + (r.utilizationPct != null ? fmt(r.utilizationPct, 0) + '%' : '\u2013') + '</td>' +
    '</tr>';
  }).join('') : '<tr><td colspan="7">No equipment.</td></tr>';
  return '<section class="print-page">' +
    '<h2 class="print-page-title">Equipment Schedule</h2>' +
    '<table class="print-table"><thead><tr><th>Type</th><th>Tag</th><th>Name</th><th>Rating kVA</th><th>Sizing kVA</th><th>Active kVA</th><th>Utilisation</th></tr></thead><tbody>' + tbody + '</tbody></table>' +
    '</section>';
}

function loadSectionHTML() {
  const scen = currentScenario();
  const loads = state.nodes.filter(n => n.type === 'load');
  const tbody = loads.length ? loads.map(l => {
    const c = loadCalc(l);
    const cat = deriveCategory(state.nodes, l, scen);
    const prim = l.parentId != null ? findNode(l.parentId) : null;
    const red = l.redundantParentId != null ? findNode(l.redundantParentId) : null;
    const feed = servingFeed(l, scen);
    return '<tr>' +
      '<td>' + escapeHtml(pv(l.tag)) + '</td>' +
      '<td>' + escapeHtml(pv(l.name)) + '</td>' +
      '<td>' + escapeHtml(categoryLabel[cat]) + '</td>' +
      '<td>' + escapeHtml(pv(l.loadType || 'General House Loads')) + '</td>' +
      '<td>' + escapeHtml(pv(l.voltageV)) + '</td>' +
      '<td>' + (c.pf != null ? c.pf : '\u2013') + '</td>' +
      '<td>' + (l.ratedKW === '' ? '\u2013' : l.ratedKW) + '</td>' +
      '<td>' + (l.demandFactor === '' ? '\u2013' : l.demandFactor) + '</td>' +
      '<td>' + fmt(c.kva, 1) + '</td>' +
      '<td>' + fmt(c.flc, 1) + '</td>' +
      '<td>' + escapeHtml(pv(prim ? prim.tag : '\u2013')) + '</td>' +
      '<td>' + escapeHtml(pv(red ? red.tag : '\u2013')) + '</td>' +
      '<td>' + escapeHtml(feed || 'none') + '</td>' +
      (nodeEffectiveActive(l) ? '<td>Active</td>' : '<td>Inactive</td>') +
    '</tr>';
  }).join('') : '<tr><td colspan="14">No loads.</td></tr>';
  return '<section class="print-page">' +
    '<h2 class="print-page-title">Load Schedule</h2>' +
    '<table class="print-table"><thead><tr><th>Tag</th><th>Name</th><th>Category</th><th>Load Type</th><th>V</th><th>PF</th><th>kW</th><th>DF</th><th>kVA</th><th>FLC (A)</th><th>Primary</th><th>Redundant</th><th>Active</th><th>Status</th></tr></thead><tbody>' + tbody + '</tbody></table>' +
    '</section>';
}

$('#btnPdf').addEventListener('click', () => $('#pdfOptionsOverlay').classList.add('open'));
function closePdfOptions() { $('#pdfOptionsOverlay').classList.remove('open'); }
$('#pdfOptionsClose').addEventListener('click', closePdfOptions);
$('#pdfOptionsCancel').addEventListener('click', closePdfOptions);
$('#pdfOptionsOverlay').addEventListener('click', (e) => { if (e.target.id === 'pdfOptionsOverlay') closePdfOptions(); });
$('#pdfOptionsGenerate').addEventListener('click', () => {
  const opts = {
    cover: $('#optCover').checked,
    equip: $('#optEquip').checked, loads: $('#optLoads').checked,
    diagram: $('#optDiagram') ? $('#optDiagram').checked : false,
  };
  if (!opts.cover && !opts.equip && !opts.loads && !opts.diagram) {
    showToast('Select at least one section to include.', 'error'); return;
  }
  closePdfOptions();
  const sections = [];
  if (opts.cover) sections.push(coverSectionHTML());
  if (opts.equip) sections.push(equipmentSectionHTML());
  if (opts.loads) sections.push(loadSectionHTML());
  if (opts.diagram && window.Diagram) sections.push(Diagram.sheetSectionHTML());
  try { runPrint(assembleSections(sections)); }
  catch (err) { console.error('PDF export failed:', err); showToast('Export PDF failed: ' + err.message, 'error', 6000); }
});

/* ===================================================================
   UNDO / REDO KEYBOARD SHORTCUTS
   =================================================================== */
document.addEventListener('keydown', (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod) return;
  const tag = (document.activeElement && document.activeElement.tagName) || '';
  const inDiagram = activeView === 'diagram';
  if (!inDiagram && (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA')) return;
  if (e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); if (window.History) History.undo(); }
  else if ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y') { e.preventDefault(); if (window.History) History.redo(); }
});

/* ===================================================================
   INIT
   =================================================================== */
initEmbeddedPreviewBanner();
attachNetworkHeaderSort();
attachScheduleHeaderSort();
if (window.History) History.init();
if (window.Diagram) Diagram.init();
setView(activeView);