// src/analysis/extremes.js
//
// Extreme-value detection for annual temperature anomaly series.
//
// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//   • Identifies "record years" — years whose annual anomaly falls above the
//     95th percentile (high records) or below the 5th percentile (low records).
//   • Computes summary statistics: mean, standard deviation, min, max, and
//     the 5th and 95th percentile values used as thresholds.
//   • Excludes null anomalies AND incomplete years.  Null values are NEVER
//     converted to 0.
//   • Reports every excluded year by name so the user can verify what was omitted.
//
// ─── WHAT "RECORD" MEANS HERE ────────────────────────────────────────────────
//   "Record high" = annual anomaly above the 95th percentile of the full series.
//   "Record low"  = annual anomaly below the 5th percentile.
//   These are relative to the data's own distribution, not to the 1951-1980
//   baseline.  The TrendPanel labels this clearly.
//
// ─── PERCENTILE METHOD ───────────────────────────────────────────────────────
//   Linear interpolation between adjacent sorted values (the same method used
//   by NumPy's percentile function at interpolation='linear').

/**
 * Linear interpolation percentile.
 * @param {number[]} sorted  Ascending sorted array of non-null values.
 * @param {number}   p       Percentile, 0–100.
 */
function percentile(sorted, p) {
  if (sorted.length === 0) return null
  if (sorted.length === 1) return sorted[0]
  const idx  = (p / 100) * (sorted.length - 1)
  const lo   = Math.floor(idx)
  const hi   = Math.ceil(idx)
  const frac = idx - lo
  return sorted[lo] + frac * (sorted[hi] - sorted[lo])
}

/**
 * Detect extreme years and compute distributional statistics.
 *
 * @param {Array<{ year: number, anomaly: number|null }>} annual
 * @returns {object}
 *   {
 *     mean:           number,
 *     stdDev:         number,
 *     min:            number,
 *     max:            number,
 *     p05:            number,  // 5th percentile threshold
 *     p95:            number,  // 95th percentile threshold
 *     records:        Array<{ year, anomaly, type: 'high'|'low' }>,
 *     n:              number,  // non-null years used
 *     excludedYears:  Array<{ year, reason }>,
 *   }
 */
export function findExtremes(annual) {
  if (!Array.isArray(annual) || annual.length === 0) {
    return { error: 'No data provided.', n: 0, excludedYears: [] }
  }

  // ── Separate complete from excluded years ─────────────────────────────────
  const complete      = []
  const excludedYears = []
  for (const row of annual) {
    if (row.anomaly === null || row.anomaly === undefined || isNaN(row.anomaly)) {
      excludedYears.push({
        year: row.year,
        reason: 'Annual mean is missing (marked *** in source data); excluded from extreme-event calculation.',
      })
    } else {
      complete.push({ year: row.year, anomaly: row.anomaly })
    }
  }

  const n = complete.length
  if (n < 4) {
    return {
      error: `Insufficient complete years for extreme-value detection (n = ${n}).`,
      n,
      excludedYears,
    }
  }

  const values = complete.map(r => r.anomaly)

  // ── Distributional statistics ─────────────────────────────────────────────
  const mean = values.reduce((s, v) => s + v, 0) / n

  // I4 fix: use sample standard deviation (÷ n-1, Bessel's correction) rather
  // than population standard deviation (÷ n).  The GISTEMP series is a sample
  // of a stochastic climate process; Bessel's correction gives an unbiased
  // estimator of the true population standard deviation.  For n ≈ 145 the
  // difference is sqrt(144/145) ≈ 0.3% — numerically negligible, but the
  // correct formula to use and label for scientific reporting.
  // Guard against n < 2 (would divide by zero).
  const sampleVariance = n > 1
    ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1)
    : null
  const stdDev = sampleVariance !== null ? Math.sqrt(sampleVariance) : null

  const sorted = [...values].sort((a, b) => a - b)
  const min    = sorted[0]
  const max    = sorted[sorted.length - 1]
  const p05    = percentile(sorted, 5)
  const p95    = percentile(sorted, 95)

  // ── Identify record years ─────────────────────────────────────────────────
  const records = complete
    .filter(r => r.anomaly > p95 || r.anomaly < p05)
    .map(r => ({
      year:    r.year,
      anomaly: r.anomaly,
      type:    r.anomaly > p95 ? 'high' : 'low',
    }))
    .sort((a, b) => a.year - b.year)

  return {
    mean,
    // stdDev is the SAMPLE standard deviation (Bessel-corrected, ÷ n-1).
    // TrendPanel labels it "Sample std dev" to distinguish from population std dev.
    stdDev,
    stdDevType: 'sample',    // 'sample' | 'population' — for display label
    min,
    max,
    p05,
    p95,
    records,
    n,
    excludedYears,
    // Human-readable summary for TrendPanel
    recordHighCount: records.filter(r => r.type === 'high').length,
    recordLowCount:  records.filter(r => r.type === 'low').length,
    thresholdNote:   `Record highs: anomaly > ${p95.toFixed(2)} (95th percentile). Record lows: anomaly < ${p05.toFixed(2)} (5th percentile). Thresholds are relative to the ${complete[0].year}–${complete[n-1].year} series distribution.`,
  }
}
