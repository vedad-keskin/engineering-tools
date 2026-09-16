// ============================================================
// Capacity Planner - node-type registry & field definitions
// ============================================================

export const NUMBER = 'number' as const;
export const SELECT = 'select' as const;

export const POWER_SOURCES = ['utility', 'generator', 'battery'] as const;

export const LOAD_TYPES = [
  'General House Loads',
  'Critical Infrastructure Loads',
  'IT Loads',
] as const;

export type NodeType =
  | 'utility'
  | 'mv-dist'
  | 'transformer'
  | 'generator'
  | 'battery'
  | 'ups'
  | 'dist'
  | 'load';

export type LoadType = (typeof LOAD_TYPES)[number];

export interface TypeMetaEntry {
  label: string;
  short: string;
  badge: string;
  icon: string;
}

export const TYPE_META: Record<NodeType, TypeMetaEntry> = {
  utility: { label: 'Utility', short: 'UTIL', badge: 'util', icon: '\u26A1' },
  'mv-dist': { label: 'MV Distribution', short: 'MVDB', badge: 'mv', icon: '\u22A5\u2602' },
  transformer: { label: 'Transformer', short: 'TX', badge: 'tx', icon: '\u2139\u039B' },
  generator: { label: 'Generator', short: 'GEN', badge: 'gen', icon: '\u2699' },
  battery: { label: 'Battery', short: 'BAT', badge: 'batt', icon: '\u25A4' },
  ups: { label: 'UPS', short: 'UPS', badge: 'ups', icon: '\u25BA' },
  dist: { label: 'LV Distribution', short: 'LVDB', badge: 'dist', icon: '\u25A3' },
  load: { label: 'Load', short: 'LOAD', badge: 'load', icon: '\u25CF' },
};

export interface TypeFieldDef {
  key: string;
  label: string;
  type: typeof NUMBER | typeof SELECT;
  unit?: string;
  step?: number;
  hint?: string;
  options?: readonly (number | string)[];
}

export const TYPE_FIELDS: Record<NodeType, TypeFieldDef[]> = {
  utility: [
    { key: 'contractKVA', label: 'Contract Capacity', type: NUMBER, unit: 'kVA', step: 1 },
    { key: 'voltageKV', label: 'Supply Voltage', type: NUMBER, unit: 'kV', step: 1 },
  ],
  'mv-dist': [
    { key: 'voltageV', label: 'Voltage', type: NUMBER, unit: 'V', step: 1 },
    { key: 'ratingA', label: 'Busbar Rating', type: NUMBER, unit: 'A', step: 1 },
  ],
  transformer: [
    { key: 'ratingKVA', label: 'Rating', type: NUMBER, unit: 'kVA', step: 1 },
    { key: 'hvV', label: 'HV Voltage', type: NUMBER, unit: 'V', step: 1 },
    { key: 'lvV', label: 'LV Voltage', type: NUMBER, unit: 'V', step: 1 },
  ],
  generator: [
    { key: 'ratingKVA', label: 'Rating', type: NUMBER, unit: 'kVA', step: 1 },
    { key: 'pf', label: 'Power Factor', type: NUMBER, unit: '', step: 0.01 },
    { key: 'voltageV', label: 'Voltage', type: NUMBER, unit: 'V', step: 1 },
  ],
  battery: [
    { key: 'ratingKVA', label: 'Rating', type: NUMBER, unit: 'kVA', step: 1 },
    { key: 'voltageV', label: 'Voltage', type: NUMBER, unit: 'V', step: 1 },
    {
      key: 'energyKWh',
      label: 'Energy',
      type: NUMBER,
      unit: 'kWh',
      step: 1,
      hint: 'Informational only \u2014 not used in calculations.',
    },
    {
      key: 'autonomyMin',
      label: 'Autonomy',
      type: NUMBER,
      unit: 'min',
      step: 1,
      hint: 'Informational only \u2014 not used in calculations.',
    },
  ],
  ups: [
    { key: 'ratingKVA', label: 'Rating', type: NUMBER, unit: 'kVA', step: 1 },
    { key: 'voltageV', label: 'Voltage', type: NUMBER, unit: 'V', step: 1 },
  ],
  dist: [
    { key: 'voltageV', label: 'Voltage', type: NUMBER, unit: 'V', step: 1 },
    { key: 'ratingA', label: 'Busbar Rating', type: NUMBER, unit: 'A', step: 1 },
  ],
  load: [
    { key: 'phases', label: 'Phases', type: SELECT, options: [3, 1] },
    { key: 'voltageV', label: 'Voltage', type: NUMBER, unit: 'V', step: 1 },
    { key: 'pf', label: 'Power Factor', type: NUMBER, unit: '', step: 0.01 },
    { key: 'ratedKW', label: 'Rated Load', type: NUMBER, unit: 'kW', step: 0.1 },
    {
      key: 'demandFactor',
      label: 'Demand Factor',
      type: NUMBER,
      unit: '',
      step: 0.01,
      hint: 'Demand kW = rated kW \u00d7 demand factor.',
    },
    { key: 'loadType', label: 'Load Type', type: SELECT, options: LOAD_TYPES },
  ],
};

