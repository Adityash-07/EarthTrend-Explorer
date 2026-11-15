// src/analysis/regression.js
//
// Ordinary Least Squares (OLS) linear regression for annual temperature anomaly data.
//
// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//   • Filters out null anomalies (NASA's "***" missing-value marker) and
//     incomplete years before computing anything.
//   • Fits a straight line  ŷ = slope × year + intercept  to the data.
//   • Returns the slope in °C per decade, R², and a 95% confidence interval.
//   • Returns the full fitted-line array so the chart can draw the trend line.
//   • Computes the Durbin-Watson statistic so autocorrelation is visible.
//
// ─── 95% CONFIDENCE INTERVAL — EXACT METHOD AND ASSUMPTIONS ─────────────────
//   The CI is computed using the classical OLS standard error formula:
//
//     se(slope) = sqrt( SSres / (n-2) )  /  sqrt( Σ(xᵢ − x̄)² )
//
//   where SSres = Σ(yᵢ − ŷᵢ)² is the residual sum of squares.
//
//   The 95% CI for the slope is then:
//
//     [slope − t*(df=n-2) × se(slope),  slope + t*(df=n-2) × se(slope)]
//
//   t* is obtained from an accurate numerical approximation of the Student
//   t-distribution inverse CDF at α/2 = 0.025, df = n-2.
//
//   ASSUMPTIONS of this CI (all stated to the user in TrendPanel):
//     1. Residuals are independent and identically distributed.
//     2. Residuals are approximately normally distributed.
//     3. Variance of residuals is constant (homoscedasticity).
//
//   KNOWN LIMITATION — AUTOCORRELATION:
//     Annual surface temperature observations are serially correlated: each
//     year's anomaly is partly predictable from the previous year's.  This
//     violates assumption 1, causing se(slope) to be underestimated, which
//     makes the CI artificially narrow and p-values artificially small.
//     We report the Durbin-Watson statistic (DW) alongside the CI.
//     DW ≈ 2 means little autocorrelation; DW < 1.5 is a strong warning.
//     Users should treat the CI as a lower bound on true uncertainty.
//     The Mann-Kendall test (mannKendall.js) is non-parametric and more
//     reliable for trend direction under autocorrelation.
//
// ─── INCOMPLETE-YEAR HANDLING ────────────────────────────────────────────────
//   A year is considered "complete" only if its J-D (annual mean) anomaly is
//   non-null in the parsed data.  NASA marks partial-year J-D values as "***",
//   which parseGistemp.js converts to null.  This function:
//     • Never converts null to 0.
//     • Reports every excluded year in the returned `excludedYears` array.
//
// ─── MINIMUM SAMPLE SIZE ─────────────────────────────────────────────────────
//   At least 10 complete years are required.  Fewer returns { error, n, excludedYears }.

const MIN_N = 10

/**
 * Student t critical value at two-tailed α = 0.05 (i.e. the 97.5th percentile).
 *
 * I2 fix: the previous lookup table for df ≤ 10 contained incorrect values
 * (they were an unrelated approximation, not actual t₀.₀₂₅ values).
 * The table below contains the exact values from standard statistical tables,
 * verified against scipy.stats.t.ppf(0.975, df) for df = 1..10:
 *
 *   df=1:  12.706   df=2:  4.303   df=3:  3.182   df=4:  2.776   df=5:  2.571
 *   df=6:  2.447    df=7:  2.365   df=8:  2.306   df=9:  2.262   df=10: 2.228
 *
 * For df > 10 the Hill (1970) / Cornish-Fisher expansion is used, which is
 * accurate to ~4 decimal places for df ≥ 11.  For df ≥ 1000 we return the
 * z-value 1.95996 (error < 0.00001).
 *
 * Plain English: this tells us how many "standard errors" wide the 95%
 * confidence interval must be for a given sample size.
 */
