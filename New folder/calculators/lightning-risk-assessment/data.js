// ============================================================
// Lightning Risk Assessment - reference data
// Component-based risk model per IEC 62305-2:2010 (Ed. 2.0).
// Every table entry is tagged with its source table and a
// VERIFIED / NEEDS_VERIFICATION marker so a standard-compliance
// audit can grep for outstanding items. Tables reproduced from
// public technical literature (DEHN Lightning Protection Guide,
// 3rd ed. 2014 - a free manufacturer reference that reproduces
// the IEC 62305-2 tables); figures should still be spot-checked
// against a licensed copy of the standard before this tool is
// used for compliance decisions. Edition 3.0 (2024) support can
// be added later as a sibling STANDARDS entry (edition-ready
// structure kept for that purpose).
// ============================================================

// Edition metadata surfaced in the UI (plan v2, section 6)
const STANDARD_EDITION = {
  id: 'iec-62305-2-2010',
  label: 'IEC 62305-2:2010 (Ed. 2.0)',
  note: '2024 Ed. 3.0 supersedes this edition; some jurisdictions phase it in on a compliance deadline (e.g. UK: binding from Oct 2027). Confirm the applicable edition with the engineer of record.',
};

// The engine reads these globals; future editions slot in here.
const STANDARDS = {
  'iec-62305-2-2010': {
    edition: STANDARD_EDITION,
    RT: {
      RT1: 0.00001, // 1e-5 - tolerable risk for loss of human life (Table 4)
      RT2: 0.001,   // 1e-3 - tolerable risk for loss of service to public (Table 4)
      RT3: 0.0001,  // 1e-4 - tolerable risk for loss of cultural heritage (Table 4) - WAS 0.001 in v1 (fixed per plan v2 s1.1)
    },
  },
};
const ACTIVE_STANDARD = STANDARDS[STANDARD_EDITION.id];
const RT = ACTIVE_STANDARD.RT;

