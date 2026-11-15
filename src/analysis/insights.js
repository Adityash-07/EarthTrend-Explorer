// src/analysis/insights.js
//
// Evidence-based insight text generator.
//
// ─── WHAT THIS FILE DOES ──────────────────────────────────────────────────────
//   • Takes the computed outputs from regression.js, mannKendall.js, and
//     extremes.js and assembles a plain-English paragraph.
//   • EVERY sentence is populated from actual computed values.
//   • NOTHING is hardcoded.  If the data changes, the text changes.
//   • Autocorrelation and uncertainty caveats are always included.
//   • Causation is never implied from trend data.
//
// ─── DESIGN PRINCIPLES ────────────────────────────────────────────────────────
//   1. Insight = observation, not interpretation.
//      "The data show X" is acceptable.  "X is caused by Y" is never generated.
//   2. Every claim names its source, time range, units, and method.
//   3. Limitations are part of the output, not fine print.
//   4. If a statistic could not be computed (error object), the text says so
//      explicitly rather than silently omitting it.

/**
 * Format a number to 2 decimal places with an explicit + sign for positives.
 */
function fmt(v, decimals = 2) {
  if (v === null || v === undefined || isNaN(v)) return 'N/A'
  const s = Math.abs(v).toFixed(decimals)
  return v >= 0 ? `+${s}` : `−${s}`
}

/**
 * Generate a plain-English insight paragraph from Phase 1 statistical results.
 *
 * @param {object} regression   Return value of olsRegression()
 * @param {object} mk           Return value of mannKendallTest()
 * @param {object} extremes     Return value of findExtremes()
 * @param {object} meta         Dataset metadata { source, minYear, maxYear, baseline }
 * @param {string} [unit='°C']  Physical unit string (e.g. "°C" or "Mkm²")
 * @returns {object}  { paragraphs: string[], warnings: string[], excludedYearsSummary: string }
 */
export function generateInsight(regression, mk, extremes, meta, unit = '°C') {
  const paragraphs = []
  const warnings   = []

  const source   = meta?.source    ?? 'Unknown dataset'
  const baseline = meta?.baseline  ?? null

  // ── Paragraph 1: dataset overview ─────────────────────────────────────────
  const baselineClause = baseline
    ? `relative to the ${baseline} average`
    : 'as an absolute measure'
  const missingNote = unit === '°C'
    ? '(marked "***" in the source data) are excluded and listed below.'
    : 'are excluded and listed below.'
  paragraphs.push(
    `This analysis is based on the ${source} dataset, covering annual mean ` +
    `values (${unit}) ${baselineClause}. ` +
    `All statistics use only complete years — years with missing annual means ` +
    missingNote
  )

  // ── Paragraph 2: OLS regression result ────────────────────────────────────
  if (regression?.error) {
    paragraphs.push(`OLS regression could not be computed: ${regression.error}`)
    warnings.push(regression.error)
  } else {
    const r2str  = regression.rSquared !== null ? regression.rSquared.toFixed(3) : 'N/A'
    const ciStr  = `[${regression.ciLowPerDecade.toFixed(2)}, ${regression.ciHighPerDecade.toFixed(2)}]`
    const dwStr  = regression.durbinWatson !== null ? regression.durbinWatson.toFixed(2) : 'N/A'

    paragraphs.push(
      `OLS linear regression over ${regression.n} complete years yields a trend rate of ` +
      `${fmt(regression.slopePerDecade)} ${unit} per decade ` +
      `(R² = ${r2str}; 95% CI: ${ciStr} ${unit}/decade, computed using the classical OLS ` +
      `t-distribution formula with df = n − 2 = ${regression.n - 2}). ` +
      `The Durbin-Watson statistic is ${dwStr} ` +
      `(${regression.autocorrWarning === 'low' ? 'indicating low autocorrelation' : 'indicating ' + regression.autocorrWarning + ' autocorrelation'}). ` +
      `${regression.autocorrLabel}`
    )
  }

  // ── Paragraph 3: Mann-Kendall adjusted result (primary) ───────────────────
  if (mk?.error) {
    paragraphs.push(`Mann-Kendall test could not be computed: ${mk.error}`)
    warnings.push(mk.error)
  } else {
    const adj = mk.adjusted
    const std = mk.standard

    paragraphs.push(
      `The autocorrelation-adjusted Mann-Kendall test (Hamed & Rao 1998, inflation factor = ${adj.inflationFactor}) ` +
      `gives Z = ${adj.zScore.toFixed(3)}, ${adj.significance}. ` +
      `Trend direction: ${adj.trend}. ` +
      `For comparison, the standard (unadjusted) MK test gives Z = ${std.zScore.toFixed(3)}, ` +
      `${std.significance} — the adjusted result is recommended because ${std.warning.toLowerCase()} ` +
      `Sen's slope (median pairwise slope) is ${fmt(mk.senSlopePerDecade)} ${unit} per decade.`
    )
  }

  // ── Paragraph 4: extreme events ───────────────────────────────────────────
  if (extremes?.error) {
    paragraphs.push(`Extreme-event analysis could not be computed: ${extremes.error}`)
  } else {
    paragraphs.push(
      `Extreme-event analysis identifies ${extremes.recordHighCount} record-high years ` +
      `(annual value > ${extremes.p95.toFixed(2)} ${unit}, the 95th percentile) and ` +
      `${extremes.recordLowCount} record-low years ` +
      `(annual value < ${extremes.p05.toFixed(2)} ${unit}, the 5th percentile) ` +
      `across ${extremes.n} complete years. ` +
      `These thresholds are relative to the full series distribution, ` +
      `not to any external climate benchmark. ` +
      `The standard deviation of annual values is ${extremes.stdDev.toFixed(3)} ${unit}.`
    )
  }

  // ── Paragraph 5: standing caveats ─────────────────────────────────────────
  paragraphs.push(
    `Limitations: (1) OLS confidence intervals assume independent, normally distributed residuals — ` +
    `serial autocorrelation in annual climate data means the CI may be narrower than it should be. ` +
    `(2) The Mann-Kendall autocorrelation correction (Hamed & Rao 1998) reduces but does not ` +
    `eliminate this concern. (3) Trend analyses describe association in the data; ` +
    `they do not identify causes of observed changes.`
  )

  // ── Excluded years summary ────────────────────────────────────────────────
  // I6 fix: collect excluded years from all three analysis modules, not just
  // regression.  All three functions apply the same filter (null anomaly = excluded)
  // so their lists should be identical, but we merge and deduplicate to be safe.
  const allExcluded = [
    ...(regression?.excludedYears ?? []),
    ...(mk?.excludedYears        ?? []),
    ...(extremes?.excludedYears  ?? []),
  ]
  // Deduplicate by year (keep first occurrence, which carries a reason string)
  const seen = new Set()
  const uniqueExcluded = allExcluded.filter(e =>
    seen.has(e.year) ? false : (seen.add(e.year), true)
  )

  const excludedYearsSummary = uniqueExcluded.length === 0
    ? 'No years were excluded — all years in the series have complete annual mean values.'
    : `Excluded from all analyses (${uniqueExcluded.length} year${uniqueExcluded.length !== 1 ? 's' : ''}): ${uniqueExcluded.map(e => `${e.year}`).join(', ')}. Reason: annual mean marked as missing ("***") in source data.`

  return { paragraphs, warnings, excludedYearsSummary }
}
