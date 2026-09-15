/* ===================================================================
   APP STATE
   =================================================================== */
function cloneDefaults() { return JSON.parse(JSON.stringify(LIGHTNING_DEFAULTS)); }
let state = cloneDefaults();

// state key -> lookup table name (fields with plain option lists handled inline)
const FIELD_TABLE = {
  hz: 'specialHazard',
  Pd: 'protectionLevel',
  spd: 'spd',
  Cd: 'location',
  rf: 'fireRisk',
  floorType: 'floorType',
  fireProvisions: 'fireProvisions',
  structureType: 'structureType',
  services: 'serviceType',
};

const RISK_META = [
  { key: '1', title: 'R1 \u2014 Risk of human loss', threshold: RT.RT1, toleranceText: 'risk of 1 in 100,000', rKey: 'R1', comps: ['RA', 'RB1', 'RC1', 'RM1'], resultKey: 'result1' },
  { key: '2', title: 'R2 \u2014 Risk of loss of service', threshold: RT.RT2, toleranceText: 'risk of 1 in 1,000', rKey: 'R2', comps: ['RB2', 'RC2', 'RM2'], resultKey: 'result2' },
  { key: '3', title: 'R3 \u2014 Risk of loss of cultural heritage', threshold: RT.RT3, toleranceText: 'risk of 1 in 10,000', rKey: 'R3', comps: ['RB3'], resultKey: 'result3' },
];

/* ===================================================================
   FORMATTING HELPERS
   =================================================================== */
function sup(n) {
  const map = ['\u2070', '\u00b9', '\u00b2', '\u00b3', '\u2074', '\u2075', '\u2076', '\u2077', '\u2078', '\u2079'];
  return String(n).replace(/-/g, '\u207b').replace(/\d/g, d => map[+d]);
}
// Scientific notation, e.g. 1.85 x 10^-7 (unicode superscripts, no HTML)
function fmtSci(v, dp) {
  if (v === null || v === undefined || v === '' || !isFinite(v)) return '\u2013';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / Math.pow(10, e);
  let mStr = m.toFixed(dp === undefined ? 2 : dp).replace(/\.?0+$/, '');
  return mStr + ' \u00d7 10' + sup(e);
}

/* ===================================================================
   FIELD HELPERS (wrappers over shared.js builders)
   =================================================================== */
function tipField(fieldEl, tip) {
  const lbl = fieldEl.querySelector('label');
  if (lbl) lbl.appendChild(el('span', { class: 'info-i', 'data-tip': tip, 'aria-label': tip, tabindex: '0' }, ['i']));
  return fieldEl;
}
function errField(fieldEl, msg) {
  if (msg) {
    fieldEl.classList.add('invalid');
    fieldEl.appendChild(el('div', { class: 'err' }, [msg]));
  }
  return fieldEl;
}
function checkboxField(label, checked, onChange, opts) {
  opts = opts || {};
  const wrap = el('div', { class: 'field checkbox-field' });
  const row = el('label', { class: 'checkbox-row' });
  const cb = el('input', { type: 'checkbox' });
  if (opts.field) cb.dataset.field = opts.field;
  cb.checked = !!checked;
  cb.addEventListener('change', () => onChange(cb.checked));
  row.appendChild(cb);
  row.appendChild(el('span', {}, [label]));
  wrap.appendChild(row);
  if (opts.hint) wrap.appendChild(el('div', { class: 'hint' }, [opts.hint]));
  return wrap;
}

/* ===================================================================
   VALIDATION
   =================================================================== */
function numOf(k) { return parseFloat(state[k]); }
function geometryErrors() {
  const e = {};
  if (!(numOf('Ng') > 0)) e.Ng = 'Enter a positive number of flashes per km\u00b2 per year.';
  if (!(numOf('L') > 0)) e.L = 'Length must be greater than 0 m.';
  if (!(numOf('W') > 0)) e.W = 'Width must be greater than 0 m.';
  if (!(numOf('Hi') > 0)) e.Hi = 'Height must be greater than 0 m.';
  const t = numOf('T');
  if (state.T !== '' && !isNaN(t) && t < 0) e.T = 'Must be zero or greater.';
  return e;
}
// Params handed to the engine: geometry guaranteed valid, T blank coerced to 0
function readParams() {
  const p = { ...state };
  const t = parseFloat(p.T);
  p.T = isNaN(t) ? 0 : t;
  return p;
}

