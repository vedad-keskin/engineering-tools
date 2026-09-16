import {
  defaultPowerState,
  defaultsCopy,
  DIAGRAM_DEFAULTS,
  FIELD_DEFAULTS,
  type NodeType,
  type PowerNode,
  type PowerState,
} from './data';

export const TOOL_ID = 'power-network';
export const SCHEMA_VERSION = 1;

const LEGACY_TOOLS = new Set(['capacity-planner', 'block-diagram', 'network-diagram']);
const FEEDS = ['primary', 'redundant', '50-50'] as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v != null && typeof v === 'object' && !Array.isArray(v);
}

function isNodeType(v: unknown): v is NodeType {
  return typeof v === 'string' && v in FIELD_DEFAULTS;
}

function extractLegacyState(data: unknown): Record<string, unknown> | null {
  if (!isRecord(data)) return null;

  const wrappedState = data['state'];
  if (isRecord(wrappedState) && Array.isArray(wrappedState['nodes'])) {
    const tool = data['tool'];
    if (tool == null || typeof tool === 'string') {
      if (tool == null || LEGACY_TOOLS.has(tool)) return wrappedState;
    }
    return null;
  }

  if (Array.isArray(data['nodes'])) return data;

  return null;
}

function normalizeNode(raw: Record<string, unknown>): PowerNode | null {
  if (typeof raw['id'] !== 'number' || !isNodeType(raw['type'])) return null;

  const n = raw as unknown as PowerNode;
  n.id = raw['id'];
  n.type = raw['type'];

  if (n.activeFeed == null || FEEDS.indexOf(n.activeFeed as (typeof FEEDS)[number]) < 0) {
    n.activeFeed = 'primary';
  }
  if (n.active == null) n.active = true;
  if (n.order == null) n.order = null;
  if (n.systemId == null) n.systemId = null;

  if (
    (n.type === 'generator' || n.type === 'battery' || n.type === 'utility') &&
    n.parentId != null
  ) {
    n.parentId = null;
  }

  if (n.type === 'load' && !n.loadType) n.loadType = 'General House Loads';

  if (n.x === undefined) n.x = null;
  if (n.y === undefined) n.y = null;
  if (n.labelDx === undefined) n.labelDx = null;
  if (n.labelDy === undefined) n.labelDy = null;
  if (n.showFields === undefined) {
    n.showFields = DIAGRAM_DEFAULTS[n.type].slice();
  } else if (n.showFields == null) {
    n.showFields = null;
  }
  if (n.busLen === undefined) n.busLen = null;

  if (n.name == null) n.name = n.type;
  if (n.tag == null) n.tag = '';
  if (n.parentId === undefined) n.parentId = null;
  if (n.redundantParentId === undefined) n.redundantParentId = null;

  return n;
}

export function migrateLegacyPower(data: unknown): PowerState | null {
  const legacy = extractLegacyState(data);
  if (!legacy || !Array.isArray(legacy['nodes'])) return null;

  const legacyNodes = legacy['nodes'];
  const base = defaultPowerState();
  const nodes: PowerNode[] = [];
  for (const raw of legacyNodes) {
    if (!isRecord(raw)) continue;
    const node = normalizeNode(raw);
    if (node) nodes.push(node);
  }
  if (nodes.length === 0 && legacyNodes.length > 0) return null;

  const defs = defaultsCopy();
  const legacyDefaults = legacy['defaults'];
  if (isRecord(legacyDefaults)) {
    for (const t of Object.keys(FIELD_DEFAULTS) as NodeType[]) {
      const row = legacyDefaults[t];
      if (isRecord(row)) {
        defs[t] = Object.assign({}, FIELD_DEFAULTS[t], row);
      }
    }
  }

  const legacyProject = legacy['project'];
  const project = isRecord(legacyProject)
    ? { ...base.project, ...(legacyProject as Partial<typeof base.project>) }
    : base.project;

  const systems = Array.isArray(legacy['systems'])
    ? (legacy['systems'] as PowerState['systems'])
    : [];

  const scenarios = Array.isArray(legacy['scenarios'])
    ? (legacy['scenarios'] as PowerState['scenarios'])
    : [];

  const legacyNextId = legacy['nextId'];
  const nextId =
    typeof legacyNextId === 'number' && legacyNextId > 0
      ? legacyNextId
      : Math.max(1, ...nodes.map((x) => x.id + 1));

  const legacyNextSystemId = legacy['nextSystemId'];
  const nextSystemId =
    typeof legacyNextSystemId === 'number' && legacyNextSystemId > 0
      ? legacyNextSystemId
      : Math.max(1, ...systems.map((s) => (s.id || 0) + 1));

  const legacyNextScenarioId = legacy['nextScenarioId'];
  const nextScenarioId =
    typeof legacyNextScenarioId === 'number' && legacyNextScenarioId > 0
      ? legacyNextScenarioId
      : 1;

  const legacyColumnPrefs = legacy['columnPrefs'];
  const columnPrefs =
    isRecord(legacyColumnPrefs) && legacyColumnPrefs != null
      ? (legacyColumnPrefs as PowerState['columnPrefs'])
      : {};

  const legacyDiagram = legacy['diagram'];
  const diagram = Object.assign({}, base.diagram, isRecord(legacyDiagram) ? legacyDiagram : {});

  const legacyActiveScenarioId = legacy['activeScenarioId'];

  return {
    project,
    nodes,
    nextId,
    systems,
    nextSystemId,
    defaults: defs,
    scenarios,
    activeScenarioId:
      legacyActiveScenarioId === undefined || legacyActiveScenarioId === null
        ? null
        : (legacyActiveScenarioId as number),
    nextScenarioId,
    columnPrefs,
    diagram,
  };
}
