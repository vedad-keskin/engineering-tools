/* ===================================================================
   APP STATE
   =================================================================== */
function defaultState() {
  return {
    project: {
      client: '', projectName: '', projectNo: '', title: 'LV Cable Sizing Calculation',
      preparedBy: '', checkedBy: '', approvedBy: '', date: new Date().toISOString().slice(0,10),
      revision: 'A', code: 'IEC 60364',
    },
    general: {
      site: { maxOutdoorTemp: 38, maxGroundTemp: 30, maxIndoorTemp: 35, soilResistivity: 2.5,
               insulationType: 'XLPE', phaseVoltage: 400, phaseNeutralVoltage: 230 },
      bunched: {
        indoor:  { maxLayers: 2, installation: 'Perforated cable tray', maxGrouped: 5 },
        outdoor: { maxLayers: 2, installation: 'Perforated cable tray', maxGrouped: 5 },
      },
      nonBunched: {
        indoor:  { maxLayers: 2, installation: 'Cable ladder', spacing: 'Touching', maxPerLayer: 5 },
        outdoor: { maxLayers: 1, installation: 'Cable ladder', spacing: 'Touching', maxPerLayer: 5 },
      },
      underground: { maxCables: 3, installation: 'In duct', spacing: 'Touching' },
    },
    rows: [],
    nextId: 1,
  };
}

function blankRow(id) {
  return {
    id, panel: '', no: id, loadName: '',
    ratedLoadKW: '', voltage: 400, pf: 0.85, isMotorLoad: 'No', startingPF: 0.35, startingCurrentRatio: 6, efficiencyPct: 95,
    feederRatingCB: '', pdTripSetting: '', pdTripType: '', pdTripSettingType: 'Fixed',
    place: 'Air', area: 'Outdoor',
    conductor: 'CU', insulation: 'XLPE', armour: 'SWA', outerSheath: 'PVC',
    noRuns: 1, noCores: 4, cableSize: '',
    allowedVDPct: 5, cableLength: '',
    tripCurve: 'C',
  };
}

let state = defaultState();
let editingId = null;
let activeView = 'project';
let selectedIds = new Set();

function findRow(id) { return state.rows.find(r => r.id === id); }

/* ===================================================================
   TAB NAVIGATION
   =================================================================== */
function renderActive() {
  if (activeView === 'project') renderProject();
  if (activeView === 'general') renderGeneral();
  if (activeView === 'schedule') renderSchedule();
}
const setView = initTabs(v => { activeView = v; renderActive(); });

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
  defs.forEach(([key, label, type]) => {
    c.appendChild(inputField(label, p[key], v => { p[key] = v; }, { type: type || 'text' }));
  });
  const codeField = inputField('Design Code', p.code, () => {}, { readonly: true, hint: 'This calculation follows the same basis as the source workbook.' });
  c.appendChild(codeField);
}

/* ===================================================================
   GENERAL VIEW
   =================================================================== */
function generalChanged() {
  withFocusPreserved('#view-general', renderGeneral);
  renderSchedule();
}

