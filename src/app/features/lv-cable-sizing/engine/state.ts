export const SCHEMA_VERSION = 1;
export const TOOL_ID = 'lv-cable-sizing';

export interface LvProject {
  client: string;
  projectName: string;
  projectNo: string;
  title: string;
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  date: string;
  revision: string;
  code: string;
}

export interface LvSiteConfig {
  maxOutdoorTemp: number;
  maxGroundTemp: number;
  maxIndoorTemp: number;
  soilResistivity: number;
  insulationType: 'XLPE' | 'PVC';
  phaseVoltage: number;
  phaseNeutralVoltage: number;
}

export interface LvBunchedZoneConfig {
  maxLayers: number;
  installation: string;
  maxGrouped: number;
}

export interface LvNonBunchedZoneConfig {
  maxLayers: number;
  installation: string;
  spacing: string;
  maxPerLayer: number;
}

export interface LvUndergroundConfig {
  maxCables: number;
  installation: string;
  spacing: string;
}

export interface LvGeneral {
  site: LvSiteConfig;
  bunched: {
    indoor: LvBunchedZoneConfig;
    outdoor: LvBunchedZoneConfig;
  };
  nonBunched: {
    indoor: LvNonBunchedZoneConfig;
    outdoor: LvNonBunchedZoneConfig;
  };
  underground: LvUndergroundConfig;
}

export interface LvCableRow {
  id: number;
  panel: string;
  no: number;
  loadName: string;
  ratedLoadKW: number | '';
  voltage: number;
  pf: number;
  isMotorLoad: 'Yes' | 'No';
  startingPF: number;
  startingCurrentRatio: number;
  efficiencyPct: number;
  feederRatingCB: number | '';
  pdTripSetting: number | '';
  pdTripType: string;
  pdTripSettingType: string;
  place: string;
  area: string;
  conductor: string;
  insulation: string;
  armour: string;
  outerSheath: string;
  noRuns: number;
  noCores: number;
  cableSize: number | '';
  allowedVDPct: number;
  cableLength: number | '';
  tripCurve: string;
}