/* ===================================================================
   PROJECT VIEW
   =================================================================== */
function renderProject() {
  const c = $('#projectFields');
  c.innerHTML = '';
  c.appendChild(inputField('Building / Installation name', state.project.name, v => { state.project.name = v; }, { field: 'project.name' }));
  c.appendChild(inputField('Building ID No.', state.project.id, v => { state.project.id = v; }, { field: 'project.id' }));
}

/* ===================================================================
   STRUCTURE GEOMETRY VIEW
   =================================================================== */
function geometryChanged() {
  withFocusPreserved('#geometryCard', renderGeometryCore);
  renderResults();
}
function renderGeometryCore() {
  const c = $('#geometryFields');
  c.innerHTML = '';
  const errs = geometryErrors();

  c.appendChild(errField(
    tipField(inputField('Lightning Strike Density, Ng (flashes/km\u00b2/yr)', state.Ng, v => { state.Ng = v; geometryChanged(); }, { type: 'number', field: 'Ng' }),
      'Number of lightning ground flashes per km\u00b2 per year at this location. Sourced from local lightning-detection network data or an isokeraunic (thunderstorm-day) map for the region \u2014 not a value to estimate by eye.'),
    errs.Ng));
  c.appendChild(errField(
    tipField(inputField('Length, L (m)', state.L, v => { state.L = v; geometryChanged(); }, { type: 'number', field: 'L' }),
      'Building length in metres.'),
    errs.L));
  c.appendChild(errField(
    tipField(inputField('Width, W (m)', state.W, v => { state.W = v; geometryChanged(); }, { type: 'number', field: 'W' }),
      'Building width in metres.'),
    errs.W));
  c.appendChild(errField(
    tipField(inputField('Height, Hi (m)', state.Hi, v => { state.Hi = v; geometryChanged(); }, { type: 'number', field: 'Hi' }),
      'Building height in metres \u2014 drives the direct-flash collection area AD.'),
    errs.Hi));
  c.appendChild(errField(
    tipField(inputField('Chimney / Tower height, T (m)', state.T, v => { state.T = v; geometryChanged(); }, { type: 'number', field: 'T' }),
      'Height of protruding structures such as chimneys or towers, in metres; set to 0 if none.'),
    errs.T));

  renderMetrics();
}
function renderMetrics() {
  const res = calculateLightningRisk(readParams());
  const inc = !res || res.incomplete;
  metricStrip('#geometryMetrics', [
    ['AD \u2014 Direct-flash area (m\u00b2)', inc ? '\u2013' : fmt(res.AD, 2)],
    ['AM \u2014 Nearby-flash area (m\u00b2)', inc ? '\u2013' : fmt(res.AM, 2)],
    ['ND \u2014 Strikes to structure / yr', inc ? '\u2013' : fmtSci(res.ND)],
    ['NM \u2014 Strikes near structure / yr', inc ? '\u2013' : fmtSci(res.NM)],
  ]);
}
function renderGeometry() {
  renderGeometryCore();
  renderResults();
}

/* ===================================================================
   RISK FACTORS VIEW
   =================================================================== */
