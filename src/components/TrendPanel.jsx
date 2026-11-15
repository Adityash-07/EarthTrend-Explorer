// src/components/TrendPanel.jsx
//
// Displays the Phase 1 statistical results below the AnnualChart.
//
// ─── WHAT THE USER SEES ───────────────────────────────────────────────────────
//   • OLS regression row: slope °C/decade, R², 95% CI, Durbin-Watson, autocorrelation badge
//   • Mann-Kendall row: BOTH standard and adjusted results side-by-side so the
//     user can see the difference autocorrelation correction makes
//   • Sen's slope row
//   • Extreme events row: record high and low counts, thresholds
//   • Auto-generated insight paragraphs
//   • Excluded years list (collapsed by default, expandable)
//
// ─── DESIGN PRINCIPLES ───────────────────────────────────────────────────────
//   • Every number displayed is passed in as a prop — this component does NO math.
//   • Autocorrelation and uncertainty caveats are always visible, not in tooltips.
//   • The "adjusted" MK result is highlighted as the recommended one.
//   • Causation is never implied.

import React, { useState } from 'react'
import { generateInsight } from '../analysis/insights.js'
import styles from './TrendPanel.module.css'

/** Format a number with explicit + sign for positives */
function fmt(v, decimals = 2) {
  if (v === null || v === undefined || isNaN(v)) return 'N/A'
  const s = Math.abs(v).toFixed(decimals)
  return v >= 0 ? `+${s}` : `−${s}`
}

/** Autocorrelation warning badge colour */
function dwBadgeClass(warning) {
  return {
    strong:   styles.badgeRed,
    moderate: styles.badgeAmber,
    low:      styles.badgeGreen,
    negative: styles.badgeAmber,
    unknown:  styles.badgeGrey,
  }[warning] ?? styles.badgeGrey
}

/** Single stat row with label, value, and optional footnote */
function StatRow({ label, value, note, recommended }) {
  return (
    <div className={`${styles.statRow} ${recommended ? styles.recommended : ''}`}>
      <span className={styles.statLabel}>
        {recommended && <span className={styles.recommendedBadge}>★ Recommended</span>}
        {label}
      </span>
      <span className={styles.statValue}>{value}</span>
      {note && <span className={styles.statNote}>{note}</span>}
    </div>
  )
}