function renderGeneral() {
  const s = state.general.site;
  const siteC = $('#siteFields'); siteC.innerHTML = '';
  siteC.appendChild(inputField('Max. Outdoor Temperature (\u00b0C)', s.maxOutdoorTemp, v => { s.maxOutdoorTemp = v; generalChanged(); }, { type: 'number', field: 'site.maxOutdoorTemp' }));
  siteC.appendChild(inputField('Max. Ground Temperature (\u00b0C)', s.maxGroundTemp, v => { s.maxGroundTemp = v; generalChanged(); }, { type: 'number', field: 'site.maxGroundTemp' }));
  siteC.appendChild(inputField('Max. Indoor Temperature (\u00b0C)', s.maxIndoorTemp, v => { s.maxIndoorTemp = v; generalChanged(); }, { type: 'number', field: 'site.maxIndoorTemp' }));
  siteC.appendChild(inputField('Soil Thermal Resistivity (\u00b0C\u00b7m/W)', s.soilResistivity, v => { s.soilResistivity = v; generalChanged(); }, { type: 'number', step: '0.1', field: 'site.soilResistivity' }));
  siteC.appendChild(selectField('Cable Insulation Type', s.insulationType, ENUMS.insulation, v => { s.insulationType = v; generalChanged(); }, { field: 'site.insulationType' }));
  siteC.appendChild(inputField('Phase-Phase Voltage (V)', s.phaseVoltage, v => { s.phaseVoltage = v; generalChanged(); }, { type: 'number', field: 'site.phaseVoltage' }));
  siteC.appendChild(inputField('Phase-Neutral Voltage (V)', s.phaseNeutralVoltage, v => { s.phaseNeutralVoltage = v; generalChanged(); }, { type: 'number', field: 'site.phaseNeutralVoltage' }));

  const gd = computeGeneral(state.general);

  // Bunched
  const bC = $('#bunchedFields'); bC.innerHTML = '';
  ['indoor', 'outdoor'].forEach(zone => {
    const cfg = state.general.bunched[zone];
    bC.appendChild(el('div', { class: 'field', style: 'grid-column:1/-1;' }, [
      el('label', { style: 'font-size:12px;color:var(--accent-dark);' }, [zone === 'indoor' ? 'a. Indoor' : 'b. Outdoor']),
    ]));
    bC.appendChild(inputField('Max. Number of Layers', cfg.maxLayers, v => { cfg.maxLayers = v; generalChanged(); }, { type: 'number', field: 'bunched.' + zone + '.maxLayers' }));
    bC.appendChild(selectField('Cables Installation', cfg.installation, ENUMS.airInstallationBunched, v => { cfg.installation = v; generalChanged(); }, { field: 'bunched.' + zone + '.installation' }));
    bC.appendChild(inputField('Max. Number of Grouped / Bunched Cables', cfg.maxGrouped, v => { cfg.maxGrouped = v; generalChanged(); }, { type: 'number', field: 'bunched.' + zone + '.maxGrouped' }));
  });
  metricStrip('#bunchedDerate', [
    ['Indoor Ambient Factor', gd.bunched.indoor.ambient],
    ['Indoor Grouping Factor', gd.bunched.indoor.grouping],
    ['Outdoor Ambient Factor', gd.bunched.outdoor.ambient],
    ['Outdoor Grouping Factor', gd.bunched.outdoor.grouping],
    ['TOTAL (Ind./Out.)', gd.bunched.indoor.total + ' / ' + gd.bunched.outdoor.total, true],
  ]);

  // Non-bunched
  const nC = $('#nonBunchedFields'); nC.innerHTML = '';
  ['indoor', 'outdoor'].forEach(zone => {
    const cfg = state.general.nonBunched[zone];
    nC.appendChild(el('div', { class: 'field', style: 'grid-column:1/-1;' }, [
      el('label', { style: 'font-size:12px;color:var(--accent-dark);' }, [zone === 'indoor' ? 'a. Indoor' : 'b. Outdoor']),
    ]));
    nC.appendChild(inputField('Max. Number of Layers', cfg.maxLayers, v => { cfg.maxLayers = v; generalChanged(); }, { type: 'number', field: 'nonBunched.' + zone + '.maxLayers' }));
    nC.appendChild(selectField('Cables Installation', cfg.installation, ENUMS.airInstallationNonBunched, v => { cfg.installation = v; generalChanged(); }, { field: 'nonBunched.' + zone + '.installation' }));
    nC.appendChild(selectField('Cables Spacing Installation', cfg.spacing, ENUMS.spacing, v => { cfg.spacing = v; }, { field: 'nonBunched.' + zone + '.spacing' }));
    nC.appendChild(inputField('Max. Number of Multicore Cables per Layer', cfg.maxPerLayer, v => { cfg.maxPerLayer = v; generalChanged(); }, { type: 'number', field: 'nonBunched.' + zone + '.maxPerLayer' }));
  });
  metricStrip('#nonBunchedDerate', [
    ['Indoor Ambient Factor', gd.nonBunched.indoor.ambient],
    ['Indoor Grouping Factor', gd.nonBunched.indoor.grouping],
    ['Outdoor Ambient Factor', gd.nonBunched.outdoor.ambient],
    ['Outdoor Grouping Factor', gd.nonBunched.outdoor.grouping],
    ['TOTAL (Ind./Out.)', gd.nonBunched.indoor.total + ' / ' + gd.nonBunched.outdoor.total, true],
  ]);

  // Underground
  const u = state.general.underground;
  const uC = $('#undergroundFields'); uC.innerHTML = '';
  uC.appendChild(inputField('Max. Number of Cables', u.maxCables, v => { u.maxCables = v; generalChanged(); }, { type: 'number', field: 'underground.maxCables' }));
  uC.appendChild(selectField('Cable Installation', u.installation, ENUMS.groundInstallation, v => { u.installation = v; generalChanged(); }, { field: 'underground.installation' }));
  uC.appendChild(selectField('Cables / Ducts Spacing Installation', u.spacing, ['Touching', '100 mm', '250 mm'], v => { u.spacing = v; }, { field: 'underground.spacing' }));

  metricStrip('#undergroundDerateStrip', [
    ['Soil Temp. Factor', gd.underground.soilTemp],
    ['Soil Resistivity Factor', gd.underground.soilResist],
    ['Grouping Factor', gd.underground.grouping],
    ['TOTAL DERATING', gd.underground.total, true],
  ]);
}

/* ===================================================================
   SCHEDULE VIEW (table)
   =================================================================== */
