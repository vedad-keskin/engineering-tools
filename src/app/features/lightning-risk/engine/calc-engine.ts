// ============================================================
// Lightning Risk Assessment - calculation engine (pure)
// Component-based risk model per IEC 62305-2:2010 (Ed. 2.0):
//   Risk component = N x P x L
// Functions are named after the standard's own structure so the
// code can be audited clause-by-clause (Annexes A/B/C):
//   calcAD / calcND  - Annex A.2  (flashes to the structure)
//   calcAM / calcNM  - Annex A.3  (flashes near the structure)
//   calcPA           - Annex B.2  (shock injury)
//   calcPB           - Annex B.3  (physical damage)
//   calcPC           - Annex B.4  (internal systems, direct)
//   calcPM           - Annex B.5  (internal systems, nearby)
//   calcLA/LB/LC/LM  - Annex C.1  (losses)
// Line-connected components RU/RV/RW/RZ are NOT implemented yet
// (Phase 2, plan v2 s5) - the results panel carries a disclaimer.
//
// inputs: geometry (m), Ng (flashes/km2/yr), and dropdown labels.
// returns: { AD, AM, ND, NM, PA, PB, PC, PM, per-risk component
//            breakdown, R1, R2, R3, result1..3, ... } or
//            { incomplete: true } when inputs aren't fully valid.
// ============================================================

import {
  CULTURE_LF,
  LIFE_CRITICAL_LO_FALLBACK,
  lookupValue,
  PMS_DEFAULT,
  PTA_DEFAULT,
  RT,
  serviceLoss,
  structureLoss,
  ZONE_RATIO_NZ_NT,
  ZONE_TIME_TZ_8760,
  type ElectricalLineLabel,
  type FireProvisionsLabel,
  type FireRiskLabel,
  type FloorTypeLabel,
  type LocationLabel,
  type ProtectionLevelLabel,
  type ServiceTypeLabel,
  type SpecialHazardLabel,
  type SpdLabel,
  type StructureTypeLabel,
} from './data';

export type RiskVerdict = 'ACCEPTABLE' | 'NOT ACCEPTABLE';

export interface LightningInputs {
  Ng: number | string;
  L: number | string;
  W: number | string;
  Hi: number | string;
  T: number | string;
  Cd: LocationLabel | string;
  rf: FireRiskLabel | string;
  Pd: ProtectionLevelLabel | string;
  spd: SpdLabel | string;
  hz: SpecialHazardLabel | string;
  floorType: FloorTypeLabel | string;
  fireProvisions: FireProvisionsLabel | string;
  structureType: StructureTypeLabel | string;
  services: ServiceTypeLabel | string;
  Ai: ElectricalLineLabel | string;
  lifeCritical: boolean;
}

export interface LightningIncomplete {
  incomplete: true;
}

export interface LightningRiskResult {
  incomplete: false;
  AD: number;
  AM: number;
  ND: number;
  NM: number;
  PA: number;
  PB: number;
  PC: number;
  PM: number;
  LA: number;
  LB1: number;
  LC1: number;
  LB2: number;
  LC2: number;
  LB3: number;
  RA: number;
  RB1: number;
  RC1: number;
  RM1: number;
  RB2: number;
  RC2: number;
  RM2: number;
  RB3: number;
  R1: number;
  R2: number;
  R3: number;
  result1: RiskVerdict;
  result2: RiskVerdict;
  result3: RiskVerdict;
  lifeCritical: boolean;
}

export type LightningCalculation = LightningIncomplete | LightningRiskResult;

export function calcNum(v: number | string | null | undefined): number {
  if (v === null || v === undefined || v === '') return NaN;
  const n = parseFloat(String(v));
  return Number.isNaN(n) ? NaN : n;
}

/* ===================================================================
   NUMBER OF DANGEROUS EVENTS (Annex A)
   =================================================================== */

// Annex A.2 - collection area for direct flashes (same Ad1/Ad2/max()
// structure as v1; Ad2 covers a protruding chimney / tower).
export function calcAD(inputs: LightningInputs): number {
  const L = calcNum(inputs.L);
  const W = calcNum(inputs.W);
  const Hi = calcNum(inputs.Hi);
  const T = calcNum(inputs.T);
  const Ad1 = L * W + 6 * Hi * (L + W) + 9 * Math.PI * Hi * Hi;
  const Ad2 = 9 * Math.PI * T * T;
  return Math.max(Ad1, Ad2);
}

// Annex A.3 - collection area for flashes near the structure
// (a 500 m wide band around the structure).
export function calcAM(inputs: LightningInputs): number {
  const L = calcNum(inputs.L);
  const W = calcNum(inputs.W);
  return 2 * 500 * (L + W) + Math.PI * 500 * 500;
}

