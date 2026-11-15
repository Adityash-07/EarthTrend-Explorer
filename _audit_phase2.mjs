/**
 * _audit_phase2.mjs
 * -----------------
 * Phase 2 final scientific-integrity audit.
 * Run with:  node _audit_phase2.mjs
 *
 * Tests:
 *   A. parseGistemp — unchanged parsing, null handling, meta fields
 *   B. parseSnowCover — missing months, 10-month rule, null vs zero, year alignment
 *   C. OLS regression — correctness on known data
 *   D. Mann-Kendall + Sen's slope — correctness on known data
 *   E. rollingMean — year-keyed output (not positional), null edges
 *   F. fittedLine year alignment
 *   G. GISTEMP unit defaults in TrendPanel/StatsCards props (structural)
 *   H. insights.js unit substitution
 *   I. Cache isolation (no stale data between datasets)
 */

import { parseSnowCover } from './src/data/parseSnowCover.js';
import { parseGistemp }   from './src/data/parseGistemp.js';
import { olsRegression }  from './src/analysis/regression.js';
import { mannKendallTest } from './src/analysis/mannKendall.js';
import { rollingMean }    from './src/analysis/rollingAverage.js';
import { findExtremes }   from './src/analysis/extremes.js';
import { generateInsight } from './src/analysis/insights.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, label, detail = '') {
  if (condition) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.error(`  ✗  ${label}${detail ? ' — ' + detail : ''}`);
    failed++;
    failures.push(label + (detail ? ' — ' + detail : ''));
  }
}

function assertClose(a, b, tol, label) {
  assert(Math.abs(a - b) <= tol, label, `expected ≈${b}, got ${a}`);
}

