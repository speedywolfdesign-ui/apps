/* ================================================================
   S-CURVE FORECASTING ENGINE
   Methodology: Gower distance, recency weighting, weighted-median
   forecast, P10/P50/P90 confidence bands
   ================================================================ */

'use strict';

/* ──────────────────────────────────────────────────────────────────
   SEEDED PRNG — mulberry32
   ────────────────────────────────────────────────────────────────── */
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ──────────────────────────────────────────────────────────────────
   BETA-DISTRIBUTION PDF (unnormalised)
   ────────────────────────────────────────────────────────────────── */
function betaPDF(x, alpha, beta) {
  if (x <= 0 || x >= 1) return 0;
  return Math.pow(x, alpha - 1) * Math.pow(1 - x, beta - 1);
}

/**
 * Generate a monthly spend profile using a beta distribution.
 * nPeriods: number of months
 * alpha, beta: shape params
 * totalBudget: total spend in $M
 * noiseSeed: seed for reproducible noise (~15% amplitude)
 * Returns array of length nPeriods with monthly spend values.
 */
function generateSpendProfile(nPeriods, alpha, betaShape, totalBudget, noiseSeed) {
  const rng = mulberry32(noiseSeed);
  const raw = [];
  for (let i = 0; i < nPeriods; i++) {
    const x = (i + 0.5) / nPeriods;
    raw.push(betaPDF(x, alpha, betaShape));
  }
  // Add ~15% multiplicative noise
  const noisy = raw.map(v => v * (1 + 0.15 * (rng() * 2 - 1)));
  const sum = noisy.reduce((a, b) => a + b, 0);
  return noisy.map(v => (v / sum) * totalBudget);
}

/* ──────────────────────────────────────────────────────────────────
   CURVE SHAPE STATISTICS
   ────────────────────────────────────────────────────────────────── */
function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function skewness(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const sd = Math.sqrt(variance(arr));
  if (sd === 0) return 0;
  const m3 = arr.reduce((s, v) => s + ((v - m) / sd) ** 3, 0) / arr.length;
  return m3;
}

function kurtosis(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const sd = Math.sqrt(variance(arr));
  if (sd === 0) return 0;
  const m4 = arr.reduce((s, v) => s + ((v - m) / sd) ** 4, 0) / arr.length;
  return m4 - 3; // excess kurtosis
}

function frontLoadRatio(arr) {
  if (!arr.length) return 0;
  const half = Math.floor(arr.length / 2);
  const firstHalf = arr.slice(0, half).reduce((a, b) => a + b, 0);
  const total = arr.reduce((a, b) => a + b, 0);
  return total === 0 ? 0 : firstHalf / total;
}

function giniCoeff(arr) {
  const n = arr.length;
  if (n === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const cumsum = [];
  let s = 0;
  for (const v of sorted) { s += v; cumsum.push(s); }
  const totalSum = s;
  if (totalSum === 0) return 0;
  const L = cumsum.reduce((acc, c) => acc + c / totalSum, 0) / n;
  return 1 - 2 * L + 1 / n;
}

function peakPeriodNorm(arr) {
  if (!arr.length) return 0;
  let maxIdx = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[maxIdx]) maxIdx = i;
  return maxIdx / (arr.length - 1 || 1);
}

/**
 * Compute all shape stats for a spend array up to `upToIndex` (inclusive).
 * Returns an object of stats.
 */
function computeShapeStats(arr, upToIndex) {
  const slice = arr.slice(0, upToIndex + 1);
  return {
    skewness:        skewness(slice),
    kurtosis:        kurtosis(slice),
    frontLoadRatio:  frontLoadRatio(slice),
    gini:            giniCoeff(slice),
    peakPeriodNorm:  peakPeriodNorm(slice),
  };
}

/* ──────────────────────────────────────────────────────────────────
   WEIGHTED PERCENTILE (linear interpolation)
   weights and values must be same length
   ────────────────────────────────────────────────────────────────── */
function weightedPercentile(values, weights, p) {
  if (!values.length) return NaN;
  // Sort by value
  const pairs = values.map((v, i) => [v, weights[i]]).sort((a, b) => a[0] - b[0]);
  const totalW = pairs.reduce((s, [, w]) => s + w, 0);
  if (totalW === 0) return NaN;

  // Build cumulative weights
  const cum = [];
  let acc = 0;
  for (const [, w] of pairs) { acc += w; cum.push(acc / totalW); }

  const target = p / 100;
  if (target <= cum[0]) return pairs[0][0];
  if (target >= cum[cum.length - 1]) return pairs[pairs.length - 1][0];

  for (let i = 1; i < pairs.length; i++) {
    if (cum[i] >= target) {
      // Linear interpolation
      const frac = (target - cum[i - 1]) / (cum[i] - cum[i - 1]);
      return pairs[i - 1][0] + frac * (pairs[i][0] - pairs[i - 1][0]);
    }
  }
  return pairs[pairs.length - 1][0];
}

/* ──────────────────────────────────────────────────────────────────
   DATA: FOCAL ACCOUNT
   ────────────────────────────────────────────────────────────────── */
const FOCAL = {
  id: 'PROJ-2024/ACCT-CIVIL-001',
  phase:        'Construction',
  discipline:   'Civil',
  workType:     'Construction',
  projSizeCat:  'L',
  acctSizeCat:  'M',
  region:       'NA',
  durationMonths: 24,
  budgetAmount:  15.0,   // $M
  acctPctProject: 0.125,
  laborMix:     0.58,
  materialMix:  0.18,
  equipMix:     0.14,
  subMix:       0.10,
  // Planned profile: beta(3,3) scaled to $15M, no noise
  get plannedProfile() {
    return generateSpendProfile(24, 3.0, 3.0, 15.0, 999);
  },
  // Actual spend months 1-10 ($M, converted from $K)
  actualSpend: [0.120, 0.255, 0.385, 0.545, 0.725, 0.855, 0.910, 0.870, 0.765, 0.700],
  completionDate: null, // active
};

// Pre-compute planned stats once
const focalPlanned = FOCAL.plannedProfile;
const focalPlannedStats = computeShapeStats(focalPlanned, focalPlanned.length - 1);

// Total actuals to date (sum of all known actual spend)
const ACTD_COMPUTED = FOCAL.actualSpend.reduce((a, b) => a + b, 0); // $6.13M

/* ──────────────────────────────────────────────────────────────────
   DATA: POOL ACCOUNTS
   [id, phase, discipline, workType, projSize, acctSize, region,
    durationMo, budgetM, acctPct, labor, mat, equip, sub,
    spendAlpha, spendBeta, completionYear, noiseSeed]
   ────────────────────────────────────────────────────────────────── */
const POOL_RAW = [
  ['MATCH-001','Construction','Civil','Construction','L','M','NA',22,14.2,0.120,0.56,0.19,0.15,0.10,3.0,2.8,2022,1],
  ['MATCH-002','Construction','Civil','Construction','L','M','NA',26,16.1,0.118,0.55,0.20,0.14,0.11,3.1,3.2,2023,2],
  ['MATCH-003','Construction','Civil','Construction','L','S','NA',20,11.8,0.110,0.57,0.18,0.15,0.10,2.8,3.0,2023,3],
  ['MATCH-004','Construction','Civil','Construction','L','M','NA',24,15.5,0.129,0.54,0.21,0.14,0.11,3.2,3.0,2022,4],
  ['MATCH-005','Construction','Structural','Construction','L','M','NA',22,13.8,0.115,0.48,0.22,0.18,0.12,3.0,3.1,2021,5],
  ['MATCH-006','Construction','Civil','Construction','M','S','NA',18,9.5,0.238,0.60,0.18,0.13,0.09,2.0,4.5,2022,6],
  ['MATCH-007','Construction','Civil','Construction','L','L','EMEA',28,18.3,0.122,0.52,0.22,0.15,0.11,3.5,2.5,2021,7],
  ['MATCH-008','Construction','Mechanical','Construction','L','M','NA',24,14.9,0.124,0.35,0.28,0.25,0.12,3.0,3.0,2020,8],
  ['MATCH-009','Procurement','Civil','Procurement','L','M','NA',20,13.5,0.113,0.15,0.55,0.20,0.10,2.0,5.0,2023,9],
  ['MATCH-010','Construction','Civil','Construction','S','S','NA',16,7.8,0.156,0.60,0.18,0.12,0.10,3.2,2.8,2022,10],
  ['POOL-011','Construction','Piping','Construction','L','M','NA',24,14.0,0.117,0.42,0.25,0.18,0.15,3.0,3.0,2023,11],
  ['POOL-012','Engineering','Civil','Engineering','L','M','NA',18,8.0,0.080,0.75,0.10,0.05,0.10,1.5,3.0,2022,12],
  ['POOL-013','Construction','Civil','Construction','XL','XL','APAC',36,45.0,0.150,0.50,0.25,0.15,0.10,3.0,3.0,2019,13],
  ['POOL-014','Construction','Electrical','Construction','M','S','NA',14,6.5,0.130,0.55,0.20,0.10,0.15,4.0,2.0,2022,14],
  ['POOL-015','Commissioning','Civil','Commissioning','L','S','NA',12,4.2,0.105,0.62,0.15,0.12,0.11,5.0,2.0,2024,15],
];

/**
 * Build pool account objects with pre-computed spend profiles and shape stats.
 */
function buildPoolAccounts() {
  return POOL_RAW.map(r => {
    const [id, phase, discipline, workType, projSizeCat, acctSizeCat, region,
      durationMonths, budgetM, acctPct, labor, mat, equip, sub,
      alpha, betaS, compYear, seed] = r;

    const totalSpend = budgetM * 0.97; // 3% underspend
    const spendProfile = generateSpendProfile(durationMonths, alpha, betaS, totalSpend, seed);

    // Planned same as actual for completed accounts (they ARE completed)
    const plannedProfile = generateSpendProfile(durationMonths, alpha, betaS, budgetM, seed + 1000);
    const plannedStats = computeShapeStats(plannedProfile, plannedProfile.length - 1);

    const completionDate = new Date(compYear, 5, 15);

    return {
      id, phase, discipline, workType, projSizeCat, acctSizeCat, region,
      durationMonths, budgetAmount: budgetM, acctPctProject: acctPct,
      laborMix: labor, materialMix: mat, equipMix: equip, subMix: sub,
      spendProfile, totalSpend, plannedProfile,
      plannedSkewness: plannedStats.skewness,
      plannedFrontLoad: plannedStats.frontLoadRatio,
      plannedGini:      plannedStats.gini,
      plannedPeakNorm:  plannedStats.peakPeriodNorm,
      plannedKurtosis:  plannedStats.kurtosis,
      completionDate,
    };
  });
}

const POOL = buildPoolAccounts();

/* ──────────────────────────────────────────────────────────────────
   FEATURE WEIGHTS & RANGES
   ────────────────────────────────────────────────────────────────── */
const FEATURE_WEIGHTS = {
  // Categorical
  phase_type:    2.0,
  discipline:    1.5,
  work_type:     1.5,
  proj_size_cat: 1.0,
  acct_size_cat: 1.0,
  region:        0.5,
  // Numeric static
  duration_months:    1.0,
  budget_amount:      1.0,
  budget_per_month:   1.0,
  acct_pct_project:   1.0,
  labor_mix:          1.5,
  material_mix:       1.5,
  equip_mix:          1.5,
  subcontract_mix:    1.5,
  // Hours element breakdown
  craft_labour:       1.0,
  supervision:        1.0,
  // Company cost element breakdown
  internal_cost:      1.0,
  // Observed curve shape (computed up to current lifecycle%)
  skewness:           2.0,
  front_load_ratio:   1.5,
  gini:               1.0,
  peak_period_norm:   1.0,
  kurtosis:           0.5,
  plan_vs_actual_skew:1.0,
  // Planned curve shape
  planned_skewness:   1.5,
  planned_front_load: 1.5,
  planned_gini:       1.0,
  planned_peak_norm:  1.0,
  planned_kurtosis:   0.5,
};

const TOTAL_WEIGHT = Object.values(FEATURE_WEIGHTS).reduce((a, b) => a + b, 0);

// Mutable copy used by algorithm (updated by Settings UI)
let ACTIVE_WEIGHTS = Object.assign({}, FEATURE_WEIGHTS);
function getTotalWeight() { return Object.values(ACTIVE_WEIGHTS).reduce((a, b) => a + b, 0); }

let ACTIVE_FORECAST_LINE = 'actual'; // 'actual' | 'incurred' | 'earned'

// SPI/CPI matching weight (user-adjustable, 0 = off — replaces the old on/off toggle)
let SPI_CPI_WEIGHT = 3.0;

/* ── CLASSIFICATION GROUPS (shared by settings modal + driver detail) ─ */
const CLASSIFICATION_GROUPS = [
  { source: 'Project groups', items: [
    { key: 'proj_program',         title: 'Program'                 },
    { key: 'proj_portfolio',       title: 'Portfolio'               },
    { key: 'proj_type',            title: 'Project type'            },
    { key: 'proj_phase',           title: 'Project phase'           },
    { key: 'proj_stage_gate',      title: 'Stage gate'              },
    { key: 'proj_delivery_method', title: 'Delivery method'         },
    { key: 'proj_contract_model',  title: 'Contract model'          },
    { key: 'proj_funding_type',    title: 'Funding type'            },
    { key: 'proj_client_sector',   title: 'Client sector'           },
    { key: 'proj_industry',        title: 'Industry segment'        },
    { key: 'proj_region',          title: 'Region'                  },
    { key: 'proj_country',         title: 'Country'                 },
    { key: 'proj_state',           title: 'State / province'        },
    { key: 'proj_city',            title: 'City'                    },
    { key: 'proj_site_type',       title: 'Site type'               },
    { key: 'proj_environment',     title: 'Greenfield / brownfield' },
    { key: 'proj_size_band',       title: 'Size band'               },
    { key: 'proj_duration_band',   title: 'Duration band'           },
    { key: 'proj_complexity',      title: 'Complexity rating'       },
    { key: 'proj_risk_class',      title: 'Risk class'              },
    { key: 'proj_priority',        title: 'Priority tier'           },
    { key: 'proj_currency',        title: 'Currency'                },
    { key: 'proj_business_unit',   title: 'Business unit'           },
    { key: 'proj_division',        title: 'Division'                },
    { key: 'proj_sponsor',         title: 'Sponsor org'             },
    { key: 'proj_execution_model', title: 'Execution model'         },
  ]},
  { source: 'Enterprise', items: [
    { key: 'ent_program',        title: 'Capital program'   },
    { key: 'ent_portfolio',      title: 'Portfolio'         },
    { key: 'ent_business_unit',  title: 'Business unit'     },
    { key: 'ent_region',         title: 'Region'            },
    { key: 'ent_country',        title: 'Country'           },
    { key: 'ent_funding_source', title: 'Funding source'    },
    { key: 'ent_asset_class',    title: 'Asset class'       },
    { key: 'ent_sponsor_org',    title: 'Sponsor org'       },
    { key: 'ent_fiscal_year',    title: 'Fiscal year'       },
  ]},
  { source: 'Standard', items: [
    { key: 'phase_type',         title: 'Phase type'        },
    { key: 'discipline',         title: 'Discipline'        },
    { key: 'work_type',          title: 'Work type'         },
    { key: 'std_cost_category',  title: 'Cost category'     },
    { key: 'std_commodity',      title: 'Commodity class'   },
    { key: 'std_contract_type',  title: 'Contract type'     },
    { key: 'std_account_status', title: 'Account status'    },
    { key: 'std_wbs_level',      title: 'WBS level'         },
    { key: 'std_milestone_type', title: 'Milestone type'    },
  ]},
  { source: 'Module', items: [
    { key: 'proj_size_cat',      title: 'Project size'         },
    { key: 'acct_size_cat',      title: 'Account size'         },
    { key: 'region',             title: 'Region'               },
    { key: 'mod_facility_type',  title: 'Facility type'        },
    { key: 'mod_plant_area',     title: 'Plant area'           },
    { key: 'mod_system',         title: 'System'               },
    { key: 'mod_subsystem',      title: 'Subsystem'            },
    { key: 'mod_equipment_class',title: 'Equipment class'      },
    { key: 'mod_material_group', title: 'Material group'       },
    { key: 'mod_vendor_category',title: 'Vendor category'      },
    { key: 'mod_procurement_pkg',title: 'Procurement package'  },
    { key: 'mod_construction_zone',title: 'Construction zone'  },
    { key: 'mod_work_package',   title: 'Work package'         },
    { key: 'mod_activity_type',  title: 'Schedule activity type'},
    { key: 'mod_resource_type',  title: 'Resource type'        },
    { key: 'mod_craft_type',     title: 'Craft type'           },
    { key: 'mod_shift_pattern',  title: 'Shift pattern'        },
    { key: 'mod_site_location',  title: 'Site location'        },
    { key: 'mod_building',       title: 'Building'             },
    { key: 'mod_level',          title: 'Floor / level'        },
    { key: 'mod_unit_operation', title: 'Unit operation'       },
    { key: 'mod_process_area',   title: 'Process area'         },
    { key: 'mod_discipline_lead',title: 'Discipline lead'      },
    { key: 'mod_deliverable',    title: 'Engineering deliverable'},
    { key: 'mod_permit_type',    title: 'Permit type'          },
    { key: 'mod_risk_category',  title: 'Risk category'        },
  ]},
];
// Flatten selected classification sub-groups into driver-detail features (with sub-headers)
function _clsFeatures(...sources) {
  const out = [];
  for (const src of sources) {
    const g = CLASSIFICATION_GROUPS.find(x => x.source === src);
    if (!g) continue;
    out.push({ header: src });
    g.items.forEach(it => out.push({ key: it.key, label: it.title }));
  }
  return out;
}
function _clsKeys(...sources) {
  return sources.flatMap(src => (CLASSIFICATION_GROUPS.find(x => x.source === src)?.items || []).map(it => it.key));
}

/* ── AI BANNER DRIVER GROUPS ─────────────────────────────────────── */
const DRIVER_GROUPS = [
  {
    id: 'classification', label: 'Classification groups', icon: 'pi-tags', color: '#1d4ed8', bg: '#dbeafe', textColor: '#1e3a8a',
    keys: _clsKeys('Project groups', 'Enterprise', 'Standard', 'Module'),
    features: _clsFeatures('Project groups', 'Enterprise', 'Standard', 'Module'),
  },
  {
    id: 'numerical', label: 'Numerical features', icon: 'pi-calculator', color: '#0891b2', bg: '#e0f2fe', textColor: '#0c4a6e',
    keys: ['duration_months','budget_amount','labor_mix','material_mix','equip_mix','subcontract_mix','craft_labour','supervision','internal_cost'],
    features: [
      { key:'duration_months', label:'Duration (months)' },
      { key:'budget_amount',   label:'Budget ($M)' },
      { header: 'Cost driven breakdown',    metric: 'cost' },
      { key:'labor_mix',       label:'Labor mix',       metric: 'cost' },
      { key:'material_mix',    label:'Material mix',    metric: 'cost' },
      { key:'equip_mix',       label:'Equipment mix',   metric: 'cost' },
      { key:'subcontract_mix', label:'Subcontract mix', metric: 'cost' },
      { header: 'Hours driven breakdown',   metric: 'hours' },
      { key:'craft_labour',    label:'Craft labour',    metric: 'hours' },
      { key:'supervision',     label:'Supervision',     metric: 'hours' },
      { header: 'Company driven breakdown', metric: 'company' },
      { key:'internal_cost',   label:'Internal cost',   metric: 'company' },
    ]
  },
  {
    id: 'spi', label: 'SPI / CPI integration (earned value)', icon: 'pi-chart-line', color: '#b45309', bg: '#fef3c7', textColor: '#78350f',
    keys: [],
    features: [
      // Single combined row — mirrors the one SPI/CPI weight controller in settings
      { key:'spi_cpi', label:'SPI / CPI integration', fixedWeight: true },
    ]
  },
  {
    id: 'shape', label: 'Curve shape statistics', icon: 'pi-chart-bar', color: '#7c3aed', bg: '#f5f3ff', textColor: '#5b21b6',
    keys: ['skewness','front_load_ratio','gini','peak_period_norm','kurtosis','planned_skewness','planned_front_load','planned_gini','planned_peak_norm','planned_kurtosis','plan_vs_actual_skew'],
    features: [
      { key:'skewness',            label:'Skewness' },
      { key:'front_load_ratio',    label:'Front-load ratio' },
      { key:'gini',                label:'Concentration (Gini)' },
      { key:'peak_period_norm',    label:'Peak period (normalized)' },
      { key:'kurtosis',            label:'Kurtosis' },
      { key:'plan_vs_actual_skew', label:'Plan vs. actual skew difference' },
      { key:'planned_skewness',    label:'Planned skewness' },
      { key:'planned_front_load',  label:'Planned front-load ratio' },
      { key:'planned_gini',        label:'Planned concentration' },
      { key:'planned_peak_norm',   label:'Planned peak period' },
      { key:'planned_kurtosis',    label:'Planned kurtosis' },
    ]
  },
];

function _obsStats() {
  return computeShapeStats(FOCAL.actualSpend, FOCAL.actualSpend.length - 1);
}

// Curve shape data points shown in the UI — single source shared by the
// "Driven by" detail card and the settings modal so the two always match.
// Clamped non-negative: values cannot be negative anywhere they're displayed.
function _shapeDisplayVals() {
  const s  = _obsStats();
  const nn = (x) => Math.max(0, x);
  return {
    skewness:            nn(s.skewness).toFixed(3),
    front_load_ratio:    nn(s.frontLoadRatio).toFixed(3),
    gini:                nn(s.gini).toFixed(3),
    peak_period_norm:    nn(s.peakPeriodNorm).toFixed(3),
    kurtosis:            nn(s.kurtosis).toFixed(3),
    plan_vs_actual_skew: nn(focalPlannedStats.skewness - s.skewness).toFixed(3),
    planned_skewness:    nn(focalPlannedStats.skewness).toFixed(3),
    planned_front_load:  nn(focalPlannedStats.frontLoadRatio).toFixed(3),
    planned_gini:        nn(focalPlannedStats.gini).toFixed(3),
    planned_peak_norm:   nn(focalPlannedStats.peakPeriodNorm).toFixed(3),
    planned_kurtosis:    nn(focalPlannedStats.kurtosis).toFixed(3),
  };
}


function _buildDriverPill(group, pct) {
  return `<span class="sc-driver-pill sc-driver-pill--themed"
    style="background:${group.bg};color:${group.textColor};border-color:${group.bg}">
    <i class="pi ${group.icon}"></i> ${group.label}: ${pct}%
  </span>`;
}

