// ============================================================
// Calculation engine - faithful JS port of the workbook formulas
// ============================================================
// NOTE: round() is provided by assets/js/shared.js (identical implementation,
// kept as the single canonical copy) and must be loaded before this file.

// Approximate-match lookup (mirrors Excel VLOOKUP(key, table, col, TRUE)):
// returns the row whose first value is the largest one <= key.
function approxLookup(table, key, valueIndex) {
  let best = null;
  for (const row of table) {
    if (row[0] <= key) best = row;
    else break;
  }
  if (!best) return null;
  return best[valueIndex];
}

function airTempDerate(tempC, insulation) {
  const idx = insulation === 'PVC' ? 1 : 2;
  return approxLookup(AIR_TEMP_DERATE, tempC, idx);
}
function soilTempDerate(tempC, insulation) {
  const idx = insulation === 'PVC' ? 1 : 2;
  return approxLookup(SOIL_TEMP_DERATE, tempC, idx);
}
function soilResistDerate(resistivity, installation) {
  const idx = installation === 'Directly buried' ? 1 : 2;
  return approxLookup(SOIL_RESIST_DERATE, resistivity, idx);
}

// ---- GENERAL sheet: derating factors for each installation category ----
function computeGeneral(general) {
  const s = general.site;
  const out = { bunched: {}, nonBunched: {}, underground: {} };

  for (const zone of ['indoor', 'outdoor']) {
    const temp = zone === 'indoor' ? s.maxIndoorTemp : s.maxOutdoorTemp;
    const cfgB = general.bunched[zone];
    const ambientB = airTempDerate(temp, s.insulationType);
    const groupingB = GROUPING_DERATE.bunched[zone][cfgB.installation];
    out.bunched[zone] = { ambient: ambientB, grouping: groupingB, total: round(ambientB * groupingB, 4) };

    const cfgN = general.nonBunched[zone];
    const ambientN = airTempDerate(temp, s.insulationType);
    const groupingN = GROUPING_DERATE.nonBunched[zone][cfgN.installation];
    out.nonBunched[zone] = { ambient: ambientN, grouping: groupingN, total: round(ambientN * groupingN, 4) };
  }

  const u = general.underground;
  const soilT = soilTempDerate(s.maxGroundTemp, s.insulationType);
  const soilR = soilResistDerate(s.soilResistivity, u.installation);
  const groupingU = GROUPING_DERATE.underground[u.installation];
  out.underground = { soilTemp: soilT, soilResist: soilR, grouping: groupingU, total: round(soilT * soilR * groupingU, 4) };

  return out;
}

// ---- Ampacity table selector ----
const AMPACITY_MAP = {
  // [place][conductor][insulation][armour] -> field name in CABLE_DATA[key].armoured / .unarmoured
  Air:    { CU: { XLPE: { SWA: 'cuXlpeAir', '-': 'cuXlpeAir' }, PVC: { SWA: 'cuPvcAir', '-': 'cuPvcAir' } },
            AL: { XLPE: { SWA: 'alXlpeAir', '-': 'alXlpeAir' }, PVC: { SWA: 'alPvcAir', '-': 'alPvcAir' } } },
  Ground: { CU: { XLPE: { SWA: 'cuXlpeGnd', '-': 'cuXlpeGnd' }, PVC: { SWA: 'cuPvcGnd', '-': 'cuPvcGnd' } },
            AL: { XLPE: { SWA: 'alXlpeGnd', '-': 'alXlpeGnd' }, PVC: { SWA: 'alPvcGnd', '-': 'alPvcGnd' } } },
};

function cableAmpacity(place, conductor, insulation, armour, cores, size) {
  const entry = CABLE_DATA[k(cores, size)];
  if (!entry) return null;
  const table = armour === 'SWA' ? entry.armoured : entry.unarmoured;
  const field = AMPACITY_MAP[place][conductor][insulation][armour === 'SWA' ? 'SWA' : '-'];
  const v = table[field];
  return (v === null || v === undefined) ? null : v;
}

function cableDiameter(armour, cores, size) {
  const entry = CABLE_DATA[k(cores, size)];
  if (!entry) return null;
  const v = armour === 'SWA' ? entry.armoured.dia : entry.unarmoured.dia;
  return (v === null || v === undefined) ? null : v;
}

function peDiameter(peSize) {
  // Single-core, unarmoured diameter for the PE conductor size
  const entry = CABLE_DATA[k(1, peSize)];
  if (!entry) return null;
  return entry.unarmoured.dia;
}

function resistancePerKm(conductor, size) {
  const e = CABLE_ELECTRICAL[size];
  if (!e) return null;
  return conductor === 'CU' ? e.rCu : e.rAl;
}
function reactancePerKm(insulation, cores, size) {
  const e = CABLE_ELECTRICAL[size];
  if (!e) return null;
  if (insulation === 'XLPE') return cores === 1 ? e.xSingleXlpe : e.xMultiXlpe;
  return cores === 1 ? e.xSinglePvc : e.xMultiPvc;
}