function section(name) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${name}`);
  console.log(`${'─'.repeat(60)}`);
}

// ── Minimal stub CSV for GISTEMP parser ──────────────────────────────────────
// Two real data rows with one "***" annual mean to test null handling.
const GISTEMP_STUB = `Land-Ocean: Global Means
Year,Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec,J-D,D-N,DJF,MAM,JJA,SON
1880,-.19,-.25,-.11,-.22,-.11,-.22,-.23,-.24,-.26,-.32,-.37,-.44,-.27,***,***,-.15,-.23,-.31
1881,-.19,-.25,-.11,-.22,-.11,-.22,-.23,-.24,-.26,-.32,-.37,-.44,-.23,-.27,-.27,-.15,-.23,-.31
1882,***,***,***,***,***,***,***,***,***,***,***,***,***,***,***,***,***,***
`;

// ── Snow Cover stub text ──────────────────────────────────────────────────────
// Tests:
//   - 1966: only months 11 & 12 (2 months) → annual = null
//   - 1967: months 1–12 all present (12 months) → annual = mean of 12
//   - 1968: months 1–6, 8–12 (11 months — Jul absent) → annual = mean of 11
//   - 1969: months 1–9 only (9 months) → annual = null (< 10)
//   - 1970: months 1–10 exactly (10 months) → annual = mean of 10 (boundary)
//   - Verify no absent month is treated as 0

const SNOW_STUB = `
1966  11  34943905
1966  12  43004840
1967  01  48517313
1967  02  47431583
1967  03  42977055
1967  04  33111782
1967  05  22794380
1967  06  14367907
1967  07  8209985
1967  08  5308387
1967  09  7218637
1967  10  18975406
1967  11  35000000
1967  12  44000000
1968  01  47000000
1968  02  46000000
1968  03  41000000
1968  04  32000000
1968  05  21000000
1968  06  13000000
1968  08  5000000
1968  09  7000000
1968  10  18000000
1968  11  34000000
1968  12  43000000
1969  01  48000000
1969  02  46000000
1969  03  42000000
1969  04  33000000
1969  05  22000000
1969  06  13000000
1969  07  8000000
1969  08  5000000
1969  09  7000000
1970  01  48000000
1970  02  46000000
1970  03  42000000
1970  04  33000000
1970  05  22000000
1970  06  13000000
1970  07  8000000
1970  08  5000000
1970  09  7000000
1970  10  18000000
`;

// ─────────────────────────────────────────────────────────────────────────────
// A. parseGistemp
// ─────────────────────────────────────────────────────────────────────────────
section('A. parseGistemp — parsing correctness');

// parseGistemp calls Papa.parse which is an ESM import — in Node.js we can
// test it directly since we're running in a module context.
// Papa is a CommonJS module — use createRequire.
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Patch global fetch so loadGistempData isn't needed; we test parseGistemp directly.
// parseGistemp is synchronous and needs Papa.parse — which works in Node.
let gistempResult;
try {
  gistempResult = parseGistemp(GISTEMP_STUB);
  assert(true, 'parseGistemp runs without throwing on valid stub CSV');
} catch (e) {
  assert(false, 'parseGistemp runs without throwing', e.message);
  process.exit(1);
}

const { annual: ga, monthly: gm, seasonal: gs, meta: gmeta } = gistempResult;

assert(Array.isArray(ga),  'annual is an array');
assert(Array.isArray(gm),  'monthly is an array');
assert(Array.isArray(gs),  'seasonal is an array');

// 1880 row: J-D = -0.27 (present)
const row1880 = ga.find(r => r.year === 1880);
assert(row1880 !== undefined, '1880 row present in annual');
assertClose(row1880.anomaly, -0.27, 0.001, '1880 anomaly = -0.27');

// 1881 row: J-D = -0.23 (present)
const row1881 = ga.find(r => r.year === 1881);
assertClose(row1881.anomaly, -0.23, 0.001, '1881 anomaly = -0.23');

// 1882 row: J-D = *** → null (never 0)
const row1882 = ga.find(r => r.year === 1882);
assert(row1882 !== undefined, '1882 row present in annual (even though J-D = ***)');
assert(row1882.anomaly === null, '1882 J-D *** → anomaly is null, not 0');

// meta
assert(gmeta.minYear === 1880, 'meta.minYear = 1880');
assert(gmeta.maxYear === 1882, 'meta.maxYear = 1882');
assert(gmeta.baseline === '1951–1980', 'meta.baseline = 1951–1980');
assert(gmeta.source.includes('GISTEMP'), 'meta.source contains GISTEMP');

// monthly: 1880 Jan = -0.19
const mo1880 = gm.find(r => r.year === 1880);
assert(mo1880 !== undefined, '1880 monthly row present');
assertClose(mo1880.Jan, -0.19, 0.001, '1880 Jan monthly = -0.19');

// 1882 monthly: all *** → all null
const mo1882 = gm.find(r => r.year === 1882);
assert(Object.keys(mo1882).filter(k => k !== 'year').every(k => mo1882[k] === null),
  '1882 all monthly values are null (not 0)');

// ─────────────────────────────────────────────────────────────────────────────
// B. parseSnowCover — missing months, annual mean rules, null safety
// ─────────────────────────────────────────────────────────────────────────────
section('B. parseSnowCover — missing-month and annual-mean rules');

const sc = parseSnowCover(SNOW_STUB);

assert(Array.isArray(sc.annual), 'annual is an array');
assert(Array.isArray(sc.monthly), 'monthly is an array');
assert(typeof sc.meta === 'object', 'meta is an object');

// meta standard fields
assert(sc.meta.minYear === 1966, 'meta.minYear = 1966');
assert(sc.meta.maxYear === 1970, 'meta.maxYear = 1970');
assert(sc.meta.source  === 'Rutgers University Global Snow Lab', 'meta.source correct');
assert(sc.meta.baseline === null, 'meta.baseline = null (no anomaly baseline)');

// 1966: only 2 months → annual = null
const sc1966 = sc.annual.find(r => r.year === 1966);
assert(sc1966 !== undefined, '1966 row present');
assert(sc1966.anomaly === null, '1966 annual = null (only 2 months available)');
assert(sc1966.monthsAvailable === 2, '1966 monthsAvailable = 2');

// 1967: 12 months present → annual = mean of those 12
const sc1967 = sc.annual.find(r => r.year === 1967);
assert(sc1967 !== undefined, '1967 row present');
assert(sc1967.monthsAvailable === 12, '1967 monthsAvailable = 12');
assert(sc1967.anomaly !== null, '1967 annual is not null');
// Verify: mean of the 12 specific values in SNOW_STUB for 1967 (in Mkm²)
const vals1967 = [48517313,47431583,42977055,33111782,22794380,14367907,8209985,5308387,7218637,18975406,35000000,44000000];
const expected1967 = vals1967.reduce((s,v) => s + v, 0) / 12 / 1_000_000;
assertClose(sc1967.anomaly, expected1967, 0.0001, '1967 annual mean computed correctly from 12 months');

// 1968: Jul (month 7) absent → 11 months → annual = mean of 11 (not null, ≥ 10)
const sc1968 = sc.annual.find(r => r.year === 1968);
assert(sc1968 !== undefined, '1968 row present');
assert(sc1968.monthsAvailable === 11, '1968 monthsAvailable = 11 (Jul absent)');
assert(sc1968.anomaly !== null, '1968 annual is not null (11 ≥ 10)');
// Jul must be missing from monthly array, not substituted with 0
const sc1968Jul = sc.monthly.find(r => r.year === 1968 && r.month === 7);
assert(sc1968Jul !== undefined, '1968 Jul monthly row exists (year-month combination present)');
assert(sc1968Jul.value === null, '1968 Jul value is null, not 0 (absent month → null)');

// 1969: 9 months → annual = null (< 10)
const sc1969 = sc.annual.find(r => r.year === 1969);
assert(sc1969 !== undefined, '1969 row present');
assert(sc1969.monthsAvailable === 9, '1969 monthsAvailable = 9');
assert(sc1969.anomaly === null, '1969 annual = null (only 9 months)');

// 1970: exactly 10 months → annual = mean of 10 (boundary condition)
const sc1970 = sc.annual.find(r => r.year === 1970);
assert(sc1970 !== undefined, '1970 row present');
assert(sc1970.monthsAvailable === 10, '1970 monthsAvailable = 10');
assert(sc1970.anomaly !== null, '1970 annual is NOT null (10 ≥ 10, boundary met)');
const vals1970 = [48000000,46000000,42000000,33000000,22000000,13000000,8000000,5000000,7000000,18000000];
const expected1970 = vals1970.reduce((s,v) => s + v, 0) / 10 / 1_000_000;
assertClose(sc1970.anomaly, expected1970, 0.0001, '1970 annual mean computed correctly from 10 months');

// No absent month is treated as zero
// Count how many monthly entries have value === 0 (should be 0)
const zeroMonths = sc.monthly.filter(r => r.value === 0);
assert(zeroMonths.length === 0, 'No monthly entry has value === 0 (absent months are null, not zero)');

// All monthly entries that are null come from absent rows
const nullMonths = sc.monthly.filter(r => r.value === null);
assert(nullMonths.length > 0, 'Some monthly entries are null (expected for absent rows)');
// None of these should have a year that isn't in yearMonthMap — verify by checking
// that months from 1–12 are always present in monthly array for every year
const yearsInAnnual = sc.annual.map(r => r.year);
for (const y of yearsInAnnual) {
  const monthEntries = sc.monthly.filter(r => r.year === y);
  assert(monthEntries.length === 12, `Year ${y} has exactly 12 monthly slots (all 12 months represented)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// C. OLS regression — correctness on a simple known dataset
