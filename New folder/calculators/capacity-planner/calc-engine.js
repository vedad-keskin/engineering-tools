// ============================================================
// Capacity Planner - calculation engine (pure functions)
// Hierarchy: Utility -> MV distribution -> Transformer/Generator
//            -> UPS/LV switchboards -> loads.
// Every load has a primary supply (parentId) and an optional
// redundant supply (redundantParentId). Sizing counts each load at
// 100% on EVERY connected feed path (primary and redundant, whenever
// that parent is set), so each source is sized to carry it; building
// totals count each load once via the active feed
// (activeFeed: 'primary' | 'redundant' | '50-50').
// Load category is derived purely from upstream equipment:
//   critical       -> a UPS appears on any upstream path
//   essential      -> no UPS, but a generator appears upstream
//   non-essential  -> neither
//
// Operating scenarios: every node has a base `active` flag
// ("Normal" mode). Each named scenario may store per-node
// overrides (`overrides: { nodeId: 'active'|'inactive' }`); a node
// missing from the override map inherits its base flag. All engine
// functions accept an optional `scenario` argument (default null =
// base flags). An inactive node propagates downstream — a child is
// only effective when at least one of its primary/redundant supply
// chains is effective. A load with an active redundant supply but a
// dead primary path is fed 100% by the redundant supply (ignoring a
// 50-50 split). Under a 50/50 split each feed sizes at 100% but the
// single-count active load is split 50/50.
// ============================================================

function stateNode(nodes, id) { return nodes.find(n => n.id === id); }

function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

// Children in the primary-supply tree.
function childrenOf(nodes, id) { return nodes.filter(n => n.parentId === id); }

// Every node reachable via primary OR redundant parent chains, including `node`
// itself. Cycle-safe (visited set).
function ancestorsOf(nodes, node) {
  if (!node) return [];
  const acc = [];
  const seen = new Set();
  function visit(n) {
    if (!n || seen.has(n.id)) return;
    seen.add(n.id);
    acc.push(n);
    if (n.parentId != null) visit(stateNode(nodes, n.parentId));
    if (n.redundantParentId != null) visit(stateNode(nodes, n.redundantParentId));
  }
  visit(node);
  return acc;
}

// The ids along one feed's parent chain, starting from the node's own parent
// upward (empty for a missing / null feed).
function walkUp(nodes, node, key) {
  const ids = [];
  const seen = new Set();
  let cur = node;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const pid = cur[key];
    if (pid == null) break;
    ids.push(pid);
    cur = stateNode(nodes, pid);
  }
  return ids;
}

// Does `node` lie on the given feed chain (primary or redundant) of `load`?
function passesThroughKey(nodes, device, load, key) {
  return walkUp(nodes, load, key).indexOf(device.id) >= 0;
}

// Does `node` lie on any upstream path (primary OR redundant) of `load`?
function passesThrough(nodes, node, load) {
  return passesThroughKey(nodes, node, load, 'parentId') ||
    passesThroughKey(nodes, node, load, 'redundantParentId');
}

// Effective Active/Inactive status of a node in a scenario.
// A node is effective only if it is not flagged inactive AND at least one of
// its primary / redundant supply chains is itself effective. Power sources
// (parentId == null) are effective purely from their own flag.
function effActive(nodes, n, scenario, memo) {
  memo = memo || new Map();
  if (!n) return false;
  if (memo.has(n.id)) return memo.get(n.id);
  memo.set(n.id, false);           // cycle guard
  let ok = false;
  if (scenarioOverrideActive(n, scenario)) {
    if (n.parentId == null) {
      ok = true;
    } else {
      const prim = stateNode(nodes, n.parentId);
      const red = n.redundantParentId != null ? stateNode(nodes, n.redundantParentId) : null;
      ok = (prim ? effActive(nodes, prim, scenario, memo) : false) ||
        (red ? effActive(nodes, red, scenario, memo) : false);
    }
  }
  memo.set(n.id, ok);
  return ok;
}

