// src/analysis/mannKendall.js
//
// Mann-Kendall trend test and Sen's slope estimator.
//
// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//   • Filters null anomalies and incomplete years before any computation.
//   • Computes the Mann-Kendall S statistic and two variance estimates:
//       (a) Standard MK variance (assumes independent observations)
//       (b) Autocorrelation-adjusted variance (Hamed & Rao 1998)
//   • Returns separate significance results for BOTH so the user can see
//     the difference — a key requirement for scientific honesty.
//   • Computes Sen's slope (the median of all pairwise slopes).
//
// ─── AUTOCORRELATION HANDLING — IMPORTANT ────────────────────────────────────
//   The standard Mann-Kendall variance formula assumes observations are
//   independent.  Annual surface temperature anomalies are NOT independent —
//   each year is partly predictable from the year before (positive serial
//   correlation).  This causes the standard MK test to overstate significance.
//
//   We implement the Hamed & Rao (1998) modified variance correction:
//     "A modified Mann-Kendall trend test for autocorrelated data",
//     Journal of Hydrology, 204(1-4), 182-196.
//
//   The correction inflates the variance by a factor that depends on the
//   autocorrelation structure of the ranks.  A higher corrected variance
//   yields a smaller |Z| and larger p-value (less confident in the trend).
//
//   Both results (standard and adjusted) are returned and labelled.
//   The adjusted result is recommended for display.
//   We do NOT simply pick one and hide the other.
//
//   EXACT FORMULA IMPLEMENTED (Hamed & Rao 1998, equation 3):
//     n*_s / n  =  1  +  2/(n(n-1)(n-2))  ×  Σ[k=1..n-1] (n-k)(n-k-1)(n-k-2) × ρₛ(k)
//
//   where ρₛ(k) is the autocorrelation of the FRACTIONAL RANKS of the values
//   at lag k.  "Fractional ranks" means tied observations receive the AVERAGE
//   of the ranks they would occupy (e.g. if values 3 and 4 tie, both get 3.5).
//   This is required by the H&R paper; competition ranks give different results.
//
// ─── WHAT THE RESULTS MEAN ───────────────────────────────────────────────────
//   • S > 0  →  later values tend to be higher than earlier values (warming trend)
//   • S < 0  →  later values tend to be lower (cooling trend)
//   • p ≤ 0.01 →  "significant at 1% level" — very unlikely to be a random fluctuation
//   • p > 0.05 →  "no statistically significant trend detected"
//
// ─── INCOMPLETE-YEAR HANDLING ────────────────────────────────────────────────
//   Same policy as regression.js: null anomaly = excluded, reason reported.
//   null is NEVER converted to 0.

const MIN_N = 10

/** Compute the two-tailed p-value from a Z score using an accurate
 *  error-function approximation (Horner's method, error < 1.5×10⁻⁷). */
function zToPValue(z) {
  const absZ = Math.abs(z)
  // Abramowitz & Stegun 26.2.17 approximation
  const t = 1 / (1 + 0.2316419 * absZ)
  const poly = t * (0.319381530
    + t * (-0.356563782
    + t * (1.781477937
    + t * (-1.821255978
    + t * 1.330274429))))
  const pdf  = Math.exp(-0.5 * absZ ** 2) / Math.sqrt(2 * Math.PI)
  const oneTail = pdf * poly
  return Math.min(1, 2 * oneTail)  // two-tailed
}

/** Classify a p-value into a human-readable significance label. */
function significanceLabel(p) {
  if (p <= 0.001) return 'p ≤ 0.001 (very highly significant)'
  if (p <= 0.01)  return 'p ≤ 0.01 (highly significant)'
  if (p <= 0.05)  return 'p ≤ 0.05 (significant)'
  return 'p > 0.05 (not statistically significant)'
}

/** Classify trend direction from S and p. */
function trendLabel(S, p) {
  if (p > 0.05) return 'No statistically significant trend'
  return S > 0 ? 'Increasing' : 'Decreasing'
}

/**
 * Compute fractional (average-tie) ranks for an array of values.
 *
 * "Fractional ranks" means that tied observations receive the average of the
 * ranks they would occupy if they were ordered arbitrarily among themselves.
 * Example: values [3, 1, 3] → ranks [2.5, 1, 2.5]  (the two 3s share ranks 2 and 3).
 *
 * This is the correct rank type for the Hamed & Rao (1998) autocorrelation
 * correction.  Using competition ranks (1-2-2-4 style) instead gives slightly
 * different ρₛ values and can understate the inflation factor.
 *
 * @param {number[]} values
 * @returns {number[]} fractional ranks, same length
 */