// Annex A.2 - annual dangerous events: flashes to the structure
export function calcND(inputs: LightningInputs): number {
  const Cd = lookupValue('location', inputs.Cd);
  return calcNum(inputs.Ng) * calcAD(inputs) * (Cd ?? NaN) * 0.000001;
}

// Annex A.3 - annual dangerous events: flashes near the structure
export function calcNM(inputs: LightningInputs): number {
  return calcNum(inputs.Ng) * calcAM(inputs) * 0.000001;
}

/* ===================================================================
   PROBABILITY OF DAMAGE (Annex B)
   =================================================================== */

// Annex B.2 - probability a flash to the structure causes shock
// injury. PA = PTA x PB. PTA_DEFAULT = 1 (no touch/step-voltage
// protection measures), so PA reduces to PB for the common case -
// the same "Lightning Protection Level" dropdown drives both
// variables on purpose (plan v2 s2.4).
export function calcPA(inputs: LightningInputs): number {
  return PTA_DEFAULT * calcPB(inputs);
}

// Annex B.3 - probability of physical damage (fire/explosion),
// by class of LPS.
export function calcPB(inputs: LightningInputs): number {
  return lookupValue('protectionLevel', inputs.Pd) ?? NaN;
}

// Annex B.4 - probability of internal-system failure from a direct
// flash. PC = PSPD x CLD, where CLD (Table B.6) is 0 when no
// external line enters the structure (stand-alone systems).
function calcPSPD(inputs: LightningInputs): number {
  return lookupValue('spd', inputs.spd) ?? NaN;
}

function calcCLD(inputs: LightningInputs): number {
  return inputs.Ai === 'No' ? 0 : 1; // Table B.6 (DEHN 3.2.4.4), VERIFIED
}

export function calcPC(inputs: LightningInputs): number {
  return calcPSPD(inputs) * calcCLD(inputs);
}

// Annex B.5 - probability of internal-system failure from a nearby
// flash. PM = PSPD x PMS. PMS_DEFAULT = 1 is the worst case
// (no spatial shielding, unshielded cabling, withstand <= 1 kV);
// tagged NEEDS_VERIFICATION - see data.js.
export function calcPMS(_inputs: LightningInputs): number {
  return PMS_DEFAULT;
}

export function calcPM(inputs: LightningInputs): number {
  return calcPSPD(inputs) * calcPMS(inputs);
}

/* ===================================================================
   LOSS (Annex C.1)
   =================================================================== */

// Fire risk reduction rf - Table C.5 (rp is forced to 1 for
// structures with risk of explosion, standard clause C.2).
function calcRF(inputs: LightningInputs): number {
  return lookupValue('fireRisk', inputs.rf) ?? NaN;
}

function calcRP(inputs: LightningInputs): number {
  if (inputs.rf === 'Explosion') return 1; // rp = 1 always, VERIFIED (clause C.2)
  return lookupValue('fireProvisions', inputs.fireProvisions) ?? NaN;
}

function calcHZ(inputs: LightningInputs): number {
  return lookupValue('specialHazard', inputs.hz) ?? NaN;
}

function calcRT(inputs: LightningInputs): number {
  return lookupValue('floorType', inputs.floorType) ?? NaN;
}

// Is the internal-systems risk path (RC/RM) applicable to R1?
// Per IEC 62305-2 Annex C, RC and RM only count toward loss of
// human life for structures with risk of explosion or for hospitals
// / other life-critical facilities (plan v2 s3).
function isHospitalType(label: string): boolean {
  return label === 'Hospital \u2013 intensive care / operating section' || label === 'Hospital \u2013 other areas';
}

export function lifeCriticalEff(inputs: LightningInputs): boolean {
  return inputs.rf === 'Explosion' || inputs.lifeCritical === true || isHospitalType(inputs.structureType);
}

// LA: loss of life by shock (D1). Single-zone, continuous occupancy
// constants are kept explicit (plan v2 s2.5).
export function calcLA(inputs: LightningInputs): number {
  const st = structureLoss(inputs.structureType);
  if (!st) return NaN;
  return calcRT(inputs) * st.LT * ZONE_RATIO_NZ_NT * ZONE_TIME_TZ_8760;
}

// LB (loss of human life): loss by physical damage (D2).
export function calcLBHuman(inputs: LightningInputs): number {
  const st = structureLoss(inputs.structureType);
  if (!st) return NaN;
  return calcRP(inputs) * calcRF(inputs) * calcHZ(inputs) * st.LF * ZONE_RATIO_NZ_NT * ZONE_TIME_TZ_8760;
}

