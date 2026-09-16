import {
  LIGHTNING_DEFAULTS,
  lookupValue,
  serviceLoss,
  structureLoss,
  type ElectricalLineLabel,
  type FireProvisionsLabel,
  type FireRiskLabel,
  type FloorTypeLabel,
  type LocationLabel,
  type LookupTableName,
  type ProtectionLevelLabel,
  type ServiceTypeLabel,
  type SpecialHazardLabel,
  type SpdLabel,
  type StructureTypeLabel,
} from './data';

export const TOOL_ID = 'lightning-risk' as const;
export const SCHEMA_VERSION = 1 as const;

export interface LightningProject {
  name: string;
  id: string;
}

export interface LightningState {
  schemaVersion: typeof SCHEMA_VERSION;
  tool: typeof TOOL_ID;
  project: LightningProject;
  Ng: number | string;
  L: number | string;
  W: number | string;
  Hi: number | string;
  T: number | string;
  hz: SpecialHazardLabel;
  structureType: StructureTypeLabel;
  floorType: FloorTypeLabel;
  fireProvisions: FireProvisionsLabel;
  lifeCritical: boolean;
  Pd: ProtectionLevelLabel;
  spd: SpdLabel;
  Ai: ElectricalLineLabel;
  Cd: LocationLabel;
  rf: FireRiskLabel;
  services: ServiceTypeLabel;
}

const FIELD_TABLE: Record<string, LookupTableName> = {
  hz: 'specialHazard',
  Pd: 'protectionLevel',
  spd: 'spd',
  Cd: 'location',
  rf: 'fireRisk',
  floorType: 'floorType',
  fireProvisions: 'fireProvisions',
};

const ELECTRICAL_LINE_OPTIONS: readonly ElectricalLineLabel[] = ['No', 'Aerial', 'Underground'];

function cloneDefaults(): LightningState {
  return {
    schemaVersion: SCHEMA_VERSION,
    tool: TOOL_ID,
    project: { ...LIGHTNING_DEFAULTS.project },
    Ng: LIGHTNING_DEFAULTS.Ng,
    L: LIGHTNING_DEFAULTS.L,
    W: LIGHTNING_DEFAULTS.W,
    Hi: LIGHTNING_DEFAULTS.Hi,
    T: LIGHTNING_DEFAULTS.T,
    hz: LIGHTNING_DEFAULTS.hz,
    structureType: LIGHTNING_DEFAULTS.structureType,
    floorType: LIGHTNING_DEFAULTS.floorType,
    fireProvisions: LIGHTNING_DEFAULTS.fireProvisions,
    lifeCritical: LIGHTNING_DEFAULTS.lifeCritical,
    Pd: LIGHTNING_DEFAULTS.Pd,
    spd: LIGHTNING_DEFAULTS.spd,
    Ai: LIGHTNING_DEFAULTS.Ai,
    Cd: LIGHTNING_DEFAULTS.Cd,
    rf: LIGHTNING_DEFAULTS.rf,
    services: LIGHTNING_DEFAULTS.services,
  };
}

export function defaultLightningState(): LightningState {
  return cloneDefaults();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function numOr(value: unknown, fallback: number | string): number | string {
  const n = parseFloat(String(value));
  return Number.isNaN(n) ? fallback : n;
}

function fieldKnown(tableName: LookupTableName, label: string): boolean {
  return lookupValue(tableName, label) != null;
}

export function migrateLegacyLightning(data: unknown): LightningState | null {
  if (!isRecord(data)) {
    return null;
  }

  const required = ['Ng', 'L', 'W', 'Hi', 'T', 'project'] as const;
  if (!required.every((key) => key in data)) {
    return null;
  }

  if (
    ('schemaVersion' in data && data['schemaVersion'] !== SCHEMA_VERSION) ||
    ('tool' in data && data['tool'] !== TOOL_ID)
  ) {
    return null;
  }

  const base = cloneDefaults();
  const project = data['project'];

  if (isRecord(project)) {
    base.project.name = String(project['name'] ?? '');
    base.project.id = String(project['id'] ?? '');
  }

  base.Ng = numOr(data['Ng'], base.Ng);
  base.L = numOr(data['L'], base.L);
  base.W = numOr(data['W'], base.W);
  base.Hi = numOr(data['Hi'], base.Hi);
  base.T = numOr(data['T'], base.T);
  base.lifeCritical = Boolean(data['lifeCritical']);

  for (const [field, tableName] of Object.entries(FIELD_TABLE)) {
    const value = data[field];
    if (typeof value !== 'string' || !fieldKnown(tableName, value)) {
      continue;
    }
    switch (field) {
      case 'hz':
        base.hz = value as SpecialHazardLabel;
        break;
      case 'Pd':
        base.Pd = value as ProtectionLevelLabel;
        break;
      case 'spd':
        base.spd = value as SpdLabel;
        break;
      case 'Cd':
        base.Cd = value as LocationLabel;
        break;
      case 'rf':
        base.rf = value as FireRiskLabel;
        break;
      case 'floorType':
        base.floorType = value as FloorTypeLabel;
        break;
      case 'fireProvisions':
        base.fireProvisions = value as FireProvisionsLabel;
        break;
      default:
        break;
    }
  }

  const structureType = data['structureType'];
  if (typeof structureType === 'string' && structureLoss(structureType) != null) {
    base.structureType = structureType as StructureTypeLabel;
  }

  const services = data['services'];
  if (typeof services === 'string' && serviceLoss(services) != null) {
    base.services = services as ServiceTypeLabel;
  }

  const ai = data['Ai'];
  if (typeof ai === 'string' && ELECTRICAL_LINE_OPTIONS.includes(ai as ElectricalLineLabel)) {
    base.Ai = ai as ElectricalLineLabel;
  }

  return base;
}