function renderSchedule() {
  const body = $('#schedBody'); body.innerHTML = '';
  const gd = computeGeneral(state.general);
  $('#emptyState').style.display = state.rows.length ? 'none' : 'block';
  $('#schedTable').style.display = state.rows.length ? 'table' : 'none';

  // Prune selection of any rows that no longer exist
  const liveIds = new Set(state.rows.map(r => r.id));
  Array.from(selectedIds).forEach(id => { if (!liveIds.has(id)) selectedIds.delete(id); });

  state.rows.forEach((row, idx) => {
    const res = computeRow(row, gd, state.general);
    const tag = (row.panel || '\u2013') + ' - ' + row.no;
    const tr = el('tr');
    const selTd = el('td', { class: 'noprint' });
    const selCb = el('input', { type: 'checkbox' });
    selCb.checked = selectedIds.has(row.id);
    selCb.addEventListener('click', (e) => e.stopPropagation());
    selCb.addEventListener('change', () => {
      if (selCb.checked) selectedIds.add(row.id); else selectedIds.delete(row.id);
      updateSelectionUI();
    });
    selTd.appendChild(selCb);
    tr.appendChild(selTd);
    tr.appendChild(el('td', {}, [String(idx + 1)]));
    tr.appendChild(el('td', {}, [tag]));
    tr.appendChild(el('td', {}, [row.loadName || '\u2014']));
    tr.appendChild(el('td', { class: 'num' }, [row.ratedLoadKW === '' ? '\u2013' : String(row.ratedLoadKW)]));
    tr.appendChild(el('td', {}, [row.place + (row.place === 'Air' ? ' / ' + row.area : '')]));
    tr.appendChild(el('td', {}, [(row.noCores || '?') + '\u00d7' + (row.cableSize || '?') + ' mm\u00b2']));
    tr.appendChild(el('td', { class: 'num' }, [String(row.noRuns || '\u2013')]));
    tr.appendChild(el('td', { class: 'num' }, [fmt(res.flc, 1)]));
    tr.appendChild(el('td', { class: 'num' }, [fmt(res.deratedAmpacity, 1)]));
    tr.appendChild(el('td', { class: 'num' }, [row.pdTripSetting === '' ? '\u2013' : String(row.pdTripSetting)]));
    tr.appendChild(el('td', { class: 'num' }, [row.cableLength === '' ? '\u2013' : String(row.cableLength)]));
    tr.appendChild(el('td', { class: 'num' }, [fmt(res.cableVDPct, 2)]));
    tr.appendChild(el('td', {}, [statusBadge(res.remarks)]));
    const actions = el('td', { class: 'noprint' });
    const actWrap = el('div', { class: 'rowactions' });
    const dupBtn = el('button', { class: 'iconbtn', title: 'Duplicate' }, ['\u2398']);
    dupBtn.addEventListener('click', (e) => { e.stopPropagation(); duplicateRow(row.id); });
    const delBtn = el('button', { class: 'iconbtn danger', title: 'Delete' }, ['\u2715']);
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteRow(row.id); });
    actWrap.appendChild(dupBtn); actWrap.appendChild(delBtn);
    actions.appendChild(actWrap);
    tr.appendChild(actions);
    tr.addEventListener('click', () => openModal(row.id));
    body.appendChild(tr);
  });
  updateSelectionUI();
}
function updateSelectionUI() {
  const n = selectedIds.size;
  const selectAllCb = $('#selectAllCb');
  if (selectAllCb) {
    selectAllCb.checked = state.rows.length > 0 && n === state.rows.length;
    selectAllCb.indeterminate = n > 0 && n < state.rows.length;
  }
  const info = $('#selectionInfo');
  const clearBtn = $('#btnClearSelection');
  if (info) {
    if (n > 0) {
      info.style.display = '';
      info.textContent = n + ' selected';
    } else {
      info.style.display = 'none';
    }
  }
  if (clearBtn) clearBtn.style.display = n > 0 ? '' : 'none';
  $all('#schedBody tr').forEach(tr => tr.classList.remove('row-selected'));
  state.rows.forEach((row, idx) => {
    if (selectedIds.has(row.id)) {
      const tr = $('#schedBody').children[idx];
      if (tr) tr.classList.add('row-selected');
    }
  });
}
function statusBadge(remarks) {
  if (remarks === 'ACCEPTABLE') return el('span', { class: 'badge ok' }, ['\u2713 Acceptable']);
  if (remarks === 'NOT ACCEPTABLE') return el('span', { class: 'badge fail' }, ['\u2715 Not acceptable']);
  if (remarks === 'INCOMPLETE') return el('span', { class: 'badge warn' }, ['Incomplete']);
  return el('span', { class: 'badge warn' }, ['\u2014']);
}

$('#btnAddRow').addEventListener('click', () => {
  const row = blankRow(state.nextId++);
  row.no = state.rows.length + 1;
  state.rows.push(row);
  renderSchedule();
  openModal(row.id);
});
$('#btnLoadExample').addEventListener('click', () => {
  const row = blankRow(state.nextId++);
  Object.assign(row, {
    panel: 'MDB-1', no: state.rows.length + 1, loadName: 'Chiller Pump P-01',
    ratedLoadKW: 75, voltage: 400, pf: 0.85, isMotorLoad: 'Yes', startingPF: 0.35, startingCurrentRatio: 6, efficiencyPct: 92,
    feederRatingCB: 160, pdTripSetting: 140, pdTripType: 'Thermal', pdTripSettingType: 'Fixed',
    place: 'Air', area: 'Outdoor', conductor: 'CU', insulation: 'XLPE', armour: 'SWA', outerSheath: 'PVC',
    noRuns: 1, noCores: 4, cableSize: 50, allowedVDPct: 5, cableLength: 60, tripCurve: 'C',
  });
  state.rows.push(row);
  renderSchedule();
});
$('#selectAllCb').addEventListener('change', (e) => {
  if (e.target.checked) state.rows.forEach(r => selectedIds.add(r.id));
  else selectedIds.clear();
  renderSchedule();
});
$('#btnClearSelection').addEventListener('click', () => {
  selectedIds.clear();
  renderSchedule();
});
function duplicateRow(id) {
  const src = findRow(id);
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = state.nextId++;
  copy.no = state.rows.length + 1;
  state.rows.push(copy);
  renderSchedule();
}
function deleteRow(id) {
  showConfirm('Delete this cable row? This cannot be undone.', 'Delete', () => {
    state.rows = state.rows.filter(r => r.id !== id);
    selectedIds.delete(id);
    renderSchedule();
    if (editingId === id) closeModal();
  });
}

/* ===================================================================
   ROW EDITOR MODAL
   =================================================================== */
function openModal(id) {
  editingId = id;
  $('#overlay').classList.add('open');
  renderModal();
}
function closeModal() {
  editingId = null;
  $('#overlay').classList.remove('open');
  renderSchedule();
}
$('#modalClose').addEventListener('click', closeModal);
$('#btnCloseModal').addEventListener('click', closeModal);
$('#overlay').addEventListener('click', (e) => { if (e.target.id === 'overlay') closeModal(); });
$('#btnDeleteRow').addEventListener('click', () => { if (editingId != null) deleteRow(editingId); });

function updateRow(row, key, value) {
  row[key] = value;
  withFocusPreserved('#modal', renderModal);
}