function riskChanged() {
  withFocusPreserved('#riskCard', renderRiskCore);
  renderResults();
}
function renderRiskCore() {
  const c = $('#riskFactorsFields');
  c.innerHTML = '';
  const defs = [
    ['hz', 'Danger for People',
      'Increase factor hz for special hazard (Table C.6): No special hazard \u2014 1; low panic level (\u22642 floors, < 100 persons) \u2014 2; medium risk of panic (< 1000 persons) \u2014 5; difficult to evacuate (disabled people, hospitals) \u2014 5; high risk of panic (> 1000 persons) \u2014 10. The former "Hazard/Contamination of surroundings" options are not part of the standard and were removed.'],
    ['structureType', 'Structure Type',
      'Selects the typical loss values of Table C.2 used for loss of human life: LT (shock), LF (physical damage) and LO (internal-system failure) per structure type.'],
    ['floorType', 'Floor / Ground Surface (rt)',
      'Reduction factor rt for shock-injury loss (LA), depending on the floor or ground surface: agricultural/concrete 10\u207b\u00b2; marble/ceramic 10\u207b\u00b3; gravel/moquette/carpets 10\u207b\u2074; asphalt/linoleum/wood 10\u207b\u2075.'],
    ['fireProvisions', 'Fire-Fighting Provisions (rp)',
      'Reduction factor rp for physical-damage loss: no provisions \u2014 1; extinguishers, manual alarm, hydrants, fire compartments or escape routes \u2014 0.5; automatic extinguishing or automatic alarm (with overvoltage protection and < 10 min response) \u2014 0.2. Ignored (rp = 1) where the fire risk is Explosion.'],
    ['Pd', 'Lightning Protection Level',
      'Class of the installed (or proposed) LPS per IEC 62305-3 \u2014 None (no LPS) \u2014 1; Class IV \u2014 0.2; III \u2014 0.1; II \u2014 0.05; I \u2014 0.02. Class I offers the highest interception efficiency, Class IV the lowest. This is a design choice made by the LPS designer, not a measurement. The primary mitigation within your control.'],
    ['spd', 'Surge Protection Device (SPD)',
      'Coordinated surge protection per IEC 62305-4: No coordinated SPD \u2014 1; LPL III\u2013IV \u2014 0.05; LPL II \u2014 0.02; LPL I \u2014 0.01. Reduces the internal-systems failure probabilities PC and PM. The second mitigation within your control.'],
    ['Ai', 'Electrical Line',
      'Presence of an incoming service line increases exposure because a strike anywhere along that line can transport current or overvoltage into the structure. No \u2014 no electrical service line enters the structure (internal-systems direct-flash probability PC = 0); Aerial \u2014 overhead line (higher exposure); Underground \u2014 buried cable (lower exposure).'],
    ['Cd', 'Relative Location',
      'Structure surrounded by higher objects or trees \u2014 nearby taller objects offer some natural shielding (0.25); similar or lower objects \u2014 no significant shielding (0.5); isolated \u2013 no other objects nearby \u2014 fully exposed (1); isolated on a hilltop or hillock \u2014 most exposed, attracts proportionally more strikes (2).'],
    ['rf', 'Fire Risk',
      'Defined by the structure\u2019s specific fire load (combustible energy \u00f7 floor area, MJ/m\u00b2): Explosion \u2014 classified hazardous zone per IEC 60079 (worst case; the full standard has three explosion sub-tiers by zone); High \u2014 combustible construction or fire load > 800 MJ/m\u00b2; Ordinary \u2014 400\u2013800 MJ/m\u00b2; Low \u2014 < 400 MJ/m\u00b2. Fire load comes from a fire-load survey or fire-engineering assessment, not estimation.'],
    ['services', 'Associated Services (R2)',
      'Services provided to the public from this structure, per Table C.3: gas/water/power supply (LF 10\u207b\u00b9, LO 10\u207b\u00b2) or TV/telecommunication (LF 10\u207b\u00b2, LO 10\u207b\u00b3). Selecting "No" sets the loss-of-service risk R2 to zero.'],
  ];
  defs.forEach(([key, label, tip]) => {
    const opts = FIELD_TABLE[key] ? TABLES[FIELD_TABLE[key]].map(r => r.label) : ['No', 'Aerial', 'Underground'];
    c.appendChild(tipField(selectField(label, state[key], opts, v => { state[key] = v; riskChanged(); }, { field: key }), tip));
  });

  c.appendChild(tipField(
    checkboxField('Hospital or life-critical facility', state.lifeCritical, v => { state.lifeCritical = v; riskChanged(); }, { field: 'lifeCritical', hint: 'Tick if internal-system failure can directly endanger human life (hospitals, critical process controls). Includes RC/RM in R1.' }),
    'Per Annex C of the standard, internal-systems failure (RC/RM) only counts toward loss of human life for structures with risk of explosion or for hospitals / other life-critical facilities. Explosion and hospital structure types are always included; tick for other life-critical facilities.'));
}
function renderRisk() {
  renderRiskCore();
  renderResults();
}

/* ===================================================================
   RESULTS
   =================================================================== */