export type FieldDefaults = Record<string, string | number>;

export const FIELD_DEFAULTS: Record<NodeType, FieldDefaults> = {
  utility: { tag: '', contractKVA: '', voltageKV: 11 },
  'mv-dist': { tag: '', voltageV: 11000, ratingA: '' },
  transformer: { tag: '', ratingKVA: '', hvV: 11000, lvV: 400 },
  generator: { tag: '', ratingKVA: '', pf: 0.8, voltageV: 400 },
  battery: { tag: '', ratingKVA: '', voltageV: 400, energyKWh: '', autonomyMin: '' },
  ups: { tag: '', ratingKVA: '', voltageV: 400 },
  dist: { tag: '', voltageV: 400, ratingA: '' },
  load: {
    tag: '',
    phases: 3,
    voltageV: 400,
    pf: 0.85,
    ratedKW: '',
    demandFactor: 1,
    loadType: 'General House Loads',
  },
};

export const CHILD_TYPES: Record<NodeType, NodeType[]> = {
  utility: ['mv-dist', 'transformer', 'generator', 'battery', 'ups', 'dist'],
  'mv-dist': ['mv-dist', 'transformer', 'generator', 'battery', 'ups', 'dist'],
  transformer: ['dist', 'ups', 'generator', 'battery'],
  generator: ['dist', 'ups'],
  battery: [],
  ups: ['dist', 'battery'],
  dist: ['dist', 'ups', 'generator', 'battery', 'load'],
  load: [],
};

export const SYSTEM_COLORS = [
  '#0f5fc9',
  '#0f7a3d',
  '#b26a00',
  '#6b46c1',
  '#b3241c',
  '#5b6675',
  '#c2185b',
  '#00838f',
] as const;

export const ALLOWED_SOURCES: Record<NodeType, NodeType[]> = {
  utility: [],
  generator: [],
  battery: [],
  'mv-dist': ['utility', 'mv-dist', 'generator'],
  transformer: ['utility', 'mv-dist', 'generator'],
  ups: ['transformer', 'dist', 'mv-dist', 'utility', 'generator', 'battery'],
  dist: ['transformer', 'ups', 'dist', 'mv-dist', 'utility', 'generator', 'battery'],
  load: ['dist', 'ups', 'mv-dist'],
};

export const DIAGRAM_DEFAULTS: Record<NodeType, string[]> = {
  utility: ['tag', 'name', 'contractKVA', 'voltageKV'],
  'mv-dist': ['tag', 'name', 'voltageV', 'ratingA'],
  transformer: ['tag', 'name', 'ratingKVA', 'hvV', 'lvV'],
  generator: ['tag', 'name', 'ratingKVA', 'pf', 'voltageV'],
  battery: ['tag', 'name', 'autonomyMin'],
  ups: ['tag', 'name', 'ratingKVA'],
  dist: ['tag', 'name', 'voltageV', 'ratingA'],
  load: ['name', 'ratedKW'],
};