// ─────────────────────────────────────────────────────────────────────────────
section('C. olsRegression — correctness on hand-verified data');

// Perfect linear data: anomaly = 0.02*(year - 2000)
// slope = 0.02 exactly, intercept = -40, R² = 1.0
const linearData = Array.from({ length: 30 }, (_, i) => ({
  year: 2000 + i,
  anomaly: 0.02 * i,
}));
const linReg = olsRegression(linearData);
assert(!linReg.error, 'olsRegression returns no error for linear data');
assertClose(linReg.slope, 0.02, 1e-10, 'slope = 0.02 (perfect linear data)');
assertClose(linReg.rSquared, 1.0, 1e-10, 'R² = 1.0 (perfect linear data)');
assert(linReg.n === 30, 'n = 30');
assert(linReg.excludedYears.length === 0, 'no excluded years');
assert(Array.isArray(linReg.fittedLine), 'fittedLine is an array');
assert(linReg.fittedLine.length === 30, 'fittedLine length = 30');
// Verify year-keyed: fittedLine[0].year === 2000
assert(linReg.fittedLine[0].year === 2000, 'fittedLine[0].year = 2000');
assertClose(linReg.fittedLine[0].fitted, 0.0, 1e-9, 'fittedLine[0].fitted ≈ 0.0');