export function fractionalRanks(values) {
  const n = values.length
  // For each value, count how many values are strictly less (gives 0-based rank start)
  // then count ties to compute the average rank.
  return values.map(v => {
    let nBelow = 0
    let nEqual = 0
    for (const w of values) {
      if (w < v)       nBelow++
      else if (w === v) nEqual++
    }
    // Ranks are 1-based. Positions occupied: nBelow+1 through nBelow+nEqual.
    // Average = nBelow + (nEqual + 1) / 2
    return nBelow + (nEqual + 1) / 2
  })
}

/**
 * Compute the autocorrelation coefficients ρₛ(1), ρₛ(2), … ρₛ(nLag) of an array.
 * Used by the Hamed & Rao variance correction.
 *
 * Uses the full-sample variance in the denominator (consistent with H&R eq. 3)
 * rather than a lag-corrected denominator.
 *
 * @param {number[]} arr  — array of fractional ranks (or any numeric series)
 * @param {number}   nLag — number of lags to compute (H&R recommend n/3)
 */
function autocorrelations(arr, nLag) {
  const n     = arr.length
  const mean  = arr.reduce((s, v) => s + v, 0) / n
  const denom = arr.reduce((s, v) => s + (v - mean) ** 2, 0)
  const rhos  = []
  for (let lag = 1; lag <= nLag; lag++) {
    let num = 0
    for (let i = 0; i < n - lag; i++) num += (arr[i] - mean) * (arr[i + lag] - mean)
    rhos.push(denom === 0 ? 0 : num / denom)
  }
  return rhos
}

/**
 * Mann-Kendall trend test with optional Hamed & Rao (1998) autocorrelation correction.
 *
 * @param {Array<{ year: number, anomaly: number|null }>} annual
 * @returns {object}  See return statement for field documentation.
 */