export interface LvState {
  schemaVersion: number;
  toolId: string;
  project: LvProject;
  general: LvGeneral;
  rows: LvCableRow[];
  nextId: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function defaultLvState(): LvState {
  return {
    schemaVersion: SCHEMA_VERSION,
    toolId: TOOL_ID,
    project: {
      client: '',
      projectName: '',
      projectNo: '',
      title: 'LV Cable Sizing Calculation',
      preparedBy: '',
      checkedBy: '',
      approvedBy: '',
      date: new Date().toISOString().slice(0, 10),
      revision: 'A',
      code: 'IEC 60364',
    },
    general: {
      site: {
        maxOutdoorTemp: 38,
        maxGroundTemp: 30,
        maxIndoorTemp: 35,
        soilResistivity: 2.5,
        insulationType: 'XLPE',
        phaseVoltage: 400,
        phaseNeutralVoltage: 230,
      },
      bunched: {
        indoor: { maxLayers: 2, installation: 'Perforated cable tray', maxGrouped: 5 },
        outdoor: { maxLayers: 2, installation: 'Perforated cable tray', maxGrouped: 5 },
      },
      nonBunched: {
        indoor: { maxLayers: 2, installation: 'Cable ladder', spacing: 'Touching', maxPerLayer: 5 },
        outdoor: { maxLayers: 1, installation: 'Cable ladder', spacing: 'Touching', maxPerLayer: 5 },
      },
      underground: { maxCables: 3, installation: 'In duct', spacing: 'Touching' },
    },
    rows: [],
    nextId: 1,
  };
}

export function blankLvRow(id: number): LvCableRow {
  return {
    id,
    panel: '',
    no: id,
    loadName: '',
    ratedLoadKW: '',
    voltage: 400,
    pf: 0.85,
    isMotorLoad: 'No',
    startingPF: 0.35,
    startingCurrentRatio: 6,
    efficiencyPct: 95,
    feederRatingCB: '',
    pdTripSetting: '',
    pdTripType: '',
    pdTripSettingType: 'Fixed',
    place: 'Air',
    area: 'Outdoor',
    conductor: 'CU',
    insulation: 'XLPE',
    armour: 'SWA',
    outerSheath: 'PVC',
    noRuns: 1,
    noCores: 4,
    cableSize: '',
    allowedVDPct: 5,
    cableLength: '',
    tripCurve: 'C',
  };
}

export function exampleLvRow(id: number): LvCableRow {
  return {
    ...blankLvRow(id),
    panel: 'MDB-1',
    loadName: 'Chiller Pump P-01',
    ratedLoadKW: 75,
    voltage: 400,
    pf: 0.85,
    isMotorLoad: 'Yes',
    startingPF: 0.35,
    startingCurrentRatio: 6,
    efficiencyPct: 92,
    feederRatingCB: 160,
    pdTripSetting: 140,
    pdTripType: 'Thermal',
    pdTripSettingType: 'Fixed',
    place: 'Air',
    area: 'Outdoor',
    conductor: 'CU',
    insulation: 'XLPE',
    armour: 'SWA',
    outerSheath: 'PVC',
    noRuns: 1,
    noCores: 4,
    cableSize: 50,
    allowedVDPct: 5,
    cableLength: 60,
    tripCurve: 'C',
  };
}

export function migrateLegacyLv(data: unknown): LvState | null {
  if (
    !isRecord(data) ||
    !isRecord(data['project']) ||
    !isRecord(data['general']) ||
    !Array.isArray(data['rows'])
  ) {
    return null;
  }

  const base = defaultLvState();
  const legacyGeneral = data['general'];
  const legacySite = isRecord(legacyGeneral['site']) ? legacyGeneral['site'] : {};
  const legacyBunched = isRecord(legacyGeneral['bunched']) ? legacyGeneral['bunched'] : {};
  const legacyNonBunched = isRecord(legacyGeneral['nonBunched']) ? legacyGeneral['nonBunched'] : {};
  const legacyUnderground = isRecord(legacyGeneral['underground']) ? legacyGeneral['underground'] : {};

  const bunchedIndoor = isRecord(legacyBunched['indoor']) ? legacyBunched['indoor'] : {};
  const bunchedOutdoor = isRecord(legacyBunched['outdoor']) ? legacyBunched['outdoor'] : {};
  const nonBunchedIndoor = isRecord(legacyNonBunched['indoor']) ? legacyNonBunched['indoor'] : {};
  const nonBunchedOutdoor = isRecord(legacyNonBunched['outdoor']) ? legacyNonBunched['outdoor'] : {};

  const rows = data['rows'] as LvCableRow[];
  const maxRowId = rows.reduce((max, row) => (typeof row.id === 'number' && row.id > max ? row.id : max), 0);

  return {
    schemaVersion: SCHEMA_VERSION,
    toolId: TOOL_ID,
    project: { ...base.project, ...(data['project'] as Partial<LvProject>) },
    general: {
      site: { ...base.general.site, ...(legacySite as Partial<LvSiteConfig>) },
      bunched: {
        indoor: { ...base.general.bunched.indoor, ...(bunchedIndoor as Partial<LvBunchedZoneConfig>) },
        outdoor: { ...base.general.bunched.outdoor, ...(bunchedOutdoor as Partial<LvBunchedZoneConfig>) },
      },
      nonBunched: {
        indoor: { ...base.general.nonBunched.indoor, ...(nonBunchedIndoor as Partial<LvNonBunchedZoneConfig>) },
        outdoor: { ...base.general.nonBunched.outdoor, ...(nonBunchedOutdoor as Partial<LvNonBunchedZoneConfig>) },
      },
      underground: { ...base.general.underground, ...(legacyUnderground as Partial<LvUndergroundConfig>) },
    },
    rows,
    nextId: typeof data['nextId'] === 'number' && data['nextId'] > 0 ? data['nextId'] : maxRowId + 1,
  };
}