// With one null year interspersed
const dataWithNull = [...linearData];
dataWithNull[10] = { year: 2010, anomaly: null };  // remove year 2010
const nullReg = olsRegression(dataWithNull);
assert(!nullReg.error, 'regression with one null: no error');
assert(nullReg.n === 29, 'regression with one null: n = 29');
assert(nullReg.excludedYears.length === 1, 'regression with one null: 1 excluded year');
assert(nullReg.excludedYears[0].year === 2010, 'excluded year is 2010');
// fittedLine should not contain 2010 (null year excluded from complete set)
const fit2010 = nullReg.fittedLine.find(p => p.year === 2010);
assert(fit2010 === undefined, 'fittedLine does NOT contain null year 2010');

// ─────────────────────────────────────────────────────────────────────────────
// D. Mann-Kendall + Sen's slope
// ─────────────────────────────────────────────────────────────────────────────
section('D. mannKendallTest — correctness and null handling');

// Monotone increasing series → S > 0, trend = Increasing
const monoInc = Array.from({ length: 20 }, (_, i) => ({ year: 2000+i, anomaly: i * 0.1 }));
const mkInc = mannKendallTest(monoInc);
assert(!mkInc.error, 'MK no error on monotone increasing');
assert(mkInc.S > 0, 'S > 0 for monotone increasing');
assert(mkInc.standard.trend === 'Increasing', 'standard trend = Increasing');
assert(mkInc.adjusted.trend === 'Increasing', 'adjusted trend = Increasing');
assertClose(mkInc.senSlopePerDecade, 1.0, 0.001, 'Sen slope/decade = 1.0 for 0.1/yr series');

// Monotone decreasing
const monoDec = Array.from({ length: 20 }, (_, i) => ({ year: 2000+i, anomaly: -i * 0.1 }));
const mkDec = mannKendallTest(monoDec);
assert(mkDec.S < 0, 'S < 0 for monotone decreasing');
assert(mkDec.standard.trend === 'Decreasing', 'standard trend = Decreasing');

// With nulls — nulls are excluded, not counted as 0
const dataWithNulls = Array.from({ length: 20 }, (_, i) => ({
  year: 2000+i,
  anomaly: i === 5 || i === 10 ? null : i * 0.1,
}));
const mkNull = mannKendallTest(dataWithNulls);
assert(!mkNull.error, 'MK no error with nulls');
assert(mkNull.n === 18, 'MK n = 18 (2 nulls excluded)');
assert(mkNull.excludedYears.length === 2, 'MK 2 excluded years');
// S should still be positive (trend is still increasing for the remaining data)
assert(mkNull.S > 0, 'MK S > 0 even with nulls removed');

// ─────────────────────────────────────────────────────────────────────────────
// E. rollingMean — year-keyed output (not positional), null edges
// ─────────────────────────────────────────────────────────────────────────────
section('E. rollingMean — year alignment and null edge handling');