// unit         – physical unit string, e.g. "°C" or "Mkm²" (default: "°C")
// variableName – human name for the measured quantity, e.g. "Temperature Anomaly"
//                or "Snow Cover Extent" (default: "Temperature Anomaly")
export default function TrendPanel({ regression, mk, extremes, meta, unit = '°C', variableName = 'Temperature Anomaly' }) {
  const [showExcluded, setShowExcluded] = useState(false)
  const [showInsight,  setShowInsight]  = useState(true)

  // Guard: show a warning card if any result is missing or errored
  const hasRegression = regression && !regression.error
  const hasMK         = mk         && !mk.error
  const hasExtremes   = extremes   && !extremes.error

  // Generate insight text from all three results
  const insight = generateInsight(regression, mk, extremes, meta, unit)

  // Collect all excluded years from all analyses (deduplicated)
  const allExcluded = [...(regression?.excludedYears ?? []), ...(mk?.excludedYears ?? []), ...(extremes?.excludedYears ?? [])]
  const seenYears   = new Set()
  const uniqueExcluded = allExcluded.filter(e => seenYears.has(e.year) ? false : (seenYears.add(e.year), true))

  return (
    <div className={styles.panel}>
      {/* ── Panel header ──────────────────────────────────────────────────── */}
      <div className={styles.panelHeader}>
        <h2 className={styles.panelTitle}>Statistical Trend Analysis</h2>
        <span className={styles.panelSubtitle}>
          {meta?.source ?? variableName} · {meta?.minYear}–{meta?.maxYear}
          {meta?.baseline ? ` · Baseline: ${meta.baseline}` : ''}
        </span>
      </div>

      {/* ── OLS Regression section ────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>OLS Linear Regression</div>

        {!hasRegression ? (
          <div className={styles.errorBox}>{regression?.error ?? 'Regression not available.'}</div>
        ) : (
          <>
            <StatRow
              label={`${variableName} Rate (OLS slope)`}
              value={`${fmt(regression.slopePerDecade)} ${unit} / decade`}
            />
            <StatRow
              label="95% Confidence Interval"
              value={`[${regression.ciLowPerDecade.toFixed(2)}, ${regression.ciHighPerDecade.toFixed(2)}] ${unit}/decade`}
              note={`Method: ${regression.ciMethod}. Assumes: ${regression.ciAssumptions.join('; ')}.`}
            />
            <StatRow
              label="R² (variance explained)"
              value={regression.rSquared !== null ? regression.rSquared.toFixed(4) : 'N/A (zero variance)'}
            />
            <StatRow
              label="Sample size"
              value={`n = ${regression.n} complete years`}
              note={regression.excludedYears.length > 0 ? `${regression.excludedYears.length} year(s) excluded (see below)` : 'No years excluded'}
            />

            {/* Durbin-Watson autocorrelation assessment */}
            <div className={styles.dwRow}>
              <span className={styles.statLabel}>Durbin-Watson statistic</span>
              <span className={styles.statValue}>
                {regression.durbinWatson !== null ? regression.durbinWatson.toFixed(3) : 'N/A'}
                &nbsp;
                <span className={`${styles.badge} ${dwBadgeClass(regression.autocorrWarning)}`}>
                  {regression.autocorrWarning} autocorrelation
                </span>
              </span>
              <span className={styles.statNote}>{regression.autocorrLabel}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Mann-Kendall section ──────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Mann-Kendall Trend Test</div>

        {!hasMK ? (
          <div className={styles.errorBox}>{mk?.error ?? 'Mann-Kendall test not available.'}</div>
        ) : (
          <>
            <div className={styles.mkCompare}>
              {/* Standard (unadjusted) result */}
              <div className={`${styles.mkBox} ${styles.mkStandard}`}>
                <div className={styles.mkBoxTitle}>Standard MK (unadjusted)</div>
                <div className={styles.mkStat}>Z = {mk.standard.zScore.toFixed(3)}</div>
                <div className={styles.mkStat}>p = {mk.standard.pValue.toFixed(4)}</div>
                <div className={styles.mkTrend}>{mk.standard.trend}</div>
                <div className={styles.mkNote}>{mk.standard.significance}</div>
                <div className={`${styles.mkWarning}`}>{mk.standard.warning}</div>
              </div>

              {/* Autocorrelation-adjusted result */}
              <div className={`${styles.mkBox} ${styles.mkAdjusted}`}>
                <div className={styles.mkBoxTitle}>
                  Adjusted MK — Hamed &amp; Rao (1998)
                  <span className={styles.recommendedBadge}>★ Recommended</span>
                </div>
                <div className={styles.mkStat}>Z = {mk.adjusted.zScore.toFixed(3)}</div>
                <div className={styles.mkStat}>p = {mk.adjusted.pValue.toFixed(4)}</div>
                <div className={styles.mkStat}>Inflation factor = {mk.adjusted.inflationFactor}×</div>
                <div className={styles.mkTrend}>{mk.adjusted.trend}</div>
                <div className={styles.mkNote}>{mk.adjusted.significance}</div>
                <div className={styles.mkNote} style={{color:'#4ade80',marginTop:'0.3rem'}}>{mk.adjusted.recommendation}</div>
              </div>
            </div>

            {/* Sen's slope */}
            <StatRow
              label="Sen's Slope"
              value={`${fmt(mk.senSlopePerDecade)} ${unit} / decade`}
              note={mk.senSlopeMethod}
              recommended
            />
          </>
        )}
      </div>

      {/* ── Extremes section ──────────────────────────────────────────────── */}
      <div className={styles.section}>
        <div className={styles.sectionTitle}>Extreme Events</div>

        {!hasExtremes ? (
          <div className={styles.errorBox}>{extremes?.error ?? 'Extreme-event analysis not available.'}</div>
        ) : (
          <>
            <StatRow
              label="Record high years (above 95th percentile)"
              value={`${extremes.recordHighCount} year${extremes.recordHighCount !== 1 ? 's' : ''} — threshold: > ${extremes.p95.toFixed(2)} ${unit}`}
            />
            <StatRow
              label="Record low years (below 5th percentile)"
              value={`${extremes.recordLowCount} year${extremes.recordLowCount !== 1 ? 's' : ''} — threshold: < ${extremes.p05.toFixed(2)} ${unit}`}
            />
            <StatRow
              label={`Series std dev (${extremes.stdDevType ?? 'sample'})`}
              value={extremes.stdDev !== null ? `${extremes.stdDev.toFixed(3)}` : 'N/A'}
              note="Sample standard deviation (Bessel-corrected, ÷ n−1). Units match the displayed variable."
            />
            <div className={styles.extremeNote}>{extremes.thresholdNote}</div>
          </>
        )}
      </div>

      {/* ── Excluded years ────────────────────────────────────────────────── */}
      {uniqueExcluded.length > 0 && (
        <div className={styles.section}>
          <button
            className={styles.toggleBtn}
            onClick={() => setShowExcluded(v => !v)}
            aria-expanded={showExcluded}
          >
            {showExcluded ? '▾' : '▸'} Excluded years ({uniqueExcluded.length})
          </button>
          {showExcluded && (
            <ul className={styles.excludedList}>
              {uniqueExcluded.map(e => (
                <li key={e.year}>
                  <strong>{e.year}</strong> — {e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ── Insight text ──────────────────────────────────────────────────── */}
      <div className={styles.section}>
        <button
          className={styles.toggleBtn}
          onClick={() => setShowInsight(v => !v)}
          aria-expanded={showInsight}
        >
          {showInsight ? '▾' : '▸'} Generated insight
        </button>
        {showInsight && (
          <div className={styles.insightBox}>
            {insight.paragraphs.map((p, i) => (
              <p key={i} className={i === insight.paragraphs.length - 1 ? styles.caveat : styles.insightPara}>
                {p}
              </p>
            ))}
            {insight.excludedYearsSummary && (
              <p className={styles.excludedSummary}>{insight.excludedYearsSummary}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