// ---- CALCULATION sheet: per-row computation ----
// row: {panel, no, tag, loadName, ratedLoadKW, voltage, pf, startingPF, startingCurrentRatio, efficiencyPct,
//       feederRatingCB, pdTripSetting, pdTripType, pdTripSettingType,
//       place, area, conductor, insulation, armour, outerSheath, noRuns, noCores, cableSize,
//       allowedVDPct, cableLength, tripCurve}
// generalDerating: output of computeGeneral()
// general: raw general config (needed for phase-neutral voltage & size thresholds)
function computeRow(row, generalDerating, general) {
  const res = {};
  const isMotor = row.isMotorLoad === 'Yes';
  const eff = isMotor ? (row.efficiencyPct || 0) / 100 : 1;

  // L: Full load current
  if (row.ratedLoadKW > 0 && row.voltage > 0 && row.pf > 0 && eff > 0) {
    const phaseFactor = row.voltage === 400 ? Math.sqrt(3) : Math.sqrt(1);
    res.flc = (row.ratedLoadKW * 1000) / (phaseFactor * row.voltage * row.pf * eff);
  } else {
    res.flc = null;
  }

  const sizeLE25 = row.cableSize > 0 && row.cableSize <= 25;
  const sizeLE26 = row.cableSize > 0 && row.cableSize <= 26; // matches workbook's X (layers) threshold quirk

  // U: Installation (text) / V: Temp / W: Grouping count / X: No. of layers - pulled from GENERAL config
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

  // AH: cable diameter (power cable)
  res.cableDiameter = row.cableSize > 0 ? cableDiameter(row.armour, row.noCores, row.cableSize) : null;

  // AI/AJ/AK: PE cable
  if (row.noRuns > 0) {
    res.peRuns = row.noCores === 5 ? 'N.A.' : row.noRuns;
  } else res.peRuns = null;
  if (row.cableSize > 0) {
    res.peSize = row.noCores === 5 ? 'N.A.' : (PE_SIZE_TABLE[row.cableSize] ?? null);
  } else res.peSize = null;
  res.peDiameter = (row.cableSize > 0 && res.peSize !== 'N.A.' && res.peSize != null) ? peDiameter(res.peSize) : (res.peSize === 'N.A.' ? 'N.A.' : null);

  // AM: cable current carrying capacity (base, per single cable/run)
  res.ampacityBase = row.cableSize > 0 ? cableAmpacity(row.place, row.conductor, row.insulation, row.armour, row.noCores, row.cableSize) : null;

  // AN: circuit current carrying capacity = ampacity * number of runs
  res.ampacityCircuit = (row.noRuns > 0 && res.ampacityBase > 0) ? res.ampacityBase * row.noRuns : null;

  // AO/AP/AQ: derating factors, pulled from GENERAL
  if (row.cableSize > 0 && row.place && row.area) {
    if (row.place === 'Ground') {
      // Workbook quirk: the per-row "Temp." and "Grouping" columns show only the soil-temperature
      // and grouping factors respectively; the soil-thermal-resistivity factor is folded silently
      // into the "Overall Derating Factor" column only (matches GENERAL!S53/S55/S56).
      res.tempDerate = generalDerating.underground.soilTemp;
      res.groupDerate = generalDerating.underground.grouping;
      res.overallDerate = generalDerating.underground.total;
    } else if (row.place === 'Air' && row.area === 'Outdoor') {
      const cat = sizeLE25 ? generalDerating.bunched.outdoor : generalDerating.nonBunched.outdoor;
      res.tempDerate = cat.ambient; res.groupDerate = cat.grouping; res.overallDerate = cat.total;
    } else if (row.place === 'Air' && row.area === 'Indoor') {
      const cat = sizeLE25 ? generalDerating.bunched.indoor : generalDerating.nonBunched.indoor;
      res.tempDerate = cat.ambient; res.groupDerate = cat.grouping; res.overallDerate = cat.total;
    } else {
      res.tempDerate = res.groupDerate = res.overallDerate = 'ERROR';
    }
  } else {
    res.tempDerate = res.groupDerate = res.overallDerate = null;
  }

  // AR: derated circuit ampacity
  if (row.cableSize > 0 && res.ampacityBase != null && typeof res.overallDerate === 'number' && row.noRuns > 0) {
    res.deratedAmpacity = res.ampacityBase * res.overallDerate * row.noRuns;
  } else {
    res.deratedAmpacity = null;
  }

  // AT/AU: R & X per km
  res.rPerKm = row.cableSize > 0 ? resistancePerKm(row.conductor, row.cableSize) : null;
  res.xPerKm = row.cableSize > 0 ? reactancePerKm(row.insulation, row.noCores, row.cableSize) : null;

  // AW: cable voltage drop % (running load)
  if (row.cableLength > 0 && row.allowedVDPct > 0 && res.ampacityBase != null && res.deratedAmpacity != null && res.rPerKm != null && res.xPerKm != null && res.flc != null) {
    const phaseFactor = row.voltage === 400 ? Math.sqrt(3) : Math.sqrt(4);
    const sinPhi = Math.sin(Math.acos(row.pf));
    res.cableVDPct = (((phaseFactor * res.flc * (res.rPerKm * row.pf + res.xPerKm * sinPhi) * row.cableLength) / (1000 * row.noRuns)) / row.voltage) * 100;
  } else {
    res.cableVDPct = null;
  }

  // AY/AZ/BA: motor starting (only applicable when this feeder is flagged as a motor load)
  if (isMotor && row.startingCurrentRatio > 0) {
    res.startingCurrent = row.startingCurrentRatio === 'N.A.' ? 'N.A.' : row.startingCurrentRatio * res.flc;
  } else {
    res.startingCurrent = isMotor ? null : 'N.A.';
  }

  res.allowedStartVDPct = (row.cableLength > 0) ? (res.startingCurrent === 'N.A.' ? 'N.A.' : 10) : null;

  if (row.cableLength > 0 && res.startingCurrent != null) {
    if (res.startingCurrent === 'N.A.') {
      res.startVDPct = 'N.A.';
    } else if (res.rPerKm != null && res.xPerKm != null) {
      const phaseFactor = row.voltage === 400 ? Math.sqrt(3) : Math.sqrt(4);
      const sinPhiStart = Math.sin(Math.acos(row.startingPF));
      res.startVDPct = (((phaseFactor * res.startingCurrent * (res.rPerKm * row.startingPF + res.xPerKm * sinPhiStart) * row.cableLength) / (1000 * row.noRuns)) / row.voltage) * 100;
    } else res.startVDPct = null;
  } else res.startVDPct = null;

  // BD: max cable length for earth-fault-loop
  if (row.cableLength > 0 && row.tripCurve && row.cableSize > 0 && row.pdTripSetting > 0) {
    if (row.tripCurve === 'N.A.') {
      res.maxCableLength = 'N.A.';
    } else {
      const mult = TRIP_CURVE_MULTIPLIER[row.tripCurve];
      const peR = (res.peSize !== 'N.A.' && res.peSize != null) ? resistancePerKm(row.conductor, res.peSize) : null;
      // workbook always pulls single-core PVC reactance for the PE conductor
      const peX = (res.peSize !== 'N.A.' && res.peSize != null && CABLE_ELECTRICAL[res.peSize]) ? CABLE_ELECTRICAL[res.peSize].xSinglePvc : null;
      if (mult && peR != null && peX != null && res.rPerKm != null && res.xPerKm != null) {
        const zLoop = Math.sqrt(Math.pow(res.rPerKm + peR, 2) + Math.pow(res.xPerKm + peX, 2));
        res.maxCableLength = (1000 * 0.8 * general.site.phaseNeutralVoltage) / ((row.pdTripSetting * mult) * zLoop);
      } else {
        res.maxCableLength = null;
      }
    }
  } else {
    res.maxCableLength = null;
  }

  // BF: Remarks / overall pass-fail, plus individual checks for UI highlighting
  const checks = {
    ampacity: (res.deratedAmpacity != null && res.deratedAmpacity !== '-' && row.pdTripSetting > 0) ? res.deratedAmpacity > row.pdTripSetting : null,
    tripTypeSelected: !!row.pdTripType,
    voltageDrop: (row.allowedVDPct > 0 && res.cableVDPct != null) ? row.allowedVDPct > res.cableVDPct : null,
    startingVoltageDrop: (res.startVDPct === 'N.A.') ? true : (res.allowedStartVDPct != null && res.startVDPct != null) ? res.allowedStartVDPct > res.startVDPct : null,
    faultLoopLength: (res.maxCableLength === 'N.A.') ? true : (typeof res.maxCableLength === 'number' && row.cableLength > 0) ? res.maxCableLength > row.cableLength : null,
  };
  res.checks = checks;

  if (!row.voltage) {
    res.remarks = null;
  } else {
    const allKnown = Object.values(checks).every(v => v !== null);
    const allPass = Object.values(checks).every(v => v === true);
    res.remarks = allKnown ? (allPass ? 'ACCEPTABLE' : 'NOT ACCEPTABLE') : 'INCOMPLETE';
  }

  return res;
}

if (typeof module !== 'undefined') {
  module.exports = { computeGeneral, computeRow, airTempDerate, soilTempDerate, soilResistDerate, cableAmpacity, cableDiameter, resistancePerKm, reactancePerKm };
}