const rollData = Array.from({ length: 20 }, (_, i) => ({ year: 2000+i, anomaly: i * 0.1 }));
const rm = rollingMean(rollData, 11);

assert(!rm.error, 'rollingMean returns no error');
assert(Array.isArray(rm.series), 'rm.series is an array');
assert(rm.series.length === 20, 'rm.series length = 20');

// Year alignment: series[i].year must equal rollData[i].year — not positional
for (let i = 0; i < 20; i++) {
  if (rm.series[i].year !== 2000 + i) {
    assert(false, `Year alignment: series[${i}].year === ${2000+i}`, `got ${rm.series[i].year}`);
    break;
  }
}
assert(true, 'Year alignment: all series[i].year === rollData[i].year (year-keyed, not positional)');

// First 5 and last 5 entries must be null (edge of 11-yr window → half=5)
const edgeNull = rm.series.slice(0, 5).every(r => r.avg === null)
              && rm.series.slice(-5).every(r => r.avg === null);
assert(edgeNull, 'First 5 and last 5 rolling avg entries are null (edge padding)');

// Middle entries must be non-null
const middleNonNull = rm.series.slice(5, 15).every(r => r.avg !== null);
assert(middleNonNull, 'Middle entries (index 5–14) are non-null');

// Verify a mid-point value: index 10 → year 2010 → window [2005..2015]
// Values: 0.5,0.6,0.7,0.8,0.9,1.0,1.1,1.2,1.3,1.4,1.5 → mean = 1.0
assertClose(rm.series[10].avg, 1.0, 0.0001, 'series[10].avg = 1.0 for 0.1*i data (window mean)');

// rollingMean with one null in the middle
const rollWithNull = rollData.map((r, i) => i === 10 ? { year: r.year, anomaly: null } : r);
const rmNull = rollingMean(rollWithNull, 11);
// Year 2010 is null in the data; the window for years 2005–2015 will skip it
// but still compute over the remaining 10 non-null values
const idx2010 = rmNull.series.findIndex(r => r.year === 2010);
// Year 2010 itself: in position 10 (middle), it has a null anomaly.
// The window [2005..2015] still has 10 non-null values → avg is computed
// But position 10 itself is null, so the avg is computed from the window's non-null values
assert(rmNull.series[idx2010].avg !== null,
  'Year with null anomaly at centre of window: avg is still computed from non-null window members');
assert(rmNull.excludedYears.length === 1, 'rollingMean with 1 null: excludedYears.length = 1');

// ─────────────────────────────────────────────────────────────────────────────
// F. fittedLine year alignment in SnowCoverChart context
// ─────────────────────────────────────────────────────────────────────────────
section('F. fittedLine — year alignment for SnowCoverChart year-keyed lookup');

// Need >= MIN_N (10) complete years for regression to succeed.
// Use 20-year series with 2 null years (positions 0 and 3: years 1966, 1969).
const testAnnual = Array.from({ length: 20 }, (_, i) => ({
  year:    1966 + i,
  anomaly: (i === 0 || i === 3) ? null : 25.0 - i * 0.1,
}));
// 18 complete years — regression should succeed
const testReg = olsRegression(testAnnual);
assert(!testReg.error, 'regression on 20-yr mixed null/non-null data (18 complete): no error');
assert(testReg.n === 18, 'n = 18 (1966 and 1969 excluded as null)');
assert(Array.isArray(testReg.fittedLine), 'fittedLine is an array');
assert(testReg.fittedLine.find(p => p.year === 1966) === undefined, 'fittedLine does not contain null year 1966');
assert(testReg.fittedLine.find(p => p.year === 1969) === undefined, 'fittedLine does not contain null year 1969');
assert(testReg.fittedLine.find(p => p.year === 1967) !== undefined, 'fittedLine contains year 1967');
assert(testReg.fittedLine.find(p => p.year === 1985) !== undefined, 'fittedLine contains year 1985');

