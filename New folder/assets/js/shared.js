/* ===================================================================
   SHARED, CALCULATOR-AGNOSTIC JS HELPERS
   Loaded by every calculator / placeholder / home page before any
   calculator-specific script (data.js / calc-engine.js / app.js).
   =================================================================== */

/* ---------- DOM helpers ---------- */
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
function el(tag, attrs, children) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else e.setAttribute(k, attrs[k]);
  }
  (children || []).forEach(c => { if (c != null) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
  return e;
}

/* ---------- formatting ---------- */
function fmt(v, dp) {
  if (v === null || v === undefined || v === '') return '\u2013';
  if (v === 'N.A.' || v === 'N/A' || v === 'ERROR') return v;
  if (typeof v === 'number') return v.toFixed(dp === undefined ? 2 : dp);
  return String(v);
}
function numOrEmpty(v) { return (v === '' || v === null || v === undefined) ? '' : v; }
function round(v, dp) {
  if (v === null || v === undefined || isNaN(v)) return v;
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}
function pv(v) { return (v === null || v === undefined || v === '') ? '\u2013' : v; }
function escapeHtml(s) {
  return String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ===================================================================
   CUSTOM CONFIRM / TOAST (native confirm()/alert() get silently
   blocked inside sandboxed embedded previews, so we don't rely on them)
   Markup is injected lazily on first use if a page doesn't already
   provide it statically, so pages don't have to hand-copy this HTML.
   =================================================================== */
function ensureConfirmMarkup() {
  let overlay = document.getElementById('confirmOverlay');
  if (overlay) return overlay;
  overlay = el('div', { id: 'confirmOverlay', class: 'mini-overlay' }, [
    el('div', { class: 'mini-modal', style: 'max-width:380px;' }, [
      el('div', { class: 'modalbody', style: 'padding-top:22px;' }, [
        el('div', { id: 'confirmMessage', style: 'font-size:13.5px;line-height:1.5;' }),
      ]),
      el('div', { class: 'modalfoot', style: 'justify-content:flex-end;gap:8px;' }, [
        el('button', { class: 'tbtn', id: 'confirmCancelBtn', style: 'background:var(--surface-2);color:var(--ink);border-color:var(--border-strong);' }, ['Cancel']),
        el('button', { class: 'tbtn primary', id: 'confirmOkBtn', style: 'background:var(--fail-ink);border-color:var(--fail-ink);' }, ['Confirm']),
      ]),
    ]),
  ]);
  document.body.appendChild(overlay);
  return overlay;
}
function ensureToastMarkup() {
  let c = document.getElementById('toastContainer');
  if (c) return c;
  c = el('div', { id: 'toastContainer' });
  document.body.appendChild(c);
  return c;
}
function showConfirm(message, okLabel, onConfirm) {
  ensureConfirmMarkup();
  $('#confirmMessage').textContent = message;
  $('#confirmOkBtn').textContent = okLabel || 'Confirm';
  $('#confirmOverlay').classList.add('open');
  function cleanup() {
    $('#confirmOverlay').classList.remove('open');
    $('#confirmOkBtn').removeEventListener('click', okHandler);
    $('#confirmCancelBtn').removeEventListener('click', cancelHandler);
  }
  function okHandler() { cleanup(); onConfirm(); }
  function cancelHandler() { cleanup(); }
  $('#confirmOkBtn').addEventListener('click', okHandler);
  $('#confirmCancelBtn').addEventListener('click', cancelHandler);
}
function showToast(message, type, durationMs) {
  ensureToastMarkup();
  const t = el('div', { class: 'toast' + (type ? ' ' + type : '') }, [message]);
  $('#toastContainer').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, durationMs || 4000);
}

/* ===================================================================
   FIELD BUILDERS
   =================================================================== */
function inputField(label, value, onChange, opts) {
  opts = opts || {};
  const wrap = el('div', { class: 'field' + (opts.computed ? ' computed' : '') });
  wrap.appendChild(el('label', {}, [label]));
  const isNumeric = opts.type === 'number';
  const input = el('input', {
    // Use text + inputmode instead of type="number": number inputs report an
    // empty .value while a decimal is mid-typed (e.g. right after "6."),
    // which corrupts values as the field re-renders on every keystroke.
    type: isNumeric ? 'text' : (opts.type || 'text'),
    ...(isNumeric ? { inputmode: 'decimal' } : {}),
  });
  input.value = value === null || value === undefined ? '' : value;
  if (opts.field) input.dataset.field = opts.field;
  if (opts.readonly || opts.computed) input.readOnly = true;
  if (opts.placeholder) input.placeholder = opts.placeholder;
  if (isNumeric) input.style.fontVariantNumeric = 'tabular-nums';
  if (!opts.computed && !opts.readonly) {
    input.addEventListener('input', () => {
      if (!isNumeric) { onChange(input.value); return; }
      const raw = input.value.trim();
      if (raw === '' || raw === '-' || raw === '.' || raw === '-.') { onChange(''); return; }
      const n = parseFloat(raw);
      onChange(isNaN(n) ? '' : n);
    });
  }
  wrap.appendChild(input);
  if (opts.hint) wrap.appendChild(el('div', { class: 'hint' }, [opts.hint]));
  return wrap;
}

function selectField(label, value, options, onChange, opts) {
  opts = opts || {};
  const wrap = el('div', { class: 'field' });
  wrap.appendChild(el('label', {}, [label]));
  const sel = el('select', {});
  if (opts.field) sel.dataset.field = opts.field;
  options.forEach(o => {
    const optEl = el('option', { value: o }, [String(o)]);
    if (String(o) === String(value)) optEl.setAttribute('selected', 'selected');
    sel.appendChild(optEl);
  });
  sel.addEventListener('change', () => onChange(sel.value));
  wrap.appendChild(sel);
  if (opts.hint) wrap.appendChild(el('div', { class: 'hint' }, [opts.hint]));
  return wrap;
}

/* Re-run a render function while preserving keyboard focus & cursor position
   of whichever input/select (tagged with data-field) is currently focused
   inside the given container. Needed because every keystroke triggers a
   full re-render of that section (so computed/derived fields stay in sync). */
function withFocusPreserved(containerSelector, renderFn) {
  const container = document.querySelector(containerSelector);
  let info = null;
  const active = document.activeElement;
  if (container && active && container.contains(active) && active.dataset && active.dataset.field) {
    info = {
      field: active.dataset.field,
      tag: active.tagName,
      rawValue: (active.tagName === 'INPUT') ? active.value : null,
      start: (typeof active.selectionStart === 'number') ? active.selectionStart : null,
      end: (typeof active.selectionEnd === 'number') ? active.selectionEnd : null,
    };
  }
  renderFn();
  if (info) {
    const el2 = document.querySelector(containerSelector + ' [data-field="' + info.field + '"]');
    if (el2) {
      // Restore the exact text the user was typing (e.g. a trailing "." or "-")
      // rather than the value re-derived from parsed state, which would
      // otherwise silently discard characters that don't form a complete number yet.
      if (info.tag === 'INPUT' && el2.tagName === 'INPUT' && info.rawValue !== null) {
        el2.value = info.rawValue;
      }
      el2.focus();
      if (info.tag === 'INPUT' && el2.setSelectionRange && info.start !== null) {
        try { el2.setSelectionRange(info.start, info.end); } catch (e) { /* ignore */ }
      }
    }
  }
}

/* ===================================================================
   GENERIC TAB CONTROLLER
   Wires up any `.tabbtn[data-view]` / `#view-<name>` pair on the page.
   Returns a setView(name) function the caller can also invoke directly
   (e.g. to set the initial view on load).
   =================================================================== */
function initTabs(onChange) {
  const btns = $all('.tabbtn');
  function setView(v) {
    btns.forEach(b => b.classList.toggle('active', b.dataset.view === v));
    $all('.view').forEach(s => s.classList.remove('active'));
    const target = $('#view-' + v);
    if (target) target.classList.add('active');
    if (onChange) onChange(v);
  }
  btns.forEach(btn => {
    btn.addEventListener('click', () => setView(btn.dataset.view));
  });
  return setView;
}

/* ===================================================================
   GENERIC METRIC SUMMARY CHIPS
   (generalized version of the LV calculator's "derate strip/chip")
   =================================================================== */
function metricChip(label, value, strong) {
  const chip = el('div', { class: 'metric-chip' });
  chip.appendChild(el('div', { class: 'lbl' }, [label]));
  chip.appendChild(el('div', { class: 'val', style: strong ? 'color:var(--accent-dark);' : '' }, [value == null ? '\u2013' : String(value)]));
  return chip;
}
function metricStrip(sel, chips) {
  const c = typeof sel === 'string' ? $(sel) : sel;
  if (!c) return;
  c.innerHTML = '';
  (chips || []).forEach(chipDef => {
    const [label, value, strong] = chipDef;
    c.appendChild(metricChip(label, value, strong));
  });
}

/* ===================================================================
   GENERIC PRINT / PDF PLUMBING (native browser print-to-PDF, styled
   via @media print). Fully domain-agnostic; calculators build their
   own section HTML and pass it to runPrint().
   =================================================================== */
function printFieldsHTML(pairs) {
  return '<div class="print-grid">' + pairs.map(([l, v]) =>
    '<div class="print-field"><div class="pl">' + escapeHtml(l) + '</div><div class="pv">' + escapeHtml(pv(v)) + '</div></div>'
  ).join('') + '</div>';
}
function printBlock(title, innerHtml) {
  return '<div class="print-block"><h4>' + escapeHtml(title) + '</h4>' + innerHtml + '</div>';
}
// Combine an ordered list of "<section class="print-page">...</section>" blocks,
// forcing a page break before every section except the first.
function assembleSections(list) {
  return list.map((html, i) => i === 0 ? html : html.replace('<section class="print-page">', '<section class="print-page pagebreak">')).join('');
}
function runPrint(html) {
  const area = $('#printArea');
  area.innerHTML = html;
  document.body.classList.add('printing');
  const cleanup = () => { document.body.classList.remove('printing'); area.innerHTML = ''; window.removeEventListener('afterprint', cleanup); };
  window.addEventListener('afterprint', cleanup);
  window.print();
}

/* ===================================================================
   GENERIC JSON IMPORT / EXPORT PLUMBING
   =================================================================== */
function downloadJSON(filenameBase, dataObj) {
  const blob = new Blob([JSON.stringify(dataObj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const name = String(filenameBase || 'export').replace(/[^a-z0-9\-_]+/gi, '_') + '.json';
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// opts: { validate(data) - throw if invalid, onLoaded(data) }
function importJSONFile(fileInputEl, opts) {
  opts = opts || {};
  const file = fileInputEl.files && fileInputEl.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (opts.validate) opts.validate(data);
      if (opts.onLoaded) opts.onLoaded(data);
    } catch (err) {
      showToast('Could not read this file as a valid project export.', 'error');
    }
  };
  reader.onerror = () => showToast('Could not read the selected file.', 'error');
  reader.readAsText(file);
  fileInputEl.value = '';
}

/* ===================================================================
   FILE:// / CROSS-ORIGIN-IFRAME BANNER DETECTION
   Injects the warning banner markup if a page doesn't already provide
   it, then shows it when the page is loaded inside a (usually sandboxed,
   cross-origin) embedded preview frame, where downloads are normally
   blocked.
   =================================================================== */
function ensureIframeBannerMarkup() {
  let banner = document.getElementById('iframeBanner');
  if (banner) return banner;
  banner = el('div', {
    id: 'iframeBanner',
    style: 'display:none;background:#fff6df;color:#8a5a00;border-bottom:1px solid #f0d894;padding:10px 20px;font-size:12.5px;text-align:center;',
    html: 'You\u2019re viewing this inside an embedded preview, which usually blocks file downloads. ' +
      '<strong>Open this file directly in your browser</strong> (download it, then double-click it, or use File&nbsp;&rarr;&nbsp;Open) to use Export JSON / Export PDF. ' +
      '<button id="btnOpenNewTab" style="margin-left:10px;background:#8a5a00;color:#fff;border:none;padding:4px 10px;border-radius:5px;cursor:pointer;font-size:12px;">Try opening in a new tab</button>',
  });
  document.body.insertBefore(banner, document.body.firstChild);
  return banner;
}
function initEmbeddedPreviewBanner() {
  const banner = ensureIframeBannerMarkup();
  let inCrossOriginFrame = false;
  try { inCrossOriginFrame = window.self !== window.top; } catch (e) { inCrossOriginFrame = true; }
  if (inCrossOriginFrame) banner.style.display = 'block';
  const btn = document.getElementById('btnOpenNewTab');
  if (btn) {
    btn.addEventListener('click', () => {
      try {
        const w = window.open(window.location.href, '_blank');
        if (!w) showToast("Your browser blocked the new tab. Please download this HTML file and open it directly instead (double-click it, or use your browser's File \u2192 Open).", 'error', 7000);
      } catch (e) {
        showToast("Couldn't open a new tab from here. Please download this HTML file and open it directly in your browser instead.", 'error', 7000);
      }
    });
  }
}

if (typeof module !== 'undefined') {
  module.exports = {
    $, $all, el, fmt, numOrEmpty, round, pv, escapeHtml,
    showConfirm, showToast, inputField, selectField, withFocusPreserved,
    initTabs, metricChip, metricStrip,
    printFieldsHTML, printBlock, assembleSections, runPrint,
    downloadJSON, importJSONFile, initEmbeddedPreviewBanner,
  };
}