// ============================================================
// Lookup tables. Each entry: { label, value, ... } with source
// and verification status documented. lookupValue() reads .value.
// ============================================================
const TABLES = {

  // Special hazard factor hz - Table C.6 (DEHN 3.2.5.4). VERIFIED.
  // The two extra rows from the v1 tool (values 20 and 50) are NOT
  // part of the standard and were removed per site-owner decision.
  specialHazard: [
    { label: 'No particular danger', value: 1, source: 'Table C.6', status: 'VERIFIED' },
    { label: 'Low panic level (<=2 floors, < 100 persons)', value: 2, source: 'Table C.6', status: 'VERIFIED' },
    { label: 'Medium risk of panic (< 1000 persons)', value: 5, source: 'Table C.6', status: 'VERIFIED' },
    { label: 'Difficult to evacuate (disabled people, hospitals)', value: 5, source: 'Table C.6', status: 'VERIFIED' },
    { label: 'High risk of panic (> 1000 persons)', value: 10, source: 'Table C.6', status: 'VERIFIED' },
  ],

  // Lightning protection level PB - Table B.3 (DEHN 3.2.4.2). VERIFIED.
  // The standard also has two natural-component rows (0.01, 0.001) for
  // LPS I + continuous metal/reinforced-concrete framework acting as a
  // natural down-conductor system; not exposed in the UI (optional
  // advanced options for a later revision).
  protectionLevel: [
    { label: 'None', value: 1, source: 'Table B.3', status: 'VERIFIED' },
    { label: 'Protection Level IV', value: 0.2, source: 'Table B.3', status: 'VERIFIED' },
    { label: 'Protection Level III', value: 0.1, source: 'Table B.3', status: 'VERIFIED' },
    { label: 'Protection Level II', value: 0.05, source: 'Table B.3', status: 'VERIFIED' },
    { label: 'Protection Level I', value: 0.02, source: 'Table B.3', status: 'VERIFIED' },
  ],

  // Coordinated SPD probability PSPD - Table B.4 (DEHN 3.2.4.3). VERIFIED.
  // PC = PSPD x CLD. Note: the v1 tool's 0.03 row was replaced with the
  // standard's 0.05 (LPL III-IV).
  spd: [
    { label: 'No coordinated SPD', value: 1, source: 'Table B.4', status: 'VERIFIED' },
    { label: 'Coordinated SPD - LPL III or IV', value: 0.05, source: 'Table B.4', status: 'VERIFIED' },
    { label: 'Coordinated SPD - LPL II', value: 0.02, source: 'Table B.4', status: 'VERIFIED' },
    { label: 'Coordinated SPD - LPL I', value: 0.01, source: 'Table B.4', status: 'VERIFIED' },
  ],

  // Relative location CD - Table A.1 (DEHN 3.2.3.1). VERIFIED.
  location: [
    { label: 'Structure surrounded by higher objects or trees', value: 0.25, source: 'Table A.1', status: 'VERIFIED' },
    { label: 'Structure surrounded by similar or lower objects', value: 0.5, source: 'Table A.1', status: 'VERIFIED' },
    { label: 'Isolated structure \u2013 No other objects nearby', value: 1, source: 'Table A.1', status: 'VERIFIED' },
    { label: 'Isolated structure on top of a hill or a hillock', value: 2, source: 'Table A.1', status: 'VERIFIED' },
  ],

  // Fire / explosion risk rf - Table C.5 (DEHN 3.2.5.3). VERIFIED.
  // "Explosion" here is the worst-case hazardous zone (Zone 0/20, solid
  // explosives, rf = 1). The full standard splits explosion into three
  // sub-tiers by hazardous-zone classification (Zone 1/21: 1e-1,
  // Zone 2/22: 1e-3) - flagged as an optional future refinement.
  fireRisk: [
    { label: 'Explosion', value: 1, source: 'Table C.5', status: 'VERIFIED' },
    { label: 'High', value: 0.1, source: 'Table C.5', status: 'VERIFIED' },
    { label: 'Ordinary', value: 0.01, source: 'Table C.5', status: 'VERIFIED' },
    { label: 'Low', value: 0.001, source: 'Table C.5', status: 'VERIFIED' },
  ],

  // Floor / ground surface factor rt - Table C.2 (DEHN 3.2.5.1). VERIFIED.
  floorType: [
    { label: 'Agricultural, concrete', value: 0.01, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Marble, ceramic', value: 0.001, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Gravel, moquette, carpets', value: 0.0001, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Asphalt, linoleum, wood', value: 0.00001, source: 'Table C.2', status: 'VERIFIED' },
  ],

  // Fire-fighting provisions rp - Table C.3 (DEHN 3.2.5.2). VERIFIED.
  // When the fire risk is "Explosion", rp is forced to 1 regardless
  // of provisions (standard clause C.2, flagged by plan v2 s2.5).
  fireProvisions: [
    { label: 'No provisions', value: 1, source: 'Table C.3', status: 'VERIFIED' },
    { label: 'Extinguishers / manual alarm / hydrants / fire compartments / escape routes', value: 0.5, source: 'Table C.3', status: 'VERIFIED' },
    { label: 'Automatic extinguishing or alarm (with overvoltage protection, < 10 min response)', value: 0.2, source: 'Table C.3', status: 'VERIFIED' },
  ],

  // Structure type - Table C.2 "typical mean values for LT, LF, LO"
  // for loss of human life (DEHN 3.2.5.5). VERIFIED.
  // Entries carry LT / LF / LO directly (lookupValue() returns .value,
  // which is null here - the engine uses the specialized accessor).
  structureType: [
    { label: 'Risk of explosion', LT: 0.01, LF: 0.1, LO: 0.1, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Hospital \u2013 intensive care / operating section', LT: 0.01, LF: 0.1, LO: 0.01, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Hospital \u2013 other areas', LT: 0.01, LF: 0.1, LO: 0.001, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Hotel, school, public building', LT: 0.01, LF: 0.1, LO: 0, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Entertainment facility, church, museum', LT: 0.01, LF: 0.05, LO: 0, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Industrial structure, economically used plant', LT: 0.01, LF: 0.02, LO: 0, source: 'Table C.2', status: 'VERIFIED' },
    { label: 'Other', LT: 0.01, LF: 0.01, LO: 0, source: 'Table C.2', status: 'VERIFIED' },
  ],

  // Type of service - Table C.3 "typical mean values for LF and LO"
  // for loss of service to the public (DEHN 3.2.5.6). VERIFIED.
  // Replaces the v1 "Associated Services" field (Lf2) with the
  // standard's per-service-type loss values.
  serviceType: [
    { label: 'No', LF: 0, LO: 0, source: 'Table C.3', status: 'VERIFIED' },
    { label: 'Gas, water, power supply', LF: 0.1, LO: 0.01, source: 'Table C.3', status: 'VERIFIED' },
    { label: 'TV, telecommunication', LF: 0.01, LO: 0.001, source: 'Table C.3', status: 'VERIFIED' },
  ],

  // Loss of cultural heritage (L3) - Table C.4 (DEHN 3.2.5.7). VERIFIED.
  cultureHeritageLF: 0.1,
};

// ---------- specialized accessors for the multi-column tables ----------
function lookupValue(tableName, label) {
  const row = (TABLES[tableName] || []).find(r => r.label === label);
  return row ? row.value : null;
}
function structureLoss(label) {
  const row = (TABLES.structureType || []).find(r => r.label === label);
  return row ? { LT: row.LT, LF: row.LF, LO: row.LO } : null;
}
function serviceLoss(label) {
  const row = (TABLES.serviceType || []).find(r => r.label === label);
  return row ? { LF: row.LF, LO: row.LO } : null;
}

// ---------- constants (single-zone, continuous occupancy) ----------
// Plan v2 s2.5: keep these as named constants (not silently omitted)
// so the formulas stay traceable to the standard and can be extended
// to multi-zone structures later.
const ZONE_RATIO_NZ_NT = 1;   // nz/nt: single zone holds all persons/users
const ZONE_TIME_TZ_8760 = 1;  // tz/8760: continuous occupancy all year

// PTA (Table B.2 / DEHN 3.2.4.1): probability of shock via touch/step
// voltage. 1 = no touch/step protection measures installed, which is
// the common case; PA then reduces to PB (see calcPA comment).
const PTA_DEFAULT = 1; // VERIFIED (Table B.2) - no protection measures

// PMS (Table B.5 / DEHN 3.2.4): PMS = (KS1 x KS2 x KS3 x KS4)^2, each
// KS factor max 1. Default = 1 (worst case: no spatial shielding,
// unshielded cabling with no routing precaution, withstand <= 1 kV).
// NEEDS_VERIFICATION: per-site shielding / wiring / withstand data
// should replace this default before compliance decisions.
const PMS_DEFAULT = 1; // NEEDS_VERIFICATION (Table B.5)

// "Other life-critical facility" fallback loss for R1 internal-systems
// components (LC/LM), used only when the user ticks the life-critical
// checkbox for a structure type with LO = 0. Provisional value taken
// from the lowest hospital row of Table C.2. NEEDS_VERIFICATION.
const LIFE_CRITICAL_LO_FALLBACK = 0.001; // NEEDS_VERIFICATION (Table C.2)

// The standard's typical loss for L3 (cultural heritage), Table C.4.
const CULTURE_LF = TABLES.cultureHeritageLF; // VERIFIED (Table C.4)

// A quick audit summary for grepping
const DATA_AUDIT = [
  ['specialHazard (hz)', 'Table C.6', 'VERIFIED'],
  ['protectionLevel (PB)', 'Table B.3', 'VERIFIED'],
  ['spd (PSPD)', 'Table B.4', 'VERIFIED'],
  ['location (CD)', 'Table A.1', 'VERIFIED'],
  ['fireRisk (rf)', 'Table C.5', 'VERIFIED'],
  ['floorType (rt)', 'Table C.2', 'VERIFIED'],
  ['fireProvisions (rp)', 'Table C.3', 'VERIFIED'],
  ['structureType (LT/LF/LO)', 'Table C.2', 'VERIFIED'],
  ['serviceType (LF/LO)', 'Table C.3', 'VERIFIED'],
  ['cultureHeritageLF', 'Table C.4', 'VERIFIED'],
  ['PTA_DEFAULT', 'Table B.2', 'VERIFIED'],
  ['PMS_DEFAULT', 'Table B.5', 'NEEDS_VERIFICATION'],
  ['LIFE_CRITICAL_LO_FALLBACK', 'Table C.2', 'NEEDS_VERIFICATION'],
];

// ============================================================
// Defaults. Dropdowns default to sensible first options (no blank
// placeholders); fire risk defaults to "Ordinary" rather than the
// first option to avoid an accidentally-explosive starting point.
// Ng = 8 is the example value from the source material.
// ============================================================
const LIGHTNING_DEFAULTS = {
  project: { name: '', id: '' },
  Ng: 8,
  L: '',
  W: '',
  Hi: '',
  T: 0,
  hz: TABLES.specialHazard[0].label,
  structureType: 'Other',
  floorType: TABLES.floorType[0].label,
  fireProvisions: TABLES.fireProvisions[0].label,
  lifeCritical: false,
  Pd: TABLES.protectionLevel[0].label,
  spd: TABLES.spd[0].label,
  Ai: 'No',
  Cd: TABLES.location[0].label,
  rf: 'Ordinary',
  services: TABLES.serviceType[0].label,
};

// Worked example from the legacy Excel file's sample data ("KTC Tower"),
// re-expressed in the v2 input set.
const KTC_EXAMPLE = {
  project: { name: 'KTC Tower', id: '' },
  Ng: 8,
  L: 12,
  W: 15,
  Hi: 10,
  T: 2,
  hz: 'No particular danger',
  structureType: 'Other',
  floorType: 'Agricultural, concrete',
  fireProvisions: 'No provisions',
  lifeCritical: false,
  Pd: 'Protection Level IV',
  spd: 'No coordinated SPD',
  Ai: 'Underground',
  Cd: 'Structure surrounded by higher objects or trees',
  rf: 'Low',
  services: 'Gas, water, power supply',
};