// Integer % per driver group, normalized from allocated points so they sum to exactly 100
// (largest-remainder rounding). Returns one value per DRIVER_GROUPS entry.
function _groupPctsSum100() {
  // Element breakdowns are metric-specific — only the selected Data type's rows count
  const metricOk = (f) => !f.metric || f.metric === CHART_METRIC;
  const pts = DRIVER_GROUPS.map(g => g.id === 'spi'
    ? SPI_CPI_WEIGHT
    : g.features.filter(f => !f.header && metricOk(f)).reduce((a, f) => a + (ACTIVE_WEIGHTS[f.key] || 0), 0));
  const total = pts.reduce((a, b) => a + b, 0);
  if (total <= 0) return pts.map(() => 0);
  const raw    = pts.map(p => p / total * 100);
  const floors = raw.map(Math.floor);
  let rem = 100 - floors.reduce((a, b) => a + b, 0);
  const byFraction = raw.map((r, i) => [r - floors[i], i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of byFraction) {
    if (rem <= 0) break;
    if (pts[i] > 0) { floors[i]++; rem--; }
  }
  return floors;
}

function buildAiBannerDetail() {
  // Separate card per driver group; each card uses the Feature / Weight / Contribution / Relative design.
  // Weight mirrors the settings sliders exactly (unset features default to 1.0, same as the modal).
  const groupPcts = _groupPctsSum100();
  const eff = (f) => f.fixedWeight != null ? SPI_CPI_WEIGHT : (ACTIVE_WEIGHTS[f.key] != null ? ACTIVE_WEIGHTS[f.key] : 1);
  // Element breakdowns are metric-specific — only show the one matching the selected Data type
  const metricOk = (f) => !f.metric || f.metric === CHART_METRIC;
  const denom = DRIVER_GROUPS.flatMap(g => g.features).filter(f => !f.header && metricOk(f)).reduce((a, f) => a + eff(f), 0);
  const contribOf = (w) => denom > 0 ? (w / denom * 100).toFixed(1) + '%' : '0.0%';

  const cards = DRIVER_GROUPS.map((group, gi) => {
    const pct = groupPcts[gi];
    const rows = group.features.filter(metricOk).map(f => {
      if (f.header) return `<div class="sc-ai-df-subhead">${f.header}</div>`;
      const w = eff(f);
      const barPct = Math.round(w / 5 * 100);
      const zero = w === 0;
      return `<div class="sc-ai-df-row${zero ? ' is-zero' : ''}">
        <span class="sc-ai-df-label" title="${f.label}">${f.label}</span>
        <span class="sc-ai-df-wt">${w.toFixed(1)}</span>
        <span class="sc-ai-df-contrib">${contribOf(w)}</span>
        <div class="sc-ai-df-bar-wrap"><div class="sc-ai-df-bar" style="width:${barPct}%;background:${zero ? '#e5e7eb' : group.color}"></div></div>
      </div>`;
    }).join('');

    return `<div class="sc-ai-detail-group">
      <div class="sc-ai-dg-header">${_buildDriverPill(group, pct)}</div>
      <div class="sc-ai-dg-colhead"><span>Feature</span><span>Wt</span><span>Contrib</span><span>Rel</span></div>
      <div class="sc-ai-dg-features">${rows}</div>
    </div>`;
  }).join('');

  return `<div class="sc-ai-detail-grid">${cards}</div>
    <div class="sc-ai-detail-foot">
      <i class="pi pi-info-circle"></i>
      Weight and contribution mirror the values set in AI forecast settings. Bar length = weight relative to maximum (5.0).
      <button type="button" class="sc-ai-detail-foot-link" onclick="openDriverSettings()">
        <i class="pi pi-cog"></i> Settings
      </button>
    </div>`;
}

window.openDriverSettings = function() {
  const wrap = document.getElementById('scSections');
  const view = wrap ? wrap.dataset.view : 'accordion';
  if (view === 'tabs') {
    // In tab view, open the settings modal instead of switching tabs
    openSettingsModal();
    return;
  }
  // Accordion view: expand the Settings section if collapsed, then scroll
  const section = document.getElementById('acc-drivers');
  if (!section) return;
  const header = section.querySelector('.sc-acc-header');
  const isOpen = header && header.getAttribute('aria-expanded') === 'true';
  if (!isOpen) toggleAcc('acc-drivers');
  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.toggleAiDriverDetail = function(e) {
  if (e && e.stopPropagation) e.stopPropagation();
  const panel = document.getElementById('scAiBannerDetail');
  const btn   = document.getElementById('scAiDetailToggle');
  if (!panel) return;
  const isOpen = panel.style.display !== 'none';
  if (!isOpen) {
    panel.innerHTML = buildAiBannerDetail();
    panel.dataset.built = '1';
  }
  panel.style.display = isOpen ? 'none' : 'block';
  if (btn) {
    btn.setAttribute('aria-expanded', String(!isOpen));
    btn.innerHTML = isOpen
      ? '<i class="pi pi-chevron-down"></i> Show detailed view'
      : '<i class="pi pi-chevron-up"></i> Hide detailed view';
  }
};

window.setForecastLine = function(line) {
  ACTIVE_FORECAST_LINE = line;
  document.querySelectorAll('.sc-forecast-btn').forEach(b => {
    b.classList.toggle('sc-forecast-btn--active', b.dataset.line === line);
  });
};

/** Compute numeric ranges across all pool accounts for normalisation */
function computeNumericRanges() {
  const fields = [
    'duration_months','budget_amount','budget_per_month','acct_pct_project',
    'labor_mix','material_mix','equip_mix','subcontract_mix',
  ];

  const ranges = {};
  for (const f of fields) {
    const vals = POOL.map(p => poolFieldVal(p, f));
    ranges[f] = Math.max(...vals) - Math.min(...vals) || 1;
  }
  return ranges;
}

function poolFieldVal(p, f) {
  switch (f) {
    case 'duration_months':   return p.durationMonths;
    case 'budget_amount':     return p.budgetAmount;
    case 'budget_per_month':  return p.budgetAmount / p.durationMonths;
    case 'acct_pct_project':  return p.acctPctProject;
    case 'labor_mix':         return p.laborMix;
    case 'material_mix':      return p.materialMix;
    case 'equip_mix':         return p.equipMix;
    case 'subcontract_mix':   return p.subMix;
    default: return 0;
  }
}

function focalFieldVal(f) {
  switch (f) {
    case 'duration_months':   return FOCAL.durationMonths;
    case 'budget_amount':     return FOCAL.budgetAmount;
    case 'budget_per_month':  return FOCAL.budgetAmount / FOCAL.durationMonths;
    case 'acct_pct_project':  return FOCAL.acctPctProject;
    case 'labor_mix':         return FOCAL.laborMix;
    case 'material_mix':      return FOCAL.materialMix;
    case 'equip_mix':         return FOCAL.equipMix;
    case 'subcontract_mix':   return FOCAL.subMix;
    default: return 0;
  }
}

const NUMERIC_RANGES = computeNumericRanges();

/* ──────────────────────────────────────────────────────────────────
   GOWER DISTANCE
   ────────────────────────────────────────────────────────────────── */
/**
 * Compute Gower distance between focal and a pool account at a given
 * lifecycle position (0-100%).
 */
function gowerDistance(pool, lifecyclePct, focalObsStats) {
  let weightedDist = 0;

  // -- Categorical features --
  function catDist(a, b, w) {
    weightedDist += w * (a === b ? 0 : 1);
  }
  catDist(FOCAL.phase,       pool.phase,        ACTIVE_WEIGHTS.phase_type);
  catDist(FOCAL.discipline,  pool.discipline,   ACTIVE_WEIGHTS.discipline);
  catDist(FOCAL.workType,    pool.workType,      ACTIVE_WEIGHTS.work_type);
  catDist(FOCAL.projSizeCat, pool.projSizeCat,  ACTIVE_WEIGHTS.proj_size_cat);
  catDist(FOCAL.acctSizeCat, pool.acctSizeCat,  ACTIVE_WEIGHTS.acct_size_cat);
  catDist(FOCAL.region,      pool.region,        ACTIVE_WEIGHTS.region);

  // -- Numeric static features --
  function numDist(fVal, pVal, range, w) {
    const d = Math.abs(fVal - pVal) / range;
    weightedDist += w * Math.min(d, 1);
  }
  const numFields = ['duration_months','budget_amount','budget_per_month','acct_pct_project',
                     'labor_mix','material_mix','equip_mix','subcontract_mix'];
  for (const f of numFields) {
    numDist(focalFieldVal(f), poolFieldVal(pool, f), NUMERIC_RANGES[f], ACTIVE_WEIGHTS[f]);
  }

  // -- Observed curve shape (only available if lifecyclePct > 0) --
  if (lifecyclePct > 0) {
    // Pool's equivalent lifecycle position in its own timeline
    const poolObsIdx = Math.max(0, Math.round((lifecyclePct / 100) * pool.durationMonths) - 1);
    const poolObs = computeShapeStats(pool.spendProfile, poolObsIdx);

    // Ranges for shape stats computed across all pool accounts at this lifecycle
    const poolShapeStats = POOL.map(p => {
      const idx = Math.max(0, Math.round((lifecyclePct / 100) * p.durationMonths) - 1);
      return computeShapeStats(p.spendProfile, idx);
    });

    function shapeRange(key) {
      const vals = poolShapeStats.map(s => s[key]);
      return Math.max(...vals) - Math.min(...vals) || 1;
    }

    function shapeNumDist(fVal, pVal, key, w) {
      const d = Math.abs(fVal - pVal) / shapeRange(key);
      weightedDist += w * Math.min(d, 1);
    }

    shapeNumDist(focalObsStats.skewness,       poolObs.skewness,       'skewness',       ACTIVE_WEIGHTS.skewness);
    shapeNumDist(focalObsStats.frontLoadRatio,  poolObs.frontLoadRatio, 'frontLoadRatio', ACTIVE_WEIGHTS.front_load_ratio);
    shapeNumDist(focalObsStats.gini,            poolObs.gini,           'gini',           ACTIVE_WEIGHTS.gini);
    shapeNumDist(focalObsStats.peakPeriodNorm,  poolObs.peakPeriodNorm, 'peakPeriodNorm', ACTIVE_WEIGHTS.peak_period_norm);
    shapeNumDist(focalObsStats.kurtosis,        poolObs.kurtosis,       'kurtosis',       ACTIVE_WEIGHTS.kurtosis);

    // plan_vs_actual_skew
    const focalPlanSkewFull = focalPlannedStats.skewness;
    const focalActSkew      = focalObsStats.skewness;
    const focalSkewDiff     = focalActSkew - focalPlanSkewFull;

    const poolPlanSkew = computeShapeStats(pool.plannedProfile, pool.plannedProfile.length - 1).skewness;
    const poolActSkew  = poolObs.skewness;
    const poolSkewDiff = poolActSkew - poolPlanSkew;

    const skewDiffVals = POOL.map(p => {
      const idxP = Math.max(0, Math.round((lifecyclePct / 100) * p.durationMonths) - 1);
      const pActS = computeShapeStats(p.spendProfile, idxP).skewness;
      const pPlanS = computeShapeStats(p.plannedProfile, p.plannedProfile.length - 1).skewness;
      return pActS - pPlanS;
    });
    const skewDiffRange = Math.max(...skewDiffVals) - Math.min(...skewDiffVals) || 1;
    weightedDist += ACTIVE_WEIGHTS.plan_vs_actual_skew * Math.min(Math.abs(focalSkewDiff - poolSkewDiff) / skewDiffRange, 1);
  } else {
    // Lifecycle = 0, observed shape features are zero (no observed data)
    weightedDist += ACTIVE_WEIGHTS.skewness + ACTIVE_WEIGHTS.front_load_ratio +
                    ACTIVE_WEIGHTS.gini + ACTIVE_WEIGHTS.peak_period_norm +
                    ACTIVE_WEIGHTS.kurtosis + ACTIVE_WEIGHTS.plan_vs_actual_skew;
  }

  // -- Planned curve shape --
  const poolPlannedStats = computeShapeStats(pool.plannedProfile, pool.plannedProfile.length - 1);

  function plannedShapeRange(key) {
    const vals = POOL.map(p => computeShapeStats(p.plannedProfile, p.plannedProfile.length - 1)[key]);
    return Math.max(...vals) - Math.min(...vals) || 1;
  }

  function plannedNumDist(fVal, pVal, key, w) {
    const d = Math.abs(fVal - pVal) / plannedShapeRange(key);
    weightedDist += w * Math.min(d, 1);
  }

  plannedNumDist(focalPlannedStats.skewness,       poolPlannedStats.skewness,       'skewness',       ACTIVE_WEIGHTS.planned_skewness);
  plannedNumDist(focalPlannedStats.frontLoadRatio,  poolPlannedStats.frontLoadRatio, 'frontLoadRatio', ACTIVE_WEIGHTS.planned_front_load);
  plannedNumDist(focalPlannedStats.gini,            poolPlannedStats.gini,           'gini',           ACTIVE_WEIGHTS.planned_gini);
  plannedNumDist(focalPlannedStats.peakPeriodNorm,  poolPlannedStats.peakPeriodNorm, 'peakPeriodNorm', ACTIVE_WEIGHTS.planned_peak_norm);
  plannedNumDist(focalPlannedStats.kurtosis,        poolPlannedStats.kurtosis,       'kurtosis',       ACTIVE_WEIGHTS.planned_kurtosis);

  const distance = weightedDist / getTotalWeight();
  return distance;
}

/* ──────────────────────────────────────────────────────────────────
   RECENCY ADJUSTMENT
   adjusted_sim = base_sim × 0.5^(years_ago / 5)
   ────────────────────────────────────────────────────────────────── */
const TODAY = new Date(2026, 4, 29); // 2026-05-29

function recencyAdjustedSimilarity(baseSim, completionDate) {
  const yearsAgo = (TODAY - completionDate) / (365.25 * 24 * 3600 * 1000);
  return baseSim * Math.pow(0.5, yearsAgo / 5);
}

/* ──────────────────────────────────────────────────────────────────
   MATCHING ENGINE
   Returns top-10 neighbors sorted by adjusted similarity desc.
   ────────────────────────────────────────────────────────────────── */
const MIN_SIMILARITY = 0.30;
const TOP_K = 10;

function matchNeighbors(lifecyclePct) {
  // Compute focal's observed stats up to current lifecycle position
  const currentMonth = Math.round((lifecyclePct / 100) * FOCAL.durationMonths);
  let focalObsStats;
  if (lifecyclePct === 0 || currentMonth === 0) {
    focalObsStats = { skewness: 0, kurtosis: 0, frontLoadRatio: 0, gini: 0, peakPeriodNorm: 0 };
  } else {
    const knownMonths = Math.min(currentMonth, FOCAL.actualSpend.length);
    focalObsStats = computeShapeStats(FOCAL.actualSpend, knownMonths - 1);
  }

  const scored = POOL.map(pool => {
    const dist = gowerDistance(pool, lifecyclePct, focalObsStats);
    const baseSim = 1 - dist;
    const adjSim  = recencyAdjustedSimilarity(baseSim, pool.completionDate);
    return { pool, baseSim, adjSim };
  });

  // Filter by minimum similarity threshold, sort desc
  const filtered = scored.filter(s => s.adjSim >= MIN_SIMILARITY);
  filtered.sort((a, b) => b.adjSim - a.adjSim);

  return filtered.slice(0, TOP_K);
}

/* ──────────────────────────────────────────────────────────────────
   FORECAST COMPUTATION
   Returns { grid (101 points), p10, p50, p90 } all in $M cumulative
   ────────────────────────────────────────────────────────────────── */

/** Cumulative sum array */
function cumsum(arr) {
  const out = [];
  let s = 0;
  for (const v of arr) { s += v; out.push(s); }
  return out;
}

/** Linear interpolation of cumulative fraction at grid x in [0,1] */
function interpCumFrac(normX, normCum) {
  // normX: 101 points from 0 to 1
  // normCum: cumulative fractions at each of the account's period midpoints
  const n = normCum.length;
  return normX.map(x => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // period positions as fractions (0..1) using midpoints
    const pos = normCum.map((_, i) => (i + 0.5) / n);
    // find bracket
    let lo = 0, hi = n - 1;
    while (lo < hi - 1) {
      const mid = (lo + hi) >> 1;
      if (pos[mid] <= x) lo = mid; else hi = mid;
    }
    const t = (x - pos[lo]) / (pos[hi] - pos[lo] || 1);
    return normCum[lo] + t * (normCum[hi] - normCum[lo]);
  });
}

const GRID_N = 101;
const GRID = Array.from({ length: GRID_N }, (_, i) => i / (GRID_N - 1)); // 0 to 1

function computeForecast(neighbors, lifecyclePct) {
  if (!neighbors.length) return null;

  const currentPos = lifecyclePct / 100;

  // For each neighbor, build normalised cumulative curve on GRID
  const neighborCurves = neighbors.map(({ pool, adjSim }) => {
    const total = pool.totalSpend;
    if (total === 0) return null;
    const cum = cumsum(pool.spendProfile);
    const normCum = cum.map(v => v / total); // 0..1
    const gridCum = interpCumFrac(GRID, normCum); // 101 points
    return { gridCum, weight: adjSim };
  }).filter(Boolean);

  if (!neighborCurves.length) return null;

  // Compute weighted P10, P50, P90 at each grid point
  const p10 = new Array(GRID_N);
  const p50 = new Array(GRID_N);
  const p90 = new Array(GRID_N);

  for (let g = 0; g < GRID_N; g++) {
    const vals    = neighborCurves.map(c => c.gridCum[g]);
    const weights = neighborCurves.map(c => c.weight);
    p10[g] = weightedPercentile(vals, weights, 10);
    p50[g] = weightedPercentile(vals, weights, 50);
    p90[g] = weightedPercentile(vals, weights, 90);
  }

  // Widen confidence bands for lifecycle < 33%
  const widened = lifecyclePct < 33;
  const loPerc = widened ? 5 : 10;
  const hiPerc = widened ? 95 : 90;
  const pLo = widened ? new Array(GRID_N) : p10;
  const pHi = widened ? new Array(GRID_N) : p90;
  if (widened) {
    for (let g = 0; g < GRID_N; g++) {
      const vals    = neighborCurves.map(c => c.gridCum[g]);
      const weights = neighborCurves.map(c => c.weight);
      pLo[g] = weightedPercentile(vals, weights, loPerc);
      pHi[g] = weightedPercentile(vals, weights, hiPerc);
    }
  }

  // Re-anchor to dollars
  const bac = FOCAL.budgetAmount;
  const actd = FOCAL.actualSpend.slice(0, Math.round(currentPos * FOCAL.durationMonths))
                 .reduce((a, b) => a + b, 0);

  // Find the cumulative fraction at currentPos
  function fracAtPos(curve) {
    const gIdx = Math.round(currentPos * (GRID_N - 1));
    return curve[gIdx];
  }

  function anchorCurve(cumFracArr) {
    const fp = fracAtPos(cumFracArr);
    return GRID.map((x, i) => {
      if (x <= currentPos) {
        // Map actual spend: scale actual proportion
        if (fp === 0) return actd * (x / (currentPos || 0.001));
        return actd * (cumFracArr[i] / fp);
      } else {
        // forecast
        const numerator = cumFracArr[i] - fp;
        const denominator = 1 - fp;
        if (denominator === 0) return actd;
        return actd + (bac - actd) * (numerator / denominator);
      }
    });
  }

  const dollarP50 = anchorCurve(p50);
  const dollarLo  = anchorCurve(pLo);
  const dollarHi  = anchorCurve(pHi);

  // EAC values at 100% (last grid point) for forecast line modifier
  let eacP50 = dollarP50[GRID_N - 1];
  let eacP10 = dollarLo[GRID_N - 1];
  let eacP90 = dollarHi[GRID_N - 1];

  if (ACTIVE_FORECAST_LINE === 'incurred') {
    eacP10 *= 1.04; eacP50 *= 1.04; eacP90 *= 1.04;
  } else if (ACTIVE_FORECAST_LINE === 'earned') {
    const bac2 = FOCAL.budgetAmount;
    eacP10 = bac2; eacP50 = bac2; eacP90 = bac2;
  }

  return { grid: GRID, p50: dollarP50, pLo: dollarLo, pHi: dollarHi, actd, bac, currentPos, eacP50, eacP10, eacP90 };
}

/* ──────────────────────────────────────────────────────────────────
   FORECAST EXPLANATION
   ────────────────────────────────────────────────────────────────── */
function buildForecastExplanation(neighbors, lifecyclePct) {
  const n = neighbors.length;
  if (n === 0) {
    return {
      confidence: 'LOW',
      text: 'No sufficiently similar historical accounts found in the internal database. Forecast is unreliable — consider using a predefined curve profile (middle, front-loaded, or back-loaded).'
    };
  }
  const sims = neighbors.map(x => x.adjSim);
  const medSim = sims.slice().sort((a,b)=>a-b)[Math.floor(sims.length/2)];
  const topIds = neighbors.slice(0, 3).map(x => x.pool.id).join(', ');

  let confidence, confNote;
  if (lifecyclePct < 20) {
    confidence = 'LOW'; confNote = 'Early lifecycle — limited observed spend data to match against.';
  } else if (lifecyclePct < 40 || medSim < 0.55) {
    confidence = 'MEDIUM'; confNote = lifecyclePct < 40 ? 'Moderate lifecycle position.' : 'Match quality below optimal threshold.';
  } else {
    confidence = 'HIGH'; confNote = 'Strong lifecycle position and match quality.';
  }

  const lineNote = ACTIVE_FORECAST_LINE === 'incurred'
    ? ' Incurred line includes estimated accruals (+4%).'
    : ACTIVE_FORECAST_LINE === 'earned'
    ? ' Earned value line is bounded by approved budget (BAC = $15.0M).'
    : '';

  const text = `Forecast based on ${n} historical control account${n>1?'s':''} from the internal project database (private data only). `
    + `Top matches: ${topIds}. Median similarity: ${(medSim*100).toFixed(0)}%. `
    + confNote + lineNote
    + ` P10–P90 confidence band ${lifecyclePct < 33 ? 'widened to P5–P95' : 'at standard P10–P90'} due to lifecycle position.`;

  return { confidence, text };
}

function updateExplanationPanel(neighbors, lifecyclePct) {
  const exp = buildForecastExplanation(neighbors, lifecyclePct);
  const badge = document.getElementById('confidenceBadge');
  const textEl = document.getElementById('explanationText');
  if (!badge || !textEl) return;
  badge.textContent = exp.confidence;
  badge.className = 'sc-confidence-badge sc-confidence-badge--' + exp.confidence.toLowerCase();
  textEl.textContent = exp.text;
}

/* ──────────────────────────────────────────────────────────────────
   SCHEDULE WARNING
   ────────────────────────────────────────────────────────────────── */
function checkScheduleWarning(lifecyclePct, forecast) {
  const banner = document.getElementById('scheduleWarning');
  const textEl = document.getElementById('scheduleWarningText');
  if (!banner || !textEl) return;

  // Simulate: if lifecycle > 80% and remaining > 40% of BAC → anomaly
  const remainingPct = forecast ? ((forecast.eacP50 - ACTD_COMPUTED) / FOCAL.budgetAmount) : 0;
  if (lifecyclePct >= 80 && remainingPct > 0.4) {
    textEl.textContent = `Schedule anomaly detected: ${lifecyclePct}% lifecycle elapsed but ${(remainingPct*100).toFixed(0)}% of budget remains. Verify that forecasted completion dates are current — schedule data may need review.`;
    banner.style.display = 'flex';
  } else {
    banner.style.display = 'none';
  }
}

/* ──────────────────────────────────────────────────────────────────
   AI SETTINGS TAB
   ────────────────────────────────────────────────────────────────── */
const SETTINGS_FEATURE_DEFS = [
  // Categorical
  { key: 'phase_type',    label: 'Phase type',       group: 'cat', desc: 'Construction, Engineering, Procurement…' },
  { key: 'discipline',    label: 'Discipline',        group: 'cat', desc: 'Civil, Mechanical, Electrical…' },
  { key: 'work_type',     label: 'Work type',         group: 'cat', desc: 'Construction, Procurement, Commissioning…' },
  { key: 'proj_size_cat', label: 'Project size',      group: 'cat', desc: 'XS / S / M / L / XL bucket' },
  { key: 'acct_size_cat', label: 'Account size',      group: 'cat', desc: 'Size of this control account' },
  { key: 'region',        label: 'Region',            group: 'cat', desc: 'NA / EMEA / APAC / LATAM' },
  // Numeric
  { key: 'duration_months',  label: 'Duration (months)',     group: 'num', desc: 'Planned account duration' },
  { key: 'budget_amount',    label: 'Budget ($M)',           group: 'num', desc: 'Total approved budget' },
  { key: 'labor_mix',        label: 'Labor mix',             group: 'num', desc: 'Proportion of cost that is labor' },
  { key: 'material_mix',     label: 'Material mix',          group: 'num', desc: 'Proportion that is materials' },
  { key: 'equip_mix',        label: 'Equipment mix',         group: 'num', desc: 'Proportion that is equipment' },
  { key: 'subcontract_mix',  label: 'Subcontract mix',       group: 'num', desc: 'Proportion subcontracted' },
  // Curve shape
  { key: 'skewness',         label: 'Observed skewness',     group: 'shape', desc: 'Shape of actual spend curve so far' },
  { key: 'front_load_ratio', label: 'Front-load ratio',      group: 'shape', desc: 'How front-loaded the spend is' },
  { key: 'planned_skewness', label: 'Planned skewness',      group: 'plan',  desc: 'Shape of the planned/baseline curve' },
  { key: 'planned_front_load', label: 'Planned front-load',  group: 'plan',  desc: 'Front-load ratio of planned curve' },
];

function initSettingsTab() {
  const container = document.getElementById('settings-features-container');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';

  const groups = [
    { id: 'cat',   title: 'Categorical features', icon: 'pi-tags',      desc: 'Classification features used to find similar accounts. These are client-specific — adjust based on your project grouping codes.' },
    { id: 'num',   title: 'Numerical features',   icon: 'pi-calculator', desc: 'Quantitative account attributes. Disable cost-element mix if your client uses a single combined cost element.' },
    { id: 'shape', title: 'Observed curve shape', icon: 'pi-chart-line', desc: 'Statistical features computed from actual spend to date.' },
    { id: 'plan',  title: 'Planned curve shape',  icon: 'pi-map',       desc: 'Statistical features computed from the baseline plan curve.' },
  ];

  let html = '';
  for (const g of groups) {
    const feats = SETTINGS_FEATURE_DEFS.filter(f => f.group === g.id);
    html += `
      <div class="sc-settings-section">
        <div class="sc-settings-section-header">
          <i class="pi ${g.icon}"></i> ${g.title}
          <span class="sc-settings-section-desc">${g.desc}</span>
        </div>
        <div class="sc-settings-features">
          ${feats.map(f => `
            <div class="sc-settings-feature-row">
              <div class="sc-settings-feat-info">
                <span class="sc-settings-feat-label">${f.label}</span>
                <span class="sc-settings-feat-desc">${f.desc}</span>
              </div>
              <div class="sc-settings-weight-control">
                <span class="sc-settings-weight-val" id="wval-${f.key}">${ACTIVE_WEIGHTS[f.key] != null ? ACTIVE_WEIGHTS[f.key].toFixed(1) : '—'}</span>
                <input type="range" class="sc-weight-slider" id="wslider-${f.key}"
                  min="0" max="5" step="0.5"
                  value="${ACTIVE_WEIGHTS[f.key] != null ? ACTIVE_WEIGHTS[f.key] : 1}"
                  oninput="updateSettingsWeight('${f.key}', parseFloat(this.value))" />
              </div>
            </div>
          `).join('')}
        </div>
      </div>`;
  }
  container.innerHTML = html;
}

// "Detected: N control elements active" — counts cost-element keys with a non-zero weight
const COST_ELEMENT_KEYS = ['labor_mix', 'material_mix', 'equip_mix', 'subcontract_mix', 'craft_labour', 'supervision', 'internal_cost'];
function _controlElementsLabel() {
  const n = COST_ELEMENT_KEYS.filter(k => (ACTIVE_WEIGHTS[k] || 0) > 0).length;
  return `Detected: ${n} of ${COST_ELEMENT_KEYS.length} control elements active.`;
}
function _refreshControlElementCount() {
  const el = document.getElementById('cost-elements-count');
  if (el) el.textContent = _controlElementsLabel();
}

// Re-sum the "x.x pts" badges on every settings accordion header
function _refreshSettingsGroupPoints() {
  document.querySelectorAll('[data-pts-keys]').forEach(el => {
    // Missing keys default to 1 — same default the sliders render with
    const sum = el.dataset.ptsKeys.split(',').reduce((a, k) => a + (ACTIVE_WEIGHTS[k] != null ? ACTIVE_WEIGHTS[k] : 1), 0);
    el.textContent = sum.toFixed(1) + ' pts';
  });
  _refreshSettingsSectionPcts();
  _refreshControlElementCount();
}

// Recalculate the per-section contribution % badges in the settings modal
// (same source as the "Driven by" pills — DRIVER_GROUPS order: classification, numerical, spi, shape)
function _refreshSettingsSectionPcts() {
  const pcts = _groupPctsSum100();
  document.querySelectorAll('.sc-settings-section-pct').forEach((el, i) => {
    if (pcts[i] != null) el.textContent = pcts[i] + '%';
  });
  // Keep the "Driven by" pills in sync with the same numbers
  _renderSummaryPills();
}

// Format a weight for display: one decimal normally, two when needed (e.g. 2.25)
function _fmtWeight(v) {
  const r = Math.round(v * 100) / 100;
  return (r * 10) % 1 ? r.toFixed(2) : r.toFixed(1);
}

window.updateSettingsWeight = function(key, value) {
  ACTIVE_WEIGHTS[key] = value;
  const valEl = document.getElementById('wval-' + key);
  if (valEl) valEl.value = _fmtWeight(value);
  const slider = document.getElementById('wslider-' + key);
  if (slider) slider.style.setProperty('--fill-pct', (value / 5 * 100).toFixed(0) + '%');
  const row = document.getElementById('row-' + key);
  if (row) row.style.opacity = value === 0 ? '0.45' : '';
  _refreshSettingsGroupPoints();
};

// Typed weight entry — clamp to 0–5, sync slider, then run the normal update path
window.weightValInput = function(key, raw) {
  let v = parseFloat(raw);
  if (isNaN(v)) v = ACTIVE_WEIGHTS[key] != null ? ACTIVE_WEIGHTS[key] : 1;
  v = Math.min(5, Math.max(0, Math.round(v * 100) / 100));
  const slider = document.getElementById('wslider-' + key);
  if (slider) slider.value = v;
  updateSettingsWeight(key, v);
};

// Arrow steppers on the weight input — ±0.1 per press, clamped to 0–5
window.stepWeight = function(key, delta) {
  const input = document.getElementById('wval-' + key);
  if (input && input.disabled) return;
  const cur = ACTIVE_WEIGHTS[key] != null ? ACTIVE_WEIGHTS[key] : 1;
  const v = Math.min(5, Math.max(0, Math.round((cur + delta) * 100) / 100));
  const slider = document.getElementById('wslider-' + key);
  if (slider) slider.value = v;
  updateSettingsWeight(key, v);
};

window.resetSettingsWeights = function() {
  // Reset AI forecast state and restore original SIM-based chart
  if (AI_FORECAST_ACTIVE) {
    AI_FORECAST_ACTIVE = false;
    window.updateChartTime(TODAY_IDX);
  }
  ACTIVE_WEIGHTS = Object.assign({}, FEATURE_WEIGHTS);
  for (const f of SETTINGS_FEATURE_DEFS) {
    const v = ACTIVE_WEIGHTS[f.key];
    if (v == null) continue;
    const slider = document.getElementById('wslider-' + f.key);
    const valEl  = document.getElementById('wval-'    + f.key);
    const row    = document.getElementById('row-'     + f.key);
    if (slider) { slider.value = v; slider.disabled = false; slider.style.setProperty('--fill-pct', (v / 5 * 100).toFixed(0) + '%'); }
    if (valEl)  { valEl.value = v.toFixed(1); valEl.disabled = false; }
    if (row)    row.style.opacity = '';
  }
  // Re-sync applied summary if visible
  const txt = document.getElementById('num-applied-text');
  if (txt) txt.textContent = '6 of 6 numerical features applied';
  const summary = document.getElementById('num-applied-summary');
  if (summary) { summary.style.background = '#f0fdf4'; summary.style.color = '#166534'; summary.querySelector('i').className = 'pi pi-check-circle'; }
  const cbx = document.getElementById('toggleCostBreakdown');
  if (cbx) cbx.checked = true;
  // Re-sync the SPI/CPI weight control
  SPI_CPI_WEIGHT = 3.0;
  const spiVal    = document.getElementById('wval-spi_cpi');
  const spiSlider = document.getElementById('wslider-spi_cpi');
  if (spiVal)    { spiVal.value = _fmtWeight(SPI_CPI_WEIGHT); spiVal.disabled = false; }
  if (spiSlider) { spiSlider.value = SPI_CPI_WEIGHT; spiSlider.disabled = false; spiSlider.style.setProperty('--fill-pct', '60%'); }
  _refreshSettingsGroupPoints();
};

// SPI/CPI matching weight — replaces the old on/off toggle. 0 = excluded.
window.setSpiCpiWeight = function(v) {
  v = Math.min(5, Math.max(0, Math.round((isNaN(v) ? 0 : v) * 100) / 100));
  SPI_CPI_WEIGHT = v;
  const valEl  = document.getElementById('wval-spi_cpi');
  const slider = document.getElementById('wslider-spi_cpi');
  if (valEl)  valEl.value = _fmtWeight(v);
  if (slider) { slider.value = v; slider.style.setProperty('--fill-pct', (v / 5 * 100).toFixed(0) + '%'); }
  _refreshSettingsSectionPcts();
};

window.spiCpiWeightInput = function(raw) {
  let v = parseFloat(raw);
  if (isNaN(v)) v = SPI_CPI_WEIGHT;
  setSpiCpiWeight(v);
};

window.stepSpiCpi = function(delta) {
  const input = document.getElementById('wval-spi_cpi');
  if (input && input.disabled) return;
  setSpiCpiWeight(SPI_CPI_WEIGHT + delta);
};

window.toggleCatGroup = function(gi) {
  const body    = document.getElementById('catgrp-' + gi);
  const chevron = document.getElementById('catgrp-chevron-' + gi);
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  if (chevron) chevron.style.transform = collapsed ? '' : 'rotate(-90deg)';
};

window.toggleNumGroup = function(id) {
  const body    = document.getElementById('numgrp-' + id);
  const chevron = document.getElementById('numgrp-chevron-' + id);
  if (!body) return;
  const collapsed = body.style.display === 'none';
  body.style.display = collapsed ? '' : 'none';
  if (chevron) chevron.style.transform = collapsed ? '' : 'rotate(-90deg)';
};

window.toggleCostBreakdown = function(enabled) {
  const mixKeys = ['labor_mix','material_mix','equip_mix','subcontract_mix'];
  const newWeight = enabled ? FEATURE_WEIGHTS.labor_mix : 0;
  for (const k of mixKeys) {
    ACTIVE_WEIGHTS[k] = newWeight;
    const slider = document.getElementById('wslider-' + k);
    const valEl  = document.getElementById('wval-' + k);
    const row    = document.getElementById('row-' + k);
    if (slider) {
      slider.value = newWeight;
      slider.disabled = !enabled;
      slider.style.setProperty('--fill-pct', (newWeight / 5 * 100).toFixed(0) + '%');
    }
    if (valEl) { valEl.value = newWeight.toFixed(1); valEl.disabled = !enabled; }
    if (row)   row.style.opacity = enabled ? '' : '0.45';
  }
  _refreshSettingsGroupPoints();
  const txt     = document.getElementById('num-applied-text');
  const summary = document.getElementById('num-applied-summary');
  const icon    = summary && summary.querySelector('i');
  if (enabled) {
    if (txt)     txt.textContent = '6 of 6 numerical features applied';
    if (summary) { summary.style.background = '#f0fdf4'; summary.style.color = '#166534'; }
    if (icon)    icon.className = 'pi pi-check-circle';
  } else {
    if (txt)     txt.textContent = '2 of 6 numerical features applied — cost element breakdown excluded';
    if (summary) { summary.style.background = '#fef3c7'; summary.style.color = '#92400e'; }
    if (icon)    icon.className = 'pi pi-exclamation-circle';
  }
  _refreshSettingsGroupPoints();
};

/* ── CHART DATA ─────────────────────────────────────────────────── */
// Full project span: Dec 2024 – Nov 2026 (24 months)
const CHART_LABELS = [
  'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan',
  'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug',
  'Sep', 'Oct', 'Nov'
];
let REAL_TODAY_IDX = 6; // Jun 2025 — actual calendar today
let TODAY_IDX = REAL_TODAY_IDX;  // mutable for time-slider simulation

// Chart-scale constants
let CHART_BAC = 40.0; // BAC shown on chart ($M)
const MONTH_CALENDAR = [
  'Dec 2024','Jan 2025','Feb 2025','Mar 2025','Apr 2025','May 2025','Jun 2025',
  'Jul 2025','Aug 2025','Sep 2025','Oct 2025','Nov 2025','Dec 2025','Jan 2026',
  'Feb 2026','Mar 2026','Apr 2026','May 2026','Jun 2026','Jul 2026','Aug 2026',
  'Sep 2026','Oct 2026','Nov 2026'
];
let SCHEDULED_END_IDX = 20; // Aug 2026

// Periodic spend data ($M) — 24 months, Dec 2024 – Nov 2026
// CA-1042 · Civil Foundations P2 · Budget: $40M
//
// Story: Front-loaded civil foundations work. Unexpected soil conditions in
// Feb (month 2) required additional dewatering scope (+$1.8M change order,
// approved in Apr). Actuals track ~$1M/mo above baseline through month 5.
// CPI = EV/AC = 21.6/23.6 = 0.916 ≈ 0.92 ✓
// SPI = EV/PV = 21.6/24.7 = 0.875 ≈ 0.88 ✓ (PV = baseline months 0-6)
const BAR_DATA = {
  // Baseline: original approved plan — bell peak at month 6–7, total ~$39.5M
  baseline:  [1.5, 2.5, 3.5, 4.2, 4.5, 4.5, 4.0, 3.2, 2.5, 1.8, 1.4, 1.1, 0.9, 0.7, 0.6, 0.5, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1, 0.1],
  // Approved: baseline + CO-001 (dewatering scope, months 2–4), total ~$41M
  approved:  [1.5, 2.5, 3.8, 4.6, 4.8, 4.7, 4.1, 3.3, 2.6, 1.9, 1.5, 1.1, 0.9, 0.7, 0.6, 0.5, 0.5, 0.4, 0.3, 0.3, 0.2, 0.2, 0.1, 0.1],
  // Control: PMO stretch target — tighter spend, earlier finish, total ~$36M
  control:   [1.5, 2.4, 3.3, 3.9, 4.2, 4.2, 3.8, 3.0, 2.3, 1.6, 1.3, 1.0, 0.8, 0.6, 0.5, 0.4, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1, 0.0, 0.0],
  // Financial: accounting estimate — mirrors actuals to date, pessimistic forward, total ~$41.5M
  financial: [1.2, 2.1, 3.4, 4.2, 4.5, 4.3, 3.9, 3.8, 3.4, 3.0, 2.5, 2.0, 1.7, 1.3, 1.0, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1],
  // Earned Value (EV): work accomplished — CPI 0.92 vs actuals (null after TODAY)
  earned:   [1.1, 1.9, 3.1, 3.9, 4.1, 3.9, 3.6, null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
  // Actuals (AC): cash spent — includes labour, equipment, materials (null after TODAY)
  actuals:  [1.2, 2.1, 3.4, 4.2, 4.5, 4.3, 3.9, null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
  // Incurred: actuals + accruals (~4% uplift for goods-received-not-invoiced)
  incurred: [1.3, 2.2, 3.6, 4.4, 4.7, 4.5, 4.1, null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
  // Commitment: new purchase orders/subcontracts signed each month — front-loaded
  commitment:[2.0, 5.8, 7.2, 4.1, 2.6, 1.8, 1.2, 0.8, 0.6, 0.5, 0.4, 0.3, 0.2, 0.2, 0.1, 0.1, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
};

// Extend a real data series (nulls after real today) with a declining spend curve
// so the time slider can animate the S-curve growing beyond the real today date.
function _buildSimSeries(realData, totalTarget) {
  const arr = [...realData];
  const lastReal = arr.reduce((li, v, i) => v !== null ? i : li, -1);
  if (lastReal < 0) return arr;
  const realSum = arr.slice(0, lastReal + 1).reduce((a, b) => a + (b || 0), 0);
  const remaining = Math.max(0, totalTarget - realSum);
  const n = arr.length - lastReal - 1;
  if (n <= 0 || remaining <= 0) return arr;
  const wts = Array.from({ length: n }, (_, i) => Math.exp(-i * 0.18));
  const wSum = wts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < n; i++) arr[lastReal + 1 + i] = +(((wts[i] / wSum) * remaining).toFixed(2));
  return arr;
}
let EAC_ACTUAL   = 42.2;
let EAC_INCURRED = 43.9;
let EAC_EARNED   = 40.0;
let ACTIVE_BAR_DATA = BAR_DATA;

let SIM_ACTUALS  = _buildSimSeries(BAR_DATA.actuals,  EAC_ACTUAL);
let SIM_INCURRED = _buildSimSeries(BAR_DATA.incurred, EAC_INCURRED);
let SIM_EARNED   = _buildSimSeries(BAR_DATA.earned,   EAC_EARNED);

/* ── CONTROL ACCOUNT MOCK DATA ───────────────────────────────────── */
const _N = Array(14).fill(null);  // 14 trailing nulls helper
const _N11 = Array(11).fill(null);
const _N18 = Array(18).fill(null);
const _Z6  = Array(6).fill(0);

const CA_DATA = {
  'ca-1042': {
    label:    'CA-1042 · Civil Foundations — P2',
    subtitle: 'Control account: CA-1042 · Civil Foundations — Phase 2',
    realTodayIdx:    6,
    scheduledEndIdx: 20,
    chartBac:   40.0,
    eacActual:  42.2,
    eacIncurred:43.9,
    eacEarned:  40.0,
    yMax: 50, yStep: 10,
    bannerConf: 87, bannerSimilar: 24,
    bars: BAR_DATA,
    explanation: "Forecast built against Cisco Systems' internal project history only — private data, no external benchmarks. Three independent forecast lines (Actual/ETC, Incurred/ETC, Earned) are each matched using their own historical data series. Matching uses Gower distance across CA group codes (PHASE_TYPE, DISCIPLINE, WORK_TYPE) and project groups (PROJ_SIZE, REGION). SPI (0.88) and CPI (0.92) active as weighting factors — accounts with similar performance profiles weighted higher. Top 9 matched neighbors (avg similarity 0.78, min 0.30) re-anchor to $23.6M actuals → $42.2M EAC. Curve shape signals (skewness, front-load ratio, Gini, peak period) indicate deviation from the baseline plan."
  },
  'ca-1043': {
    label:    'CA-1043 · Structural Steel — P1',
    subtitle: 'Control account: CA-1043 · Structural Steel — Phase 1',
    realTodayIdx:    9,
    scheduledEndIdx: 17,
    chartBac:   28.0,
    eacActual:  26.7,
    eacIncurred:27.2,
    eacEarned:  28.0,
    yMax: 35, yStep: 5,
    bannerConf: 82, bannerSimilar: 18,
    bars: {
      baseline:  [0.60,1.60,3.00,3.75,3.85,3.50,2.90,2.30,1.80,1.30,0.75,0.55,0.40,0.30,0.20,0.15,0.10,0.05,0,0,0,0,0,0],
      approved:  [0.60,1.70,3.20,3.90,3.95,3.60,2.95,2.35,1.85,1.35,0.80,0.60,0.45,0.35,0.25,0.18,0.10,0.07,0,0,0,0,0,0],
      control:   [0.55,1.40,2.70,3.40,3.50,3.20,2.60,2.00,1.50,1.10,0.65,0.45,0.30,0.20,0.15,0.10,0.05,0.05,0,0,0,0,0,0],
      financial: [0.70,1.80,3.40,3.80,3.40,2.70,2.20,1.80,1.50,1.10,0.80,0.60,0.45,0.35,0.25,0.18,0.10,0.07,0,0,0,0,0,0],
      earned:    [0.74,1.89,3.57,3.99,3.57,2.84,2.31,1.89,1.58,1.16,..._N],
      actuals:   [0.70,1.80,3.40,3.80,3.40,2.70,2.20,1.80,1.50,1.10,..._N],
      incurred:  [0.73,1.87,3.54,3.95,3.54,2.81,2.29,1.87,1.56,1.14,..._N],
      commitment:[3.0,7.0,6.0,4.0,2.0,0.8,0.3,0.2,0.1,0.1,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    },
    explanation: "Forecast built against Cisco Systems' internal project history only — private data, no external benchmarks. Front-loaded structural steel profile shows strong cost performance (CPI 1.05) with a modestly compressed schedule (SPI 0.96). Matching uses Gower distance across CA group codes and project groups — structural discipline is well-represented in the historical pool. SPI (0.96) and CPI (1.05) active as weighting factors — under-budget trajectory weighted favorably. Top 8 matched neighbors (avg similarity 0.81, min 0.35) re-anchor to $22.4M actuals → $26.7M EAC. Curve shape signals indicate front-load ratio above baseline plan — typical for steel erection phase sequences."
  },
  'ca-1044': {
    label:    'CA-1044 · MEP Systems',
    subtitle: 'Control account: CA-1044 · MEP Systems',
    realTodayIdx:    5,
    scheduledEndIdx: 21,
    chartBac:   35.0,
    eacActual:  39.8,
    eacIncurred:41.8,
    eacEarned:  35.0,
    yMax: 50, yStep: 10,
    bannerConf: 72, bannerSimilar: 31,
    bars: {
      baseline:  [0.60,1.00,1.80,2.50,2.80,2.70,2.70,2.60,2.50,2.30,2.10,1.90,1.70,1.50,1.30,1.10,0.90,0.70,0.55,0.45,0.35,0.30,0,0],
      approved:  [0.65,1.10,1.90,2.60,2.95,2.80,2.80,2.70,2.60,2.40,2.20,2.00,1.80,1.60,1.40,1.20,1.00,0.80,0.60,0.50,0.40,0.30,0,0],
      control:   [0.55,0.90,1.70,2.30,2.60,2.50,2.50,2.40,2.30,2.10,1.90,1.70,1.50,1.30,1.10,0.90,0.70,0.55,0.40,0.35,0.28,0.22,0,0],
      financial: [0.80,1.20,2.00,2.50,2.40,1.70,2.20,2.40,2.60,2.70,2.60,2.40,2.20,1.90,1.60,1.30,1.00,0.80,0.65,0.50,0.40,0.35,0,0],
      earned:    [0.70,1.06,1.76,2.20,2.11,1.50,..._N18],
      actuals:   [0.80,1.20,2.00,2.50,2.40,1.70,..._N18],
      incurred:  [0.83,1.25,2.08,2.60,2.50,1.77,..._N18],
      commitment:[1.5,3.0,5.5,6.0,5.0,3.5,3.0,2.5,2.0,1.5,1.0,0.8,0.5,0.3,0.2,0.1,0.1,0.0,0,0,0,0,0,0],
    },
    explanation: "Forecast built against Cisco Systems' internal project history only — private data, no external benchmarks. MEP systems showing cost pressure (CPI 0.88) and schedule delay (SPI 0.82) — back-loaded spend profile with significant remaining scope. Matching uses Gower distance with heavier weighting on discipline (MEP) and cost mix (labor/equipment ratio). SPI (0.82) and CPI (0.88) active as weighting factors — accounts with similar underperformance profiles weighted higher. Top 11 matched neighbors (avg similarity 0.72, min 0.28) re-anchor to $10.6M actuals → $39.8M EAC. Confidence is lower than typical due to early lifecycle position (26.6% complete) — wider P10–P90 band reflects forecast uncertainty."
  },
  'ca-1045': {
    label:    'CA-1045 · Site Preparation',
    subtitle: 'Control account: CA-1045 · Site Preparation',
    realTodayIdx:    12,
    scheduledEndIdx: 13,
    chartBac:   12.0,
    eacActual:  12.24,
    eacIncurred:12.50,
    eacEarned:  12.0,
    yMax: 15, yStep: 5,
    bannerConf: 91, bannerSimilar: 42,
    bars: {
      baseline:  [1.40,1.90,1.75,1.50,1.25,0.95,0.75,0.55,0.45,0.38,0.28,0.28,0.27,0.29,0,0,0,0,0,0,0,0,0,0],
      approved:  [1.40,1.90,1.75,1.50,1.25,0.95,0.75,0.55,0.45,0.38,0.28,0.28,0.27,0.29,0,0,0,0,0,0,0,0,0,0],
      control:   [1.35,1.80,1.65,1.40,1.15,0.85,0.65,0.50,0.40,0.33,0.25,0.25,0.22,0.25,0,0,0,0,0,0,0,0,0,0],
      financial: [1.50,2.00,1.80,1.50,1.30,1.00,0.80,0.60,0.50,0.40,0.30,0.30,0.20,0.30,0,0,0,0,0,0,0,0,0,0],
      earned:    [1.47,1.96,1.76,1.47,1.27,0.98,0.78,0.59,0.49,0.39,0.29,0.29,0.20,..._N11],
      actuals:   [1.50,2.00,1.80,1.50,1.30,1.00,0.80,0.60,0.50,0.40,0.30,0.30,0.20,..._N11],
      incurred:  [1.56,2.08,1.87,1.56,1.35,1.04,0.83,0.62,0.52,0.42,0.31,0.31,0.21,..._N11],
      commitment:[4.0,3.5,2.0,1.0,0.5,0.3,0.2,0.1,0.0,0.0,0.0,0.0,0.0,0.0,0,0,0,0,0,0,0,0,0,0],
    },
    explanation: "Forecast built against Cisco Systems' internal project history only — private data, no external benchmarks. Site preparation nearing completion (99.7% complete) — final month of activity remaining. Near-complete status yields very high model confidence; matching is primarily informational at this lifecycle stage. SPI (1.02) and CPI (0.98) indicate on-budget, on-schedule performance throughout the project lifecycle. Top 14 matched neighbors (avg similarity 0.91, min 0.52) confirm typical closeout pattern. Forecast EAC of $12.2M is within 2% of $12.0M budget — routine close-out variance."
  }
};

// Project summary — a roll-up of every control account. Bars are the
// element-wise sum of the individual CAs; BAC/EAC are their totals. Built
// after the literal so it can read the sibling entries.
CA_DATA['project-summary'] = (function () {
  const ids = ['ca-1042', 'ca-1043', 'ca-1044', 'ca-1045'];
  const cas = ids.map(id => CA_DATA[id]);
  const LEN = 24;
  const sumBars = key => {
    const out = Array(LEN).fill(0);
    cas.forEach(ca => { const a = ca.bars[key] || []; for (let i = 0; i < LEN; i++) out[i] += (a[i] || 0); });
    return out.map(v => +v.toFixed(2));
  };
  const sum = key => +cas.reduce((s, ca) => s + ca[key], 0).toFixed(1);
  return {
    label:    'Project summary',
    subtitle: 'Project summary — all control accounts (rolled up)',
    realTodayIdx:    6,
    scheduledEndIdx: 21,
    chartBac:    sum('chartBac'),
    eacActual:   sum('eacActual'),
    eacIncurred: sum('eacIncurred'),
    eacEarned:   sum('eacEarned'),
    yMax: 140, yStep: 20,
    bannerConf: 85, bannerSimilar: 115,
    bars: {
      baseline: sumBars('baseline'), approved: sumBars('approved'), control: sumBars('control'),
      financial: sumBars('financial'), earned: sumBars('earned'), actuals: sumBars('actuals'),
      incurred: sumBars('incurred'), commitment: sumBars('commitment'),
    },
    explanation: "Project-level roll-up across all control accounts (CA-1042 Civil Foundations, CA-1043 Structural Steel, CA-1044 MEP Systems, CA-1045 Site Preparation). Each line is the sum of its control accounts; the AI forecast aggregates the independent per-account matches into a single project S-curve. Total budget $115.0M → forecast EAC $120.9M (Actual/ETC). Cost pressure is concentrated in MEP Systems (CPI 0.88); civil and steel scopes are tracking on or under budget. Select an individual control account from the dropdown to drill into its own matched-history forecast."
  };
})();

let ACTIVE_CA_ID = 'ca-1042';

window.selectAccount = function(id) {
  const ca = CA_DATA[id];
  if (!ca) return;

  // Close dropdown regardless
  const dropdown = document.getElementById('acctDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const acctSBtn = document.getElementById('acctSelectorBtn');
  if (acctSBtn) acctSBtn.setAttribute('aria-expanded', 'false');

  if (id === ACTIVE_CA_ID) return;
  ACTIVE_CA_ID = id;

  // Update mutable globals
  REAL_TODAY_IDX    = ca.realTodayIdx;
  TODAY_IDX         = REAL_TODAY_IDX;
  SCHEDULED_END_IDX = ca.scheduledEndIdx;
  CHART_BAC         = ca.chartBac;
  EAC_ACTUAL        = ca.eacActual;
  EAC_INCURRED      = ca.eacIncurred;
  EAC_EARNED        = ca.eacEarned;
  ACTIVE_BAR_DATA   = ca.bars;
  AI_FORECAST_ACTIVE = false; // new CA = fresh data, AI forecast is no longer valid
  AI_PROJ_ACTUAL = null;

  // Rebuild simulation series for new CA
  SIM_ACTUALS  = _buildSimSeries(ca.bars.actuals,  EAC_ACTUAL);
  SIM_INCURRED = _buildSimSeries(ca.bars.incurred, EAC_INCURRED);
  SIM_EARNED   = _buildSimSeries(ca.bars.earned,   EAC_EARNED);

  if (scurveChart) {
    const ds = scurveChart.data.datasets;

    // Bar datasets 0-7
    ds[0].data = ca.bars.baseline;
    ds[1].data = ca.bars.approved;
    ds[2].data = ca.bars.control;
    ds[3].data = ca.bars.financial;
    ds[4].data = ca.bars.earned;
    ds[5].data = ca.bars.actuals;
    ds[6].data = ca.bars.incurred;
    ds[7].data = ca.bars.commitment;

    // Rebuild line + band datasets
    const ha  = buildActualHistLine();
    const hi  = buildIncurredHistLine();
    const he  = buildEarnedHistLine();
    const pa  = buildActualForecastLine();
    const pi  = buildIncurredForecastLine();
    const pe  = buildEarnedForecastLine();
    const p90 = buildBandLine(pa, 1.08);
    const p10 = buildBandLine(pa, 0.92);

    ds[8].data  = p90;
    ds[9].data  = p10;
    ds[10].data = ha;
    ds[11].data = hi;
    ds[12].data = he;
    ds[13].data = pa;
    ds[14].data = pi;
    ds[15].data = pe;
    ds[16].data = Array(24).fill(CHART_BAC);

    // Update Y-axis scale
    scurveChart.options.scales.y.max = ca.yMax;
    scurveChart.options.scales.y.ticks.stepSize = ca.yStep;

    scurveChart.update('none');
  }

  // Update KPI cards
  _updateKpiFromTime(TODAY_IDX);

  // Update AI banner
  const confPill = document.querySelector('.sc-high-confidence-pill');
  if (confPill) confPill.textContent = `High confidence: ${ca.bannerConf}%`;
  const simAccts = document.querySelector('.sc-similar-accts');
  if (simAccts) simAccts.textContent = `${ca.bannerSimilar} similar accounts`;

  // Update forecast explanation
  const expBox = document.querySelector('.sc-forecast-exp-box');
  if (expBox) expBox.textContent = ca.explanation;

  // Update page subtitle
  const subEl = document.querySelector('.sc-page-subtitle');
  if (subEl) subEl.textContent = ca.subtitle;

  // Update selector button label
  if (acctSBtn) {
    acctSBtn.innerHTML = `${ca.label} <i class="pi pi-chevron-down sc-acct-chevron"></i>`;
  }

  // Update dropdown active state
  document.querySelectorAll('.sc-acct-drop-item').forEach(el => {
    el.classList.toggle('sc-acct-drop-item--active', el.dataset.id === id);
  });

  // Reset time slider to the new CA's real today
  const slider = document.getElementById('scTimeSlider');
  if (slider) {
    slider.value = REAL_TODAY_IDX;
    const pct = ((REAL_TODAY_IDX - +slider.min) / (+slider.max - +slider.min)) * 100;
    slider.style.setProperty('--fill-pct', pct + '%');
  }
  const tsLabel = document.getElementById('scTsMonth');
  if (tsLabel) tsLabel.textContent = MONTH_CALENDAR[TODAY_IDX];
  const tsBadge = document.getElementById('scTsSimBadge');
  if (tsBadge) tsBadge.style.display = 'none';
};

// Cumulative S-curves — compute from periodic data
function buildCumulative(arr) {
  let sum = 0;
  return arr.map(v => { sum += (v || 0); return sum; });
}

// Build cumulative historical lines (solid segment, 0 → TODAY_IDX, then null)
// Use SIM arrays so lines work beyond the real today when the time slider is active
function buildActualHistLine() {
  let sum = 0;
  return SIM_ACTUALS.map((v, i) => {
    if (i > TODAY_IDX) return null;
    sum += (v || 0);
    return sum;
  });
}

function buildIncurredHistLine() {
  let sum = 0;
  return SIM_INCURRED.map((v, i) => {
    if (i > TODAY_IDX) return null;
    sum += (v || 0);
    return sum;
  });
}

function buildEarnedHistLine() {
  let sum = 0;
  return SIM_EARNED.map((v, i) => {
    if (i > TODAY_IDX) return null;
    sum += (v || 0);
    return sum;
  });
}

// Forecast line: start from simulated cumulative at TODAY_IDX, project forward to target
function _buildForecastLine(simSeries, target) {
  const cumAtToday = simSeries.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0);
  const remaining  = Math.max(0, target - cumAtToday);
  const forecastMonths = 24 - TODAY_IDX - 1;
  const result = Array(24).fill(null);
  result[TODAY_IDX] = cumAtToday;
  if (forecastMonths <= 0) return result;
  const wts = Array.from({ length: forecastMonths }, (_, i) => Math.max(0.08, 1 - i * 0.055));
  const wSum = wts.reduce((a, b) => a + b, 0);
  let runSum = cumAtToday;
  for (let i = 0; i < forecastMonths; i++) {
    runSum += (wts[i] / wSum) * remaining;
    result[TODAY_IDX + 1 + i] = runSum;
  }
  return result;
}

function buildActualForecastLine()   { return _buildForecastLine(SIM_ACTUALS,  EAC_ACTUAL); }
function buildIncurredForecastLine() { return _buildForecastLine(SIM_INCURRED, EAC_INCURRED); }
function buildEarnedForecastLine()   { return _buildForecastLine(SIM_EARNED,   EAC_EARNED); }

// P10/P90 confidence band around the actual/ETC forecast.
// The junction point (TODAY_IDX) anchors to the actual value so the band starts
// at zero width there and fans out — prevents a bezier kink at the cutpoint.
function buildBandLine(forecastLine, multiplier) {
  return forecastLine.map((v, i) => {
    if (v === null) return null;
    if (i <= TODAY_IDX) return v; // anchor: no fan at or before today
    return v * multiplier;
  });
}

let scurveChart = null;
let showConfidenceBand = true;

/* ── Chart metric (Cost / Hours / Company) ──────────────────────────
   The chart plots cumulative cost in $M. Switching metric only re-labels
   the y-axis, tick values and tooltips — the curve shape is identical
   (mock-data demo). valFmt(raw) and axisFmt(v) both receive $M-scale
   numbers and convert/relabel them for the active metric.            */
const CHART_METRICS = {
  cost: {
    title: 'Cumulative cost',
    valFmt: (v) => '$' + v.toFixed(1) + 'M',
    axisFmt: (v) => '$' + v + 'M',
  },
  hours: {
    // Cost ($M) → labour hours at a blended ~$125/hr ⇒ ~8k hrs per $1M
    title: 'Cumulative hours',
    valFmt: (v) => (v * 8).toFixed(0) + 'k hrs',
    axisFmt: (v) => (v * 8) + 'k',
  },
  company: {
    // Company cost = direct cost grossed up ~15% for overhead & markup
    title: 'Cumulative company cost',
    valFmt: (v) => '$' + (v * 1.15).toFixed(1) + 'M',
    axisFmt: (v) => '$' + Math.round(v * 1.15) + 'M',
  },
};
let CHART_METRIC = 'cost';

window.setChartMetric = function (metric) {
  if (!CHART_METRICS[metric]) return;
  CHART_METRIC = metric;
  // Contribution % is metric-specific (only the active breakdown counts) — recalculate everywhere
  _refreshSettingsSectionPcts();
  // Rebuild the "Driven by" detail if it's open — its element breakdown + contributions are metric-specific
  const detailPanel = document.getElementById('scAiBannerDetail');
  if (detailPanel && detailPanel.dataset.built && detailPanel.style.display !== 'none') {
    detailPanel.innerHTML = buildAiBannerDetail();
  }
  if (!scurveChart) return;
  // Tick + tooltip callbacks read CHART_METRIC live, so an update() re-labels
  // them; only the static axis title needs an explicit refresh.
  scurveChart.options.scales.y.title.text = CHART_METRICS[metric].title;
  scurveChart.update();
};
let AI_FORECAST_ACTIVE = false; // true when AI forecast curves are shown on chart
let AI_PROJ_ACTUAL = null;      // stored AI forecast line — used to recompute band on slider move

function initScurveChart() {
  const ctx = document.getElementById('scurve-chart');
  if (!ctx) return;

  const truncAtToday = (arr) => arr.map((v, i) => i > TODAY_IDX ? null : v);

  const histActual   = buildActualHistLine();
  const histIncurred = buildIncurredHistLine();
  const histEarned   = buildEarnedHistLine();

  // Cumulative budget comparison lines (static plan curves)
  const cum = (arr) => { let s = 0; return arr.map(v => v === null ? null : +(s += v).toFixed(2)); };
  const lineBudget   = cum(BAR_DATA.baseline);
  const lineControl  = cum(BAR_DATA.control);
  const lineFinance  = cum(BAR_DATA.financial);
  // Cashflow: cash out the door — actuals paid with ~1-month lag and 5% retention held
  const lineCashflow = cum(BAR_DATA.actuals.map((v, i) => {
    if (i > TODAY_IDX) return null;
    const lagged = i >= 1 ? BAR_DATA.actuals[i - 1] : 0;
    return lagged === null ? null : +(lagged * 0.95).toFixed(2);
  }));
  const projActual   = buildActualForecastLine();
  const projIncurred = buildIncurredForecastLine();
  const projEarned   = buildEarnedForecastLine();
  const p10Band = buildBandLine(projActual, 0.92);
  const p90Band = buildBandLine(projActual, 1.08);

  // Dot at junction (Today) only
  const junctionDot = (c) => c.dataIndex === TODAY_IDX ? 6 : 0;

  const verticalLinePlugin = {
    id: 'currentPeriodLine',
    afterDatasetsDraw(chart) {
      _positionChartDragger(chart);
    }
  };

  const m = CHART_METRICS[CHART_METRIC];

  scurveChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: CHART_LABELS,
      datasets: [
        // Bar datasets — indices 0-7 (hidden in Cumulative, shown in Periodic)
        { label: 'Baseline',   data: BAR_DATA.baseline,   backgroundColor: '#7c3aed', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Approved',   data: BAR_DATA.approved,   backgroundColor: '#1565c0', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Control',    data: BAR_DATA.control,    backgroundColor: '#db2777', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Financial',  data: BAR_DATA.financial,  backgroundColor: '#0d9488', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Earned',     data: BAR_DATA.earned,     backgroundColor: '#059669', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Actuals',    data: BAR_DATA.actuals,    backgroundColor: '#2563eb', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Incurred',   data: BAR_DATA.incurred,   backgroundColor: '#f59e0b', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        { label: 'Commitment', data: BAR_DATA.commitment, backgroundColor: '#43a047', barPercentage: 0.85, categoryPercentage: 0.85, order: 2, hidden: true },
        // Confidence band — indices 8 (_p90), 9 (_p10) — around Actual/ETC forecast
        { type: 'line', label: '_p90', data: p90Band, borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(37,99,235,0.10)', borderColor: 'transparent', tension: 0.45, spanGaps: false, order: 1 },
        { type: 'line', label: '_p10', data: p10Band, borderWidth: 0, pointRadius: 0, fill: false, backgroundColor: 'transparent',          borderColor: 'transparent', tension: 0.45, spanGaps: false, order: 1 },
        // Historical solid lines — indices 10 (_hist_actual), 11 (_hist_incurred), 12 (_hist_earned)
        { type: 'line', label: 'Actual / ETC',   data: histActual,   borderColor: '#2563eb', borderWidth: 2.5, pointRadius: 0, fill: false, tension: 0.45, order: 1 },
        { type: 'line', label: 'Incurred / ETC', data: histIncurred, borderColor: '#f59e0b', borderWidth: 2.5, pointRadius: 0, fill: false, tension: 0.45, order: 1 },
        { type: 'line', label: 'Earned',         data: histEarned,   borderColor: '#059669', borderWidth: 2.5, pointRadius: 0, fill: false, tension: 0.45, order: 1 },
        // Forecast dashed lines — indices 13 (Actual/ETC), 14 (Incurred/ETC), 15 (Earned)
        { type: 'line', label: 'Actual / ETC',   data: projActual,   borderColor: '#2563eb', borderWidth: 2, borderDash: [6, 4], pointRadius: junctionDot, pointBackgroundColor: '#2563eb', pointBorderColor: '#fff', pointBorderWidth: 2, fill: false, tension: 0.45, order: 1, spanGaps: true },
        { type: 'line', label: 'Incurred / ETC', data: projIncurred, borderColor: '#f59e0b', borderWidth: 2, borderDash: [6, 4], pointRadius: junctionDot, pointBackgroundColor: '#f59e0b', pointBorderColor: '#fff', pointBorderWidth: 2, fill: false, tension: 0.45, order: 1, spanGaps: true },
        { type: 'line', label: 'Earned',   data: projEarned,   borderColor: '#059669', borderWidth: 2, borderDash: [6, 4], pointRadius: junctionDot, pointBackgroundColor: '#059669', pointBorderColor: '#fff', pointBorderWidth: 2, fill: false, tension: 0.45, order: 1, spanGaps: true },
        // BAC reference — index 16
        { type: 'line', label: '_bac', data: Array(24).fill(40), borderColor: '#9ca3af', borderWidth: 1, borderDash: [4, 4], pointRadius: 0, fill: false, order: 3 },
        // Budget comparison lines — indices 17 (Budget), 18 (Control budget), 19 (Finance budget), 20 (Cashflow)
        { type: 'line', label: 'Budget',         data: lineBudget,   borderColor: '#7c3aed', borderWidth: 2,   pointRadius: 0, fill: false, tension: 0.45, order: 1, segment: { borderDash: (c) => c.p0DataIndex >= TODAY_IDX ? [2, 3] : undefined } },
        { type: 'line', label: 'Control budget', data: lineControl,  borderColor: '#db2777', borderWidth: 1.5, borderDash: [3, 3], pointRadius: 0, fill: false, tension: 0.45, order: 1, hidden: true },
        { type: 'line', label: 'Finance budget', data: lineFinance,  borderColor: '#0d9488', borderWidth: 1.5, borderDash: [3, 3], pointRadius: 0, fill: false, tension: 0.45, order: 1, hidden: true },
        { type: 'line', label: 'Cashflow',       data: lineCashflow, borderColor: '#0891b2', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.45, order: 1, hidden: true },
      ]
    },
    plugins: [verticalLinePlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          filter: (item, index, array) => {
            if (item.dataset.label.startsWith('_') || item.raw == null) return false;
            // Drop duplicate same-series entries (historical + forecast halves overlap at "today");
            // keep line-vs-bar distinction by keying on label + type.
            const key = item.dataset.label + '|' + item.dataset.type;
            return array.findIndex(x => x.raw != null && (x.dataset.label + '|' + x.dataset.type) === key) === index;
          },
          usePointStyle: true,
          callbacks: {
            // Line datasets get a line swatch; bar datasets get a filled box — so it's clear which is which
            labelPointStyle: (c) => ({ pointStyle: c.dataset.type === 'bar' ? 'rect' : 'line', rotation: 0 }),
            labelColor: (c) => {
              const col = c.dataset.borderColor || c.dataset.backgroundColor || '#9ca3af';
              return { borderColor: col, backgroundColor: col, borderWidth: c.dataset.type === 'bar' ? 0 : 3 };
            },
            label: (c) => c.raw === null ? null : ` ${c.dataset.label}: ${CHART_METRICS[CHART_METRIC].valFmt(c.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { color: '#f3f4f6' }, ticks: { font: { size: 11 }, color: '#6b7280' } },
        y: {
          position: 'left',
          title: { display: true, text: m.title, font: { size: 11 }, color: '#9ca3af' },
          min: 0, max: 50,
          grid: { color: '#f3f4f6' },
          ticks: {
            font: { size: 11 }, color: '#6b7280',
            callback: v => CHART_METRICS[CHART_METRIC].axisFmt(v),
            stepSize: 10
          }
        }
      }
    }
  });
}

/* ── CHART DRAGGER (in-chart time scrubber) ─────────────────────── */
function _positionChartDragger(chart) {
  const dragger = document.getElementById('scChartDragger');
  if (!dragger || !chart) return;
  const xScale = chart.scales.x;
  if (!xScale) return;
  const xPos = xScale.getPixelForValue(TODAY_IDX);
  dragger.style.left = xPos + 'px';
  dragger.style.display = '';
  dragger.classList.toggle('is-simulated', TODAY_IDX !== REAL_TODAY_IDX);
  const label = document.getElementById('scChartDraggerLabel');
  if (label) label.textContent = MONTH_CALENDAR[TODAY_IDX] || '';
}

function _setupChartDragger() {
  const dragger = document.getElementById('scChartDragger');
  if (!dragger || dragger.dataset.bound) return;
  dragger.dataset.bound = '1';
  const handle = dragger.querySelector('.sc-chart-dragger-handle');
  if (!handle) return;

  let dragging = false;

  function pointerToIdx(clientX) {
    if (!scurveChart) return TODAY_IDX;
    const canvas = scurveChart.canvas;
    const rect = canvas.getBoundingClientRect();
    const xScale = scurveChart.scales.x;
    const x = clientX - rect.left;
    let idx = Math.round(xScale.getValueForPixel(x));
    return Math.max(2, Math.min(22, idx));
  }

  function syncSlider(idx) {
    const slider = document.getElementById('scTimeSlider');
    if (!slider) return;
    slider.value = idx;
    const pct = ((idx - +slider.min) / (+slider.max - +slider.min)) * 100;
    slider.style.setProperty('--fill-pct', pct + '%');
  }

  function onPointerMove(e) {
    if (!dragging) return;
    const idx = pointerToIdx(e.clientX);
    if (idx !== TODAY_IDX) {
      window.updateChartTime(idx);
      syncSlider(idx);
    }
  }

  function onPointerUp(e) {
    if (!dragging) return;
    dragging = false;
    handle.releasePointerCapture && handle.releasePointerCapture(e.pointerId);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
  }

  handle.addEventListener('pointerdown', e => {
    dragging = true;
    handle.setPointerCapture && handle.setPointerCapture(e.pointerId);
    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('pointercancel', onPointerUp);
    e.preventDefault();
  });
}

window.toggleConfidenceBand = function(show) {
  showConfidenceBand = show;
  if (!scurveChart) return;
  // dataset index 8 is _p90 (top of band)
  scurveChart.data.datasets[8].backgroundColor = show ? 'rgba(59,130,246,0.12)' : 'transparent';
  scurveChart.update();
};

// Each key maps to its dataset indices — toggling hides/shows all segments
const LINE_DATASETS = {
  actual: [10, 13], incurred: [11, 14], earned: [12, 15],
  budget: [17], control: [18], finance: [19], cashflow: [20],
};
const LINE_VISIBILITY = {
  actual: true, incurred: true, earned: true,
  budget: true, control: false, finance: false, cashflow: false,
};

// Bar dataset index for each toggle key — bars (periodic view) follow the same legend switches
const BAR_FOR_LINE = { budget: 0, control: 2, finance: 3, earned: 4, actual: 5, incurred: 6 };
let CHART_PERIODIC = false;

window.toggleForecastLine = function(key) {
  if (!scurveChart) return;
  LINE_VISIBILITY[key] = !LINE_VISIBILITY[key];
  for (const idx of LINE_DATASETS[key]) {
    const ds = scurveChart.data.datasets[idx];
    if (ds) ds.hidden = !LINE_VISIBILITY[key];
  }
  // Keep the matching bar dataset in sync (only visible in periodic view)
  const barIdx = BAR_FOR_LINE[key];
  if (barIdx != null) {
    const bds = scurveChart.data.datasets[barIdx];
    if (bds) bds.hidden = !CHART_PERIODIC || !LINE_VISIBILITY[key];
  }
  scurveChart.update();
  const btn = document.querySelector(`.sc-line-toggle[data-line="${key}"]`);
  if (btn) {
    btn.setAttribute('aria-pressed', String(LINE_VISIBILITY[key]));
    btn.classList.toggle('sc-line-toggle--off', !LINE_VISIBILITY[key]);
  }
  _updateLineMoreDot();
};

// Show a dot on the "More" button when any line inside the More menu is active
function _updateLineMoreDot() {
  const moreBtn = document.getElementById('lineMoreBtn');
  if (!moreBtn) return;
  const anyOn = ['control', 'finance', 'cashflow'].some(k => LINE_VISIBILITY[k]);
  moreBtn.classList.toggle('has-active', anyOn);
}

/* ── DATE RANGE SELECTOR (dual-handle slider) ────────────────────── */
let DATE_RANGE = { start: 0, end: MONTH_CALENDAR.length - 1 };

function _syncDateRangeUI() {
  const { start: s, end: e } = DATE_RANGE;
  const max = MONTH_CALENDAR.length - 1;
  const sr = document.getElementById('drpStartR');
  const er = document.getElementById('drpEndR');
  if (sr) sr.value = s;
  if (er) er.value = e;
  const sb = document.getElementById('drpStartBox');
  const eb = document.getElementById('drpEndBox');
  if (sb) sb.textContent = MONTH_CALENDAR[s];
  if (eb) eb.textContent = MONTH_CALENDAR[e];
  const fill = document.getElementById('drpFill');
  if (fill) {
    fill.style.left  = (s / max * 100) + '%';
    fill.style.width = ((e - s) / max * 100) + '%';
  }
  const label = document.getElementById('dateRangeLabel');
  if (label) label.textContent = `${MONTH_CALENDAR[s]} – ${MONTH_CALENDAR[e]}`;
}

function _applyDateRangeToChart() {
  if (!scurveChart) return;
  scurveChart.options.scales.x.min = DATE_RANGE.start;
  scurveChart.options.scales.x.max = DATE_RANGE.end;
  scurveChart.update();
}

window.dateRangeSliderInput = function(which) {
  const sr = document.getElementById('drpStartR');
  const er = document.getElementById('drpEndR');
  if (!sr || !er) return;
  let s = +sr.value, e = +er.value;
  // Handles can't cross
  if (which === 'start' && s > e) s = e;
  if (which === 'end'   && e < s) e = s;
  DATE_RANGE = { start: s, end: e };
  _syncDateRangeUI();
  _applyDateRangeToChart();
};

window.toggleDateRangePicker = function() {
  const pop = document.getElementById('dateRangePop');
  const btn = document.getElementById('dateRangeBtn');
  if (!pop) return;
  const isOpen = pop.style.display !== 'none';
  if (!isOpen) _syncDateRangeUI();
  pop.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
};

window.resetDateRange = function() {
  DATE_RANGE = { start: 0, end: MONTH_CALENDAR.length - 1 };
  _syncDateRangeUI();
  _applyDateRangeToChart();
};

window.toggleLineMoreMenu = function() {
  const dropdown = document.getElementById('lineMoreDropdown');
  const btn = document.getElementById('lineMoreBtn');
  if (!dropdown) return;
  const isOpen = dropdown.style.display !== 'none';
  dropdown.style.display = isOpen ? 'none' : 'block';
  if (btn) btn.setAttribute('aria-expanded', String(!isOpen));
};

window.toggleChartView = function(periodic) {
  if (!scurveChart) return;
  CHART_PERIODIC = periodic;
  const keyForBar = {};
  for (const [k, i] of Object.entries(BAR_FOR_LINE)) keyForBar[i] = k;
  for (let i = 0; i <= 7; i++) {
    const key = keyForBar[i];
    // Only bars with a legend toggle are shown (Approved/Commitment have none)
    scurveChart.data.datasets[i].hidden = !periodic || !key || !LINE_VISIBILITY[key];
  }
  scurveChart.update();
  const outer = document.querySelector('.sc-chart-outer');
  if (outer) outer.classList.toggle('is-periodic', periodic);
};

/* ── TIME SLIDER ─────────────────────────────────────────────────── */

function _updateKpiFromTime(idx) {
  const ac  = SIM_ACTUALS.slice(0, idx + 1).reduce((a, b) => a + (b || 0), 0);
  const ev  = SIM_EARNED.slice(0, idx + 1).reduce((a, b) => a + (b || 0), 0);
  const pv  = ACTIVE_BAR_DATA.baseline.slice(0, idx + 1).reduce((a, b) => a + (b || 0), 0);
  const cpi = ac > 0 ? Math.max(0.3, ev / ac) : 1;
  const spi = pv > 0 ? Math.max(0.3, ev / pv) : 1;
  const eac = +(CHART_BAC / cpi).toFixed(1);
  const pct = ac > 0 ? Math.min(100, (ac / eac) * 100) : 0;
  const overPct = +((eac / CHART_BAC - 1) * 100).toFixed(2);

  // EAC card
  const eacEl = document.getElementById('m-eac');
  if (eacEl) eacEl.textContent = '$' + eac.toFixed(1) + 'M';
  const eacSubEl = document.getElementById('m-eac-sub');
  if (eacSubEl) eacSubEl.innerHTML = `Budget: $${CHART_BAC.toFixed(1)}M · <span class="${overPct >= 0 ? 'sc-metric-over' : 'sc-metric-under'}">${overPct >= 0 ? '+' : ''}${overPct}%</span>`;

  // % Complete card
  const pctEl = document.getElementById('m-pct');
  if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
  const pctSubEl = document.getElementById('m-pct-sub');
  if (pctSubEl) pctSubEl.textContent = 'Actuals to date: $' + ac.toFixed(1) + 'M';

  // CPI / SPI card
  const cpiEl = document.getElementById('m-cpispi');
  if (cpiEl) {
    cpiEl.textContent = cpi.toFixed(2) + ' / ' + spi.toFixed(2);
    const isWarn = cpi < 1 || spi < 1;
    cpiEl.classList.toggle('sc-metric-value--warn', isWarn);
    const sub = cpiEl.closest('.sc-metric-card')?.querySelector('.sc-metric-sub');
    if (sub) {
      sub.textContent = (cpi < 1 ? 'Cost overrun' : 'On/under budget') + ' · ' + (spi < 1 ? 'Behind schedule' : 'On/ahead schedule');
      sub.classList.toggle('sc-metric-sub--warn', isWarn);
    }
  }

  // Estimated completion: schedule slip = planned duration × (1/SPI − 1)
  const slipMonths = Math.round(CHART_LABELS.length * Math.max(-6, (1 / spi) - 1));
  const compIdx    = Math.min(23, Math.max(0, SCHEDULED_END_IDX + slipMonths));
  const compLabel    = MONTH_CALENDAR[compIdx] || MONTH_CALENDAR[23];
  const schedLabel   = MONTH_CALENDAR[SCHEDULED_END_IDX];
  const slipMos      = compIdx - SCHEDULED_END_IDX;
  const compEl       = document.getElementById('m-completion');
  if (compEl) compEl.textContent = compLabel;
  const compSubEl    = document.getElementById('m-completion-sub');
  if (compSubEl) compSubEl.innerHTML = `Scheduled: ${schedLabel} · <span class="${slipMos > 0 ? 'sc-metric-over' : 'sc-metric-under'}">${slipMos > 0 ? '+' : ''}${slipMos} mo.</span>`;
}

window.updateChartTime = function(idx) {
  if (!scurveChart) return;
  TODAY_IDX = idx;

  // When AI forecast is active, preserve its curves — only move the Today marker
  if (!AI_FORECAST_ACTIVE) {
    const ha  = buildActualHistLine();
    const hi  = buildIncurredHistLine();
    const he  = buildEarnedHistLine();
    const pa  = buildActualForecastLine();
    const pi  = buildIncurredForecastLine();
    const pe  = buildEarnedForecastLine();
    const p90 = buildBandLine(pa, 1.08);
    const p10 = buildBandLine(pa, 0.92);

    scurveChart.data.datasets[8].data  = p90;
    scurveChart.data.datasets[9].data  = p10;
    scurveChart.data.datasets[10].data = ha;
    scurveChart.data.datasets[11].data = hi;
    scurveChart.data.datasets[12].data = he;
    scurveChart.data.datasets[13].data = pa;
    scurveChart.data.datasets[14].data = pi;
    scurveChart.data.datasets[15].data = pe;
  } else if (AI_PROJ_ACTUAL) {
    // AI forecast active — re-anchor band at new TODAY_IDX so it fans from the slider position
    scurveChart.data.datasets[8].data = buildBandLine(AI_PROJ_ACTUAL, 1.08);
    scurveChart.data.datasets[9].data = buildBandLine(AI_PROJ_ACTUAL, 0.92);
  }

  // 'none' = instant redraw, no animation — keeps the Today line and data curves
  // in sync; regular update() animates curves while the plugin line jumps, looking broken
  scurveChart.update('none');

  const label = document.getElementById('scTsMonth');
  if (label) label.textContent = MONTH_CALENDAR[idx];
  const isReal = idx === REAL_TODAY_IDX;
  const badge  = document.getElementById('scTsSimBadge');
  if (badge) badge.style.display = isReal ? 'none' : 'inline-flex';

  _updateKpiFromTime(idx);
};

window.resetToRealToday = function() {
  const slider = document.getElementById('scTimeSlider');
  if (slider) {
    slider.value = REAL_TODAY_IDX;
    const pct = ((REAL_TODAY_IDX - +slider.min) / (+slider.max - +slider.min)) * 100;
    slider.style.setProperty('--fill-pct', pct + '%');
  }
  window.updateChartTime(REAL_TODAY_IDX);
};

/* ── REAL AI FORECAST COMPUTATION & CHART UPDATE ────────────────── */

/**
 * Compute implied EAC by comparing actual spend rate against the
 * weighted-median spend rate of matched neighbors at the current lifecycle %.
 * Returns implied EAC in model scale ($M, FOCAL budget).
 */
function computeImpliedEAC(neighbors, lifecyclePct) {
  if (!neighbors.length) return FOCAL.budgetAmount;
  const currentPos = lifecyclePct / 100;
  const currentGIdx = Math.round(currentPos * (GRID_N - 1));

  // Weighted-median cumulative fraction at currentPos across neighbors
  const vals = [], wts = [];
  for (const { pool, adjSim } of neighbors) {
    const total = pool.totalSpend;
    if (!total) continue;
    const cum = cumsum(pool.spendProfile);
    const normCum = cum.map(v => v / total);
    const gridCum = interpCumFrac(GRID, normCum);
    vals.push(gridCum[currentGIdx]);
    wts.push(adjSim);
  }
  const medianFrac = weightedPercentile(vals, wts, 50);
  if (!medianFrac) return FOCAL.budgetAmount;

  // Use SIM_ACTUALS (chart scale, covers full simulated timeline) to derive actual fraction.
  // FOCAL.actualSpend only covers 10 real months — using it past the real today gives a
  // stale fraction that makes chartEAC fall below the cumulative (descending forecast).
  const chartActualSpent = SIM_ACTUALS.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0);
  const actualFrac = chartActualSpent / CHART_BAC;

  return FOCAL.budgetAmount * (actualFrac / medianFrac);
}

window.runAiForecast = function() {
  if (!ACTIVE_USER.perms.runForecast) return;
  const btn = document.querySelector('.sc-run-btn');
  if (!btn || btn.disabled) return;
  const orig = btn.innerHTML;
  btn.innerHTML = '<i class="pi pi-spin pi-spinner btn-icon-left"></i> Running…';
  btn.disabled = true;

  const chartWrap = document.querySelector('.sc-chart-wrap');
  if (chartWrap) chartWrap.classList.add('sc-chart-loading');

  setTimeout(() => {
    const lifecyclePct = Math.round((TODAY_IDX + 1) / CHART_LABELS.length * 100);
    const neighbors    = matchNeighbors(lifecyclePct);
    const forecast     = computeForecast(neighbors, lifecyclePct);

    if (forecast && scurveChart) {
      const impliedEAC = computeImpliedEAC(neighbors, lifecyclePct);
      _applyForecastToChart(forecast, impliedEAC);
      AI_FORECAST_ACTIVE = true;
      _updateKpiFromForecast(impliedEAC, neighbors);
      _updateBannerFromForecast(neighbors);
      _updateExplanationFromForecast(forecast, neighbors, lifecyclePct, impliedEAC);
    }

    if (chartWrap) chartWrap.classList.remove('sc-chart-loading');
    btn.innerHTML = orig;
    btn.disabled = !ACTIVE_USER.perms.runForecast;

    // If the detailed view is currently open, rebuild it with fresh weights
    const detailPanel = document.getElementById('scAiBannerDetail');
    if (detailPanel && detailPanel.dataset.built && detailPanel.style.display !== 'none') {
      detailPanel.innerHTML = buildAiBannerDetail();
    }
  }, 1100);
};

function _applyForecastToChart(forecast, impliedEAC) {
  const overrunRatio = impliedEAC / FOCAL.budgetAmount;
  const chartActualSum   = SIM_ACTUALS.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0);
  const chartIncurredSum = SIM_INCURRED.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0);
  const chartEarnedSum   = SIM_EARNED.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0);

  // Clamp so forecast never descends (chartEAC must exceed current cumulative)
  const chartEAC         = Math.max(chartActualSum * 1.001, CHART_BAC * overrunRatio);
  const chartEACIncurred = Math.max(chartIncurredSum * 1.001, chartEAC * 1.04);
  const chartEACEarned   = Math.max(chartEarnedSum  * 1.001, CHART_BAC);
  const chartBandHiEnd   = chartEAC * 1.08;
  const chartBandLoEnd   = Math.max(chartActualSum * 1.001, chartEAC * 0.92);

  // Map model P50 shape (actd → bac) to chart scale (chartActualSum → chartEAC)
  const modelRange = forecast.bac - forecast.actd || 1;
  function shapeProgress(gridArr, m) {
    const frac = (m + 0.5) / CHART_LABELS.length;
    const gIdx = Math.round(Math.min(frac, 1) * (GRID_N - 1));
    return Math.max(0, Math.min(1, (gridArr[gIdx] - forecast.actd) / modelRange));
  }

  const projActual   = Array(CHART_LABELS.length).fill(null);
  const projIncurred = Array(CHART_LABELS.length).fill(null);
  const projEarned   = Array(CHART_LABELS.length).fill(null);
  const bandHi       = Array(CHART_LABELS.length).fill(null);
  const bandLo       = Array(CHART_LABELS.length).fill(null);

  projActual[TODAY_IDX]   = chartActualSum;
  projIncurred[TODAY_IDX] = chartIncurredSum;
  projEarned[TODAY_IDX]   = chartEarnedSum;
  bandHi[TODAY_IDX]       = chartActualSum;
  bandLo[TODAY_IDX]       = chartActualSum;

  for (let m = TODAY_IDX + 1; m < CHART_LABELS.length; m++) {
    const prog = shapeProgress(forecast.p50, m);
    projActual[m]   = chartActualSum   + (chartEAC         - chartActualSum)   * prog;
    projIncurred[m] = chartIncurredSum + (chartEACIncurred  - chartIncurredSum) * prog;
    projEarned[m]   = chartEarnedSum   + (chartEACEarned    - chartEarnedSum)   * prog;

    const hiProg = shapeProgress(forecast.pHi, m);
    const loProg = shapeProgress(forecast.pLo, m);
    bandHi[m] = chartActualSum + (chartBandHiEnd - chartActualSum) * hiProg;
    bandLo[m] = chartActualSum + (chartBandLoEnd - chartActualSum) * loProg;
  }

  AI_PROJ_ACTUAL = projActual; // save so band can re-anchor as slider moves

  scurveChart.data.datasets[8].data  = bandHi;
  scurveChart.data.datasets[9].data  = bandLo;
  scurveChart.data.datasets[13].data = projActual;
  scurveChart.data.datasets[14].data = projIncurred;
  scurveChart.data.datasets[15].data = projEarned;
  scurveChart.update('active');
}

function _updateKpiFromForecast(impliedEAC, neighbors) {
  const overrunRatio = impliedEAC / FOCAL.budgetAmount;
  const chartEAC     = CHART_BAC * overrunRatio;
  const varPct       = (chartEAC - CHART_BAC) / CHART_BAC * 100;
  const chartActualSum = SIM_ACTUALS.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0);

  // EAC card
  const eacEl    = document.getElementById('m-eac');
  const eacSubEl = document.getElementById('m-eac-sub');
  if (eacEl) eacEl.textContent = '$' + chartEAC.toFixed(1) + 'M';
  if (eacSubEl) {
    const sign   = varPct >= 0 ? '+' : '';
    const varCls = varPct > 1 ? 'sc-metric-over' : varPct < -1 ? 'sc-metric-under' : '';
    eacSubEl.innerHTML = `Budget: $${CHART_BAC.toFixed(1)}M · <span class="${varCls}">${sign}${varPct.toFixed(2)}%</span>`;
  }

  // % Complete
  const pctEl    = document.getElementById('m-pct');
  const pctSubEl = document.getElementById('m-pct-sub');
  const pct      = chartEAC > 0 ? (chartActualSum / chartEAC) * 100 : 0;
  if (pctEl) pctEl.textContent = pct.toFixed(1) + '%';
  if (pctSubEl) pctSubEl.textContent = `Actuals to date: $${chartActualSum.toFixed(1)}M`;

  // Completion date
  const overrunMonths   = Math.max(0, Math.round((overrunRatio - 1) * FOCAL.durationMonths));
  const completionIdx   = Math.min(MONTH_CALENDAR.length - 1, SCHEDULED_END_IDX + overrunMonths);
  const completionEl    = document.getElementById('m-completion');
  const completionSubEl = document.getElementById('m-completion-sub');
  if (completionEl) completionEl.textContent = MONTH_CALENDAR[completionIdx];
  if (completionSubEl) {
    const delayCls = overrunMonths > 0 ? 'sc-metric-over' : 'sc-metric-under';
    const delayStr = overrunMonths > 0 ? `+${overrunMonths} mo.` : 'On schedule';
    completionSubEl.innerHTML = `Scheduled: ${MONTH_CALENDAR[SCHEDULED_END_IDX]} · <span class="${overrunMonths !== 0 ? delayCls : ''}">${delayStr}</span>`;
  }

  // Confidence pill + similar-accounts count
  const n      = neighbors.length;
  const sims   = neighbors.map(x => x.adjSim);
  const medSim = sims.length ? sims.slice().sort((a, b) => a - b)[Math.floor(sims.length / 2)] : 0;
  const confPct = Math.round(medSim * 100);
  const level   = confPct >= 70 ? 'High' : confPct >= 50 ? 'Medium' : 'Low';

  const confEl = document.querySelector('.sc-high-confidence-pill');
  if (confEl) {
    confEl.textContent = `${level} confidence: ${confPct}%`;
    const [bg, border, color] = confPct >= 70
      ? ['#f0fdf4', '#86efac', '#15803d']
      : confPct >= 50
        ? ['#fef3c7', '#fde68a', '#92400e']
        : ['#fef2f2', '#fca5a5', '#991b1b'];
    Object.assign(confEl.style, { background: bg, borderColor: border, color });
  }

  const simEl = document.querySelector('.sc-similar-accts');
  if (simEl) simEl.textContent = `${n} similar account${n !== 1 ? 's' : ''}`;
}

function _renderSummaryPills() {
  const pills = document.getElementById('scAiDriverPills');
  if (!pills) return 0;
  const pcts = _groupPctsSum100();
  pills.innerHTML = DRIVER_GROUPS.map((g, gi) =>
    pcts[gi] > 0 ? _buildDriverPill(g, pcts[gi]) : ''
  ).join('');
}

function _updateBannerFromForecast(neighbors) {
  _renderSummaryPills();
}

function _updateExplanationFromForecast(forecast, neighbors, lifecyclePct, impliedEAC) {
  const box = document.querySelector('.sc-forecast-exp-box');
  if (!box) return;

  const exp         = buildForecastExplanation(neighbors, lifecyclePct);
  const n           = neighbors.length;
  const sims        = neighbors.map(x => x.adjSim);
  const medSim      = sims.length ? sims.slice().sort((a, b) => a - b)[Math.floor(sims.length / 2)] : 0;
  const chartEAC    = (CHART_BAC * impliedEAC / FOCAL.budgetAmount).toFixed(1);
  const chartActual = SIM_ACTUALS.slice(0, TODAY_IDX + 1).reduce((a, b) => a + (b || 0), 0).toFixed(1);
  const topIds      = neighbors.slice(0, 3).map(x => x.pool.id).join(', ');

  box.textContent = `Forecast based on ${n} matched account${n !== 1 ? 's' : ''} from the internal project database (private data only). `
    + `Top matches: ${topIds}. Median similarity: ${(medSim * 100).toFixed(0)}%. `
    + `${exp.confidence} confidence — ${exp.confidence === 'HIGH' ? 'strong lifecycle position and match quality' : exp.confidence === 'MEDIUM' ? 'moderate lifecycle position or match quality' : 'early lifecycle — limited observed spend data'}. `
    + `Gower distance matching across ${Object.values(ACTIVE_WEIGHTS).filter(v => v > 0).length} active features. `
    + `Actuals to date: $${chartActual}M → Implied EAC: $${chartEAC}M (${((impliedEAC / FOCAL.budgetAmount - 1) * 100).toFixed(1)}% vs budget).`;

  // Brief highlight to signal update
  box.style.background = '#dbeafe';
  box.style.transition = 'background 0.6s ease';
  setTimeout(() => { box.style.background = ''; box.style.transition = ''; }, 900);
}

window.toggleAcc = function(id) {
  const section = document.getElementById(id);
  if (!section) return;
  const body = document.getElementById(id + '-body');
  const chevron = section.querySelector('.sc-acc-chevron');
  const header = section.querySelector('.sc-acc-header');
  const isOpen = header.getAttribute('aria-expanded') === 'true';

  if (isOpen) {
    body.style.display = 'none';
    chevron.className = 'pi pi-chevron-right sc-acc-chevron';
    header.setAttribute('aria-expanded', 'false');
    section.classList.add('sc-acc-section--collapsed');
  } else {
    body.style.display = '';
    chevron.className = 'pi pi-chevron-down sc-acc-chevron';
    header.setAttribute('aria-expanded', 'true');
    section.classList.remove('sc-acc-section--collapsed');
    // Lazy-init content
    if (id === 'acc-drivers') initDriverSettingsContent();
    if (id === 'acc-appendix') initAppendixContent();
    if (id === 'acc-warnings') initWarningsContent();
  }
};

window.toggleAcctDropdown = function() {
  const dropdown = document.getElementById('acctDropdown');
  const btn = document.getElementById('acctSelectorBtn');
  if (!dropdown) return;
  const isOpen = dropdown.style.display !== 'none';
  dropdown.style.display = isOpen ? 'none' : 'block';
  btn && btn.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) {
    const search = document.getElementById('acctSearch');
    if (search) { search.value = ''; filterAcctDropdown(''); }
    setTimeout(() => { const s = document.getElementById('acctSearch'); if (s) s.focus(); }, 30);
  }
};

window.filterAcctDropdown = function(query) {
  const q = (query || '').trim().toLowerCase();
  const items = document.querySelectorAll('#acctDropdown .sc-acct-drop-item');
  let visible = 0;
  items.forEach(item => {
    const match = !q || item.textContent.toLowerCase().includes(q);
    item.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  const noResults = document.getElementById('acctDropNoResults');
  if (noResults) noResults.style.display = visible === 0 ? '' : 'none';
};

document.addEventListener('click', e => {
  if (!e.target.closest('#acctSelectorWrap')) {
    const d = document.getElementById('acctDropdown');
    if (d) d.style.display = 'none';
    const sBtn = document.getElementById('acctSelectorBtn');
    if (sBtn) sBtn.setAttribute('aria-expanded', 'false');
  }
  if (!e.target.closest('#kebabWrap')) {
    const d = document.getElementById('kebabDropdown');
    if (d) d.style.display = 'none';
    const btn = document.getElementById('kebabBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  if (!e.target.closest('#lineMoreWrap')) {
    const d = document.getElementById('lineMoreDropdown');
    if (d) d.style.display = 'none';
    const btn = document.getElementById('lineMoreBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
  if (!e.target.closest('#dateRangeWrap')) {
    const d = document.getElementById('dateRangePop');
    if (d) d.style.display = 'none';
    const btn = document.getElementById('dateRangeBtn');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  }
});

window.toggleKebabMenu = function() {
  const dropdown = document.getElementById('kebabDropdown');
  const btn = document.getElementById('kebabBtn');
  if (!dropdown) return;
  const isOpen = dropdown.style.display !== 'none';
  dropdown.style.display = isOpen ? 'none' : 'block';
  btn && btn.setAttribute('aria-expanded', String(!isOpen));
};

/* ── SWITCH USER MODAL ───────────────────────────────────────────── */
const USERS = [
  {
    id: 'sarah', initials: 'SC', name: 'Sarah Chen', role: 'Project manager', color: '#6366f1',
    perms: { runForecast: true, modifyWeights: false, configureGroups: false, exportData: true, changeAccount: true }
  },
  {
    id: 'michael', initials: 'MT', name: 'Michael Torres', role: 'Cost engineer', color: '#0891b2',
    perms: { runForecast: true, modifyWeights: true, configureGroups: false, exportData: true, changeAccount: true }
  },
  {
    id: 'david', initials: 'DP', name: 'David Park', role: 'Project controls director', color: '#7c3aed',
    perms: { runForecast: false, modifyWeights: false, configureGroups: false, exportData: true, changeAccount: false }
  },
  {
    id: 'admin', initials: 'AU', name: 'Admin User', role: 'Super user', color: '#dc2626',
    perms: { runForecast: true, modifyWeights: true, configureGroups: true, exportData: true, changeAccount: true }
  },
  {
    id: 'jennifer', initials: 'JL', name: 'Jennifer Lee', role: 'Read only', color: '#64748b',
    perms: { runForecast: false, modifyWeights: false, configureGroups: false, exportData: false, changeAccount: false }
  }
];

const PERM_LABELS = [
  { key: 'runForecast',    label: 'Run AI forecast' },
  { key: 'modifyWeights',  label: 'Modify feature weights' },
  { key: 'configureGroups',label: 'Configure group codes' },
  { key: 'exportData',     label: 'Export data' },
  { key: 'changeAccount',  label: 'Change account' }
];

let ACTIVE_USER = USERS.find(u => u.id === 'admin');

window.openSwitchUserModal = function() {
  const dropdown = document.getElementById('kebabDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const btn = document.getElementById('kebabBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');

  const overlay = document.createElement('div');
  overlay.className = 'sc-modal-overlay';
  overlay.id = 'switchUserOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Switch user');

  overlay.innerHTML = `
    <div class="sc-modal" id="switchUserModal">
      <div class="sc-modal-header">
        <div class="sc-modal-title"><i class="pi pi-users"></i> Switch user</div>
        <button class="sc-modal-close" onclick="closeSwitchUserModal()" aria-label="Close"><i class="pi pi-times"></i></button>
      </div>
      <div class="sc-modal-body">
        <p class="sc-modal-subtitle">Select a user to preview the forecasting page with their role permissions applied.</p>
        <div class="sc-user-cards-grid">
          ${USERS.map(u => `
            <div class="sc-ucard${u.id === ACTIVE_USER.id ? ' sc-ucard--active' : ''}" onclick="switchToUser('${u.id}')" role="button" tabindex="0" aria-pressed="${u.id === ACTIVE_USER.id}">
              ${u.id === ACTIVE_USER.id ? '<span class="sc-ucard--active-badge">Active</span>' : ''}
              <div class="sc-ucard-avatar" style="background:${u.color}">${u.initials}</div>
              <div class="sc-ucard-name">${u.name}</div>
              <div class="sc-ucard-role">${u.role}</div>
              <div class="sc-ucard-perms">
                ${PERM_LABELS.map(p => `
                  <div class="sc-ucard-perm ${u.perms[p.key] ? 'sc-ucard-perm--allow' : 'sc-ucard-perm--deny'}">
                    <i class="pi ${u.perms[p.key] ? 'pi-check-circle' : 'pi-times-circle'}"></i>
                    <span class="sc-ucard-perm-label">${p.label}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeSwitchUserModal();
  });

  document.addEventListener('keydown', _modalEscHandler);
  document.body.appendChild(overlay);
};

function _modalEscHandler(e) {
  if (e.key === 'Escape') closeSwitchUserModal();
}

window.closeSwitchUserModal = function() {
  const overlay = document.getElementById('switchUserOverlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', _modalEscHandler);
};

window.switchToUser = function(id) {
  const user = USERS.find(u => u.id === id);
  if (!user) return;
  ACTIVE_USER = user;
  closeSwitchUserModal();
  applyUserPermissions(user);
  updateRoleBanner(user);
};

function applyUserPermissions(user) {
  const p = user.perms;

  // Run AI Forecast button
  const runBtn = document.querySelector('.sc-run-btn');
  if (runBtn) {
    runBtn.disabled = !p.runForecast;
    runBtn.title = p.runForecast ? '' : 'Your role does not have permission to run AI forecasts';
    runBtn.style.opacity = p.runForecast ? '' : '0.5';
  }

  // Account selector button
  const acctBtn = document.getElementById('acctSelectorBtn');
  if (acctBtn) {
    acctBtn.disabled = !p.changeAccount;
    acctBtn.style.opacity = p.changeAccount ? '' : '0.55';
    acctBtn.style.cursor = p.changeAccount ? '' : 'not-allowed';
    acctBtn.title = p.changeAccount ? '' : 'Your role cannot change the account';
    const chevron = acctBtn.querySelector('i');
    if (chevron) {
      chevron.className = p.changeAccount ? 'pi pi-chevron-down sc-acct-chevron' : 'pi pi-lock sc-acct-chevron';
    }
  }

  // Export gate flag (checked in kebabExportExcel)
  window._canExport = p.exportData;

  // Lock badge on Settings accordion header
  _updateSettingsAccLockBadge(user);

  // Apply restrictions within settings panel (if already built)
  _applySettingsPermissions(user);
}

function _updateSettingsAccLockBadge(user) {
  const header = document.querySelector('#acc-drivers .sc-acc-title');
  if (!header) return;
  const existing = header.querySelector('.sc-acc-lock-badge');
  if (existing) existing.remove();
  const p = user.perms;
  const locked = !p.modifyWeights || !p.configureGroups;
  if (locked && user.id !== 'admin') {
    const badge = document.createElement('span');
    badge.className = 'sc-acc-lock-badge';
    badge.innerHTML = '<i class="pi pi-lock"></i> Read-only';
    header.appendChild(badge);
  }
}

function _applySettingsPermissions(user) {
  const container = document.getElementById('driver-settings-container');
  if (!container || !container.dataset.built) return;
  const p = user.perms;

  // Remove any existing notice first
  const prev = container.querySelector('.sc-perm-notice');
  if (prev) prev.remove();

  // Insert restriction notice at top if user has any settings restriction
  if (user.id !== 'admin' && (!p.modifyWeights || !p.configureGroups)) {
    const notice = document.createElement('div');
    notice.className = 'sc-perm-notice';
    let msg = '';
    if (!p.modifyWeights && !p.configureGroups) {
      msg = `All settings are <strong>read-only</strong> for the <em>${user.role}</em> role. You can view weights and configuration but cannot make changes.`;
    } else if (!p.modifyWeights) {
      msg = `Feature weights (sliders) are <strong>read-only</strong> for the <em>${user.role}</em> role. Group code configuration is not restricted.`;
    } else {
      msg = `Group code configuration is <strong>restricted</strong> for the <em>${user.role}</em> role. Feature weights can still be adjusted.`;
    }
    notice.innerHTML = `<i class="pi pi-lock" style="flex-shrink:0;margin-top:1px"></i><span>${msg}</span>`;
    container.insertBefore(notice, container.firstChild);
  }

  // Classification Groups section — lock based on configureGroups.
  // Sections are looked up by data-sec (not position) so reordering the
  // settings layout doesn't reshuffle which section gets which permission.
  const catSection = container.querySelector('.sc-settings-section[data-sec="classification"]');
  if (catSection) {
    const canEdit = p.configureGroups;
    catSection.querySelectorAll('.sc-weight-slider, .sc-settings-weight-val').forEach(s => { s.disabled = !canEdit; });
    catSection.style.opacity = canEdit ? '' : '0.6';
    let secLock = catSection.querySelector('.sc-section-lock');
    if (!canEdit) {
      if (!secLock) {
        secLock = document.createElement('span');
        secLock.className = 'sc-section-lock';
        secLock.innerHTML = '<i class="pi pi-lock"></i> Restricted';
        const hdr = catSection.querySelector('.sc-settings-section-header');
        if (hdr) hdr.appendChild(secLock);
      }
    } else {
      if (secLock) secLock.remove();
    }
  }

  // Numerical Features section — cost element breakdown toggle (needs configureGroups)
  const costToggle = document.getElementById('toggleCostBreakdown');
  if (costToggle) costToggle.disabled = !p.configureGroups;

  // All other sliders (Numerical, SPI/CPI, Shape) — controlled by modifyWeights
  const numSection   = container.querySelector('.sc-settings-section[data-sec="numerical"]');
  const evm          = container.querySelector('.sc-settings-section[data-sec="spi"]');
  const shapeSection = container.querySelector('.sc-settings-section[data-sec="shape"]');
  [numSection, evm, shapeSection].forEach(sec => {
    if (!sec) return;
    sec.querySelectorAll('.sc-weight-slider, .sc-settings-weight-val').forEach(s => { s.disabled = !p.modifyWeights; });
    sec.style.opacity = p.modifyWeights ? '' : '0.6';
    const toggle = sec.querySelector('input[type="checkbox"]:not(#toggleCostBreakdown)');
    if (toggle) toggle.disabled = !p.modifyWeights;
    let secLock = sec.querySelector('.sc-section-lock');
    if (!p.modifyWeights) {
      if (!secLock) {
        secLock = document.createElement('span');
        secLock.className = 'sc-section-lock';
        secLock.innerHTML = '<i class="pi pi-lock"></i> Restricted';
        const hdr = sec.querySelector('.sc-settings-section-header');
        if (hdr) hdr.appendChild(secLock);
      }
    } else {
      if (secLock) secLock.remove();
    }
  });

  // Reset button
  const resetBtn = container.querySelector('[onclick="resetSettingsWeights()"]');
  if (resetBtn) {
    resetBtn.disabled = !p.modifyWeights;
    resetBtn.style.opacity = p.modifyWeights ? '' : '0.45';
  }

  // Numerical section summary banner — read-only label when restricted
  const numSummary = document.getElementById('num-applied-summary');
  const existingReadOnly = numSummary && numSummary.querySelector('.sc-perm-readonly-tag');
  if (numSummary) {
    if (!p.modifyWeights && !existingReadOnly) {
      const tag = document.createElement('span');
      tag.className = 'sc-perm-readonly-tag';
      tag.innerHTML = ' &nbsp;<i class="pi pi-lock"></i> read-only';
      numSummary.appendChild(tag);
    } else if (p.modifyWeights && existingReadOnly) {
      existingReadOnly.remove();
    }
  }
}

function updateRoleBanner(user) {
  const toolbar = document.querySelector('.sc-toolbar');
  if (!toolbar) return;

  const existing = document.getElementById('sc-role-banner');
  if (existing) existing.remove();

  if (user.id === 'admin') return; // super user — no restriction banner

  const restrictions = PERM_LABELS
    .filter(p => !user.perms[p.key])
    .map(p => p.label.toLowerCase());

  let bannerClass = 'sc-role-banner';
  let icon = 'pi-user';
  if (restrictions.length >= 4) {
    bannerClass += ' sc-role-banner--danger';
    icon = 'pi-lock';
  } else if (restrictions.length >= 2) {
    bannerClass += ' sc-role-banner--warning';
    icon = 'pi-exclamation-triangle';
  }

  const restrictionText = restrictions.length
    ? `Restricted: ${restrictions.join(', ')}.`
    : 'Full access.';

  const banner = document.createElement('div');
  banner.id = 'sc-role-banner';
  banner.className = bannerClass;
  banner.innerHTML = `
    <i class="pi ${icon}"></i>
    <span>Viewing as <strong>${user.name}</strong> (${user.role}) — ${restrictionText}</span>
    <div class="sc-role-banner-actions">
      <button class="sc-kebab-item" style="padding:8px var(--space-4);font-size:13px;font-weight:var(--font-weight-bold);gap:var(--space-1half);border-radius:var(--radius-md);border:1px solid currentColor;background:transparent;cursor:pointer;width:auto" onclick="openSwitchUserModal()">
        Switch user
      </button>
    </div>
  `;

  toolbar.insertAdjacentElement('afterend', banner);
}

window.kebabOpenSettings = function() {
  openSettingsModal();
};

/* ── PDF EXPORT ──────────────────────────────────────────────────── */

const EXPORT_REPORT_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,system-ui,sans-serif;font-size:12px;color:#111827;background:#fff;padding:0}
  @page{size:A4 landscape;margin:15mm 12mm}
  @media print{.no-print{display:none!important}}
  .page{padding:24px 28px;max-width:1100px;margin:0 auto}
  h1{font-size:20px;font-weight:800;color:#1e3a8a;margin-bottom:2px}
  h2{font-size:13px;font-weight:700;color:#1e3a8a;margin:18px 0 8px;border-bottom:2px solid #dbeafe;padding-bottom:4px}
  h3{font-size:11px;font-weight:700;color:#374151;margin:12px 0 6px}
  .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid #1e3a8a}
  .header-left h1{font-size:22px}
  .header-left .ca-label{font-size:13px;color:#3b82f6;font-weight:600;margin-top:2px}
  .header-left .subtitle{font-size:11px;color:#6b7280;margin-top:1px}
  .header-right{text-align:right;font-size:11px;color:#6b7280;line-height:1.6}
  .header-right strong{display:block;font-size:12px;color:#111827}
  .section{margin-bottom:6px}
  .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}
  .kpi-card{border:1px solid #e5e7eb;border-radius:8px;padding:10px 12px;background:#f9fafb}
  .kpi-label{font-size:10px;color:#6b7280;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-bottom:3px}
  .kpi-value{font-size:20px;font-weight:800;color:#111827;margin-bottom:2px}
  .kpi-value.warn{color:#d97706}
  .kpi-sub{font-size:10px;color:#6b7280}
  .over{color:#dc2626;font-weight:600}
  .under{color:#059669;font-weight:600}
  .ai-banner{background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px 14px;margin-bottom:18px;display:flex;align-items:center;flex-wrap:wrap;gap:8px}
  .ai-active-tag{background:#1d4ed8;color:#fff;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;letter-spacing:.04em}
  .ai-conf{background:#f0fdf4;border:1px solid #86efac;color:#15803d;border-radius:12px;padding:2px 10px;font-size:10px;font-weight:700}
  .ai-sim{font-size:10px;color:#6b7280}
  .pill{background:#dbeafe;color:#1e3a8a;border-radius:10px;padding:1px 8px;font-size:10px;font-weight:600;display:inline-block;margin:1px}
  .sim-badge{background:#7c3aed;color:#fff;border-radius:4px;padding:2px 8px;font-size:10px;font-weight:700;margin-left:4px}
  .chart-box{border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:18px;background:#fff}
  .chart-box img{width:100%;height:auto;display:block}
  .exp-box{background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 14px;font-size:11px;line-height:1.6;color:#374151;margin-bottom:18px}
  table{width:100%;border-collapse:collapse;font-size:11px}
  th{background:#1e3a8a;color:#fff;padding:5px 8px;text-align:left;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.04em}
  th.r{text-align:right}
  td{border-bottom:1px solid #f3f4f6;color:#374151;vertical-align:middle}
  .footer{margin-top:24px;padding-top:10px;border-top:1px solid #e5e7eb;display:flex;justify-content:space-between;font-size:10px;color:#9ca3af}
  .tag{display:inline-block;background:#f3f4f6;border-radius:4px;padding:1px 7px;font-size:10px;color:#374151;margin-right:4px}
  .empty-msg{padding:60px 20px;text-align:center;color:#9ca3af;font-size:13px}
`;

// Snapshot all live values the report needs (chart image must be read before any new window opens)
function _gatherExportData() {
  const canvas = document.getElementById('scurve-chart');
  const now = new Date();

  const weightDefs = [
    { group: 'Classification groups', rows: [
      { key: 'phase_type',    label: 'Phase type'   }, { key: 'discipline',    label: 'Discipline'   },
      { key: 'work_type',     label: 'Work type'    }, { key: 'proj_size_cat', label: 'Project size' },
      { key: 'acct_size_cat', label: 'Account size' }, { key: 'region',        label: 'Region'       },
    ]},
    { group: 'Numerical features', rows: [
      { key: 'duration_months',  label: 'Duration (months)' }, { key: 'budget_amount',    label: 'Budget amount'     },
      { key: 'budget_per_month', label: 'Budget / month'    }, { key: 'acct_pct_project', label: 'Acct % of project' },
      { key: 'labor_mix',        label: 'Labor mix'         }, { key: 'material_mix',     label: 'Material mix'      },
      { key: 'equip_mix',        label: 'Equipment mix'     }, { key: 'subcontract_mix',  label: 'Subcontract mix'   },
    ]},
    { group: 'Curve shape', rows: [
      { key: 'skewness',         label: 'Skewness'         }, { key: 'front_load_ratio', label: 'Front-load ratio' },
      { key: 'gini',             label: 'Gini coefficient' }, { key: 'peak_period_norm', label: 'Peak period'      },
      { key: 'kurtosis',         label: 'Kurtosis'         },
    ]},
  ];
  const totalW = getTotalWeight();
  const weightRows = weightDefs.map(g => {
    const rows = g.rows.map(r => {
      const v = ACTIVE_WEIGHTS[r.key] ?? 0;
      const contrib = totalW > 0 ? ((v / totalW) * 100).toFixed(1) : '0.0';
      const bar = Math.round((v / 5) * 100);
      return `<tr>
        <td style="padding:4px 8px;color:#374151">${r.label}</td>
        <td style="padding:4px 8px;text-align:center;font-weight:600;color:${v === 0 ? '#9ca3af' : '#1d4ed8'}">${v.toFixed(1)}</td>
        <td style="padding:4px 8px;text-align:center;color:#6b7280">${contrib}%</td>
        <td style="padding:4px 8px"><div style="height:6px;border-radius:3px;background:#e5e7eb;width:100%"><div style="height:6px;border-radius:3px;background:${v === 0 ? '#e5e7eb' : '#3b82f6'};width:${bar}%"></div></div></td>
      </tr>`;
    }).join('');
    return `<tr><td colspan="4" style="padding:8px 8px 2px;font-weight:700;font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;background:#f9fafb">${g.group}</td></tr>${rows}`;
  }).join('');

  const spendRows = CHART_LABELS.map((lbl, i) => {
    const isToday = i === TODAY_IDX;
    const bg = isToday ? '#dbeafe' : i % 2 === 0 ? '#f9fafb' : '#fff';
    const fmt = v => (v == null ? '—' : '$' + v.toFixed(2) + 'M');
    return `<tr style="background:${bg}${isToday ? ';font-weight:600' : ''}">
      <td style="padding:3px 8px;white-space:nowrap">${MONTH_CALENDAR[i]}${isToday ? ' ◀' : ''}</td>
      <td style="padding:3px 8px;text-align:right">${fmt(ACTIVE_BAR_DATA.baseline[i])}</td>
      <td style="padding:3px 8px;text-align:right">${fmt(ACTIVE_BAR_DATA.actuals[i])}</td>
      <td style="padding:3px 8px;text-align:right">${fmt(ACTIVE_BAR_DATA.earned[i])}</td>
      <td style="padding:3px 8px;text-align:right">${fmt(ACTIVE_BAR_DATA.incurred[i])}</td>
      <td style="padding:3px 8px;text-align:right">${fmt(ACTIVE_BAR_DATA.commitment[i])}</td>
    </tr>`;
  }).join('');

  return {
    chartImg: canvas ? canvas.toDataURL('image/png') : '',
    eac:        document.getElementById('m-eac')?.textContent        || '—',
    pct:        document.getElementById('m-pct')?.textContent        || '—',
    pctSub:     document.getElementById('m-pct-sub')?.textContent    || '',
    cpiSpi:     document.getElementById('m-cpispi')?.textContent     || '—',
    completion: document.getElementById('m-completion')?.textContent || '—',
    compSub:    document.getElementById('m-completion-sub')?.textContent || '',
    eacSub:     document.getElementById('m-eac-sub')?.textContent    || '',
    cpiSub:     document.getElementById('m-cpispi')?.closest('.sc-metric-card')?.querySelector('.sc-metric-sub')?.textContent || '',
    confPill:   document.querySelector('.sc-high-confidence-pill')?.textContent || '',
    simAccts:   document.querySelector('.sc-similar-accts')?.textContent || '',
    driverPills:[...document.querySelectorAll('.sc-driver-pill')].map(p => p.textContent).join(' · '),
    expText:    document.querySelector('.sc-forecast-exp-box')?.textContent || '',
    caLabel:    (document.getElementById('acctSelectorBtn')?.textContent || '').trim().replace(/\s*$/, '').replace(/<[^>]+>/g, '').trim(),
    subtitle:   document.querySelector('.sc-page-subtitle')?.textContent || '',
    simMonth:   document.getElementById('scTsMonth')?.textContent || '',
    isSimulated:document.getElementById('scTsSimBadge')?.style.display !== 'none',
    weightRows, spendRows,
    dateStr: now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    timeStr: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

// Selectable report sections — left list ↔ rendered output
const EXPORT_SECTIONS = [
  { id: 'kpi', label: 'Key performance indicators', icon: 'pi-th-large', desc: 'EAC, % complete, CPI / SPI, forecast completion',
    render: d => `<div class="section"><h2>Key performance indicators</h2>
      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-label">Est. at completion (EAC)</div><div class="kpi-value">${d.eac}</div><div class="kpi-sub">${d.eacSub.replace(/\+/g,'<span class="over">+').replace(/%/,'%</span>')}</div></div>
        <div class="kpi-card"><div class="kpi-label">% Complete (actuals)</div><div class="kpi-value">${d.pct}</div><div class="kpi-sub">${d.pctSub}</div></div>
        <div class="kpi-card"><div class="kpi-label">CPI / SPI</div><div class="kpi-value warn">${d.cpiSpi}</div><div class="kpi-sub">${d.cpiSub}</div></div>
        <div class="kpi-card"><div class="kpi-label">Forecast completion</div><div class="kpi-value">${d.completion}</div><div class="kpi-sub">${d.compSub}</div></div>
      </div></div>` },
  { id: 'banner', label: 'AI forecast banner', icon: 'pi-sparkles', desc: 'Confidence, similar accounts, driver mix',
    render: d => `<div class="section"><div class="ai-banner">
      <span class="ai-active-tag">${AI_FORECAST_ACTIVE ? 'AI forecast active' : 'Standard forecast'}</span>
      <span class="ai-conf">${d.confPill}</span>
      <span class="ai-sim">${d.simAccts}</span>
      <span style="font-size:10px;color:#6b7280;margin-left:4px">Driven by:</span>
      ${d.driverPills.split(' · ').filter(Boolean).map(p => `<span class="pill">${p}</span>`).join('')}
      ${d.isSimulated ? `<span class="sim-badge">Simulated: ${d.simMonth}</span>` : ''}
    </div></div>` },
  { id: 'chart', label: 'S-curve chart', icon: 'pi-chart-line', desc: 'Cumulative forecast curve image',
    render: d => `<div class="section"><h2>S-curve</h2><div class="chart-box">
      ${d.chartImg ? `<img src="${d.chartImg}" alt="S-curve chart"/>` : '<div style="height:200px;display:flex;align-items:center;justify-content:center;color:#9ca3af">Chart not available</div>'}
    </div></div>` },
  { id: 'methodology', label: 'Forecast methodology', icon: 'pi-book', desc: 'Narrative explanation of the forecast',
    render: d => `<div class="section"><h2>Forecast methodology</h2><div class="exp-box">${d.expText}</div></div>` },
  { id: 'spend', label: 'Periodic spend data', icon: 'pi-table', desc: 'Monthly baseline / actuals / earned / incurred / commitment',
    render: d => `<div class="section"><h2>Periodic spend data ($M)</h2><table>
      <thead><tr><th>Period</th><th class="r">Baseline</th><th class="r">Actuals</th><th class="r">Earned value</th><th class="r">Incurred</th><th class="r">Commitment</th></tr></thead>
      <tbody>${d.spendRows}</tbody></table></div>` },
  { id: 'weights', label: 'AI matching driver weights', icon: 'pi-sliders-h', desc: 'Feature weights and matching summary',
    render: d => `<div class="section"><h2>AI matching driver weights</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div><table><thead><tr><th>Feature</th><th>Weight</th><th>Contribution</th><th style="width:80px">Relative</th></tr></thead><tbody>${d.weightRows}</tbody></table></div>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:14px">
          <h3>Matching summary</h3>
          <div style="margin-bottom:8px"><div style="font-size:10px;color:#6b7280;margin-bottom:2px">Active features</div><div style="font-size:14px;font-weight:700;color:#1e3a8a">${Object.values(ACTIVE_WEIGHTS).filter(v => v > 0).length} of ${Object.keys(ACTIVE_WEIGHTS).length}</div></div>
          <div style="margin-bottom:8px"><div style="font-size:10px;color:#6b7280;margin-bottom:2px">Total weight</div><div style="font-size:14px;font-weight:700;color:#1e3a8a">${getTotalWeight().toFixed(1)}</div></div>
          <div style="margin-bottom:8px"><div style="font-size:10px;color:#6b7280;margin-bottom:2px">Similar accounts matched</div><div style="font-size:14px;font-weight:700;color:#1e3a8a">${d.simAccts}</div></div>
          <div><div style="font-size:10px;color:#6b7280;margin-bottom:2px">Model confidence</div><div style="font-size:14px;font-weight:700;color:#15803d">${d.confPill}</div></div>
          <div style="margin-top:14px;border-top:1px solid #e5e7eb;padding-top:10px"><h3>Account info</h3>
            <div style="font-size:11px;line-height:1.8;color:#374151">
              <div><span class="tag">Phase</span> ${FOCAL.phase}</div>
              <div><span class="tag">Discipline</span> ${FOCAL.discipline}</div>
              <div><span class="tag">Work type</span> ${FOCAL.workType}</div>
              <div><span class="tag">Region</span> ${FOCAL.region}</div>
              <div><span class="tag">BAC</span> $${CHART_BAC.toFixed(1)}M</div>
              <div><span class="tag">Duration</span> ${CHART_LABELS.length} months</div>
            </div>
          </div>
        </div>
      </div></div>` },
];

function _exportHeaderHtml(d) {
  return `<div class="header">
    <div class="header-left">
      <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px">Contruent · Cisco Systems</div>
      <h1>S-curve forecast report</h1>
      <div class="ca-label">${d.caLabel}</div>
      <div class="subtitle">${d.subtitle}</div>
    </div>
    <div class="header-right">
      <strong>Generated ${d.dateStr}</strong>
      ${d.timeStr} · ${ACTIVE_USER.name} (${ACTIVE_USER.role})
      ${d.isSimulated ? `<br><span style="color:#7c3aed;font-weight:700">Simulated to ${d.simMonth}</span>` : `<br>As of ${d.simMonth}`}
      ${AI_FORECAST_ACTIVE ? '<br><span style="color:#1d4ed8;font-weight:700">AI forecast applied</span>' : ''}
    </div>
  </div>`;
}

function _exportReportDoc(d, selectedIds) {
  const body = EXPORT_SECTIONS.filter(s => selectedIds.includes(s.id)).map(s => s.render(d)).join('');
  const footer = `<div class="footer">
    <span>Contruent · S-curve forecasting · ${d.caLabel}</span>
    <span>Generated ${d.dateStr} at ${d.timeStr} by ${ACTIVE_USER.name} · CONFIDENTIAL</span>
  </div>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"/>
    <title>S-curve forecast report — ${d.caLabel}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/primeicons@7.0.0/primeicons.css"/>
    <style>${EXPORT_REPORT_CSS}</style></head><body>
    <div class="page">${_exportHeaderHtml(d)}${body || '<div class="empty-msg">No sections selected. Choose at least one item on the left to include in the report.</div>'}${footer}</div>
  </body></html>`;
}

// Module state for the export modal
let _exportData = null;
let _exportSel  = EXPORT_SECTIONS.map(s => s.id);

window.kebabExportExcel = function() { openExportModal(); }; // back-compat alias

window.openExportModal = function() {
  const dropdown = document.getElementById('kebabDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const kBtn = document.getElementById('kebabBtn');
  if (kBtn) kBtn.setAttribute('aria-expanded', 'false');
  if (window._canExport === false) { alert('Your role does not have permission to export data.'); return; }

  _exportData = _gatherExportData();
  _exportSel  = EXPORT_SECTIONS.map(s => s.id);

  const overlay = document.createElement('div');
  overlay.className = 'sc-modal-overlay';
  overlay.id = 'exportModalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Export to PDF');
  document.body.appendChild(overlay);
  _exportRenderSelectStep();
};

window.closeExportModal = function() {
  const overlay = document.getElementById('exportModalOverlay');
  if (overlay) overlay.remove();
};

// Step 1 — pick sections (left) + live preview (right)
function _exportRenderSelectStep() {
  const overlay = document.getElementById('exportModalOverlay');
  if (!overlay) return;
  const items = EXPORT_SECTIONS.map(s => {
    const on = _exportSel.includes(s.id);
    return `<label class="sc-exp-item${on ? ' is-on' : ''}">
      <input type="checkbox" ${on ? 'checked' : ''} onchange="exportToggle('${s.id}', this.checked)" />
      <i class="pi ${s.icon}"></i>
      <span class="sc-exp-item-text"><span class="sc-exp-item-label">${s.label}</span><span class="sc-exp-item-desc">${s.desc}</span></span>
    </label>`;
  }).join('');
  const allOn = _exportSel.length === EXPORT_SECTIONS.length;

  overlay.innerHTML = `
    <div class="sc-modal sc-export-modal">
      <div class="sc-modal-header">
        <div class="sc-modal-title"><i class="pi pi-file-pdf"></i> Export to PDF</div>
        <button class="sc-modal-close" onclick="closeExportModal()" aria-label="Close"><i class="pi pi-times"></i></button>
      </div>
      <div class="sc-export-body">
        <div class="sc-exp-left">
          <div class="sc-exp-left-head">
            <span>Include in report</span>
            <button type="button" class="sc-exp-selall" onclick="exportSelectAll(${allOn ? 'false' : 'true'})">${allOn ? 'Clear all' : 'Select all'}</button>
          </div>
          <div class="sc-exp-list">${items}</div>
        </div>
        <div class="sc-exp-right">
          <div class="sc-exp-preview-label">Preview <span id="exportSelCount"></span></div>
          <div class="sc-exp-preview-frame"><iframe id="exportPreviewFrame" title="Report preview"></iframe></div>
        </div>
      </div>
      <div class="sc-export-footer">
        <button class="btn btn-secondary" onclick="closeExportModal()">Cancel</button>
        <button class="btn btn-primary" id="exportNextBtn" onclick="exportGoFinal()">Confirm <i class="pi pi-arrow-right"></i></button>
      </div>
    </div>`;

  exportRefreshPreview();
}

function exportRefreshPreview() {
  const frame = document.getElementById('exportPreviewFrame');
  if (frame) frame.srcdoc = _exportReportDoc(_exportData, _exportSel);
  const count = document.getElementById('exportSelCount');
  if (count) count.textContent = `· ${_exportSel.length} of ${EXPORT_SECTIONS.length} section${_exportSel.length === 1 ? '' : 's'}`;
  const nextBtn = document.getElementById('exportNextBtn');
  if (nextBtn) nextBtn.disabled = _exportSel.length === 0;
}

window.exportToggle = function(id, on) {
  _exportSel = on ? [...new Set([..._exportSel, id])] : _exportSel.filter(x => x !== id);
  const cb = document.querySelector(`.sc-exp-item input[onchange*="'${id}'"]`);
  if (cb) cb.closest('.sc-exp-item').classList.toggle('is-on', on);
  const sel = document.querySelector('.sc-exp-selall');
  if (sel) {
    sel.textContent = _exportSel.length === EXPORT_SECTIONS.length ? 'Clear all' : 'Select all';
    sel.setAttribute('onclick', `exportSelectAll(${_exportSel.length === EXPORT_SECTIONS.length ? 'false' : 'true'})`);
  }
  exportRefreshPreview();
};

window.exportSelectAll = function(on) {
  _exportSel = on ? EXPORT_SECTIONS.map(s => s.id) : [];
  _exportRenderSelectStep();
};

// Step 2 — full-page final preview with Back + Export
window.exportGoFinal = function() {
  if (_exportSel.length === 0) return;
  const overlay = document.getElementById('exportModalOverlay');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="sc-modal sc-export-modal sc-export-modal--final">
      <div class="sc-modal-header">
        <div class="sc-modal-title"><i class="pi pi-file-pdf"></i> Export preview</div>
        <button class="sc-modal-close" onclick="closeExportModal()" aria-label="Close"><i class="pi pi-times"></i></button>
      </div>
      <div class="sc-exp-final-frame"><iframe id="exportFinalFrame" title="Final report preview"></iframe></div>
      <div class="sc-export-footer">
        <button class="btn btn-secondary" onclick="exportGoBack()"><i class="pi pi-arrow-left btn-icon-left"></i> Back</button>
        <button class="btn btn-primary" onclick="doExportPrint()"><i class="pi pi-download btn-icon-left"></i> Export</button>
      </div>
    </div>`;
  const frame = document.getElementById('exportFinalFrame');
  if (frame) frame.srcdoc = _exportReportDoc(_exportData, _exportSel);
};

window.exportGoBack = function() { _exportRenderSelectStep(); };

window.doExportPrint = function() {
  const html = _exportReportDoc(_exportData, _exportSel);
  const win = window.open('', '_blank', 'width=1200,height=850');
  if (!win) { alert('Please allow pop-ups to export the report.'); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
  closeExportModal();
};

function _buildAndMountSettings(container) {
  function sliderRow(key, label, desc, indent) {
    const v = ACTIVE_WEIGHTS[key] != null ? ACTIVE_WEIGHTS[key] : 1;
    const pct = (v / 5 * 100).toFixed(0) + '%';
    const indentStyle = indent ? 'padding-left:30px;' : '';
    return `<div class="sc-settings-feature-row" id="row-${key}" style="${indentStyle}${v === 0 ? 'opacity:0.45' : ''}">
      <div class="sc-settings-feat-info">
        <span class="sc-settings-feat-label">${label}</span>
        <span class="sc-settings-feat-desc">${desc}</span>
      </div>
      <div class="sc-settings-weight-control">
        <span class="sc-wval-wrap">
          <input type="number" class="sc-settings-weight-val" id="wval-${key}" min="0" max="5" step="0.1" value="${v.toFixed(1)}"
            onchange="weightValInput('${key}', this.value)" aria-label="Weight for ${label} (0–5)" />
          <span class="sc-wval-arrows">
            <button type="button" tabindex="-1" onclick="stepWeight('${key}', 0.1)" aria-label="Increase weight by 0.1"><i class="pi pi-chevron-up"></i></button>
            <button type="button" tabindex="-1" onclick="stepWeight('${key}', -0.1)" aria-label="Decrease weight by 0.1"><i class="pi pi-chevron-down"></i></button>
          </span>
        </span>
        <input type="range" class="sc-weight-slider" id="wslider-${key}" min="0" max="5" step="0.5" value="${v}"
          style="--fill-pct:${pct}"
          oninput="updateSettingsWeight('${key}', parseFloat(this.value))" />
      </div>
    </div>`;
  }

  function groupPoints(keys) {
    // Missing keys default to 1 — same default the sliders render with
    return keys.reduce((a, k) => a + (ACTIVE_WEIGHTS[k] != null ? ACTIVE_WEIGHTS[k] : 1), 0);
  }

  function numGroupHeader(label, id, keys) {
    return `<div onclick="toggleNumGroup('${id}')" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 14px;background:#fafbfc;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;user-select:none">
      <i class="pi pi-chevron-down" id="numgrp-chevron-${id}" style="font-size:10px;transition:transform .15s"></i>
      <span>${label}</span>
      <span data-pts-keys="${keys.join(',')}" style="margin-left:auto;font-size:10.5px;font-weight:600;color:#94a3b8;background:#eef2f7;border-radius:10px;padding:1px 8px">${groupPoints(keys).toFixed(1)} pts</span>
    </div>`;
  }

  // Admin context configures enterprise/standard defaults only — the
  // project-specific Module group is not shown there
  const catGroups = IS_ADMIN_CONTEXT
    ? CLASSIFICATION_GROUPS.filter(g => g.source !== 'Module')
    : CLASSIFICATION_GROUPS;

  // Section contribution % — same source as the "Driven by" pills (DRIVER_GROUPS order: classification, numerical, spi, shape)
  const secPcts = _groupPctsSum100();

  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px">
      <p style="font-size:13px;color:#64748b;margin:0">Adjust classification groups and feature weights used by the Gower distance matching algorithm. Changes apply immediately to all three forecast lines.</p>
      <button class="sc-settings-reset-btn" onclick="resetSettingsWeights()"><i class="pi pi-refresh"></i> Reset to defaults</button>
    </div>`;

  // Project learning pool — which historical projects feed the matcher.
  // Collapsible accordion pinned to the top; section lookups use data-sec so
  // order doesn't affect _applySettingsPermissions.
  const canPool = ACTIVE_USER.perms.configureGroups;
  const poolActive = LEARNING_PROJECTS.filter(p => p.included).length;
  html += `<div class="sc-settings-section sc-pool-section is-collapsed" data-sec="pool" id="learningPoolSection">
    <div class="sc-settings-section-header sc-pool-header" onclick="toggleLearningPoolSection()" role="button" tabindex="0" aria-expanded="false" aria-controls="learningPoolBody" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleLearningPoolSection();}">
      <i class="pi pi-chevron-down sc-pool-chevron"></i>
      <i class="pi pi-database"></i> Project learning pool
      <span class="sc-settings-section-pct" id="poolCountBadge">${poolActive} / ${LEARNING_PROJECTS.length}</span>
      <span class="sc-settings-section-desc">Historical projects the AI scans to find comparable control accounts. Unselect a project to exclude all of its accounts from matching and forecasting.</span>
    </div>
    <div class="sc-pool-body" id="learningPoolBody">
      <div class="sc-pool-toolbar">
        <span class="sc-pool-search"><i class="pi pi-search"></i><input type="text" placeholder="Search projects…" oninput="filterLearningProjects(this.value)" aria-label="Search learning pool projects" /></span>
        <label class="sc-pool-selectall"><input type="checkbox" id="poolSelectAll" ${poolActive === LEARNING_PROJECTS.length ? 'checked' : ''} ${canPool ? '' : 'disabled'} onchange="toggleAllLearningProjects(this.checked)" /> Select all</label>
      </div>
      <div class="sc-pool-list" id="learningPoolList">
        ${LEARNING_PROJECTS.map(p => _poolRowHtml(p, canPool)).join('')}
      </div>
      <div class="sc-pool-note"><i class="pi pi-info-circle" style="flex-shrink:0;margin-top:1px"></i> Excluded projects are skipped during the scan — their control accounts won't influence any of the three forecast lines.</div>
    </div>
  </div>`;

  // Section 1: Classification Groups
  html += `<div class="sc-settings-section" data-sec="classification">
    <div class="sc-settings-section-header is-toggle" onclick="toggleSettingsSection(this)" role="button" tabindex="0" aria-expanded="true" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleSettingsSection(this);}">
      <i class="pi pi-chevron-down sc-sec-chevron"></i>
      <i class="pi pi-tags"></i> Classification groups
      <span class="sc-settings-section-pct">${secPcts[0]}%</span>
      <span class="sc-settings-section-desc">Enterprise/standard group codes from control account ID and top 3 project groups. Driven by the key groupings associated with a Contruent project ID and control account ID — configurable per client during setup.</span>
    </div>
    <div style="background:#fff">
      <div style="display:grid;grid-template-columns:1fr 70px 160px;column-gap:10px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;padding:8px 14px;border-bottom:1px solid #f1f5f9;background:#fafbfc">
        <span>Group title</span><span style="text-align:center">Wt</span><span>Adjust</span>
      </div>
      ${catGroups.map((g, gi) => `
        <div onclick="toggleCatGroup(${gi})" style="cursor:pointer;display:flex;align-items:center;gap:8px;padding:9px 14px;background:#fafbfc;border-top:1px solid #f1f5f9;border-bottom:1px solid #f1f5f9;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;user-select:none">
          <i class="pi pi-chevron-down" id="catgrp-chevron-${gi}" style="font-size:10px;transition:transform .15s"></i>
          <span>${g.source}</span>
          <span data-pts-keys="${g.items.map(f => f.key).join(',')}" style="margin-left:auto;font-size:10.5px;font-weight:600;color:#94a3b8;background:#eef2f7;border-radius:10px;padding:1px 8px">${groupPoints(g.items.map(f => f.key)).toFixed(1)} pts</span>
        </div>
        <div id="catgrp-${gi}">
        ${g.items.map(f => {
          const v = ACTIVE_WEIGHTS[f.key] != null ? ACTIVE_WEIGHTS[f.key] : 1;
          return `<div style="display:grid;grid-template-columns:1fr 70px 160px;column-gap:10px;align-items:center;padding:9px 14px 9px 30px;border-bottom:1px solid #f8f9fb">
            <span style="font-size:12.5px;font-weight:600;color:#1a1a2e">${f.title}</span>
            <span class="sc-wval-wrap" style="justify-self:center">
              <input type="number" class="sc-settings-weight-val" id="wval-${f.key}" min="0" max="5" step="0.1" value="${v.toFixed(1)}"
                onchange="weightValInput('${f.key}', this.value)" aria-label="Weight for ${f.title} (0–5)" />
              <span class="sc-wval-arrows">
                <button type="button" tabindex="-1" onclick="stepWeight('${f.key}', 0.1)" aria-label="Increase weight by 0.1"><i class="pi pi-chevron-up"></i></button>
                <button type="button" tabindex="-1" onclick="stepWeight('${f.key}', -0.1)" aria-label="Decrease weight by 0.1"><i class="pi pi-chevron-down"></i></button>
              </span>
            </span>
            <input type="range" class="sc-weight-slider" id="wslider-${f.key}" min="0" max="5" step="0.5" value="${v}"
              style="width:140px;--fill-pct:${(v/5*100).toFixed(0)}%"
              oninput="updateSettingsWeight('${f.key}', parseFloat(this.value))" />
          </div>`;
        }).join('')}
        </div>
      `).join('')}
      ${IS_ADMIN_CONTEXT ? '' : `<div style="padding:10px 14px;background:#fafbfc;border-top:1px solid #f1f5f9;font-size:11.5px;color:#64748b;display:flex;align-items:flex-start;gap:6px">
        <i class="pi pi-info-circle" style="color:#6366f1;flex-shrink:0;margin-top:1px"></i>
        Project-specific module groups are matched within the same Contruent project ID only and do not cross-match with accounts from other projects.
      </div>`}
    </div>
  </div>`;

  // Section 2: Numerical Features
  html += `<div class="sc-settings-section" data-sec="numerical">
    <div class="sc-settings-section-header is-toggle" onclick="toggleSettingsSection(this)" role="button" tabindex="0" aria-expanded="true" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleSettingsSection(this);}">
      <i class="pi pi-chevron-down sc-sec-chevron"></i>
      <i class="pi pi-calculator"></i> Numerical features
      <span class="sc-settings-section-pct">${secPcts[1]}%</span>
      <span class="sc-settings-section-desc">Quantitative account attributes.</span>
    </div>
    <div style="background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-bottom:1px solid #f1f5f9">
        <div>
          <span style="display:block;font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">Control element breakdown</span>
          <span style="font-size:12px;color:var(--text-muted)" id="cost-elements-count">${_controlElementsLabel()}</span>
        </div>
        <label class="sc-toggle-switch" aria-label="Enable control element breakdown">
          <input type="checkbox" id="toggleCostBreakdown" checked onchange="toggleCostBreakdown(this.checked)" />
          <span class="sc-toggle-track"></span>
        </label>
      </div>
      <div style="padding:10px 14px;background:#eff6ff;border-bottom:1px solid #dbeafe;font-size:11.5px;color:#1e40af;display:flex;align-items:flex-start;gap:6px">
        <i class="pi pi-info-circle" style="flex-shrink:0;margin-top:1px"></i>
        Kindly note that the cost element breakdown only impacts the cost forecasting curves. Hours element breakdown only impacts hours forecast curves, and company cost element breakdown only impacts the company cost forecast curves.
      </div>
      ${sliderRow('duration_months', 'Duration (months)', 'Planned account duration in months')}
      ${sliderRow('budget_amount',   'Budget ($M)',       'Total approved budget')}
      ${numGroupHeader('Cost element breakdown', 'cost', ['labor_mix','material_mix','equip_mix','subcontract_mix'])}
      <div id="numgrp-cost">
      ${sliderRow('labor_mix',       'Labor mix',         'Proportion of control that is labor', true)}
      ${sliderRow('material_mix',    'Material mix',      'Proportion that is materials', true)}
      ${sliderRow('equip_mix',       'Equipment mix',     'Proportion that is equipment', true)}
      ${sliderRow('subcontract_mix', 'Subcontract mix',   'Proportion subcontracted', true)}
      </div>
      ${numGroupHeader('Hours element breakdown', 'hours', ['craft_labour','supervision'])}
      <div id="numgrp-hours">
      ${sliderRow('craft_labour',    'Craft labour',      'Proportion of hours that is craft labour', true)}
      ${sliderRow('supervision',     'Supervision',       'Proportion of hours that is supervision', true)}
      </div>
      ${numGroupHeader('Company cost element breakdown', 'company', ['internal_cost'])}
      <div id="numgrp-company">
      ${sliderRow('internal_cost',   'Internal cost',     'Proportion that is internal company cost', true)}
      </div>
    </div>
  </div>`;

  // Section 3: SPI / CPI
  html += `<div class="sc-settings-section" data-sec="spi">
    <div class="sc-settings-section-header is-toggle" onclick="toggleSettingsSection(this)" role="button" tabindex="0" aria-expanded="true" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();toggleSettingsSection(this);}">
      <i class="pi pi-chevron-down sc-sec-chevron"></i>
      <i class="pi pi-chart-line"></i> SPI / CPI integration (earned value)
      <span class="sc-settings-section-pct">${secPcts[2]}%</span>
      <span class="sc-settings-section-desc">Applies to clients where earned value reporting is active. SPI and CPI influence curve shape matching independently for all three forecast lines.</span>
    </div>
    <div style="background:#fff">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:16px;padding:12px 14px;border-bottom:1px solid #f1f5f9">
        <div>
          <span style="display:block;font-size:13px;font-weight:600;color:var(--text);margin-bottom:3px">Enable SPI / CPI as matching factors</span>
          <span style="font-size:12px;color:var(--text-muted)">Accounts with similar performance index profiles are weighted higher during curve matching for all 3 forecast lines.</span>
        </div>
        <div class="sc-settings-weight-control">
          <span class="sc-wval-wrap">
            <input type="number" class="sc-settings-weight-val" id="wval-spi_cpi" min="0" max="5" step="0.1" value="${_fmtWeight(SPI_CPI_WEIGHT)}"
              onchange="spiCpiWeightInput(this.value)" aria-label="Weight for SPI / CPI matching (0–5)" />
            <span class="sc-wval-arrows">
              <button type="button" tabindex="-1" onclick="stepSpiCpi(0.1)" aria-label="Increase weight by 0.1"><i class="pi pi-chevron-up"></i></button>
              <button type="button" tabindex="-1" onclick="stepSpiCpi(-0.1)" aria-label="Decrease weight by 0.1"><i class="pi pi-chevron-down"></i></button>
            </span>
          </span>
          <input type="range" class="sc-weight-slider" id="wslider-spi_cpi" min="0" max="5" step="0.5" value="${SPI_CPI_WEIGHT}"
            style="--fill-pct:${(SPI_CPI_WEIGHT / 5 * 100).toFixed(0)}%"
            oninput="setSpiCpiWeight(parseFloat(this.value))" aria-label="SPI / CPI matching weight" />
        </div>
      </div>

    </div>
  </div>`;

  // Section 4: Curve Shape Statistics — shares values + non-negative clamping with the
  // "Driven by" detail card via _shapeDisplayVals() so both views always match.
  // Hidden in the settings UI (display:none) but kept in the DOM so it still
  // contributes to the forecast and so _applySettingsPermissions' section-index
  // lookups ([0]–[3]) stay valid.
  html += `<div class="sc-settings-section" data-sec="shape" style="display:none">
    <div class="sc-settings-section-header">
      <i class="pi pi-chart-bar"></i> Curve shape statistics
      <span class="sc-settings-section-pct">${secPcts[3]}%</span>
      <span class="sc-settings-section-desc">Statistical features computed from observed actuals to date (observed) and the planned baseline (planned). Each forecast line runs a separate shape-matching pass.</span>
    </div>
    <div style="background:#fff">
      ${sliderRow('skewness',            'Skewness',                        'Whether spending is front-loaded (negative values) or back-loaded (positive values). An account that spends most of its budget early has negative skewness; one that ramps up late has positive skewness.')}
      ${sliderRow('front_load_ratio',    'Front-load ratio',                'The fraction of total spend that occurred in the first half of the observed window. A value of 0.7 means 70% of the money was spent in the first half.')}
      ${sliderRow('gini',                'Concentration (Gini)',            'How evenly spread the spending is across periods. A value near 0 means spending is spread evenly; a value near 1 means almost all spending happened in a single period.')}
      ${sliderRow('peak_period_norm',    'Peak period (normalized)',        'Where in the observed window the single largest spend period occurred. A value of 0.2 means the peak was near the beginning; 0.8 means near the end.')}
      ${sliderRow('kurtosis',            'Kurtosis',                        'Whether spending is concentrated in a sharp peak or spread in a flat plateau. High values mean a sharp spike; low values mean a gradual distribution.')}
      ${sliderRow('plan_vs_actual_skew', 'Plan vs. actual skew difference', 'How much the actual spend shape has diverged from the planned (baseline) shape. Large positive or negative values mean the account is behaving differently than planned.')}
      ${sliderRow('planned_skewness',    'Planned skewness',                'Whether the baseline plan is front-loaded or back-loaded')}
      ${sliderRow('planned_front_load',  'Planned front-load ratio',        'Fraction of planned spend in the first half of the baseline schedule')}
      ${sliderRow('planned_gini',        'Planned concentration',           'How evenly spread the planned spending is across periods')}
      ${sliderRow('planned_peak_norm',   'Planned peak period',             'Where in the baseline schedule the largest planned spend period falls')}
      ${sliderRow('planned_kurtosis',    'Planned kurtosis',                'Whether the planned spend is a sharp spike or a flat plateau')}
    </div>
  </div>`;

  container.innerHTML = html;

  const footer = document.createElement('div');
  footer.className = 'sc-settings-footer';
  footer.innerHTML = '<i class="pi pi-info-circle" style="color:#6366f1"></i> Weight of 0 disables a feature. Weights are relative — only their ratio matters. Each forecast line (Actual/ETC, Incurred/ETC, Earned) runs an independent matching pass using its own historical data series from this client\'s project database.';
  container.appendChild(footer);

  _applySettingsPermissions(ACTIVE_USER);
}

function initDriverSettingsContent() {
  const container = document.getElementById('driver-settings-container');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';
  _buildAndMountSettings(container);
  _updateSettingsAccLockBadge(ACTIVE_USER);
}

/* ── SETTINGS MODAL ──────────────────────────────────────────────── */
window.openSettingsModal = function() {
  const dropdown = document.getElementById('kebabDropdown');
  if (dropdown) dropdown.style.display = 'none';
  const btn = document.getElementById('kebabBtn');
  if (btn) btn.setAttribute('aria-expanded', 'false');

  // Teardown accordion's built content so IDs aren't duplicated in the DOM
  const accContainer = document.getElementById('driver-settings-container');
  if (accContainer && accContainer.dataset.built) {
    accContainer.innerHTML = '';
    delete accContainer.dataset.built;
  }

  const canRun    = ACTIVE_USER.perms.runForecast;
  const canModify = ACTIVE_USER.perms.modifyWeights;

  const overlay = document.createElement('div');
  overlay.className = 'sc-modal-overlay';
  overlay.id = 'settingsModalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'AI forecast settings');

  overlay.innerHTML = `
    <div class="sc-modal sc-settings-modal" id="settingsModal">
      <div class="sc-modal-header">
        <div class="sc-modal-title"><i class="pi pi-cog"></i> AI forecast settings</div>
        <button class="sc-modal-close" onclick="closeSettingsModal()" aria-label="Close"><i class="pi pi-times"></i></button>
      </div>
      <div class="sc-modal-body sc-settings-modal-body" id="settingsModalBody">
        <div id="settings-modal-container"></div>
      </div>
      <div class="sc-settings-modal-footer">
        <button class="sc-settings-modal-reset" onclick="resetSettingsWeights();closeSettingsModal()" ${canModify ? '' : 'disabled'} style="${canModify ? '' : 'opacity:0.45'}">
          <i class="pi pi-refresh"></i> Reset to defaults
        </button>
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" onclick="closeSettingsModal()">Cancel</button>
          <button class="btn btn-primary sc-settings-modal-run" onclick="closeSettingsModal();runAiForecast()" ${canRun ? '' : 'disabled'} style="${canRun ? '' : 'opacity:0.5'}" title="${canRun ? '' : 'Your role cannot run AI forecasts'}">
            <i class="pi pi-play btn-icon-left"></i> Run analysis
          </button>
        </div>
      </div>
    </div>
  `;

  overlay.addEventListener('click', e => { if (e.target === overlay) closeSettingsModal(); });
  document.addEventListener('keydown', _settingsModalEscHandler);
  document.body.appendChild(overlay);

  _buildAndMountSettings(document.getElementById('settings-modal-container'));
  _updateSettingsModalLockNotice();
};

function _settingsModalEscHandler(e) {
  if (e.key === 'Escape') closeSettingsModal();
}

window.closeSettingsModal = function() {
  const overlay = document.getElementById('settingsModalOverlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', _settingsModalEscHandler);
  // Modal opening tore down the inline driver settings — rebuild it
  initDriverSettingsContent();
};

function _updateSettingsModalLockNotice() {
  const p = ACTIVE_USER.perms;
  if (ACTIVE_USER.id === 'admin' || (p.modifyWeights && p.configureGroups)) return;
  const body = document.getElementById('settingsModalBody');
  if (!body) return;
  const notice = document.createElement('div');
  notice.className = 'sc-perm-notice';
  notice.style.marginBottom = '14px';
  let msg = '';
  if (!p.modifyWeights && !p.configureGroups) {
    msg = `All settings are <strong>read-only</strong> for the <em>${ACTIVE_USER.role}</em> role.`;
  } else if (!p.modifyWeights) {
    msg = `Feature weights are <strong>read-only</strong> for the <em>${ACTIVE_USER.role}</em> role.`;
  } else {
    msg = `Group code configuration is <strong>restricted</strong> for the <em>${ACTIVE_USER.role}</em> role.`;
  }
  notice.innerHTML = `<i class="pi pi-lock" style="flex-shrink:0"></i><span>${msg}</span>`;
  body.insertBefore(notice, body.firstChild);
}

/* Project learning pool — the historical projects the matcher scans for
   comparable control accounts. `included` controls whether a project's
   accounts feed the forecast; account counts sum to the 1,240-account history. */
const LEARNING_PROJECTS = [
  { id: 'lp-sabine',   name: 'Sabine Pass LNG',          region: 'NA', accounts: 214, matched: 9, budget: '$4.2B', included: true  },
  { id: 'lp-portarth', name: 'Port Arthur Expansion',    region: 'NA', accounts: 188, matched: 7, budget: '$3.1B', included: true  },
  { id: 'lp-freeport', name: 'Freeport Complex',         region: 'NA', accounts: 167, matched: 6, budget: '$2.8B', included: true  },
  { id: 'lp-golden',   name: 'Golden Pass LNG',          region: 'NA', accounts: 152, matched: 5, budget: '$2.4B', included: true  },
  { id: 'lp-cameron',  name: 'Cameron LNG',              region: 'NA', accounts: 141, matched: 4, budget: '$2.0B', included: true  },
  { id: 'lp-calcasieu',name: 'Calcasieu Pass',           region: 'NA', accounts: 128, matched: 3, budget: '$1.7B', included: true  },
  { id: 'lp-corpus',   name: 'Corpus Christi Stage 3',   region: 'NA', accounts:  96, matched: 2, budget: '$1.3B', included: true  },
  { id: 'lp-riogrande',name: 'Rio Grande LNG',           region: 'NA', accounts:  64, matched: 1, budget: '$0.9B', included: true  },
  { id: 'lp-driftwood',name: 'Driftwood LNG (legacy)',   region: 'NA', accounts:  48, matched: 0, budget: '$0.6B', included: false },
  { id: 'lp-magnolia', name: 'Magnolia LNG (EU pilot)',  region: 'EU', accounts:  42, matched: 0, budget: '$0.5B', included: false },
];

function _poolRowHtml(p, canPool) {
  return `<label class="sc-pool-row${p.included ? '' : ' is-excluded'}" data-pool-id="${p.id}" data-name="${p.name.toLowerCase()}">
    <input type="checkbox" ${p.included ? 'checked' : ''} ${canPool ? '' : 'disabled'}
      onchange="toggleLearningProject('${p.id}', this.checked)" aria-label="Include ${p.name} in AI learning" />
    <span class="sc-pool-info">
      <span class="sc-pool-name">${p.name}</span>
      <span class="sc-pool-meta">${p.accounts} control accounts · ${p.matched} matched here · ${p.budget}</span>
    </span>
    <span class="sc-pool-region">${p.region}</span>
  </label>`;
}

function _refreshLearningPool() {
  const active = LEARNING_PROJECTS.filter(p => p.included).length;
  const badge = document.getElementById('poolCountBadge');
  if (badge) badge.textContent = `${active} / ${LEARNING_PROJECTS.length}`;
  const all = document.getElementById('poolSelectAll');
  if (all) all.checked = active === LEARNING_PROJECTS.length;
}

window.toggleLearningProject = function(id, on) {
  const proj = LEARNING_PROJECTS.find(p => p.id === id);
  if (proj) proj.included = on;
  const row = document.querySelector(`.sc-pool-row[data-pool-id="${id}"]`);
  if (row) row.classList.toggle('is-excluded', !on);
  _refreshLearningPool();
};

window.toggleAllLearningProjects = function(on) {
  const list = document.getElementById('learningPoolList');
  if (!list) return;
  // Only affects rows currently visible (i.e. matching the active search filter)
  list.querySelectorAll('.sc-pool-row').forEach(row => {
    if (row.style.display === 'none') return;
    const proj = LEARNING_PROJECTS.find(p => p.id === row.dataset.poolId);
    if (proj) proj.included = on;
    const cb = row.querySelector('input[type="checkbox"]');
    if (cb) cb.checked = on;
    row.classList.toggle('is-excluded', !on);
  });
  _refreshLearningPool();
};

window.toggleSettingsSection = function(headerEl) {
  const sec = headerEl.closest('.sc-settings-section');
  if (!sec) return;
  const collapsed = sec.classList.toggle('is-collapsed');
  headerEl.setAttribute('aria-expanded', String(!collapsed));
};

window.toggleLearningPoolSection = function() {
  const sec = document.getElementById('learningPoolSection');
  if (!sec) return;
  const collapsed = sec.classList.toggle('is-collapsed');
  const header = sec.querySelector('.sc-pool-header');
  if (header) header.setAttribute('aria-expanded', String(!collapsed));
};

window.filterLearningProjects = function(q) {
  const term = (q || '').trim().toLowerCase();
  const list = document.getElementById('learningPoolList');
  if (!list) return;
  let visible = 0;
  list.querySelectorAll('.sc-pool-row').forEach(row => {
    const match = !term || row.dataset.name.includes(term);
    row.style.display = match ? '' : 'none';
    if (match) visible++;
  });
  let empty = list.querySelector('.sc-pool-empty');
  if (!visible) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'sc-pool-empty';
      empty.textContent = 'No projects match your search.';
      list.appendChild(empty);
    }
  } else if (empty) {
    empty.remove();
  }
};

const SIM_ACCOUNT_PROJECTS = [
  { id: 'CA-0812 · Civil fnds.',  project: 'Port Arthur Exp.', region: 'NA',   budget: 14.2, match: 96, varPct:  4.1 },
  { id: 'CA-0634 · Civil P3',     project: 'Sabine Pass LNG',  region: 'NA',   budget: 16.1, match: 91, varPct:  8.3 },
  { id: 'CA-1001 · Grading',      project: 'Freeport Complex', region: 'NA',   budget: 11.8, match: 88, varPct:  2.8 },
  { id: 'CA-0778 · Grading P2',   project: 'Golden Pass',      region: 'NA',   budget: 15.5, match: 82, varPct: 11.5 },
  { id: 'CA-0523 · Civil fnds.',  project: 'Texas LNG',        region: 'NA',   budget: 13.8, match: 80, varPct:  3.6 },
  { id: 'CA-0419 · Civil P1',     project: 'Cameron LNG',      region: 'NA',   budget: 18.3, match: 76, varPct:  6.2 },
  { id: 'CA-0907 · Foundations',  project: 'Driftwood LNG',    region: 'NA',   budget:  9.5, match: 71, varPct: -1.4 },
  { id: 'CA-0288 · Civil P2',     project: 'Plaquemines LNG',  region: 'NA',   budget: 14.9, match: 68, varPct:  5.9 },
];

/* Expand the curated seed into the full set of `n` similar accounts for a CA
   (n = ca.bannerSimilar). Deterministic so the list is stable across renders. */
function _simAccountRows(n) {
  const pool = SIM_ACCOUNT_PROJECTS.slice();
  const projects = ['Corpus Christi','Calcasieu Pass','Rio Grande LNG','Magnolia LNG','Lake Charles',
                    'Gulf Coast GTL','Delfin LNG','Brownsville LNG','Commonwealth LNG','Port Arthur Exp.',
                    'Sabine Pass LNG','Freeport Complex','Golden Pass','Texas LNG'];
  const types    = ['Civil fnds.','Civil P1','Civil P2','Civil P3','Grading','Grading P2','Foundations',
                    'Earthworks','Substructure','Piling','Site civils','Deep fnds.'];
  const regions  = ['NA','NA','NA','EU','APAC'];
  let seed = 20420 + n;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  let acct = 1000;
  while (pool.length < n) {
    const i = pool.length;
    acct += 1 + Math.floor(rnd() * 40);
    const match = Math.max(61, 96 - Math.floor(i * (34 / Math.max(1, n))) - Math.floor(rnd() * 2));
    pool.push({
      id: `CA-${String(acct).padStart(4, '0')} · ${types[Math.floor(rnd() * types.length)]}`,
      project: projects[Math.floor(rnd() * projects.length)],
      region: regions[Math.floor(rnd() * regions.length)],
      budget: +(9 + rnd() * 12).toFixed(1),
      match,
      varPct: +((rnd() * 15) - 3).toFixed(1),
    });
  }
  return pool.slice(0, n).sort((a, b) => b.match - a.match);
}

function _buildAppendixSummaryCards() {
  const ca = CA_DATA[ACTIVE_CA_ID] || CA_DATA['ca-1042'];
  const bac      = ca.chartBac;
  const eacP50   = ca.eacActual;
  const eacP10   = +(eacP50 * 0.92).toFixed(1);
  const eacP90   = +(eacP50 * 1.08).toFixed(1);
  const pctOver  = ((eacP50 / bac - 1) * 100).toFixed(2);
  const pctUnder = ((1 - eacP10 / bac) * 100).toFixed(1);
  const pctHi    = ((eacP90 / bac - 1) * 100).toFixed(1);

  // Confidence ring geometry
  const conf = ca.bannerConf;
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - conf / 100);
  const confLabel = conf >= 70 ? 'High' : conf >= 50 ? 'Medium' : 'Low';

  // Range markers: P10 anchors left edge, P90 anchors right edge; budget + P50 positioned between
  const rangeMin = eacP10;
  const rangeMax = eacP90;
  const pos = v => Math.max(0, Math.min(100, ((v - rangeMin) / (rangeMax - rangeMin)) * 100));

  return `
    <div class="sc-appx-grid">
      <!-- Card 1: Forecast confidence -->
      <div class="sc-appx-card">
        <div class="sc-appx-card-header">
          <i class="pi pi-star"></i>
          <h3>Forecast confidence</h3>
        </div>
        <div class="sc-appx-conf-wrap">
          <div class="sc-appx-conf-ring">
            <svg width="132" height="132" viewBox="0 0 132 132">
              <circle class="sc-appx-conf-ring-bg" cx="66" cy="66" r="${radius}" fill="none" stroke-width="10"/>
              <circle class="sc-appx-conf-ring-fg" cx="66" cy="66" r="${radius}" fill="none" stroke-width="10"
                stroke-linecap="round"
                stroke-dasharray="${circumference.toFixed(2)}"
                stroke-dashoffset="${offset.toFixed(2)}"/>
            </svg>
            <div class="sc-appx-conf-center">
              <span class="sc-appx-conf-pct">${conf}%</span>
              <span class="sc-appx-conf-label">${confLabel}</span>
            </div>
          </div>
          <div class="sc-appx-conf-meta">
            Based on ${ca.bannerSimilar} similar historical accounts
            <span>Minimum match threshold: ≥ 80%</span>
          </div>
        </div>
      </div>

      <!-- Card 2: EAC forecast range -->
      <div class="sc-appx-card">
        <div class="sc-appx-card-header">
          <i class="pi pi-chart-line"></i>
          <h3>EAC forecast range</h3>
        </div>
        <p class="sc-appx-card-sub">Probabilistic range from model uncertainty and historical variance.</p>
        <div class="sc-appx-range-block">
          <div class="sc-appx-range-cats">
            <span class="lo">Optimistic (P10)</span>
            <span class="mid">Base (P50)</span>
            <span class="hi">Pessimistic (P90)</span>
          </div>
          <div class="sc-appx-range-budget">
            <div class="sc-appx-range-budget-tag" style="left:${pos(bac)}%">Budget<strong>$${bac.toFixed(0)}M</strong></div>
          </div>
          <div class="sc-appx-range-track">
            <div class="sc-appx-range-marker is-budget" style="left:${pos(bac)}%"></div>
            <div class="sc-appx-range-marker is-p50" style="left:${pos(eacP50)}%"></div>
          </div>
          <div class="sc-appx-range-values">
            <span class="lo">$${eacP10.toFixed(1)}M</span>
            <span class="mid">$${eacP50.toFixed(1)}M base</span>
            <span class="hi">$${eacP90.toFixed(1)}M</span>
          </div>
          <div class="sc-appx-range-legend">
            <div><span class="sc-appx-legend-dot lo"></span><span><strong>P10 ($${eacP10.toFixed(1)}M)</strong> — Best case; ${eacP10 < bac ? `slightly under budget` : `+${pctUnder}% over budget`}</span></div>
            <div><span class="sc-appx-legend-dot mid"></span><span><strong>P50 ($${eacP50.toFixed(1)}M)</strong> — Base case; +${pctOver}% over budget</span></div>
            <div><span class="sc-appx-legend-dot hi"></span><span><strong>P90 ($${eacP90.toFixed(1)}M)</strong> — Downside; +${pctHi}% over budget</span></div>
          </div>
        </div>
      </div>

      <!-- Card 3: Similar accounts (all matched) -->
      <div class="sc-appx-card">
        <div class="sc-appx-card-header">
          <i class="pi pi-link"></i>
          <h3>Similar accounts</h3>
        </div>
        <p class="sc-appx-card-sub">All ${ca.bannerSimilar} completed accounts matched to this control account, ranked by similarity.</p>
        <div class="sc-appx-sim-table-wrap">
          <table class="sc-appx-sim-table">
            <thead>
              <tr>
                <th>Account</th>
                <th>Project</th>
                <th class="r">EAC vs budget</th>
                <th class="r">Match</th>
              </tr>
            </thead>
            <tbody>
              ${_simAccountRows(ca.bannerSimilar).map(row => {
                const cls    = row.match >= 90 ? 'high' : row.match >= 80 ? 'med' : 'low';
                const varCls = row.varPct >= 0 ? 'var-pos' : 'var-neg';
                const sign   = row.varPct >= 0 ? '+' : '';
                return `<tr>
                  <td>${row.id}</td>
                  <td>${row.project}</td>
                  <td class="${varCls} r">${sign}${row.varPct.toFixed(1)}%</td>
                  <td class="r"><span class="sc-appx-match-pill ${cls}">${row.match}%</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Card 4: Basis of forecast -->
      <div class="sc-appx-card">
        <div class="sc-appx-card-header">
          <i class="pi pi-list"></i>
          <h3>Basis of forecast</h3>
        </div>
        <ul class="sc-appx-bullets">
          <li><strong>Pattern matching:</strong> ${ca.bannerSimilar} completed accounts with ≥80% similarity across Phase type, Discipline, Work type, Region, and Project size.</li>
          <li><strong>CPI adjustment:</strong> CPI of 0.92 applied — late-growth correction shapes cost escalation pattern in remaining curve.</li>
          <li><strong>SPI adjustment:</strong> Duration extended ~3 months based on SPI of 0.88.</li>
          <li><strong>Earned value ceiling:</strong> Earned bounded by approved budget ($${bac.toFixed(1)}M). Cannot earn over budget.</li>
          <li><strong>Incurred/actual gap:</strong> 4.2% accrual spread reflected as divergence between Actual and Incurred lines.</li>
        </ul>
      </div>
    </div>
  `;
}

function initAppendixContent() {
  const container = document.getElementById('appendix-container');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';
  container.innerHTML = _buildAppendixSummaryCards();
}

function initWarningsContent() {
  const container = document.getElementById('warnings-container');
  if (!container || container.dataset.built) return;
  container.dataset.built = '1';
  container.innerHTML = `
    <div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:12px 16px;font-size:13px;color:#991b1b;display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
      <i class="pi pi-ban" style="color:#dc2626;flex-shrink:0;margin-top:1px"></i>
      <div>
        <strong>Forecast blocked — schedule date review required (2 accounts):</strong>
        CA-1043 and CA-1047 have forecasted completion dates within the next 30 days but remaining cost balance exceeds 60% of approved budget.
        AI forecast is blocked for these accounts until schedule dates are updated in the scheduling tool.
        <span style="display:block;margin-top:5px;font-size:12px;color:#b91c1c">
          Please verify and update completion dates with the project scheduler, then re-run the AI forecast.
        </span>
      </div>
    </div>
    <div style="background:#fffbeb;border:1px solid #fbbf24;border-radius:8px;padding:12px 16px;font-size:13px;color:#92400e;display:flex;gap:10px;align-items:flex-start;margin-bottom:8px">
      <i class="pi pi-exclamation-triangle" style="color:#d97706;flex-shrink:0;margin-top:1px"></i>
      <div>
        <strong>Schedule variance — CA-1042 (this account):</strong> AI forecast completion (Nov 2026) is 3 months later than the scheduled completion date (Aug 2026).
        The AI forecast reflects historical curve patterns from similar accounts and does not override schedule data. Review with the project scheduler.
      </div>
    </div>
    <div style="background:#fff;border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;font-size:13px;color:#374151;display:flex;gap:10px;align-items:flex-start">
      <i class="pi pi-info-circle" style="color:#6366f1;flex-shrink:0;margin-top:1px"></i>
      <div>
        <strong>CPI below threshold — CA-1042:</strong> Cost performance index (0.92) is below the acceptable threshold of 0.95.
        Historical accounts with CPI in the 0.88–0.95 range show an average cost overrun of 8–12% at completion. Current EAC ($42.2M) reflects this pattern.
      </div>
    </div>

    <h3 class="sc-warn-table-title">Account warnings</h3>
    <div class="sc-warn-table-wrap">
      <table class="sc-warn-table">
        <thead>
          <tr>
            <th>Control account ID</th>
            <th>Control account description</th>
            <th>Issue type</th>
            <th>Remarks</th>
          </tr>
        </thead>
        <tbody>
          ${[
            { id: 'CA-1042', desc: 'Civil Foundations — Phase 2',  type: 'CPI below threshold',          sev: 'med',  remark: 'CPI 0.92 is below the 0.95 threshold. Similar accounts show 8–12% cost overrun at completion; EAC $42.2M reflects this.' },
            { id: 'CA-1042', desc: 'Civil Foundations — Phase 2',  type: 'Potentially outdated forecast date', sev: 'med', remark: 'AI forecast completion (Nov 2026) is 3 months later than the scheduled date (Aug 2026). Verify with the project scheduler.' },
            { id: 'CA-1043', desc: 'Structural Steel — Phase 1',   type: 'Potentially outdated forecast date', sev: 'high', remark: 'Completion date within 30 days but >60% of budget remains. AI forecast blocked until schedule dates are updated.' },
            { id: 'CA-1047', desc: 'Electrical Distribution',      type: 'Potentially outdated forecast date', sev: 'high', remark: 'Completion date within 30 days but >60% of budget remains. AI forecast blocked until schedule dates are updated.' },
          ].map(r => `
            <tr>
              <td class="sc-warn-id">${r.id}</td>
              <td>${r.desc}</td>
              <td><span class="sc-warn-tag sc-warn-tag--${r.sev}">${r.type}${r.sev === 'high' ? '<i class="pi pi-info-circle sc-warn-info" tabindex="0" title="Please verify and update completion dates with the project scheduler, then re-run the AI forecast"></i>' : ''}</span></td>
              <td class="sc-warn-remark">${r.remark}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

/* ── SECTIONS VIEW SWITCHER (A/B test: accordion vs tabs) ────────── */
const SECTIONS_VIEW_KEY = 'sc-sections-view';
const SECTIONS_TAB_KEY  = 'sc-sections-active-tab';

window.setSectionsView = function(view) {
  if (view !== 'accordion' && view !== 'tabs') view = 'accordion';
  const wrap = document.getElementById('scSections');
  if (!wrap) return;
  wrap.dataset.view = view;
  try { localStorage.setItem(SECTIONS_VIEW_KEY, view); } catch (e) {}

  // Update kebab radio check marks
  document.querySelectorAll('.sc-kebab-item--radio[data-view-choice]').forEach(btn => {
    btn.setAttribute('aria-checked', String(btn.dataset.viewChoice === view));
  });

  // Close the kebab dropdown
  const drop = document.getElementById('kebabDropdown');
  if (drop) drop.style.display = 'none';
  const kBtn = document.getElementById('kebabBtn');
  if (kBtn) kBtn.setAttribute('aria-expanded', 'false');

  // Tab mode needs an active section; pick saved or fall back to first
  if (view === 'tabs') {
    let savedTab;
    try { savedTab = localStorage.getItem(SECTIONS_TAB_KEY); } catch (e) {}
    const active = document.querySelector('.sc-acc-section.is-active-tab');
    let tabId = savedTab || (active && active.id) || 'acc-forecast';
    // Settings has no tab in tab view (use the cog/modal instead)
    if (tabId === 'acc-drivers') tabId = 'acc-forecast';
    setActiveTab(tabId);
  }

  // The chart needs to redraw when its container becomes visible again
  if (scurveChart) {
    requestAnimationFrame(() => scurveChart.resize());
  }
};

window.setActiveTab = function(id) {
  document.querySelectorAll('.sc-acc-section').forEach(s => {
    s.classList.toggle('is-active-tab', s.id === id);
  });
  document.querySelectorAll('.sc-tab-btn').forEach(b => {
    b.classList.toggle('is-active', b.dataset.tab === id);
  });
  try { localStorage.setItem(SECTIONS_TAB_KEY, id); } catch (e) {}

  // Lazy-init content when a tab opens for the first time
  if (id === 'acc-drivers') initDriverSettingsContent();
  if (id === 'acc-appendix') initAppendixContent();
  if (id === 'acc-warnings') initWarningsContent();

  // Chart needs a resize when the forecast tab becomes visible
  if (id === 'acc-forecast' && scurveChart) {
    requestAnimationFrame(() => scurveChart.resize());
  }
};

function _restoreSectionsView() {
  let saved;
  try { saved = localStorage.getItem(SECTIONS_VIEW_KEY); } catch (e) {}
  setSectionsView(saved || 'accordion');
}

/* ── ADMIN SETTINGS PAGE (?context=admin) ───────────────────────── */
// In the administrator context the page becomes a plain settings page:
// the forecast toolbar/sections are hidden (kept in the DOM so they can
// be brought back later) and the AI forecast settings render inline
// with a Save action — no modal.
const IS_ADMIN_CONTEXT = new URLSearchParams(window.location.search).get('context') === 'admin';

/* Change log — persisted to localStorage, seeded with demo history */
const ADMIN_LOG_KEY = 'scurve-admin-settings-log';
const ADMIN_LOG_SEED = [
  { initials: 'AU', name: 'Admin User',     role: 'Super user',    color: '#dc2626', action: 'Updated 4 feature weights in Curve shape statistics', ts: '2026-05-28T14:32:00' },
  { initials: 'MT', name: 'Michael Torres', role: 'Cost engineer', color: '#0891b2', action: 'Adjusted SPI / CPI integration weight 2.5 → 3.0',      ts: '2026-05-19T09:08:00' },
  { initials: 'AU', name: 'Admin User',     role: 'Super user',    color: '#dc2626', action: 'Enabled Enterprise classification group',              ts: '2026-05-12T16:45:00' },
  { initials: 'AU', name: 'Admin User',     role: 'Super user',    color: '#dc2626', action: 'Initial configuration created',                        ts: '2026-04-30T11:20:00' },
];

function _adminLogEntries() {
  try {
    const raw = localStorage.getItem(ADMIN_LOG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return ADMIN_LOG_SEED.slice();
}

function _adminLogSave(entries) {
  try { localStorage.setItem(ADMIN_LOG_KEY, JSON.stringify(entries)); } catch (e) {}
}

function _adminLogFmtTs(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date} · ${time}`;
}

function _renderAdminLog() {
  const list = document.getElementById('adminLogList');
  if (!list) return;
  list.innerHTML = _adminLogEntries().map(e => `
    <div class="sc-admin-log-entry">
      <span class="sc-admin-log-avatar" style="background:${e.color}">${e.initials}</span>
      <div class="sc-admin-log-entry-body">
        <div class="sc-admin-log-who">${e.name} <span class="sc-admin-log-role">· ${e.role}</span></div>
        <div class="sc-admin-log-action">${e.action}</div>
        <div class="sc-admin-log-ts"><i class="pi pi-clock"></i> ${_adminLogFmtTs(e.ts)}</div>
      </div>
    </div>`).join('');
}

/* Edit flow — the inline page is always read-only; Edit opens the settings
   in a modal, Save commits + logs, Cancel/Esc discards the edits */
let _adminEditSnapshot = null;

function _adminSetInlineReadonly() {
  const container = document.getElementById('admin-settings-container');
  if (!container) return;
  container.classList.add('sc-admin-settings--readonly');
  container.querySelectorAll('input').forEach(el => { el.disabled = true; });
}

function _adminRebuildInline() {
  const container = document.getElementById('admin-settings-container');
  if (!container) return;
  container.innerHTML = '';
  _buildAndMountSettings(container);
  _adminSetInlineReadonly();
}

window.openAdminSettingsModal = function() {
  // Snapshot weights — used to restore on cancel and to describe the change on save
  _adminEditSnapshot = Object.assign({}, ACTIVE_WEIGHTS, { __spi_cpi: SPI_CPI_WEIGHT });

  // Tear down the inline settings so control IDs aren't duplicated in the DOM
  const inline = document.getElementById('admin-settings-container');
  if (inline) inline.innerHTML = '';

  const overlay = document.createElement('div');
  overlay.className = 'sc-modal-overlay';
  overlay.id = 'adminSettingsModalOverlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Edit AI forecast settings');

  overlay.innerHTML = `
    <div class="sc-modal sc-settings-modal">
      <div class="sc-modal-header">
        <div class="sc-modal-title"><i class="pi pi-cog"></i> Edit AI forecast settings</div>
        <button class="sc-modal-close" onclick="cancelAdminSettingsModal()" aria-label="Close"><i class="pi pi-times"></i></button>
      </div>
      <div class="sc-modal-body sc-settings-modal-body">
        <div id="admin-settings-modal-container"></div>
      </div>
      <div class="sc-settings-modal-footer" style="justify-content:flex-end">
        <div style="display:flex;gap:8px">
          <button class="btn btn-secondary" type="button" onclick="cancelAdminSettingsModal()">Cancel</button>
          <button class="btn btn-primary" type="button" onclick="saveAdminSettingsModal()">Save settings</button>
        </div>
      </div>
    </div>`;

  // Deliberate close only — outside clicks don't dismiss (Esc still cancels)
  document.addEventListener('keydown', _adminModalEscHandler);
  document.body.appendChild(overlay);

  _buildAndMountSettings(document.getElementById('admin-settings-modal-container'));
};

function _adminModalEscHandler(e) {
  if (e.key === 'Escape') cancelAdminSettingsModal();
}

function _closeAdminSettingsModal() {
  const overlay = document.getElementById('adminSettingsModalOverlay');
  if (overlay) overlay.remove();
  document.removeEventListener('keydown', _adminModalEscHandler);
  _adminRebuildInline(); // restore the read-only inline view
}

window.cancelAdminSettingsModal = function() {
  // Discard edits — restore the snapshot taken when the modal opened
  if (_adminEditSnapshot) {
    SPI_CPI_WEIGHT = _adminEditSnapshot.__spi_cpi;
    const snap = Object.assign({}, _adminEditSnapshot);
    delete snap.__spi_cpi;
    ACTIVE_WEIGHTS = snap;
  }
  _adminEditSnapshot = null;
  _closeAdminSettingsModal();
};

window.saveAdminSettingsModal = function() {
  // Count changed weights for the log entry
  const snap = _adminEditSnapshot || {};
  let changed = Object.keys(ACTIVE_WEIGHTS).filter(k => ACTIVE_WEIGHTS[k] !== snap[k]).length;
  if (SPI_CPI_WEIGHT !== snap.__spi_cpi) changed++;
  const action = changed > 0
    ? `Updated ${changed} feature weight${changed === 1 ? '' : 's'}`
    : 'Saved settings (no changes)';

  const entries = _adminLogEntries();
  entries.unshift({
    initials: ACTIVE_USER.initials, name: ACTIVE_USER.name, role: ACTIVE_USER.role,
    color: ACTIVE_USER.color, action, ts: new Date().toISOString()
  });
  _adminLogSave(entries);
  _renderAdminLog();

  _adminEditSnapshot = null;
  _closeAdminSettingsModal();
  showToast('success', '', 'Settings saved');
};

function initAdminSettingsPage() {
  // Hide the forecast experience — admin only does the settings job here
  const toolbar = document.querySelector('.sc-toolbar');
  if (toolbar) toolbar.style.display = 'none';
  const sections = document.getElementById('scSections');
  if (sections) sections.style.display = 'none';

  // Retitle the page for the admin context
  const title = document.querySelector('.page-title');
  if (title) title.textContent = 'AI driven forecast settings';
  const subtitle = document.querySelector('.sc-page-subtitle');
  if (subtitle) subtitle.textContent = 'Configure the classification groups and feature weights used by the AI forecast matching algorithm';

  // Two-column layout: settings card (white) + change log on the right
  const page = document.createElement('div');
  page.className = 'sc-admin-settings-layout';
  page.innerHTML = `
    <div class="sc-admin-settings-main">
      <div class="sc-admin-card-head">
        <div class="sc-admin-card-title">
          <i class="pi pi-cog"></i> AI forecast settings
          <span class="sc-admin-mode-badge" id="adminModeBadge">View only</span>
        </div>
        <button class="btn btn-secondary" type="button" id="adminEditBtn" onclick="openAdminSettingsModal()">
          <i class="pi pi-pencil btn-icon-left"></i> Edit
        </button>
      </div>
      <div id="admin-settings-container"></div>
    </div>
    <aside class="sc-admin-log" aria-label="Settings change log">
      <div class="sc-admin-log-head"><i class="pi pi-history"></i> Change log</div>
      <div class="sc-admin-log-list" id="adminLogList"></div>
    </aside>`;
  document.querySelector('.proj-content').appendChild(page);

  _buildAndMountSettings(document.getElementById('admin-settings-container'));
  _renderAdminLog();
  _adminSetInlineReadonly(); // inline view is always read-only — Edit opens the modal
}

/* ── INIT ───────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  if (IS_ADMIN_CONTEXT) {
    // Admin context: settings page only — skip chart/accordion init so
    // the hidden forecast sections stay inert (no duplicate control IDs)
    initAdminSettingsPage();
    return;
  }
  initScurveChart();
  _setupChartDragger();
  _renderSummaryPills();
  initAppendixContent();
  initWarningsContent();
  initDriverSettingsContent();
  _restoreSectionsView();
});