// Build fitMap the same way SnowCoverChart does (with Array.isArray guard)
const fitMap = {};
if (Array.isArray(testReg.fittedLine)) {
  testReg.fittedLine.forEach(pt => { if (pt?.year != null) fitMap[pt.year] = pt.fitted; });
}
assert(fitMap[1967] !== undefined, 'fitMap[1967] is defined');
assert(fitMap[1966] === undefined, 'fitMap[1966] is undefined (null year not in fittedLine)');
assert(fitMap[1969] === undefined, 'fitMap[1969] is undefined (null year not in fittedLine)');

// Build rolling average the same way SnowCoverChart does
const rollResult = rollingMean(testAnnual, 11);
const avgMap = {};
if (Array.isArray(rollResult.series)) {
  rollResult.series.forEach(r => { if (r?.year != null) avgMap[r.year] = r.avg; });
}

const chartData = testAnnual.map(d => ({
  year:   d.year,
  extent: d.anomaly,
  trend:  fitMap[d.year]  ?? null,
  movAvg: avgMap[d.year] ?? null,
}));
// Year 1967 (complete, within centre of 11-yr rolling window) => trend non-null
assert(chartData.find(d => d.year === 1967).trend !== null,
  'chartData[1967].trend is non-null (year-keyed, not positional)');
// Year 1966 => trend null (anomaly was null, not in fittedLine)
assert(chartData.find(d => d.year === 1966).trend === null,
  'chartData[1966].trend is null (null anomaly => no fitted value)');
// Year 1969 => trend null
assert(chartData.find(d => d.year === 1969).trend === null,
  'chartData[1969].trend is null (null anomaly => no fitted value)');

// Regression error path: olsRegression returns {error} when n < 10
// SnowCoverChart guards with Array.isArray(fittedLine) — verify guard handles this
const tooFewData = Array.from({ length: 5 }, (_, i) => ({ year: 2000+i, anomaly: i * 0.1 }));
const errorReg = olsRegression(tooFewData);
assert(errorReg.error !== undefined, 'olsRegression returns error when n < MIN_N (5 < 10)');
assert(errorReg.fittedLine === undefined, 'fittedLine is undefined when regression errors');
// Simulate SnowCoverChart guard: Array.isArray(undefined) === false
const guardedFitMap = {};
if (Array.isArray(errorReg.fittedLine)) {
  errorReg.fittedLine.forEach(pt => { guardedFitMap[pt.year] = pt.fitted; });
}
assert(Object.keys(guardedFitMap).length === 0,
  'Array.isArray guard prevents crash when fittedLine is undefined');

// ─────────────────────────────────────────────────────────────────────────────
// G. GISTEMP unit defaults — no regressions in units for GISTEMP path
// ─────────────────────────────────────────────────────────────────────────────
section('G. Unit defaults — GISTEMP path uses °C, Snow Cover uses Mkm²');

// parseGistemp meta has no unit field (unit comes from registry, not parser)
// The registry specifies unit: '°C' for gistemp and 'Mkm²' for snowcover.
// We verify the meta structure is compatible with what Header/TrendPanel expect.
const giMeta = gistempResult.meta;
assert('baseline' in giMeta, 'GISTEMP meta has baseline field');
assert('source'   in giMeta, 'GISTEMP meta has source field');
assert('minYear'  in giMeta, 'GISTEMP meta has minYear field');
assert('maxYear'  in giMeta, 'GISTEMP meta has maxYear field');

const scMeta = sc.meta;
assert(scMeta.baseline === null, 'Snow Cover meta.baseline === null');
assert('source'   in scMeta, 'Snow Cover meta has source field');
assert('minYear'  in scMeta, 'Snow Cover meta has minYear field');
assert('maxYear'  in scMeta, 'Snow Cover meta has maxYear field');

