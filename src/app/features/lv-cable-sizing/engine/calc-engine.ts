import {
  AIR_TEMP_DERATE,
  CABLE_DATA,
  CABLE_ELECTRICAL,
  GROUPING_DERATE,
  PE_SIZE_TABLE,
  SOIL_RESIST_DERATE,
  SOIL_TEMP_DERATE,
  TRIP_CURVE_MULTIPLIER,
  k,
} from './data';
import { round } from './math';
import type { LvCableRow, LvGeneral } from './state';

type LookupRow = readonly [key: number, ...values: readonly (number | null)[]];

function approxLookup(table: readonly LookupRow[], key: number, valueIndex: number): number | null {
  let best: LookupRow | null = null;
  for (const row of table) {
    if (row[0] <= key) best = row;
    else break;
  }
  if (!best) return null;
  const value = best[valueIndex];
  return value ?? null;
}

export function airTempDerate(tempC: number, insulation: string): number | null {
  const idx = insulation === 'PVC' ? 1 : 2;
  return approxLookup(AIR_TEMP_DERATE, tempC, idx);
}

export function soilTempDerate(tempC: number, insulation: string): number | null {
  const idx = insulation === 'PVC' ? 1 : 2;
  return approxLookup(SOIL_TEMP_DERATE, tempC, idx);
}

export function soilResistDerate(resistivity: number, installation: string): number | null {
  const idx = installation === 'Directly buried' ? 1 : 2;
  return approxLookup(SOIL_RESIST_DERATE, resistivity, idx);
}

export interface LvGeneralDeratingZone {
  ambient?: number | null;
  grouping?: number;
  total?: number | null | undefined;
}

export interface LvGeneralDerating {
  bunched: {
    indoor: LvGeneralDeratingZone;
    outdoor: LvGeneralDeratingZone;
  };
  nonBunched: {
    indoor: LvGeneralDeratingZone;
    outdoor: LvGeneralDeratingZone;
  };
  underground: {
    soilTemp?: number | null;
    soilResist?: number | null;
    grouping?: number;
    total?: number | null | undefined;
  };
}

export function computeGeneral(general: LvGeneral): LvGeneralDerating {
  const s = general.site;
  const out: LvGeneralDerating = { bunched: { indoor: {}, outdoor: {} }, nonBunched: { indoor: {}, outdoor: {} }, underground: {} };

  for (const zone of ['indoor', 'outdoor'] as const) {
    const temp = zone === 'indoor' ? s.maxIndoorTemp : s.maxOutdoorTemp;
    const cfgB = general.bunched[zone];
    const ambientB = airTempDerate(temp, s.insulationType);
    const groupingB = GROUPING_DERATE.bunched[zone][cfgB.installation as keyof (typeof GROUPING_DERATE.bunched)['indoor']];
    out.bunched[zone] = { ambient: ambientB, grouping: groupingB, total: round((ambientB as number) * groupingB, 4) };

    const cfgN = general.nonBunched[zone];
    const ambientN = airTempDerate(temp, s.insulationType);
    const groupingN = GROUPING_DERATE.nonBunched[zone][cfgN.installation as keyof (typeof GROUPING_DERATE.nonBunched)['indoor']];
    out.nonBunched[zone] = { ambient: ambientN, grouping: groupingN, total: round((ambientN as number) * groupingN, 4) };
  }

  const u = general.underground;
  const soilT = soilTempDerate(s.maxGroundTemp, s.insulationType);
  const soilR = soilResistDerate(s.soilResistivity, u.installation);
  const groupingU = GROUPING_DERATE.underground[u.installation as keyof typeof GROUPING_DERATE.underground];
  out.underground = {
    soilTemp: soilT,
    soilResist: soilR,
    grouping: groupingU,
    total: round((soilT as number) * (soilR as number) * groupingU, 4),
  };

  return out;
}

type AmpacityField =
  | 'cuPvcAir'
  | 'cuPvcGnd'
  | 'alPvcAir'
  | 'alPvcGnd'
  | 'cuXlpeAir'
  | 'cuXlpeGnd'
  | 'alXlpeAir'
  | 'alXlpeGnd';