function tCritical95(df) {
  if (df >= 1000) return 1.95996
  // I2 fix: exact t₀.₀₂₅ values for df = 1..10 (from standard t-tables,
  // verified against scipy.stats.t.ppf(0.975, df)).
  const exactTable = [
    12.706,  // df = 1
     4.303,  // df = 2
     3.182,  // df = 3
     2.776,  // df = 4
     2.571,  // df = 5
     2.447,  // df = 6
     2.365,  // df = 7
     2.306,  // df = 8
     2.262,  // df = 9
     2.228,  // df = 10
  ]
  if (df >= 1 && df <= 10) return exactTable[df - 1]
  // For df > 10: Cornish-Fisher / Hill (1970) rational expansion.
  // t ≈ z + g₁/df + g₂/df² + g₃/df³  where z = z₀.₉₇₅ = 1.95996
  const z = 1.95996
  const g1 = (z ** 3 + z) / 4
  const g2 = (5 * z ** 5 + 16 * z ** 3 + 3 * z) / 96
  const g3 = (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / 384
  return z + g1 / df + g2 / (df ** 2) + g3 / (df ** 3)
}

/**
 * Durbin-Watson statistic for first-order autocorrelation.
 *
 *   DW = Σ(eᵢ − eᵢ₋₁)² / Σeᵢ²
 *
 * I3 fix: thresholds and comments below now match the classification used
 * in the autocorrWarning logic (see Step 7):
 *   DW < 1.0  → "strong" positive autocorrelation
 *   DW 1.0–1.5 → "moderate" positive autocorrelation
 *   DW 1.5–2.5 → "low" autocorrelation (CI approximately reliable)
 *   DW > 2.5  → "negative" autocorrelation (unusual in climate series)
 *
 * @param {number[]} residuals
 */
function durbinWatson(residuals) {
  let num = 0, den = 0
  for (let i = 0; i < residuals.length; i++) {
    den += residuals[i] ** 2
    if (i > 0) num += (residuals[i] - residuals[i - 1]) ** 2
  }
  return den === 0 ? null : num / den
}

/**
 * Fit an OLS trend line to annual anomaly data.
 *
 * @param {Array<{ year: number, anomaly: number|null }>} annual
 *   The full parsed annual series from parseGistemp.js.
 * @returns {object} See inline docs below, or { error, n, excludedYears } on failure.
 */
export function olsRegression(annual) {
  if (!Array.isArray(annual) || annual.length === 0) {
    return { error: 'No data provided.', n: 0, excludedYears: [] }
  }

  // ── Step 1: separate complete years from excluded years ───────────────────
  const complete = []
  const excludedYears = []
  for (const row of annual) {
    if (row.anomaly === null || row.anomaly === undefined || isNaN(row.anomaly)) {
      excludedYears.push({ year: row.year, reason: 'Annual mean is missing (marked *** in source data)' })
    } else {
      complete.push({ year: row.year, anomaly: row.anomaly })
    }
  }

  const n = complete.length

  if (n < MIN_N) {
    return {
      error: `Insufficient complete years for regression (n = ${n}, minimum required = ${MIN_N}).`,
      n,
      excludedYears,
    }
  }

  // ── Step 2: compute means ─────────────────────────────────────────────────
  let xSum = 0, ySum = 0
  for (const { year, anomaly } of complete) { xSum += year; ySum += anomaly }
  const xMean = xSum / n
  const yMean = ySum / n

  // ── Step 3: compute slope and intercept ───────────────────────────────────
  let Sxx = 0, Sxy = 0
  for (const { year, anomaly } of complete) {
    Sxx += (year - xMean) ** 2
    Sxy += (year - xMean) * (anomaly - yMean)
  }

  if (Sxx === 0) {
    // All years are identical — cannot fit a line (should never happen with real data)
    return { error: 'Zero variance in year values — cannot compute regression.', n, excludedYears }
  }

  const slope     = Sxy / Sxx          // °C per year
  const intercept = yMean - slope * xMean

  // ── Step 4: residuals and R² ──────────────────────────────────────────────
  const residuals = complete.map(({ year, anomaly }) => anomaly - (slope * year + intercept))

  const SSres = residuals.reduce((s, e) => s + e ** 2, 0)
  const SStot = complete.reduce((s, { anomaly }) => s + (anomaly - yMean) ** 2, 0)

  const rSquared = SStot === 0 ? null : 1 - SSres / SStot

  // ── Step 5: standard error of slope and 95% CI ───────────────────────────
  // df = n - 2  (we estimated two parameters: slope and intercept)
  const df       = n - 2
  const residVar = SSres / df          // mean squared residual (σ² estimate)
  const sSlope   = Math.sqrt(residVar / Sxx)  // standard error of slope
  const tCrit    = tCritical95(df)

  // CI is on slope per year; convert to per decade for display
  const ciLowPerDecade  = (slope - tCrit * sSlope) * 10
  const ciHighPerDecade = (slope + tCrit * sSlope) * 10

  // ── Step 6: Durbin-Watson statistic ───────────────────────────────────────
  const dw = durbinWatson(residuals)

  // ── Step 7: autocorrelation warning level ────────────────────────────────
  // I3 fix: classification labels now match the DW header comment exactly.
  //   DW < 1.0  → "strong"   (CI likely substantially too narrow)
  //   DW 1.0–1.5 → "moderate" (CI may be meaningfully too narrow)
  //   DW 1.5–2.5 → "low"      (CI approximately reliable under OLS assumptions)
  //   DW > 2.5  → "negative"  (unusual for climate series)
  let autocorrWarning
  if (dw === null) {
    autocorrWarning = 'unknown'
  } else if (dw < 1.0) {
    autocorrWarning = 'strong'
  } else if (dw < 1.5) {
    autocorrWarning = 'moderate'
  } else if (dw < 2.5) {
    autocorrWarning = 'low'
  } else {
    autocorrWarning = 'negative'
  }

  // ── Step 8: build fitted line array for chart overlay ────────────────────
  // We generate a point for every complete year (not just filtered display range).
  const fittedLine = complete.map(({ year }) => ({
    year,
    fitted: slope * year + intercept,
  }))

  return {
    // Core result
    slope,                           // °C per year (raw)
    slopePerDecade: slope * 10,      // °C per decade (for display)
    intercept,
    rSquared,                        // 0–1, or null if SStot = 0

    // Confidence interval (95%, OLS classical formula — see autocorrelation caveat)
    ciLowPerDecade,                  // lower bound, °C per decade
    ciHighPerDecade,                 // upper bound, °C per decade
    ciMethod: 'OLS classical (t-distribution, df = n − 2)',
    ciAssumptions: [
      'Independent and identically distributed residuals',
      'Approximately normal residuals',
      'Constant residual variance (homoscedasticity)',
    ],

    // Autocorrelation assessment
    durbinWatson: dw,
    autocorrWarning,
    // Human-readable label for the DW warning
    autocorrLabel: {
      strong:   'Strong positive autocorrelation detected (DW < 1.0). The 95% CI is likely substantially too narrow. Treat as a lower bound on uncertainty.',
      moderate: 'Moderate autocorrelation detected (DW < 1.5). The 95% CI may be somewhat too narrow.',
      low:      'Low autocorrelation (DW ≈ 2). CI is approximately reliable under OLS assumptions.',
      negative: 'Negative autocorrelation detected (DW > 2.5). Unusual for climate series — verify data.',
      unknown:  'Autocorrelation could not be assessed.',
    }[autocorrWarning],

    // Sample details
    n,
    excludedYears,  // array of { year, reason } — shown in TrendPanel

    // Chart data
    fittedLine,     // [ { year, fitted }, … ] for every complete year
  }
}