function renderModal() {
  const row = findRow(editingId);
  if (!row) return;
  const gd = computeGeneral(state.general);
  const res = computeRow(row, gd, state.general);
  const tag = (row.panel || '\u2013') + ' - ' + row.no;
  $('#modalTitle').textContent = 'Cable ' + tag + (row.loadName ? ' \u2014 ' + row.loadName : '');

  const body = $('#modalBody'); body.innerHTML = '';

  // Feeder details
  body.appendChild(sectionTitle('Feeder Details'));
  let g = el('div', { class: 'grid cols-4' });
  g.appendChild(inputField('Panel / From', row.panel, v => updateRow(row, 'panel', v), { field: 'panel' }));
  g.appendChild(inputField('No.', row.no, v => updateRow(row, 'no', v), { type: 'number', field: 'no' }));
  g.appendChild(inputField('Cable Tag', tag, () => {}, { computed: true }));
  g.appendChild(inputField('Load Name / To', row.loadName, v => updateRow(row, 'loadName', v), { field: 'loadName' }));
  body.appendChild(g);

  // Load details
  body.appendChild(sectionTitle('Load Details'));
  g = el('div', { class: 'grid cols-4' });
  g.appendChild(inputField('Rated Load, P (kW)', row.ratedLoadKW, v => updateRow(row, 'ratedLoadKW', v), { type: 'number', step: '0.1', field: 'ratedLoadKW' }));
  g.appendChild(selectField('Voltage, Un (V)', row.voltage, ENUMS.voltage, v => updateRow(row, 'voltage', parseFloat(v)), { field: 'voltage' }));
  g.appendChild(inputField('Power Factor, cos\u03c6', row.pf, v => updateRow(row, 'pf', v), { type: 'number', step: '0.01', field: 'pf' }));
  g.appendChild(selectField('Motor Load', row.isMotorLoad, ['Yes', 'No'], v => updateRow(row, 'isMotorLoad', v), { field: 'isMotorLoad' }));
  g.appendChild(inputField('Full Load Current, In (A)', fmt(res.flc, 2), () => {}, { computed: true }));
  body.appendChild(g);

  // Motor parameters (only relevant / shown when this feeder is a motor load)
  if (row.isMotorLoad === 'Yes') {
    body.appendChild(sectionTitle('Motor Parameters'));
    g = el('div', { class: 'grid cols-4' });
    g.appendChild(inputField('Starting p.f.', row.startingPF, v => updateRow(row, 'startingPF', v), { type: 'number', step: '0.01', field: 'startingPF' }));
    g.appendChild(inputField('Starting Current Ratio (Ist/In)', row.startingCurrentRatio, v => updateRow(row, 'startingCurrentRatio', v), { type: 'number', step: '0.1', field: 'startingCurrentRatio' }));
    g.appendChild(inputField('Efficiency, \u03b7 (%)', row.efficiencyPct, v => updateRow(row, 'efficiencyPct', v), { type: 'number', step: '1', field: 'efficiencyPct' }));
    body.appendChild(g);
  }

  // Overload protection
  body.appendChild(sectionTitle('Overload Protection'));
  g = el('div', { class: 'grid cols-4' });
  g.appendChild(selectField('Feeder Rating, CB (A)', row.feederRatingCB || ENUMS.breakerRating[0], ENUMS.breakerRating, v => updateRow(row, 'feederRatingCB', parseFloat(v)), { field: 'feederRatingCB' }));
  g.appendChild(inputField('PD Trip Setting, Ir (A)', row.pdTripSetting, v => updateRow(row, 'pdTripSetting', v), { type: 'number', field: 'pdTripSetting' }));
  const tripTypeOpts = (row.feederRatingCB > 20) ? ENUMS.pdTripTypeWide : ENUMS.pdTripTypeNarrow;
  if (!tripTypeOpts.includes(row.pdTripType)) row.pdTripType = tripTypeOpts[0];
  g.appendChild(selectField('PD Trip Type', row.pdTripType, tripTypeOpts, v => updateRow(row, 'pdTripType', v), { field: 'pdTripType' }));
  g.appendChild(selectField('PD Trip Setting Type', row.pdTripSettingType, ENUMS.pdTripSettingType, v => updateRow(row, 'pdTripSettingType', v), { field: 'pdTripSettingType' }));
  body.appendChild(g);

  // Installation details
  body.appendChild(sectionTitle('Installation Details'));
  g = el('div', { class: 'grid cols-4' });
  g.appendChild(selectField('Place', row.place, ENUMS.installationPlace, v => updateRow(row, 'place', v), { field: 'place' }));
  if (row.place === 'Air') {
    g.appendChild(selectField('Area', row.area, ENUMS.installationArea, v => updateRow(row, 'area', v), { field: 'area' }));
  } else {
    g.appendChild(inputField('Area', 'N/A (underground)', () => {}, { readonly: true }));
  }
  g.appendChild(inputField('Installation (from Design Conditions)', res.installationText, () => {}, { computed: true }));
  g.appendChild(inputField('Design Temperature (\u00b0C)', res.tempC, () => {}, { computed: true }));
  g.appendChild(inputField('Grouping / No. of grouped cables', res.groupingCount, () => {}, { computed: true }));
  g.appendChild(inputField('No. of layers', res.layers, () => {}, { computed: true }));
  body.appendChild(g);

  // Power cable
  body.appendChild(sectionTitle('Power Cable'));
  g = el('div', { class: 'grid cols-4' });
  g.appendChild(selectField('Conductor', row.conductor, ENUMS.conductorMaterial, v => updateRow(row, 'conductor', v), { field: 'conductor' }));
  g.appendChild(selectField('Insulation', row.insulation, ENUMS.insulation, v => updateRow(row, 'insulation', v), { field: 'insulation' }));
  g.appendChild(selectField('Armour', row.armour, ENUMS.armour, v => updateRow(row, 'armour', v), { field: 'armour' }));
  g.appendChild(selectField('Outer Sheath', row.outerSheath, ENUMS.outerSheath, v => updateRow(row, 'outerSheath', v), { field: 'outerSheath' }));
  g.appendChild(inputField('Cable Type', row.conductor + '/' + row.insulation + '/' + row.armour + '/' + row.outerSheath, () => {}, { computed: true }));
  g.appendChild(inputField('No. of Runs', row.noRuns, v => updateRow(row, 'noRuns', v), { type: 'number', field: 'noRuns' }));
  g.appendChild(selectField('No. of Cores', row.noCores, ENUMS.noCores, v => updateRow(row, 'noCores', parseFloat(v)), { field: 'noCores' }));
  g.appendChild(selectField('Cable Size (mm\u00b2)', row.cableSize || ENUMS.cableSize[0], ENUMS.cableSize, v => updateRow(row, 'cableSize', parseFloat(v)), { field: 'cableSize' }));
  g.appendChild(inputField('Diameter (mm)', fmt(res.cableDiameter, 1), () => {}, { computed: true }));
  body.appendChild(g);

  // PE cable
  body.appendChild(sectionTitle('Protective Earth (PE) Cable'));
  g = el('div', { class: 'grid cols-3' });
  g.appendChild(inputField('No. of Runs', String(res.peRuns ?? '\u2013'), () => {}, { computed: true }));
  g.appendChild(inputField('Cable Size (mm\u00b2)', String(res.peSize ?? '\u2013'), () => {}, { computed: true }));
  g.appendChild(inputField('Diameter (mm)', typeof res.peDiameter === 'number' ? fmt(res.peDiameter, 1) : String(res.peDiameter ?? '\u2013'), () => {}, { computed: true }));
  body.appendChild(g);

  // Cable design
  body.appendChild(sectionTitle('Cable Design'));
  g = el('div', { class: 'grid cols-4' });
  g.appendChild(inputField('Cable Ampacity (A)', fmt(res.ampacityBase, 0), () => {}, { computed: true }));
  g.appendChild(inputField('Circuit Ampacity (A)', fmt(res.ampacityCircuit, 0), () => {}, { computed: true }));
  g.appendChild(inputField('Temp. Derating Factor', fmt(res.tempDerate, 3), () => {}, { computed: true }));
  g.appendChild(inputField('Grouping Derating Factor', fmt(res.groupDerate, 3), () => {}, { computed: true }));
  g.appendChild(inputField('Overall Derating Factor', fmt(res.overallDerate, 4), () => {}, { computed: true }));
  g.appendChild(inputField('Derated Circuit Ampacity, Iz\u2032 (A)', fmt(res.deratedAmpacity, 1), () => {}, { computed: true }));
  g.appendChild(inputField('Cable Length (m)', row.cableLength, v => updateRow(row, 'cableLength', v), { type: 'number', field: 'cableLength' }));
  g.appendChild(inputField('Resistance, R (\u03a9/km)', fmt(res.rPerKm, 4), () => {}, { computed: true }));
  g.appendChild(inputField('Reactance, X (\u03a9/km)', fmt(res.xPerKm, 4), () => {}, { computed: true }));
  g.appendChild(inputField('Allowed Voltage Drop (%)', row.allowedVDPct, v => updateRow(row, 'allowedVDPct', v), { type: 'number', step: '0.1', field: 'allowedVDPct' }));
  g.appendChild(inputField('Cable Voltage Drop (%)', fmt(res.cableVDPct, 2), () => {}, { computed: true }));
  body.appendChild(g);

  // Motor starting (only relevant when this feeder is a motor load)
  if (row.isMotorLoad === 'Yes') {
    body.appendChild(sectionTitle('Motor Starting'));
    g = el('div', { class: 'grid cols-3' });
    g.appendChild(inputField('Starting Current, Ist (A)', typeof res.startingCurrent === 'number' ? fmt(res.startingCurrent, 1) : String(res.startingCurrent ?? '\u2013'), () => {}, { computed: true }));
    g.appendChild(inputField('Allowed Starting VD (%)', String(res.allowedStartVDPct ?? '\u2013'), () => {}, { computed: true }));
    g.appendChild(inputField('Cable Starting VD (%)', typeof res.startVDPct === 'number' ? fmt(res.startVDPct, 2) : String(res.startVDPct ?? '\u2013'), () => {}, { computed: true }));
    body.appendChild(g);
  }

  // Earth fault loop
  body.appendChild(sectionTitle('Earth Fault Loop'));
  g = el('div', { class: 'grid cols-3' });
  g.appendChild(selectField('Trip Curve', row.tripCurve, ENUMS.tripCurve, v => updateRow(row, 'tripCurve', v), { field: 'tripCurve' }));
  g.appendChild(inputField('Max. Cable Length (m)', typeof res.maxCableLength === 'number' ? fmt(res.maxCableLength, 1) : String(res.maxCableLength ?? '\u2013'), () => {}, { computed: true }));
  body.appendChild(g);

  // Results summary bar
  body.appendChild(sectionTitle('Results Summary'));
  const bar = el('div', { class: 'resultsbar' });
  bar.appendChild(resultCard('Full Load Current', fmt(res.flc, 1) + ' A'));
  bar.appendChild(resultCard('Derated Circuit Ampacity', fmt(res.deratedAmpacity, 1) + ' A'));
  bar.appendChild(resultCard('Cable Voltage Drop', fmt(res.cableVDPct, 2) + ' %'));
  bar.appendChild(resultCard('Status', res.remarks || '\u2014', res.remarks === 'ACCEPTABLE' ? 'ok' : (res.remarks === 'NOT ACCEPTABLE' ? 'fail' : '')));
  body.appendChild(bar);

  // Checklist
  body.appendChild(sectionTitle('Compliance Checklist'));
  const cl = el('div', { class: 'checklist' });
  cl.appendChild(checkRow('Derated ampacity exceeds overload trip setting (Iz\u2032 > Ir)', res.checks.ampacity));
  cl.appendChild(checkRow('Protective device type selected', res.checks.tripTypeSelected));
  cl.appendChild(checkRow('Cable voltage drop within allowed limit', res.checks.voltageDrop));
  cl.appendChild(checkRow('Motor starting voltage drop within allowed limit (or N/A)', res.checks.startingVoltageDrop));
  cl.appendChild(checkRow('Cable length within max. earth-fault-loop length (or N/A)', res.checks.faultLoopLength));
  body.appendChild(cl);
}