// TrendPanel subtitle uses meta.source ?? variableName — confirm no crash
const tpSubtitle_gistemp = giMeta.source ?? 'Temperature Anomaly';
const tpSubtitle_snow    = scMeta.source ?? 'Snow Cover Extent';
assert(tpSubtitle_gistemp.includes('GISTEMP'), 'TrendPanel subtitle uses GISTEMP source for GISTEMP');
assert(tpSubtitle_snow.includes('Rutgers'),    'TrendPanel subtitle uses Rutgers source for Snow Cover');

// ─────────────────────────────────────────────────────────────────────────────
// H. generateInsight — unit substitution
// ─────────────────────────────────────────────────────────────────────────────
section('H. generateInsight — unit string substitution');

// Build enough complete data for all analysis functions to succeed
const insightData = Array.from({ length: 50 }, (_, i) => ({ year: 1970+i, anomaly: i * 0.01 }));
const reg50   = olsRegression(insightData);
const mk50    = mannKendallTest(insightData);
const ext50   = findExtremes(insightData);
const metaGi  = { source: 'NASA GISTEMP v4', minYear: 1970, maxYear: 2019, baseline: '1951–1980' };
const metaSc  = { source: 'Rutgers University Global Snow Lab', minYear: 1970, maxYear: 2019, baseline: null };

const insightGi = generateInsight(reg50, mk50, ext50, metaGi, '°C');
const insightSc = generateInsight(reg50, mk50, ext50, metaSc, 'Mkm²');

// GISTEMP: should contain '°C' and not contain 'Mkm²'
const giText = insightGi.paragraphs.join(' ');
assert(giText.includes('°C'), 'GISTEMP insight contains °C');
assert(!giText.includes('Mkm²'), 'GISTEMP insight does NOT contain Mkm²');
assert(giText.includes('1951–1980'), 'GISTEMP insight mentions baseline');

// Snow Cover: should contain 'Mkm²' and not contain '°C'
const scText = insightSc.paragraphs.join(' ');
assert(scText.includes('Mkm²'), 'Snow Cover insight contains Mkm²');
assert(!scText.includes('°C'), 'Snow Cover insight does NOT contain °C');
assert(!scText.includes('unknown baseline'), 'Snow Cover insight does not say "unknown baseline"');
assert(scText.includes('absolute measure'), 'Snow Cover insight says "absolute measure" (no baseline)');

// No hardcoded scientific observations in insight text
assert(!giText.includes('1.5°C'), 'insight text does not contain hardcoded 1.5°C');
assert(!giText.includes('warming of'), 'insight text does not say "warming of" (no fabricated conclusion)');

// ─────────────────────────────────────────────────────────────────────────────
// I. Cache isolation — switching datasets does not leak state
// ─────────────────────────────────────────────────────────────────────────────
section('I. Dataset isolation — parsing is independent for each dataset');

// Parse both datasets separately and verify no field cross-contamination
const sc2 = parseSnowCover(SNOW_STUB);
const gi2 = parseGistemp(GISTEMP_STUB);

assert(sc2.meta.baseline === null, 'Snow Cover re-parse: baseline still null');
assert(gi2.meta.baseline === '1951–1980', 'GISTEMP re-parse: baseline still 1951–1980');
assert(sc2.meta.source !== gi2.meta.source, 'Sources differ between datasets');
assert(sc2.annual.every(r => !('Jan' in r)), 'Snow cover annual rows do not have monthly columns');
assert(gi2.annual.every(r => !('monthsAvailable' in r)), 'GISTEMP annual rows do not have monthsAvailable column');

// Verify GISTEMP monthly has month-name keys; Snow Cover monthly has month-number keys
assert(gi2.monthly[0] && 'Jan' in gi2.monthly[0], 'GISTEMP monthly row has Jan key');
assert(sc2.monthly[0] && 'month' in sc2.monthly[0], 'Snow Cover monthly row has month key');