// Is a node's own (base or scenario overridden) status active?
function scenarioOverrideActive(n, scenario) {
  if (n == null) return false;
  if (scenario && scenario.overrides && scenario.overrides[n.id] != null) {
    return scenario.overrides[n.id] === 'active';
  }
  return n.active !== false;
}

// Is the load's feed connection along `key` usable?  Only the immediate
// parent's effective-active status matters: effActive already encodes
// whether the parent's busbar is energised (via its own primary or
// redundant feed).  Walking the full chain would incorrectly count a
// live intermediate node as "dead" when its own primary chain has a
// failed ancestor but the node itself is fed through its redundant supply.
function pathUsable(nodes, load, key, scenario, memo) {
  const pid = load[key];
  if (pid == null) return false;
  const parent = stateNode(nodes, pid);
  return parent != null && effActive(nodes, parent, scenario, memo);
}

// Determine how (and whether) a load contributes in a scenario.
// Returns null when the load is excluded (own status inactive, or no usable
// feed). Otherwise { P, R } fractions of the demand carried by the primary and
// redundant feeds respectively.
function loadContribution(nodes, load, scenario) {
  if (!scenarioOverrideActive(load, scenario)) return null;
  const memo = new Map();
  const pu = pathUsable(nodes, load, 'parentId', scenario, memo);
  const ru = load.redundantParentId != null
    ? pathUsable(nodes, load, 'redundantParentId', scenario, memo)
    : false;
  if (!pu && !ru) return null;
  const feed = load.activeFeed || 'primary';
  let P = 0, R = 0;
  if (pu && ru) {
    if (feed === 'redundant') { R = 1; }
    else if (feed === '50-50') { P = 0.5; R = 0.5; }
    else { P = 1; }
  } else if (pu) { P = 1; }        // primary forced / only primary usable
  else { R = 1; }                  // redundant assumes primary (even if 50-50)
  return { P: P, R: R };
}

// Does `node` lie on the load's ACTIVE feed path only (legacy single-feed)?
function passesActiveThrough(nodes, node, load) {
  if (load.activeFeed === 'redundant') {
    if (load.redundantParentId == null) return false;
    return walkUp(nodes, load, 'redundantParentId').includes(node.id);
  }
  return walkUp(nodes, load, 'parentId').includes(node.id);
}

// Category is derived (never stored). Only effective (active) upstream
// equipment is considered.
function deriveCategory(nodes, node, scenario) {
  const chain = ancestorsOf(nodes, node);
  const memo = new Map();
  const act = chain.filter(n => effActive(nodes, n, scenario, memo));
  if (act.some(n => n.type === 'ups')) return 'critical';
  if (act.some(n => n.type === 'generator' || n.type === 'battery')) return 'essential';
  return 'non-essential';
}

// Per-load numerics. ratedKW may be '' (treated as incomplete -> nulls).
function loadCalc(load) {
  const ksv = parseFloat(load.pf);
  const pf = (ksv > 0) ? ksv : null;
  const rated = num(load.ratedKW);
  const df = (load.demandFactor === '' || load.demandFactor === null || load.demandFactor === undefined) ? null : parseFloat(load.demandFactor);
  const kva = (rated > 0 && pf) ? rated / pf : null;
  const demandKW = (rated > 0 && df !== null && !isNaN(df)) ? rated * df : null;
  const demandKVA = (demandKW != null && pf) ? demandKW / pf : null;
  const phaseFactor = Number(load.phases) === 3 ? Math.sqrt(3) : 1;
  const flc = (kva != null && num(load.voltageV) > 0) ? (kva * 1000) / (phaseFactor * num(load.voltageV)) : null;
  return { kva, demandKW, demandKVA, flc, pf };
}

function threePhaseKVA(V, A) {
  V = num(V); A = num(A);
  return (V > 0 && A > 0) ? Math.sqrt(3) * V * A / 1000 : null;
}