function resultCard(label, value, tone) {
  const c = el('div', { class: 'rc' });
  c.appendChild(el('div', { class: 'l' }, [label]));
  const v = el('div', { class: 'v' }, [value]);
  if (tone === 'ok') v.style.color = 'var(--ok-ink)';
  if (tone === 'fail') v.style.color = 'var(--fail-ink)';
  c.appendChild(v);
  return c;
}
function sectionTitle(t) { return el('div', { class: 'section-title' }, [t]); }
function checkRow(label, status) {
  const cls = status === true ? 'pass' : status === false ? 'fail' : 'pending';
  const txt = status === true ? 'PASS' : status === false ? 'FAIL' : 'N/A';
  const r = el('div', { class: 'checkrow ' + cls });
  r.appendChild(el('div', { class: 'dot' }));
  r.appendChild(el('div', { class: 'txt' }, [label]));
  r.appendChild(el('div', { class: 'v' }, [txt]));
  return r;
}

/* ===================================================================
   EMBEDDED-PREVIEW DETECTION
   =================================================================== */
initEmbeddedPreviewBanner();

/* ===================================================================
   IMPORT / EXPORT JSON
   =================================================================== */
$('#btnExport').addEventListener('click', () => {
  try {
    const name = state.project.projectNo || state.project.projectName || 'lv-cable-calc';
    downloadJSON(name, state);
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
      if (!data.project || !data.general || !data.rows) throw new Error('missing fields');
    },
    onLoaded(data) {
      state = data;
      state.nextId = (Math.max(0, ...state.rows.map(r => r.id || 0)) + 1);
      selectedIds = new Set();
      renderActive();
      showToast('Project loaded.', 'success');
    },
  });
});