const AMPACITY_MAP: Record<string, Record<string, Record<string, Record<string, AmpacityField>>>> = {
  Air: {
    CU: {
      XLPE: { SWA: 'cuXlpeAir', '-': 'cuXlpeAir' },
      PVC: { SWA: 'cuPvcAir', '-': 'cuPvcAir' },
    },
    AL: {
      XLPE: { SWA: 'alXlpeAir', '-': 'alXlpeAir' },
      PVC: { SWA: 'alPvcAir', '-': 'alPvcAir' },
    },
  },
  Ground: {
    CU: {
      XLPE: { SWA: 'cuXlpeGnd', '-': 'cuXlpeGnd' },
      PVC: { SWA: 'cuPvcGnd', '-': 'cuPvcGnd' },
    },
    AL: {
      XLPE: { SWA: 'alXlpeGnd', '-': 'alXlpeGnd' },
      PVC: { SWA: 'alPvcGnd', '-': 'alPvcGnd' },
    },
  },
};

export function cableAmpacity(
  place: string,
  conductor: string,
  insulation: string,
  armour: string,
  cores: number,
  size: number,
): number | null {
  const entry = CABLE_DATA[k(cores, size)];
  if (!entry) return null;
  const table = armour === 'SWA' ? entry.armoured : entry.unarmoured;
  const field = AMPACITY_MAP[place][conductor][insulation][armour === 'SWA' ? 'SWA' : '-'];
  const v = table[field];
  return v === null || v === undefined ? null : v;
}

export function cableDiameter(armour: string, cores: number, size: number): number | null {
  const entry = CABLE_DATA[k(cores, size)];
  if (!entry) return null;
  const v = armour === 'SWA' ? entry.armoured.dia : entry.unarmoured.dia;
  return v === null || v === undefined ? null : v;
}

function peDiameter(peSize: number): number | null {
  const entry = CABLE_DATA[k(1, peSize)];
  if (!entry) return null;
  return entry.unarmoured.dia;
}

export function resistancePerKm(conductor: string, size: number): number | null {
  const e = CABLE_ELECTRICAL[size];
  if (!e) return null;
  return conductor === 'CU' ? e.rCu : e.rAl;
}

export function reactancePerKm(insulation: string, cores: number, size: number): number | null {
  const e = CABLE_ELECTRICAL[size];
  if (!e) return null;
  if (insulation === 'XLPE') return cores === 1 ? e.xSingleXlpe : e.xMultiXlpe;
  return cores === 1 ? e.xSinglePvc : e.xMultiPvc;
}

export interface LvRowChecks {
  ampacity: boolean | null;
  tripTypeSelected: boolean | null;
  voltageDrop: boolean | null;
  startingVoltageDrop: boolean | null;
  faultLoopLength: boolean | null;
}

export interface LvRowResult {
  flc: number | null;
  installationText?: string;
  tempC?: number;
  groupingCount?: number;
  layers?: number | string;
  cableDiameter: number | null;
  peRuns: number | string | null;
  peSize: number | string | null;
  peDiameter: number | string | null;
  ampacityBase: number | null;
  ampacityCircuit: number | null;
  tempDerate: number | string | null;
  groupDerate: number | string | null;
  overallDerate: number | string | null;
  deratedAmpacity: number | null;
  rPerKm: number | null;
  xPerKm: number | null;
  cableVDPct: number | null;
  startingCurrent: number | string | null;
  allowedStartVDPct: number | string | null;
  startVDPct: number | string | null;
  maxCableLength: number | string | null;
  checks: LvRowChecks;
  remarks: 'ACCEPTABLE' | 'NOT ACCEPTABLE' | 'INCOMPLETE' | null;
}