// Rating of a distribution/equipment node expressed in kVA (the unit used for
// utilisation). Switchboards are rated in A, converted via 3-phase voltage.
function nodeRatingKVA(node) {
  switch (node.type) {
    case 'utility': return num(node.contractKVA) > 0 ? num(node.contractKVA) : null;
    case 'transformer':
    case 'generator':
    case 'ups': return num(node.ratingKVA) > 0 ? num(node.ratingKVA) : null;
    case 'mv-dist':
    case 'dist': return threePhaseKVA(node.voltageV, node.ratingA);
    default: return null;
  }
}

// Roll-up for one node. Sizing = loads connected via a feed path (100% per
// connected feed — a load is counted on BOTH its primary and redundant paths
// whenever that parent is set, so each source is sized to carry it); active =
// single-count demand using the active feed fractions (50/50 splits).
function nodeRollup(nodes, node, scenario) {
  let sizingKVA = 0, activeKVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load') continue;
    if (l.active === false && !(scenario && scenario.overrides && scenario.overrides[l.id] != null)) continue;
    const c = loadCalc(l);
    if (c.demandKVA == null) continue;
    const cc = loadContribution(nodes, l, scenario);
    if (!cc) continue;
    const onP = passesThroughKey(nodes, node, l, 'parentId');
    const onR = passesThroughKey(nodes, node, l, 'redundantParentId');
    if (onP && l.parentId != null) sizingKVA += c.demandKVA;
    if (onR && l.redundantParentId != null) sizingKVA += c.demandKVA;
    if (onP && cc.P > 0) activeKVA += c.demandKVA * cc.P;
    if (onR && cc.R > 0) activeKVA += c.demandKVA * cc.R;
  }
  const ratingKVA = nodeRatingKVA(node);
  let utilizationPct = null, badge = null;
  if (ratingKVA != null && ratingKVA > 0) {
    utilizationPct = (sizingKVA / ratingKVA) * 100;
    badge = utilizationPct > 100 ? 'fail' : utilizationPct > 80 ? 'warn' : 'ok';
  }
  return { sizingKVA, activeKVA, ratingKVA, utilizationPct, badge };
}

// Demand-weighted power factor for the node's effective sizing load set.
function nodePowerFactor(nodes, node, scenario) {
  let sumKW = 0, sumKVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load') continue;
    const c = loadCalc(l);
    if (c.demandKVA == null || c.demandKW == null) continue;
    const cc = loadContribution(nodes, l, scenario);
    if (!cc) continue;
    const onP = passesThroughKey(nodes, node, l, 'parentId');
    const onR = passesThroughKey(nodes, node, l, 'redundantParentId');
    if ((onP && cc.P > 0) || (onR && cc.R > 0)) { sumKW += c.demandKW; sumKVA += c.demandKVA; }
  }
  return sumKVA > 0 ? sumKW / sumKVA : null;
}

// Is a load included in a scenario's building/equipment totals? (either feed usable)
function loadCounted(nodes, load, scenario) {
  return loadContribution(nodes, load, scenario) != null;
}

// Whole-building / utility totals, per active feed, plus overloaded nodes.
function systemTotals(nodes, scenario) {
  const cat = {
    critical: { kW: 0, kVA: 0 },
    essential: { kW: 0, kVA: 0 },
    'non-essential': { kW: 0, kVA: 0 },
  };
  let connectedKW = 0, connectedKVA = 0, demandKW = 0, demandKVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load' || !loadCounted(nodes, l, scenario)) continue;
    const c = loadCalc(l);
    connectedKW += num(l.ratedKW);
    connectedKVA += c.kva || 0;
    demandKW += c.demandKW || 0;
    demandKVA += c.demandKVA || 0;
    const ct = deriveCategory(nodes, l, scenario);
    cat[ct].kW += c.demandKW || 0;
    cat[ct].kVA += c.demandKVA || 0;
  }

  let utilityActive = 0, utilityContract = 0;
  for (const u of nodes) {
    if (u.type !== 'utility') continue;
    const r = nodeRollup(nodes, u, scenario);
    utilityActive += r.activeKVA;
    utilityContract += num(u.contractKVA);
  }
  const utilityPct = utilityContract > 0 ? (utilityActive / utilityContract) * 100 : null;

  const overloaded = nodes
    .filter(n => n.type !== 'load')
    .map(n => ({ node: n, roll: nodeRollup(nodes, n, scenario) }))
    .filter(x => x.roll.utilizationPct != null && x.roll.utilizationPct > 100)
    .map(x => x.node);

  return { connectedKW, connectedKVA, demandKW, demandKVA, cat, utilityActive, utilityContract, utilityPct, overloaded };
}