export interface ProjectInfo {
  client: string;
  projectName: string;
  projectNo: string;
  title: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  date: string;
  revision: string;
}

export interface PowerSystem {
  id: number;
  name: string;
  color: string;
}

export interface PowerScenario {
  id: number;
  name: string;
  overrides?: Record<number, 'active' | 'inactive'>;
}

export interface DiagramState {
  zoom: number;
  panX: number;
  panY: number;
  showGrid: boolean;
  snapGuides: boolean;
  sheet: string;
  titleBlock: boolean;
  laidOut: boolean;
}

export interface PowerNode {
  id: number;
  type: NodeType;
  name: string;
  tag: string;
  parentId: number | null;
  redundantParentId: number | null;
  activeFeed: string;
  systemId: number | null;
  active?: boolean;
  order?: number | null;
  x?: number | null;
  y?: number | null;
  labelDx?: number | null;
  labelDy?: number | null;
  showFields?: string[] | null;
  busLen?: number | null;
  loadType?: string;
  contractKVA?: number | string;
  voltageKV?: number | string;
  voltageV?: number | string;
  ratingA?: number | string;
  ratingKVA?: number | string;
  hvV?: number | string;
  lvV?: number | string;
  pf?: number | string;
  phases?: number | string;
  ratedKW?: number | string;
  demandFactor?: number | string;
  energyKWh?: number | string;
  autonomyMin?: number | string;
}

export interface PowerState {
  project: ProjectInfo;
  nodes: PowerNode[];
  nextId: number;
  systems: PowerSystem[];
  nextSystemId: number;
  defaults: Record<NodeType, FieldDefaults>;
  scenarios: PowerScenario[];
  activeScenarioId: number | null;
  nextScenarioId: number;
  columnPrefs: Record<string, Record<string, boolean>>;
  diagram: DiagramState;
}

export function diagramFieldOptions(type: NodeType): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  if (type !== 'load') out.push({ key: 'tag', label: 'Tag' });
  out.push({ key: 'name', label: 'Name' });
  (TYPE_FIELDS[type] || []).forEach((f) => out.push({ key: f.key, label: f.label }));
  return out;
}

export function defaultsCopy(): Record<NodeType, FieldDefaults> {
  return JSON.parse(JSON.stringify(FIELD_DEFAULTS)) as Record<NodeType, FieldDefaults>;
}

export function defaultPowerState(): PowerState {
  return {
    project: {
      client: '',
      projectName: '',
      projectNo: '',
      title: 'Network Diagram',
      preparedBy: '',
      checkedBy: '',
      approvedBy: '',
      date: new Date().toISOString().slice(0, 10),
      revision: 'A',
    },
    nodes: [],
    nextId: 1,
    systems: [],
    nextSystemId: 1,
    defaults: defaultsCopy(),
    scenarios: [],
    activeScenarioId: null,
    nextScenarioId: 1,
    columnPrefs: {},
    diagram: {
      zoom: 1,
      panX: 0,
      panY: 0,
      showGrid: true,
      snapGuides: true,
      sheet: 'A3-landscape',
      titleBlock: true,
      laidOut: false,
    },
  };
}

export function blankNode(
  type: NodeType,
  id: number,
  defaults?: Record<NodeType, FieldDefaults> | null,
): PowerNode {
  const base: PowerNode = {
    id,
    type,
    name: TYPE_META[type] ? TYPE_META[type].label : type,
    tag: '',
    parentId: null,
    redundantParentId: null,
    activeFeed: 'primary',
    systemId: null,
    active: true,
    order: null,
    x: null,
    y: null,
    labelDx: null,
    labelDy: null,
    showFields: null,
    busLen: null,
  };
  const fromType = JSON.parse(JSON.stringify(FIELD_DEFAULTS[type] || {})) as FieldDefaults;
  const fromDefaults =
    defaults && defaults[type]
      ? (JSON.parse(JSON.stringify(defaults[type])) as FieldDefaults)
      : {};
  return Object.assign(base, fromType, fromDefaults);
}