// LC/LM (loss of human life): loss by internal-system failure (D3).
// LO is taken from the structure type; for non-hospital / non-
// explosion types LO = 0. If the life-critical checkbox is ticked
// for such a type, the provisional fallback value applies
// (NEEDS_VERIFICATION - see data.js).
export function calcLCHuman(inputs: LightningInputs): number {
  const st = structureLoss(inputs.structureType);
  if (!st) return NaN;
  let lo = st.LO;
  if (inputs.lifeCritical === true && lo === 0) lo = LIFE_CRITICAL_LO_FALLBACK;
  return lo * ZONE_RATIO_NZ_NT * ZONE_TIME_TZ_8760;
}

// LB (loss of service to public, R2): per service type (Table C.3).
export function calcLBService(inputs: LightningInputs): number {
  const svc = serviceLoss(inputs.services);
  if (!svc) return NaN;
  return calcRP(inputs) * calcRF(inputs) * svc.LF * ZONE_RATIO_NZ_NT;
}

// LC/LM (loss of service to public, R2): per service type (Table C.3).
export function calcLCService(inputs: LightningInputs): number {
  const svc = serviceLoss(inputs.services);
  if (!svc) return NaN;
  return svc.LO * ZONE_RATIO_NZ_NT;
}

// LB (loss of cultural heritage, R3): Table C.4 typical value.
export function calcLBCulture(inputs: LightningInputs): number {
  return calcRP(inputs) * calcRF(inputs) * CULTURE_LF * ZONE_RATIO_NZ_NT;
}

/* ===================================================================
   ASSEMBLY (plan v2 s3 - only R1, R2, R3 evaluated)
   =================================================================== */
export function calculateLightningRisk(inputs: LightningInputs): LightningCalculation {
  const Ng = calcNum(inputs.Ng);
  const L = calcNum(inputs.L);
  const W = calcNum(inputs.W);
  const Hi = calcNum(inputs.Hi);
  const T = Number.isNaN(calcNum(inputs.T)) ? 0 : calcNum(inputs.T);

  const factorsKnown = [
    lookupValue('location', inputs.Cd),
    lookupValue('fireRisk', inputs.rf),
    lookupValue('protectionLevel', inputs.Pd),
    lookupValue('spd', inputs.spd),
    lookupValue('specialHazard', inputs.hz),
    lookupValue('floorType', inputs.floorType),
    lookupValue('fireProvisions', inputs.fireProvisions),
    structureLoss(inputs.structureType),
    serviceLoss(inputs.services),
  ].every((v) => v != null);

  if (!(Ng > 0 && L > 0 && W > 0 && Hi > 0 && T >= 0) || !factorsKnown) {
    return { incomplete: true };
  }

  // ---- dangerous events ----
  const AD = calcAD(inputs);
  const AM = calcAM(inputs);
  const ND = calcND(inputs);
  const NM = calcNM(inputs);

  // ---- probabilities ----
  const PA = calcPA(inputs);
  const PB = calcPB(inputs);
  const PC = calcPC(inputs);
  const PM = calcPM(inputs);

  // ---- risk components (structure-related only) ----
  // R1 (loss of human life)
  const RA = ND * PA * calcLA(inputs);
  const RB1 = ND * PB * calcLBHuman(inputs);
  const LC1 = calcLCHuman(inputs);
  const RC1 = ND * PC * LC1;
  const RM1 = NM * PM * LC1;

  // R2 (loss of service to public)
  const RB2 = ND * PB * calcLBService(inputs);
  const LC2 = calcLCService(inputs);
  const RC2 = ND * PC * LC2;
  const RM2 = NM * PM * LC2;

  // R3 (loss of cultural heritage)
  const RB3 = ND * PB * calcLBCulture(inputs);

  // ---- assembly with applicability rules ----
  const lifeCritical = lifeCriticalEff(inputs);
  const R1 = RA + RB1 + (lifeCritical ? RC1 + RM1 : 0);
  const R2 = RB2 + RC2 + RM2;
  const R3 = RB3;

  const result1: RiskVerdict = R1 > RT.RT1 ? 'NOT ACCEPTABLE' : 'ACCEPTABLE';
  const result2: RiskVerdict = R2 > RT.RT2 ? 'NOT ACCEPTABLE' : 'ACCEPTABLE';
  const result3: RiskVerdict = R3 > RT.RT3 ? 'NOT ACCEPTABLE' : 'ACCEPTABLE';

  return {
    AD,
    AM,
    ND,
    NM,
    PA,
    PB,
    PC,
    PM,
    LA: calcLA(inputs),
    LB1: calcLBHuman(inputs),
    LC1,
    LB2: calcLBService(inputs),
    LC2,
    LB3: calcLBCulture(inputs),
    RA,
    RB1,
    RC1,
    RM1,
    RB2,
    RC2,
    RM2,
    RB3,
    R1,
    R2,
    R3,
    result1,
    result2,
    result3,
    lifeCritical,
    incomplete: false,
  };
}