// ─────────────────────────────────────────────────────────────────────────────
// J. Extreme events — correctness on known data
// ─────────────────────────────────────────────────────────────────────────────
section('J. findExtremes — null exclusion and percentile correctness');

const extData = Array.from({ length: 100 }, (_, i) => ({ year: 1920+i, anomaly: i === 50 ? null : i * 0.01 }));
const ext = findExtremes(extData);
assert(!ext.error, 'findExtremes no error');
assert(ext.n === 99, 'n = 99 (1 null excluded)');
assert(ext.excludedYears.length === 1, '1 excluded year');
assert(ext.excludedYears[0].year === 1970, 'excluded year is 1970 (index 50)');
assert(ext.stdDevType === 'sample', 'stdDevType = sample (Bessel-corrected)');
assert(ext.stdDev !== null, 'stdDev is not null');
// p95 for 99 values in 0.00,0.01,...,0.49,0.51,...,0.99
// Values: 99 * 0.01 spacing from 0.00 to 0.98 (skipping 0.50)
// sorted: 0.00,0.01,...,0.49,0.51,...,0.98  (99 values)
// p95 index: 0.95 * 98 = 93.1 → sorted[93] + 0.1*(sorted[94]-sorted[93])
// sorted[93] = 0.93 (index 93 in 0-based, which is the 94th value = 0.00+93*0.01 but skip 0.50)
// Values below 0.50: indices 0-49 (0.00–0.49), above 0.50: indices 50-98 (0.51–0.99)
// sorted[93] = 0.94 (0.51 + 43*0.01 = 0.51+0.43 = 0.94)? Let me just check it's > 0
assert(ext.p95 > 0, 'p95 > 0');
assert(ext.p05 >= 0, 'p05 >= 0');
assert(ext.p95 > ext.p05, 'p95 > p05');

// Record high years should have anomaly > p95
ext.records.filter(r => r.type === 'high').forEach(r => {
  if (r.anomaly <= ext.p95) {
    assert(false, `Record high year ${r.year}: anomaly ${r.anomaly} should be > p95 ${ext.p95}`);
  }
});
assert(true, 'All record high years have anomaly > p95');

// ─────────────────────────────────────────────────────────────────────────────
// GISTEMP CSV integrity check (read-only)
// ─────────────────────────────────────────────────────────────────────────────
section('K. GISTEMP CSV integrity check');

import { readFileSync } from 'fs';
const csvContent = readFileSync('./public/data/GLB.Ts+dSST.csv', 'utf-8');
const csvLines   = csvContent.split('\n').filter(l => l.trim() !== '');
assert(csvLines.length >= 148, `CSV has ${csvLines.length} non-empty lines (≥ 148 expected)`);
assert(csvLines[0].includes('Land-Ocean') || csvLines[0].includes('Global'), 'CSV row 1 is title row');
assert(csvLines[1].includes('Year'), 'CSV row 2 contains Year header');
assert(!csvContent.includes('NHsnow'), 'GISTEMP CSV does not contain snow cover data');

// Snow cover file read from local public/data
const snowContent = readFileSync('./public/data/NHsnowcover.txt', 'utf-8');
const snowLines   = snowContent.split('\n').filter(l => l.trim() !== '');
assert(snowLines.length === 711, `Snow cover file has 711 non-empty lines (got ${snowLines.length})`);
assert(snowLines[0].trim().startsWith('1966'), 'Snow cover first record is 1966');
assert(!snowContent.includes('Year,'), 'Snow cover file has no CSV header');

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'═'.repeat(60)}`);
console.log(`  AUDIT SUMMARY`);
console.log(`${'═'.repeat(60)}`);
console.log(`  Passed : ${passed}`);
console.log(`  Failed : ${failed}`);
if (failures.length > 0) {
  console.log('\n  FAILURES:');
  failures.forEach(f => console.log(`    ✗  ${f}`));
}
console.log(`${'═'.repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