function riskRow(m, res) {
  const ok = res[m.resultKey] === 'ACCEPTABLE';
  const row = el('div', { class: 'risk-row ' + (ok ? 'ok' : 'fail') });
  const main = el('div', { class: 'risk-main' });
  main.appendChild(el('div', { class: 'risk-title' }, [m.title]));
  const parts = [];
  m.comps.forEach(k => {
    if ((k === 'RC1' || k === 'RM1') && !res.lifeCritical) return;
    parts.push(k + ' ' + fmtSci(res[k]));
  });
  if (m.rKey === 'R1' && !res.lifeCritical) parts.push('RC/RM not applicable');
  main.appendChild(el('div', { class: 'risk-sub' }, [parts.join(' \u00b7 ')]));
  const vals = el('div', { class: 'risk-vals' });
  vals.appendChild(el('div', { class: 'risk-val' }, [fmtSci(res[m.rKey])]));
  vals.appendChild(el('div', { class: 'risk-rt' }, ['\u2264 ' + fmtSci(m.threshold) + ' (' + m.toleranceText + ')']));
  row.appendChild(main);
  row.appendChild(vals);
  row.appendChild(el('span', { class: 'badge ' + (ok ? 'ok' : 'fail') }, [ok ? '\u2713 Acceptable' : '\u2715 Not acceptable']));
  return row;
}
function renderResults() {
  const c = $('#resultsBody');
  const n = $('#resultsNotes');
  c.innerHTML = '';
  n.innerHTML = '';
  const errs = geometryErrors();
  const missing = Object.keys(errs);
  if (missing.length) {
    c.appendChild(el('div', { class: 'risk-banner info' }, [
      el('span', { class: 'rb-title' }, ['Input required \u2014 ']),
      el('span', {}, ['enter valid values for ' + missing.join(', ') + ' to run the assessment.']),
    ]));
    return;
  }
  const res = calculateLightningRisk(readParams());
  if (!res || res.incomplete) {
    c.appendChild(el('div', { class: 'risk-banner info' }, [
      el('span', { class: 'rb-title' }, ['Cannot calculate \u2014 ']),
      el('span', {}, ['review the inputs and try again.']),
    ]));
    return;
  }
  const anyFail = RISK_META.some(m => res[m.resultKey] === 'NOT ACCEPTABLE');
  RISK_META.forEach(m => c.appendChild(riskRow(m, res)));
  if (anyFail) {
    c.appendChild(el('div', { class: 'risk-banner warn' }, [
      el('span', { class: 'rb-title' }, ['Overall verdict: NOT ACCEPTABLE \u2014 ']),
      el('span', {}, ['one or more risks exceed their tolerable threshold. The mitigations within your control are the Lightning Protection Level (add or upgrade the LPS class) and a coordinated SPD system (PSPD): adjust them and re-run the assessment.']),
    ]));
  } else {
    c.appendChild(el('div', { class: 'risk-banner ok' }, [
      el('span', { class: 'rb-title' }, ['Overall verdict: ACCEPTABLE \u2014 ']),
      el('span', {}, ['all calculated risks fall within their tolerable thresholds.']),
    ]));
  }

  n.appendChild(el('div', { class: 'results-note' }, [
    el('span', { class: 'results-edition' }, [escapeHtml(STANDARD_EDITION.label)]),
    el('div', { style: 'margin-top:6px;' }, ['This assessment currently evaluates risk from direct and nearby lightning flashes to the structure per IEC 62305-2. Risk contributions from flashes to or near connected electrical lines are not yet fully modelled to the standard\u2019s precision. For structures with significant overhead-line exposure, consult a lightning protection engineer for a complete assessment.']),
    el('div', { style: 'margin-top:6px;' }, ['Provisional values pending engineer sign-off: internal-systems shielding default (PMS) and the life-critical loss fallback (LO). See the data audit notes in the source files (grep NEEDS_VERIFICATION).']),
  ]));
}
function renderAll() {
  renderProject();
  renderGeometry();
  renderRisk();
  renderResults();
}

/* ===================================================================
   EMBEDDED-PREVIEW DETECTION
   =================================================================== */
initEmbeddedPreviewBanner();

/* ===================================================================
   LOAD EXAMPLE (KTC Tower - legacy workbook verification case)
   =================================================================== */
$('#btnLoadExample').addEventListener('click', () => {
  state = JSON.parse(JSON.stringify(KTC_EXAMPLE));
  renderAll();
  showToast('Loaded KTC Tower example.', 'success');
});

/* ===================================================================
   IMPORT / EXPORT JSON
   =================================================================== */
