/* ===================================================================
   Network Diagram Builder - undo/redo + localStorage autosave
   One global snapshot stack covers Project/Settings/Network/Load
   Schedule/Diagram edits alike, since they all mutate the same `state`.
   =================================================================== */
var History = (function () {
  const KEY = 'networkDiagramBuilder.autosave.v1';
  const MAX = 60;
  const DEBOUNCE_MS = 250;

  let undoStack = [];
  let redoStack = [];
  let last = null;
  let timer = null;

  function snapshot() { return JSON.stringify(state); }

  function autosave(json) {
    try { localStorage.setItem(KEY, json); } catch (e) { /* ignore quota/private-mode errors */ }
  }

  function updateButtons() {
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.disabled = undoStack.length === 0;
    if (r) r.disabled = redoStack.length === 0;
  }

  function push(cur) {
    if (last != null && cur !== last) {
      undoStack.push(last);
      if (undoStack.length > MAX) undoStack.shift();
      redoStack = [];
    }
    last = cur;
    autosave(cur);
    updateButtons();
  }

  // Debounced, coalescing capture: call after every render/mutation. Cheap
  // no-op if nothing actually changed since the last capture.
  function mark() {
    clearTimeout(timer);
    timer = setTimeout(() => { push(snapshot()); }, DEBOUNCE_MS);
  }

  // Immediate (non-debounced) capture, used right before a drag/gesture
  // begins so the pre-drag state is guaranteed to be its own undo step.
  function commit() {
    clearTimeout(timer);
    push(snapshot());
  }

  function afterRestore() {
    resetAllViewState();
    renderActive();
    if (window.Diagram) Diagram.render();
  }

  function undo() {
    if (!undoStack.length) return;
    clearTimeout(timer);
    const cur = snapshot();
    redoStack.push(cur);
    last = undoStack.pop();
    state = JSON.parse(last);
    autosave(last);
    updateButtons();
    afterRestore();
  }

  function redo() {
    if (!redoStack.length) return;
    clearTimeout(timer);
    const cur = snapshot();
    undoStack.push(cur);
    last = redoStack.pop();
    state = JSON.parse(last);
    autosave(last);
    updateButtons();
    afterRestore();
  }

  function reset() {
    showConfirm('Start a new project? This clears the current network, diagram and autosave. Export JSON first if you want to keep a copy.', 'Start new', () => {
      try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
      state = defaultState();
      undoStack = []; redoStack = []; last = null;
      afterRestore();
      last = snapshot();
      updateButtons();
      showToast('Started a new project.', 'success');
    });
  }

  function init() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        state = JSON.parse(saved);
        normalizeState();
      }
    } catch (e) { /* corrupt autosave: fall back to defaultState() already in `state` */ }
    last = snapshot();
    updateButtons();
    const u = $('#btnUndo'), r = $('#btnRedo');
    if (u) u.addEventListener('click', undo);
    if (r) r.addEventListener('click', redo);
  }

  return { init, mark, commit, undo, redo, reset, KEY };
})();

if (typeof module !== 'undefined') { module.exports = History; }