export function childVoltage(parentType: NodeType, parent: PowerNode | null | undefined): number {
  if (parentType === 'transformer') {
    return parent?.lvV != null && parent.lvV !== '' ? (parent.lvV as number) : 400;
  }
  if (parentType === 'utility') {
    return parent && parent.voltageKV ? (parent.voltageKV as number) * 1000 : 11000;
  }
  if (parent && parent.voltageV) return parent.voltageV as number;
  return 400;
}

export function loadExample(): PowerState {
  const s = defaultPowerState();
  s.nextId = 39;
  s.nextSystemId = 3;
  s.project.projectName = 'Example Data Centre';
  s.project.projectNo = 'CP-EX-001';
  s.project.client = 'Demo Client';
  s.systems = [
    { id: 1, name: 'Power Block A', color: SYSTEM_COLORS[0] },
    { id: 2, name: 'Power Block B', color: SYSTEM_COLORS[1] },
  ];
  s.nodes = [
    { id: 1, type: 'utility', name: 'Utility A', tag: 'UTIL-A', parentId: null, redundantParentId: null, activeFeed: 'primary', systemId: 1, contractKVA: 20000, voltageKV: 20 },
    { id: 2, type: 'mv-dist', name: 'MV Switchboard A', tag: 'MVDB-A', parentId: 1, redundantParentId: 3, activeFeed: 'primary', systemId: 1, voltageV: 20000, ratingA: 630 },
    { id: 5, type: 'transformer', name: 'Transformer A', tag: 'TX-A', parentId: 2, redundantParentId: null, activeFeed: 'primary', systemId: 1, ratingKVA: 3500, hvV: 20000, lvV: 400 },
    { id: 6, type: 'dist', name: 'LV Switchboard A', tag: 'LVDB-A', parentId: 5, redundantParentId: 7, activeFeed: 'primary', systemId: 1, voltageV: 400, ratingA: 4000 },
    { id: 7, type: 'generator', name: 'Generator A', tag: 'GEN-A', parentId: null, redundantParentId: null, activeFeed: 'primary', systemId: 1, ratingKVA: 3500, pf: 0.8, voltageV: 400 },
    { id: 8, type: 'ups', name: 'UPS A', tag: 'UPS-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, ratingKVA: 2400, voltageV: 400 },
    { id: 9, type: 'dist', name: 'LV Switchboard UPS A', tag: 'LVDB-UPS-A', parentId: 8, redundantParentId: 6, activeFeed: 'primary', systemId: 1, voltageV: 400, ratingA: 3200 },
    { id: 3, type: 'utility', name: 'Utility B', tag: 'UTIL-B', parentId: null, redundantParentId: null, activeFeed: 'primary', systemId: 2, contractKVA: 20000, voltageKV: 20 },
    { id: 4, type: 'mv-dist', name: 'MV Switchboard B', tag: 'MVDB-B', parentId: 3, redundantParentId: 1, activeFeed: 'primary', systemId: 2, voltageV: 20000, ratingA: 630 },
    { id: 10, type: 'transformer', name: 'Transformer B', tag: 'TX-B', parentId: 4, redundantParentId: null, activeFeed: 'primary', systemId: 2, ratingKVA: 3500, hvV: 20000, lvV: 400 },
    { id: 11, type: 'dist', name: 'LV Switchboard B', tag: 'LVDB-B', parentId: 10, redundantParentId: 12, activeFeed: 'primary', systemId: 2, voltageV: 400, ratingA: 4000 },
    { id: 12, type: 'generator', name: 'Generator B', tag: 'GEN-B', parentId: null, redundantParentId: null, activeFeed: 'primary', systemId: 2, ratingKVA: 3500, pf: 0.8, voltageV: 400 },
    { id: 13, type: 'ups', name: 'UPS B', tag: 'UPS-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, ratingKVA: 2400, voltageV: 400 },
    { id: 14, type: 'dist', name: 'LV Switchboard UPS B', tag: 'LVDB-UPS-B', parentId: 13, redundantParentId: 11, activeFeed: 'primary', systemId: 2, voltageV: 400, ratingA: 3200 },
    { id: 15, type: 'load', name: 'Chiller', tag: 'CHILLER-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 300, demandFactor: 1 },
    { id: 16, type: 'load', name: 'CRAH', tag: 'CRAH-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 18, demandFactor: 1 },
    { id: 17, type: 'load', name: 'General Load', tag: 'GL-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 50, demandFactor: 1 },
    { id: 18, type: 'load', name: 'Sprinkler Pump', tag: 'SPR-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 50, demandFactor: 1 },
    { id: 19, type: 'load', name: 'Cooling Tower Fan', tag: 'CT-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 30, demandFactor: 1 },
    { id: 20, type: 'load', name: 'Condenser Water Pump', tag: 'CWP-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 45, demandFactor: 1 },
    { id: 21, type: 'load', name: 'AHU / Ventilation', tag: 'AHU-A', parentId: 6, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 22, demandFactor: 1 },
    { id: 22, type: 'load', name: 'Primary Pump', tag: 'PP-A', parentId: 9, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 25, demandFactor: 1 },
    { id: 23, type: 'load', name: 'Critical Load', tag: 'CRIT-A', parentId: 9, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 50, demandFactor: 1 },
    { id: 24, type: 'load', name: 'IT Load', tag: 'IT-A', parentId: 9, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.95, ratedKW: 2000, demandFactor: 1 },
    { id: 25, type: 'load', name: 'Comms / Network Load', tag: 'NET-A', parentId: 9, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 80, demandFactor: 1 },
    { id: 26, type: 'load', name: 'Emergency Lighting', tag: 'EL-A', parentId: 9, redundantParentId: null, activeFeed: 'primary', systemId: 1, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 15, demandFactor: 1 },
    { id: 27, type: 'load', name: 'Chiller', tag: 'CHILLER-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 300, demandFactor: 1 },
    { id: 28, type: 'load', name: 'CRAH', tag: 'CRAH-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 18, demandFactor: 1 },
    { id: 29, type: 'load', name: 'General Load', tag: 'GL-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 50, demandFactor: 1 },
    { id: 30, type: 'load', name: 'Sprinkler Pump', tag: 'SPR-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 50, demandFactor: 1 },
    { id: 31, type: 'load', name: 'Cooling Tower Fan', tag: 'CT-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 30, demandFactor: 1 },
    { id: 32, type: 'load', name: 'Condenser Water Pump', tag: 'CWP-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 45, demandFactor: 1 },
    { id: 33, type: 'load', name: 'AHU / Ventilation', tag: 'AHU-B', parentId: 11, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 22, demandFactor: 1 },
    { id: 34, type: 'load', name: 'Primary Pump', tag: 'PP-B', parentId: 14, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 25, demandFactor: 1 },
    { id: 35, type: 'load', name: 'Critical Load', tag: 'CRIT-B', parentId: 14, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 50, demandFactor: 1 },
    { id: 36, type: 'load', name: 'IT Load', tag: 'IT-B', parentId: 14, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.95, ratedKW: 2000, demandFactor: 1 },
    { id: 37, type: 'load', name: 'Comms / Network Load', tag: 'NET-B', parentId: 14, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 80, demandFactor: 1 },
    { id: 38, type: 'load', name: 'Emergency Lighting', tag: 'EL-B', parentId: 14, redundantParentId: null, activeFeed: 'primary', systemId: 2, phases: 3, voltageV: 400, pf: 0.9, ratedKW: 15, demandFactor: 1 },
  ];
  return s;
}