/* ===================================================================
   PDF EXPORT (native browser print-to-PDF, styled via @media print)
   These builders read state.project / state.general / state.rows
   directly, so they stay here rather than in shared.js.
   =================================================================== */
function coverSectionHTML() {
  const p = state.project;
  return '<section class="print-page">' +
    '<div class="cover-title">' + escapeHtml(p.title || 'LV Cable Sizing Calculation') + '</div>' +
    '<table class="print-kv-table">' +
      '<tr><th>Client</th><td>' + escapeHtml(pv(p.client)) + '</td></tr>' +
      '<tr><th>Project</th><td>' + escapeHtml(pv(p.projectName)) + '</td></tr>' +
      '<tr><th>Project No.</th><td>' + escapeHtml(pv(p.projectNo)) + '</td></tr>' +
      '<tr><th>Revision</th><td>' + escapeHtml(pv(p.revision)) + '</td></tr>' +
      '<tr><th>Date</th><td>' + escapeHtml(pv(p.date)) + '</td></tr>' +
      '<tr><th>Prepared by</th><td>' + escapeHtml(pv(p.preparedBy)) + '</td></tr>' +
      '<tr><th>Checked by</th><td>' + escapeHtml(pv(p.checkedBy)) + '</td></tr>' +
      '<tr><th>Approved by</th><td>' + escapeHtml(pv(p.approvedBy)) + '</td></tr>' +
      '<tr><th>Design Code</th><td>' + escapeHtml(pv(p.code)) + '</td></tr>' +
    '</table>' +
  '</section>';
}

function paramsSectionHTML(gd) {
  const s = state.general.site;
  const catRows = (cat) =>
    '<tr><td>Indoor</td><td>' + cat.indoor.ambient + '</td><td>' + cat.indoor.grouping + '</td><td>' + cat.indoor.total + '</td></tr>' +
    '<tr><td>Outdoor</td><td>' + cat.outdoor.ambient + '</td><td>' + cat.outdoor.grouping + '</td><td>' + cat.outdoor.total + '</td></tr>';

  return '<section class="print-page">' +
    '<h2 class="print-page-title">Cable Design Parameters</h2>' +
    printBlock('Site Design Conditions',
      '<table class="print-table"><tbody>' +
        '<tr><td>Max. Outdoor Temperature</td><td>' + s.maxOutdoorTemp + ' \u00b0C</td></tr>' +
        '<tr><td>Max. Ground Temperature</td><td>' + s.maxGroundTemp + ' \u00b0C</td></tr>' +
        '<tr><td>Max. Indoor Temperature</td><td>' + s.maxIndoorTemp + ' \u00b0C</td></tr>' +
        '<tr><td>Soil Thermal Resistivity</td><td>' + s.soilResistivity + ' \u00b0C\u00b7m/W</td></tr>' +
        '<tr><td>Cable Insulation Type</td><td>' + s.insulationType + '</td></tr>' +
        '<tr><td>Phase-Phase / Phase-Neutral Voltage</td><td>' + s.phaseVoltage + ' V / ' + s.phaseNeutralVoltage + ' V</td></tr>' +
      '</tbody></table>') +
    printBlock('Bunched Air-Installed Cables (\u226425mm\u00b2)',
      '<table class="print-table"><thead><tr><th></th><th>Ambient Factor</th><th>Grouping Factor</th><th>Total Derating</th></tr></thead><tbody>' + catRows(gd.bunched) + '</tbody></table>') +
    printBlock('Non-Bunched Air-Installed Cables (>25mm\u00b2)',
      '<table class="print-table"><thead><tr><th></th><th>Ambient Factor</th><th>Grouping Factor</th><th>Total Derating</th></tr></thead><tbody>' + catRows(gd.nonBunched) + '</tbody></table>') +
    printBlock('Underground Installed Cables',
      '<table class="print-table"><thead><tr><th>Soil Temp. Factor</th><th>Soil Resistivity Factor</th><th>Grouping Factor</th><th>Total Derating</th></tr></thead><tbody>' +
      '<tr><td>' + gd.underground.soilTemp + '</td><td>' + gd.underground.soilResist + '</td><td>' + gd.underground.grouping + '</td><td>' + gd.underground.total + '</td></tr>' +
      '</tbody></table>') +
  '</section>';
}

