// src/analysis/rollingAverage.js
//
// Centred moving (rolling) average for annual anomaly series.
//
// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//   • Computes a centred moving average over a configurable window (default 11 years).
//   • Handles null values in the window gracefully — a null year is simply
//     excluded from the mean, never replaced with 0.
//   • Returns null at the edges (first and last ⌊window/2⌋ positions) because
//     a centred window cannot be fully formed there.  This is correct scientific
//     behaviour: showing a smoothed value at the edge would create a false impression
//     that the trend is known beyond the data boundary.
//   • Reports which years were excluded from the full series (null anomaly).
//
// ─── WHY 11 YEARS? ───────────────────────────────────────────────────────────
//   An 11-year window is a common choice in climate science because it
//   approximately covers one solar cycle, smoothing out solar-cycle-related
//   variance while preserving decadal trends.  The window size is configurable.
//
// ─── WINDOW MUST BE ODD ──────────────────────────────────────────────────────
//   An odd window allows symmetrical centring (equal years on each side).
//   Passing an even number throws a clear error rather than silently producing
//   wrong results.

/**
 * Compute a centred rolling mean.
 *
 * @param {Array<{ year: number, anomaly: number|null }>} annual
 * @param {number} window  Odd integer ≥ 3 (default 11).
 * @returns {object}
 *   {
 *     series:        Array<{ year, avg: number|null }>,
 *     window:        number,
 *     edgeNullCount: number,   // how many edge positions are null (expected)
 *     excludedYears: Array<{ year, reason }>,  // null anomaly years in original data
 *   }
 */
export function rollingMean(annual, window = 11) {
  if (!Array.isArray(annual) || annual.length === 0) {
    return { series: [], window, edgeNullCount: 0, excludedYears: [] }
  }

  if (!Number.isInteger(window) || window < 3) {
    throw new Error(`Rolling average window must be an integer ≥ 3 (received: ${window}).`)
  }
  if (window % 2 === 0) {
    throw new Error(`Rolling average window must be odd for centred computation (received: ${window}). Try ${window + 1}.`)
  }

  const half = (window - 1) / 2

  // Identify excluded years (null anomaly) for transparency — these are
  // positions where the original data has no annual mean, not positions
  // that simply fall at the edge of the rolling window.
  const excludedYears = annual
    .filter(r => r.anomaly === null || r.anomaly === undefined || isNaN(r.anomaly))
    .map(r => ({ year: r.year, reason: 'Annual mean is missing (marked *** in source data); excluded from window average.' }))

  const n = annual.length
  const series = annual.map((row, i) => {
    // Edge: not enough data points on one side → return null
    if (i < half || i >= n - half) {
      return { year: row.year, avg: null }
    }

    // Collect non-null values in the symmetric window [i-half … i+half]
    const windowValues = []
    for (let k = i - half; k <= i + half; k++) {
      const v = annual[k].anomaly
      if (v !== null && v !== undefined && !isNaN(v)) {
        windowValues.push(v)
      }
    }

    // Require at least half the window to be non-null to report a value.
    // This prevents a moving average from being reported for a window that
    // is mostly missing data.
    if (windowValues.length < Math.ceil(window / 2)) {
      return { year: row.year, avg: null }
    }

    const avg = windowValues.reduce((s, v) => s + v, 0) / windowValues.length
    return { year: row.year, avg }
  })

  const edgeNullCount = series.filter(r => r.avg === null && !excludedYears.find(e => e.year === r.year)).length

  return { series, window, edgeNullCount, excludedYears }
}