$('#btnExport').addEventListener('click', () => {
  try {
    const name = state.project.id || state.project.name || 'lightning-risk-assessment';
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
      if (!data || typeof data !== 'object') throw new Error('not an object');
      ['Ng', 'L', 'W', 'Hi', 'T', 'project'].forEach(k => { if (!(k in data)) throw new Error('missing field: ' + k); });
    },
    onLoaded(data) {
      const base = cloneDefaults();
      const d = data;
      base.project.name = String(d.project && d.project.name !== undefined ? d.project.name : '');
      base.project.id = String(d.project && d.project.id !== undefined ? d.project.id : '');
      const numOr = (v, fb) => { const n = parseFloat(v); return isNaN(n) ? fb : n; };
      base.Ng = numOr(d.Ng, base.Ng);
      base.L = numOr(d.L, base.L);
      base.W = numOr(d.W, base.W);
      base.Hi = numOr(d.Hi, base.Hi);
      base.T = numOr(d.T, base.T);
      base.lifeCritical = !!d.lifeCritical;
      Object.keys(FIELD_TABLE).forEach(k => {
        if (lookupValue(FIELD_TABLE[k], data[k]) != null) base[k] = data[k];
      });
      if (['No', 'Aerial', 'Underground'].indexOf(d.Ai) >= 0) base.Ai = d.Ai;
      state = base;
      renderAll();
      showToast('Project loaded.', 'success');
    },
  });
});

/* ===================================================================
   PDF EXPORT (native browser print-to-PDF, styled via @media print)
   =================================================================== */