function scheduleSectionHTML(rows, gd) {
  const bodyRows = rows.map((row) => {
    const res = computeRow(row, gd, state.general);
    const tag = (row.panel || '-') + ' - ' + row.no;
    return '<tr>' +
      '<td>' + escapeHtml(tag) + '</td>' +
      '<td>' + escapeHtml(pv(row.loadName)) + '</td>' +
      '<td>' + escapeHtml(pv(row.ratedLoadKW)) + '</td>' +
      '<td>' + fmt(res.flc, 1) + '</td>' +
      '<td>' + escapeHtml(row.place + (row.place === 'Air' ? '/' + row.area : '')) + '</td>' +
      '<td>' + (row.noCores || '?') + '\u00d7' + (row.cableSize || '?') + '</td>' +
      '<td>' + escapeHtml(pv(row.noRuns)) + '</td>' +
      '<td>' + escapeHtml(pv(row.feederRatingCB)) + '</td>' +
      '<td>' + escapeHtml(pv(row.pdTripSetting)) + '</td>' +
      '<td>' + fmt(res.deratedAmpacity, 1) + '</td>' +
      '<td>' + escapeHtml(pv(row.cableLength)) + '</td>' +
      '<td>' + fmt(res.cableVDPct, 2) + '</td>' +
      '<td>' + escapeHtml(res.remarks || '') + '</td>' +
    '</tr>';
  }).join('');

  return '<section class="print-page">' +
    '<h2 class="print-page-title">Cable Schedule</h2>' +
    '<table class="print-table sched-table"><thead><tr>' +
      '<th>Tag</th><th>Load</th><th>kW</th><th>In (A)</th><th>Place/Area</th><th>Cores\u00d7Size</th><th>Runs</th>' +
      '<th>CB (A)</th><th>Ir (A)</th><th>Iz\u2032 (A)</th><th>Len (m)</th><th>VD %</th><th>Status</th>' +
    '</tr></thead><tbody>' + (bodyRows || '<tr><td colspan="13">No cables to show.</td></tr>') + '</tbody></table>' +
  '</section>';
}

function cableDetailSectionHTML(row) {
  return '<section class="print-page">' + buildCablePrintHTML(row) + '</section>';
}

function buildFullReportHTML(opts) {
  const gd = computeGeneral(state.general);
  const rowsToUse = (opts.rowIds && opts.rowIds.size > 0) ? state.rows.filter(r => opts.rowIds.has(r.id)) : state.rows;
  const sections = [];
  if (opts.cover) sections.push(coverSectionHTML());
  if (opts.params) sections.push(paramsSectionHTML(gd));
  if (opts.schedule) sections.push(scheduleSectionHTML(rowsToUse, gd));
  if (opts.detailed) rowsToUse.forEach(row => sections.push(cableDetailSectionHTML(row)));
  return assembleSections(sections);
}

function statusClass(remarks) {
  if (remarks === 'ACCEPTABLE') return 'ok';
  if (remarks === 'NOT ACCEPTABLE') return 'fail';
  return '';
}