// Would assigning `newParentId` as a (primary or redundant) parent of `nodeId`
// create a cycle? True when newParent is the node itself or one of its
// descendants. Descendants are walked over primary AND redundant chains.
function wouldCreateCycle(nodes, nodeId, newParentId) {
  if (newParentId == null || nodeId === newParentId) return nodeId === newParentId;
  const start = stateNode(nodes, newParentId);
  if (!start) return false;
  let seen = new Set();
  let cur = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.id === nodeId) return true;
    cur = cur.parentId != null ? stateNode(nodes, cur.parentId) : null;
  }
  seen = new Set(); cur = start;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.id === nodeId) return true;
    cur = cur.redundantParentId != null ? stateNode(nodes, cur.redundantParentId) : null;
  }
  return false;
}

// ids of the whole subtree hanging off `id` in the primary tree (excludes id).
function descendantsOf(nodes, id) {
  const out = [];
  function walk(pid) {
    for (const c of childrenOf(nodes, pid)) { out.push(c.id); walk(c.id); }
  }
  walk(id);
  return out;
}

// Candidate supply parents for re-parenting / redundant assignment: any
// non-load node that isn't the node itself or one of its descendants.
function eligibleParents(nodes, node, opts) {
  opts = opts || {};
  const banned = new Set([node.id]);
  descendantsOf(nodes, node.id).forEach(d => banned.add(d));
  return nodes.filter(n => n.type !== 'load' && !banned.has(n.id));
}

// Loads effectively fed by a node in a scenario (sizing set).
function passThroughLoads(nodes, node, scenario) {
  return nodes.filter(l => {
    if (l.type !== 'load') return false;
    const cc = loadContribution(nodes, l, scenario);
    if (!cc) return false;
    if (passesThroughKey(nodes, node, l, 'parentId') && cc.P > 0) return true;
    if (passesThroughKey(nodes, node, l, 'redundantParentId') && cc.R > 0) return true;
    return false;
  });
}

// All loads physically connected to a node, plus their installed sums.
// A load is "connected" when the node lies on the load's primary OR redundant
// feed chain, so loads backed up via a redundant feed count too (each load is
// counted once, even when both feeds pass through the same node). This is a
// wiring property: scenario active/inactive state and the stored activeFeed
// preference do not affect it.
function connectedLoadCalc(nodes, node) {
  let count = 0, kW = 0, kVA = 0;
  for (const l of nodes) {
    if (l.type !== 'load') continue;
    if (passesThrough(nodes, node, l)) {
      const c = loadCalc(l);
      count++;
      kW += num(l.ratedKW);
      kVA += c.kva || 0;
    }
  }
  return { count, kW, kVA };
}

if (typeof module !== 'undefined') {
  module.exports = {
    stateNode, childrenOf, ancestorsOf, walkUp, passesThrough, passesThroughKey,
    passesActiveThrough, effActive, scenarioOverrideActive, loadContribution,
    deriveCategory, loadCalc, nodeRatingKVA, nodeRollup, nodePowerFactor,
    loadCounted, systemTotals, wouldCreateCycle, descendantsOf, eligibleParents,
    passThroughLoads, connectedLoadCalc, num,
  };
}