function factorPair(key, label) {
  const tableName = FIELD_TABLE[key];
  const v = tableName ? lookupValue(tableName, state[key]) : null;
  return [label, state[key] + (v != null ? ' (' + v + ')' : '')];
}
function coverSectionHTML() {
  const p = state.project;
  return '<section class="print-page">' +
    '<div class="cover-title">Lightning Risk Assessment</div>' +
    '<table class="print-kv-table">' +
      '<tr><th>Building / Installation</th><td>' + escapeHtml(pv(p.name)) + '</td></tr>' +
      '<tr><th>Building ID No.</th><td>' + escapeHtml(pv(p.id)) + '</td></tr>' +
      '<tr><th>Assessment basis</th><td>' + escapeHtml(STANDARD_EDITION.label) + '</td></tr>' +
      '<tr><th>Date</th><td>' + escapeHtml(pv(new Date().toISOString().slice(0, 10))) + '</td></tr>' +
    '</table>' +
  '</section>';
}
function inputsSectionHTML() {
  return '<section class="print-page">' +
    '<h2 class="print-page-title">Assessment Inputs</h2>' +
    printBlock('Structure Geometry', printFieldsHTML([
      ['Length, L (m)', state.L], ['Width, W (m)', state.W], ['Height, Hi (m)', state.Hi],
      ['Chimney / Tower height, T (m)', state.T], ['Lightning Strike Density, Ng (flashes/km\u00b2/yr)', state.Ng],
    ])) +
    printBlock('Structure & Occupancy', printFieldsHTML([
      ['Danger for People (hz)', state.hz],
      ['Structure Type (Table C.2)', state.structureType],
      ['Floor / Ground Surface (rt)', state.floorType],
      ['Fire-Fighting Provisions (rp)', state.fireProvisions],
      ['Hospital / life-critical facility', state.lifeCritical ? 'Yes' : 'No'],
    ])) +
    printBlock('Protection & Location', printFieldsHTML([
      factorPair('Pd', 'Lightning Protection Level (PB)'),
      factorPair('spd', 'Surge Protection Device (PSPD)'),
      ['Electrical Line (Ai)', state.Ai],
      factorPair('Cd', 'Relative Location (CD)'),
      factorPair('rf', 'Fire Risk (rf)'),
      factorPair('services', 'Associated Services (Table C.3)'),
    ])) +
  '</section>';
}
function prCard(label, value, ok) {
  return '<div class="pr-card status-' + (ok ? 'ok' : 'fail') + '"><div class="prl">' + label + '</div><div class="prv">' + value + '</div></div>';
}
function calcSectionHTML(res) {
  const anyFail = RISK_META.some(m => res[m.resultKey] === 'NOT ACCEPTABLE');
  const r1Comps = res.lifeCritical
    ? 'RA ' + fmtSci(res.RA) + ' \u00b7 RB ' + fmtSci(res.RB1) + ' \u00b7 RC ' + fmtSci(res.RC1) + ' \u00b7 RM ' + fmtSci(res.RM1)
    : 'RA ' + fmtSci(res.RA) + ' \u00b7 RB ' + fmtSci(res.RB1) + ' \u00b7 RC/RM not applicable';
  const checklist = RISK_META.map(m => {
    const ok = res[m.resultKey] === 'ACCEPTABLE';
    return '<div class="pc-row pc-' + (ok ? 'pass' : 'fail') + '">' +
      '<span class="pc-dot"></span><span class="pc-txt">' + m.title + ' (tolerable \u2264 ' + fmtSci(m.threshold) + ')</span>' +
      '<span class="pc-v">' + escapeHtml(res[m.resultKey]) + '</span>' +
    '</div>';
  }).join('');

  return '<section class="print-page">' +
    '<h2 class="print-page-title">Risk Assessment Results</h2>' +
    printBlock('Dangerous Events & Probabilities', printFieldsHTML([
      ['Catching area, AD (m\u00b2)', fmt(res.AD, 2)],
      ['Nearby-flash area, AM (m\u00b2)', fmt(res.AM, 2)],
      ['Strikes to structure, ND (per year)', fmtSci(res.ND)],
      ['Strikes near structure, NM (per year)', fmtSci(res.NM)],
      ['PA (shock)', res.PA], ['PB (physical damage)', res.PB],
      ['PC (internal systems, direct)', res.PC], ['PM (internal systems, nearby)', res.PM],
    ])) +
    printBlock('Loss Values (Annex C)', printFieldsHTML([
      ['LA (human life, shock)', fmtSci(res.LA)],
      ['LB (human life, physical damage)', fmtSci(res.LB1)],
      ['LC/LM (human life, internal systems)', fmtSci(res.LC1)],
      ['LB (service, physical damage)', fmtSci(res.LB2)],
      ['LC/LM (service, internal systems)', fmtSci(res.LC2)],
      ['LB (cultural heritage)', fmtSci(res.LB3)],
    ])) +
    printBlock('Risk Components', printFieldsHTML([
      ['R1 components', r1Comps],
      ['R2 components', 'RB ' + fmtSci(res.RB2) + ' \u00b7 RC ' + fmtSci(res.RC2) + ' \u00b7 RM ' + fmtSci(res.RM2)],
      ['R3 components', 'RB ' + fmtSci(res.RB3)],
    ])) +
    printBlock('Calculated Risk vs Tolerable Threshold',
      '<div class="print-results" style="grid-template-columns:repeat(3,1fr);">' +
        prCard('R1 \u2014 Risk of human loss', fmtSci(res.R1), res.result1 === 'ACCEPTABLE') +
        prCard('R2 \u2014 Risk of loss of service', fmtSci(res.R2), res.result2 === 'ACCEPTABLE') +
        prCard('R3 \u2014 Risk of cultural heritage', fmtSci(res.R3), res.result3 === 'ACCEPTABLE') +
      '</div>') +
    printBlock('Verdict', '<div class="print-checklist">' + checklist + '</div>') +
    (anyFail ? printBlock('Mitigation', '<div style="font-size:11.5px;color:#5b6675;">The calculated risk exceeds the tolerable threshold for one or more risk types. Add or upgrade the lightning protection system (reduce the Lightning Protection Level) and/or install a coordinated SPD system, then re-run the assessment.</div>') : '') +
    printBlock('Scope & Data Notes', '<div style="font-size:11px;color:#5b6675;line-height:1.5;">' +
      'Component model per ' + escapeHtml(STANDARD_EDITION.label) + '. Risk contributions from flashes to or near connected electrical lines (RU/RV/RW/RZ) are not yet modelled \u2014 for significant overhead-line exposure, consult a lightning protection engineer. Provisional values pending sign-off: PMS default and life-critical LO fallback (grep NEEDS_VERIFICATION in the source data).</div>') +
  '</section>';
}
function buildReportHTML() {
  const res = calculateLightningRisk(readParams());
  return assembleSections([coverSectionHTML(), inputsSectionHTML(), calcSectionHTML(res)]);
}
$('#btnPdf').addEventListener('click', () => {
  const errs = geometryErrors();
  if (Object.keys(errs).length) {
    showToast('Complete the structure geometry inputs before exporting a report.', 'error');
    return;
  }
  try {
    runPrint(buildReportHTML());
  } catch (err) {
    console.error('PDF export failed:', err);
    showToast('Export PDF failed: ' + err.message, 'error', 6000);
  }
});

/* ===================================================================
   INIT
   =================================================================== */
renderAll();