export function computeRow(row: LvCableRow, generalDerating: LvGeneralDerating, general: LvGeneral): LvRowResult {
  const res = {} as LvRowResult;
  const isMotor = row.isMotorLoad === 'Yes';
  const eff = isMotor ? (row.efficiencyPct || 0) / 100 : 1;

  const ratedLoadKW = typeof row.ratedLoadKW === 'number' ? row.ratedLoadKW : 0;

  if (ratedLoadKW > 0 && row.voltage > 0 && row.pf > 0 && eff > 0) {
    const phaseFactor = row.voltage === 400 ? Math.sqrt(3) : Math.sqrt(1);
    res.flc = (ratedLoadKW * 1000) / (phaseFactor * row.voltage * row.pf * eff);
  } else {
    res.flc = null;
  }

  const cableSize = typeof row.cableSize === 'number' ? row.cableSize : 0;
  const pdTripSetting = typeof row.pdTripSetting === 'number' ? row.pdTripSetting : 0;
  const cableLength = typeof row.cableLength === 'number' ? row.cableLength : 0;

  const sizeLE25 = cableSize > 0 && cableSize <= 25;
  const sizeLE26 = cableSize > 0 && cableSize <= 26;

  if (row.place === 'Air') {
    if (row.area === 'Outdoor') {
      res.installationText = sizeLE25 ? general.bunched.outdoor.installation : general.nonBunched.outdoor.installation;
      res.tempC = general.site.maxOutdoorTemp;
      res.groupingCount = sizeLE25 ? general.bunched.outdoor.maxGrouped : general.nonBunched.outdoor.maxPerLayer;
      res.layers = sizeLE26 ? general.bunched.outdoor.maxLayers : general.nonBunched.outdoor.maxLayers;
    } else if (row.area === 'Indoor') {
      res.installationText = sizeLE25 ? general.bunched.indoor.installation : general.nonBunched.indoor.installation;
      res.tempC = general.site.maxIndoorTemp;
      res.groupingCount = sizeLE25 ? general.bunched.indoor.maxGrouped : general.nonBunched.indoor.maxPerLayer;
      res.layers = sizeLE26 ? general.bunched.indoor.maxLayers : general.nonBunched.indoor.maxLayers;
    }
  } else if (row.place === 'Ground') {
    res.installationText = general.underground.installation;
    res.tempC = general.site.maxGroundTemp;
    res.groupingCount = general.underground.maxCables;
    res.layers = 'N/A';
  }

  res.cableDiameter = cableSize > 0 ? cableDiameter(row.armour, row.noCores, cableSize) : null;

  if (row.noRuns > 0) {
    res.peRuns = row.noCores === 5 ? 'N.A.' : row.noRuns;
  } else {
    res.peRuns = null;
  }

  if (cableSize > 0) {
    res.peSize = row.noCores === 5 ? 'N.A.' : (PE_SIZE_TABLE[cableSize] ?? null);
  } else {
    res.peSize = null;
  }

  res.peDiameter =
    cableSize > 0 && res.peSize !== 'N.A.' && res.peSize != null
      ? peDiameter(res.peSize as number)
      : res.peSize === 'N.A.'
        ? 'N.A.'
        : null;

  res.ampacityBase =
    cableSize > 0 ? cableAmpacity(row.place, row.conductor, row.insulation, row.armour, row.noCores, cableSize) : null;

  res.ampacityCircuit = row.noRuns > 0 && (res.ampacityBase ?? 0) > 0 ? (res.ampacityBase as number) * row.noRuns : null;

  if (cableSize > 0 && row.place && row.area) {
    if (row.place === 'Ground') {
      res.tempDerate = generalDerating.underground.soilTemp ?? null;
      res.groupDerate = generalDerating.underground.grouping ?? null;
      res.overallDerate = generalDerating.underground.total ?? null;
    } else if (row.place === 'Air' && row.area === 'Outdoor') {
      const cat = sizeLE25 ? generalDerating.bunched.outdoor : generalDerating.nonBunched.outdoor;
      res.tempDerate = cat.ambient ?? null;
      res.groupDerate = cat.grouping ?? null;
      res.overallDerate = cat.total ?? null;
    } else if (row.place === 'Air' && row.area === 'Indoor') {
      const cat = sizeLE25 ? generalDerating.bunched.indoor : generalDerating.nonBunched.indoor;
      res.tempDerate = cat.ambient ?? null;
      res.groupDerate = cat.grouping ?? null;
      res.overallDerate = cat.total ?? null;
    } else {
      res.tempDerate = 'ERROR';
      res.groupDerate = 'ERROR';
      res.overallDerate = 'ERROR';
    }
  } else {
    res.tempDerate = null;
    res.groupDerate = null;
    res.overallDerate = null;
  }

  if (cableSize > 0 && res.ampacityBase != null && typeof res.overallDerate === 'number' && row.noRuns > 0) {
    res.deratedAmpacity = res.ampacityBase * res.overallDerate * row.noRuns;
  } else {
    res.deratedAmpacity = null;
  }

  res.rPerKm = cableSize > 0 ? resistancePerKm(row.conductor, cableSize) : null;
  res.xPerKm = cableSize > 0 ? reactancePerKm(row.insulation, row.noCores, cableSize) : null;

  if (
    cableLength > 0 &&
    row.allowedVDPct > 0 &&
    res.ampacityBase != null &&
    res.deratedAmpacity != null &&
    res.rPerKm != null &&
    res.xPerKm != null &&
    res.flc != null
  ) {
    const phaseFactor = row.voltage === 400 ? Math.sqrt(3) : Math.sqrt(4);
    const sinPhi = Math.sin(Math.acos(row.pf));
    res.cableVDPct =
      (((phaseFactor * res.flc * (res.rPerKm * row.pf + res.xPerKm * sinPhi) * cableLength) / (1000 * row.noRuns)) /
        row.voltage) *
      100;
  } else {
    res.cableVDPct = null;
  }

  if (isMotor && row.startingCurrentRatio > 0) {
    res.startingCurrent =
      (row.startingCurrentRatio as number | string) === 'N.A.' ? 'N.A.' : row.startingCurrentRatio * (res.flc as number);
  } else {
    res.startingCurrent = isMotor ? null : 'N.A.';
  }

  res.allowedStartVDPct = cableLength > 0 ? (res.startingCurrent === 'N.A.' ? 'N.A.' : 10) : null;

  if (cableLength > 0 && res.startingCurrent != null) {
    if (res.startingCurrent === 'N.A.') {
      res.startVDPct = 'N.A.';
    } else if (res.rPerKm != null && res.xPerKm != null) {
      const phaseFactor = row.voltage === 400 ? Math.sqrt(3) : Math.sqrt(4);
      const sinPhiStart = Math.sin(Math.acos(row.startingPF));
      res.startVDPct =
        (((phaseFactor * (res.startingCurrent as number) * (res.rPerKm * row.startingPF + res.xPerKm * sinPhiStart) * cableLength) /
          (1000 * row.noRuns)) /
          row.voltage) *
        100;
    } else {
      res.startVDPct = null;
    }
  } else {
    res.startVDPct = null;
  }

  if (cableLength > 0 && row.tripCurve && cableSize > 0 && pdTripSetting > 0) {
    if (row.tripCurve === 'N.A.') {
      res.maxCableLength = 'N.A.';
    } else {
      const mult = TRIP_CURVE_MULTIPLIER[row.tripCurve as keyof typeof TRIP_CURVE_MULTIPLIER];
      const peR = res.peSize !== 'N.A.' && res.peSize != null ? resistancePerKm(row.conductor, res.peSize as number) : null;
      const peX =
        res.peSize !== 'N.A.' && res.peSize != null && CABLE_ELECTRICAL[res.peSize as number]
          ? CABLE_ELECTRICAL[res.peSize as number].xSinglePvc
          : null;
      if (mult && peR != null && peX != null && res.rPerKm != null && res.xPerKm != null) {
        const zLoop = Math.sqrt(Math.pow(res.rPerKm + peR, 2) + Math.pow(res.xPerKm + peX, 2));
        res.maxCableLength = (1000 * 0.8 * general.site.phaseNeutralVoltage) / (pdTripSetting * mult * zLoop);
      } else {
        res.maxCableLength = null;
      }
    }
  } else {
    res.maxCableLength = null;
  }

  const checks: LvRowChecks = {
    ampacity:
      res.deratedAmpacity != null && res.deratedAmpacity !== ('-' as unknown as number) && pdTripSetting > 0
        ? res.deratedAmpacity > pdTripSetting
        : null,
    tripTypeSelected: !!row.pdTripType,
    voltageDrop: row.allowedVDPct > 0 && res.cableVDPct != null ? row.allowedVDPct > res.cableVDPct : null,
    startingVoltageDrop:
      res.startVDPct === 'N.A.'
        ? true
        : res.allowedStartVDPct != null && res.startVDPct != null
          ? (res.allowedStartVDPct as number) > (res.startVDPct as number)
          : null,
    faultLoopLength:
      res.maxCableLength === 'N.A.'
        ? true
        : typeof res.maxCableLength === 'number' && cableLength > 0
          ? res.maxCableLength > cableLength
          : null,
  };
  res.checks = checks;

  if (!row.voltage) {
    res.remarks = null;
  } else {
    const allKnown = Object.values(checks).every((v) => v !== null);
    const allPass = Object.values(checks).every((v) => v === true);
    res.remarks = allKnown ? (allPass ? 'ACCEPTABLE' : 'NOT ACCEPTABLE') : 'INCOMPLETE';
  }

  return res;
}