function buildCablePrintHTML(row) {
  const gd = computeGeneral(state.general);
  const res = computeRow(row, gd, state.general);
  const tag = (row.panel || '\u2013') + ' - ' + row.no;
  const isMotor = row.isMotorLoad === 'Yes';

  let html = '<div class="print-header"><h2>Cable ' + escapeHtml(tag) + (row.loadName ? ' \u2014 ' + escapeHtml(row.loadName) : '') + '</h2>' +
    '<div class="print-sub">' + escapeHtml(state.project.projectName || '') + (state.project.projectNo ? ' (' + escapeHtml(state.project.projectNo) + ')' : '') + '</div></div>';

  html += printBlock('Feeder Details', printFieldsHTML([
    ['Panel / From', row.panel], ['No.', row.no], ['Cable Tag', tag], ['Load Name / To', row.loadName],
  ]));

  html += printBlock('Load Details', printFieldsHTML([
    ['Rated Load, P (kW)', row.ratedLoadKW], ['Voltage, Un (V)', row.voltage],
    ['Power Factor, cos\u03c6', row.pf], ['Motor Load', row.isMotorLoad],
    ['Full Load Current, In (A)', fmt(res.flc, 2)],
  ]));

  if (isMotor) {
    html += printBlock('Motor Parameters', printFieldsHTML([
      ['Starting p.f.', row.startingPF], ['Starting Current Ratio (Ist/In)', row.startingCurrentRatio],
      ['Efficiency, \u03b7 (%)', row.efficiencyPct],
    ]));
  }

  html += printBlock('Overload Protection', printFieldsHTML([
    ['Feeder Rating, CB (A)', row.feederRatingCB], ['PD Trip Setting, Ir (A)', row.pdTripSetting],
    ['PD Trip Type', row.pdTripType], ['PD Trip Setting Type', row.pdTripSettingType],
  ]));

  html += printBlock('Installation Details', printFieldsHTML([
    ['Place', row.place], ['Area', row.place === 'Air' ? row.area : 'N/A (underground)'],
    ['Installation (from Design Conditions)', res.installationText], ['Design Temperature (\u00b0C)', res.tempC],
    ['Grouping / No. of grouped cables', res.groupingCount], ['No. of layers', res.layers],
  ]));

  html += printBlock('Power Cable', printFieldsHTML([
    ['Conductor', row.conductor], ['Insulation', row.insulation], ['Armour', row.armour], ['Outer Sheath', row.outerSheath],
    ['Cable Type', row.conductor + '/' + row.insulation + '/' + row.armour + '/' + row.outerSheath],
    ['No. of Runs', row.noRuns], ['No. of Cores', row.noCores], ['Cable Size (mm\u00b2)', row.cableSize],
    ['Diameter (mm)', fmt(res.cableDiameter, 1)],
  ]));

  html += printBlock('Protective Earth (PE) Cable', printFieldsHTML([
    ['No. of Runs', res.peRuns], ['Cable Size (mm\u00b2)', res.peSize],
    ['Diameter (mm)', typeof res.peDiameter === 'number' ? fmt(res.peDiameter, 1) : res.peDiameter],
  ]));

  html += printBlock('Cable Design', printFieldsHTML([
    ['Cable Ampacity (A)', fmt(res.ampacityBase, 0)], ['Circuit Ampacity (A)', fmt(res.ampacityCircuit, 0)],
    ['Temp. Derating Factor', fmt(res.tempDerate, 3)], ['Grouping Derating Factor', fmt(res.groupDerate, 3)],
    ['Overall Derating Factor', fmt(res.overallDerate, 4)], ['Derated Circuit Ampacity, Iz\u2032 (A)', fmt(res.deratedAmpacity, 1)],
    ['Cable Length (m)', row.cableLength], ['Resistance, R (\u03a9/km)', fmt(res.rPerKm, 4)],
    ['Reactance, X (\u03a9/km)', fmt(res.xPerKm, 4)], ['Allowed Voltage Drop (%)', row.allowedVDPct],
    ['Cable Voltage Drop (%)', fmt(res.cableVDPct, 2)],
  ]));

  if (isMotor) {
    html += printBlock('Motor Starting', printFieldsHTML([
      ['Starting Current, Ist (A)', typeof res.startingCurrent === 'number' ? fmt(res.startingCurrent, 1) : res.startingCurrent],
      ['Allowed Starting VD (%)', res.allowedStartVDPct],
      ['Cable Starting VD (%)', typeof res.startVDPct === 'number' ? fmt(res.startVDPct, 2) : res.startVDPct],
    ]));
  }

  html += printBlock('Earth Fault Loop', printFieldsHTML([
    ['Trip Curve', row.tripCurve],
    ['Max. Cable Length (m)', typeof res.maxCableLength === 'number' ? fmt(res.maxCableLength, 1) : res.maxCableLength],
  ]));

  html += printBlock('Results Summary',
    '<div class="print-results">' +
      '<div class="pr-card"><div class="prl">Full Load Current</div><div class="prv">' + fmt(res.flc, 1) + ' A</div></div>' +
      '<div class="pr-card"><div class="prl">Derated Circuit Ampacity</div><div class="prv">' + fmt(res.deratedAmpacity, 1) + ' A</div></div>' +
      '<div class="pr-card"><div class="prl">Cable Voltage Drop</div><div class="prv">' + fmt(res.cableVDPct, 2) + ' %</div></div>' +
      '<div class="pr-card status-' + statusClass(res.remarks) + '"><div class="prl">Status</div><div class="prv">' + escapeHtml(res.remarks || '\u2014') + '</div></div>' +
    '</div>');

  const checks = [
    ['Derated ampacity exceeds overload trip setting (Iz\u2032 > Ir)', res.checks.ampacity],
    ['Protective device type selected', res.checks.tripTypeSelected],
    ['Cable voltage drop within allowed limit', res.checks.voltageDrop],
    ['Motor starting voltage drop within allowed limit (or N/A)', res.checks.startingVoltageDrop],
    ['Cable length within max. earth-fault-loop length (or N/A)', res.checks.faultLoopLength],
  ];
  html += printBlock('Compliance Checklist',
    '<div class="print-checklist">' + checks.map(([l, st]) =>
      '<div class="pc-row pc-' + (st === true ? 'pass' : st === false ? 'fail' : 'pending') + '">' +
        '<span class="pc-dot"></span><span class="pc-txt">' + escapeHtml(l) + '</span>' +
        '<span class="pc-v">' + (st === true ? 'PASS' : st === false ? 'FAIL' : 'N/A') + '</span>' +
      '</div>'
    ).join('') + '</div>');

  return html;
}

function openPdfOptions() {
  const hint = $('#pdfSelectionHint');
  if (selectedIds.size > 0) {
    hint.textContent = selectedIds.size + ' cable' + (selectedIds.size === 1 ? '' : 's') + ' selected in the schedule \u2014 the Cable Schedule and Detailed Cable Calculations sections will include only the selected cable(s). Clear the selection first to include all cables.';
  } else {
    hint.textContent = 'No cables selected \u2014 the Cable Schedule and Detailed Cable Calculations sections will include all ' + state.rows.length + ' cable(s).';
  }
  $('#pdfOptionsOverlay').classList.add('open');
}
function closePdfOptions() { $('#pdfOptionsOverlay').classList.remove('open'); }

$('#btnPdf').addEventListener('click', openPdfOptions);
$('#pdfOptionsClose').addEventListener('click', closePdfOptions);
$('#pdfOptionsCancel').addEventListener('click', closePdfOptions);
$('#pdfOptionsOverlay').addEventListener('click', (e) => { if (e.target.id === 'pdfOptionsOverlay') closePdfOptions(); });

$('#pdfOptionsGenerate').addEventListener('click', () => {
  const opts = {
    cover: $('#optCover').checked,
    params: $('#optParams').checked,
    schedule: $('#optSchedule').checked,
    detailed: $('#optDetailed').checked,
    rowIds: selectedIds,
  };
  if (!opts.cover && !opts.params && !opts.schedule && !opts.detailed) {
    showToast('Select at least one section to include.', 'error');
    return;
  }
  closePdfOptions();
  try {
    runPrint(buildFullReportHTML(opts));
  } catch (err) {
    console.error('PDF export failed:', err);
    showToast('Export PDF failed: ' + err.message, 'error', 6000);
  }
});

$('#btnPdfCable').addEventListener('click', () => {
  const row = findRow(editingId);
  if (!row) return;
  try {
    runPrint(buildCablePrintHTML(row));
  } catch (err) {
    console.error('PDF export failed:', err);
    showToast('Export PDF failed: ' + err.message, 'error', 6000);
  }
});

/* ===================================================================
   INIT
   =================================================================== */
setView('project');