export function mannKendallTest(annual) {
  if (!Array.isArray(annual) || annual.length === 0) {
    return { error: 'No data provided.', n: 0, excludedYears: [] }
  }

  // ── Step 1: filter to complete years only ─────────────────────────────────
  const complete     = []
  const excludedYears = []
  for (const row of annual) {
    if (row.anomaly === null || row.anomaly === undefined || isNaN(row.anomaly)) {
      excludedYears.push({ year: row.year, reason: 'Annual mean is missing (marked *** in source data)' })
    } else {
      complete.push({ year: row.year, anomaly: row.anomaly })
    }
  }

  const n = complete.length
  const values = complete.map(r => r.anomaly)

  if (n < MIN_N) {
    return {
      error: `Insufficient complete years for Mann-Kendall test (n = ${n}, minimum required = ${MIN_N}).`,
      n,
      excludedYears,
    }
  }

  // ── Step 2: compute S statistic ───────────────────────────────────────────
  // For every pair (i, j) where j > i, add +1 if yⱼ > yᵢ, -1 if yⱼ < yᵢ, 0 if equal.
  let S = 0
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const diff = values[j] - values[i]
      if (diff > 0)      S++
      else if (diff < 0) S--
    }
  }

  // ── Step 3: standard MK variance (no autocorrelation correction) ──────────
  // Count tied groups: a "tie" is two or more years with the same anomaly value.
  const counts = {}
  for (const v of values) {
    const key = v.toFixed(4)   // group at 4 decimal places
    counts[key] = (counts[key] ?? 0) + 1
  }
  let tieAdjustment = 0
  for (const tp of Object.values(counts)) {
    if (tp > 1) tieAdjustment += tp * (tp - 1) * (2 * tp + 5)
  }

  const varS_standard = (n * (n - 1) * (2 * n + 5) - tieAdjustment) / 18

  // Z score (continuity correction: subtract/add 1 from |S| before dividing)
  const zStandard = S === 0 ? 0
    : S > 0 ? (S - 1) / Math.sqrt(varS_standard)
    :          (S + 1) / Math.sqrt(varS_standard)

  const pStandard    = zToPValue(zStandard)

  // ── Step 4: Hamed & Rao (1998) autocorrelation-adjusted variance ──────────
  // Reference: Hamed & Rao (1998), J. Hydrology 204, 182-196, equation 3.
  //
  // EXACT FORMULA:
  //   n*_s / n  =  1  +  [2 / (n(n-1)(n-2))]  ×  Σ[k=1..n-1] (n-k)(n-k-1)(n-k-2) × ρₛ(k)
  //
  // where ρₛ(k) is the lag-k autocorrelation of the fractional ranks of the values.
  // The inflation factor n*_s / n is what we multiply varS_standard by.
  //
  // Note: the third factor in the sum is (n-k-2), NOT (n-k+1).  The old code
  // had (n-k+1) which was incorrect.  This has been corrected here.

  // I5 fix: use fractional (average-tie) ranks, not competition ranks.
  const ranks = fractionalRanks(values)

  // H&R suggest using up to n/3 lags to balance information and variance.
  const maxLag = Math.floor(n / 3)
  const rhos   = autocorrelations(ranks, maxLag)

  // I1 fix: correct formula — outer coefficient 2/(n(n-1)(n-2)), inner (n-k)(n-k-1)(n-k-2)
  let inflationFactor = 1
  for (let k = 1; k <= maxLag; k++) {
    const nk = n - k
    if (nk < 2) break  // need nk ≥ 2 for (nk-1) and nk ≥ 3 for (nk-2) to be positive
    // Published term: (n-k)(n-k-1)(n-k-2)
    const innerProduct = nk * (nk - 1) * (nk - 2)
    // Outer coefficient: 2 / (n(n-1)(n-2))
    inflationFactor += (2 / (n * (n - 1) * (n - 2))) * innerProduct * rhos[k - 1]
  }
  // Floor the inflation factor at 1.  Rationale:
  //
  // The H&R correction can theoretically produce a factor < 1 when lag-k
  // autocorrelations are predominantly negative (e.g. an alternating series).
  // A factor < 1 would make the adjusted variance *smaller* than the standard
  // variance, increasing |Z| and making the test MORE sensitive — the opposite
  // of the correction's purpose for typical climate data.
  //
  // We floor at 1 for three reasons:
  //   1. Conservative: annual surface temperature data nearly always exhibits
  //      positive autocorrelation; a factor < 1 is almost certainly spurious.
  //   2. Consistent with published implementations: Yue & Wang (2004) and most
  //      R packages (e.g. 'trend') apply the same floor.
  //   3. Prevents artificially inflated significance claims when autocorrelation
  //      estimates at high lags are noisy (high-lag rhos are unreliable for
  //      short series and can fluctuate negative by chance).
  //
  // If a dataset is known to have genuine sustained negative autocorrelation,
  // the floor should be removed and the choice documented explicitly.
  inflationFactor = Math.max(1, inflationFactor)

  const varS_adjusted = varS_standard * inflationFactor

  const zAdjusted = S === 0 ? 0
    : S > 0 ? (S - 1) / Math.sqrt(varS_adjusted)
    :          (S + 1) / Math.sqrt(varS_adjusted)

  const pAdjusted = zToPValue(zAdjusted)

  // ── Step 5: Sen's slope ───────────────────────────────────────────────────
  // Compute all N*(N-1)/2 pairwise slopes, then take the median.
  // This is resistant to outlier years — a single record warm year does not
  // pull the trend estimate up the way OLS slope would.
  const pairwiseSlopes = []
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      const dy = values[j] - values[i]
      const dx = complete[j].year - complete[i].year
      if (dx !== 0) pairwiseSlopes.push(dy / dx)
    }
  }
  pairwiseSlopes.sort((a, b) => a - b)
  const mid         = Math.floor(pairwiseSlopes.length / 2)
  const senSlope    = pairwiseSlopes.length % 2 === 1
    ? pairwiseSlopes[mid]
    : (pairwiseSlopes[mid - 1] + pairwiseSlopes[mid]) / 2

  return {
    // Core MK statistic
    S,
    n,
    excludedYears,

    // ── Standard MK result (independent-observations assumption) ─────────────
    standard: {
      zScore:        zStandard,
      pValue:        pStandard,
      trend:         trendLabel(S, pStandard),
      significance:  significanceLabel(pStandard),
      assumption:    'Assumes observations are independent (no autocorrelation correction).',
      warning:       'Annual climate data are serially correlated; this result is likely overconfident.',
    },

    // ── Autocorrelation-adjusted MK result (Hamed & Rao 1998) ────────────────
    adjusted: {
      zScore:        zAdjusted,
      pValue:        pAdjusted,
      trend:         trendLabel(S, pAdjusted),
      significance:  significanceLabel(pAdjusted),
      inflationFactor: inflationFactor.toFixed(3),
      method:        'Hamed & Rao (1998) modified variance (accounts for serial autocorrelation in ranks).',
      recommendation: 'This is the recommended result for annual climate data. A larger inflation factor means stronger autocorrelation.',
    },

    // ── Sen's slope ───────────────────────────────────────────────────────────
    senSlope,                            // °C per year
    senSlopePerDecade: senSlope * 10,    // °C per decade (for display)
    senSlopeMethod:    'Median of all n(n-1)/2 pairwise slopes. Robust to outlier years.',
  }
}
