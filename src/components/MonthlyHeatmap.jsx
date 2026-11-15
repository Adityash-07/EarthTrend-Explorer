// src/components/MonthlyHeatmap.jsx
//
// A colour-coded table showing each month's temperature anomaly for every year.
// Warmer anomalies are red, cooler anomalies are blue — instantly showing
// that recent decades are almost entirely red.

import React, { useState } from 'react'
import styles from './MonthlyHeatmap.module.css'

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

/** Map an anomaly value to an RGBA background colour.
 *  Positive (warm) → red scale.  Negative (cool) → blue scale.  null → grey. */
function anomalyColor(val) {
  if (val === null) return 'rgba(255,255,255,0.03)'
  const clamped = Math.max(-1.0, Math.min(1.5, val))
  if (clamped >= 0) {
    // 0 → white-ish,  +1.5 → deep red
    const intensity = clamped / 1.5
    const r = Math.round(180 + 75 * intensity)
    const g = Math.round(80  - 60 * intensity)
    const b = Math.round(80  - 70 * intensity)
    return `rgba(${r},${g},${b},0.75)`
  } else {
    // 0 → white-ish,  -1 → deep blue
    const intensity = Math.abs(clamped) / 1.0
    const r = Math.round(80  - 60 * intensity)
    const g = Math.round(130 - 50 * intensity)
    const b = Math.round(200 + 55 * intensity)
    return `rgba(${r},${g},${b},0.75)`
  }
}

function textColor(val) {
  if (val === null) return '#334455'
  return Math.abs(val) > 0.6 ? '#fff' : '#cce'
}

export default function MonthlyHeatmap({ monthly }) {
  // Guard: monthly is undefined/null when Snow Cover data briefly reaches this
  // component during a dataset switch. Return null rather than rendering garbage.
  if (!monthly) return null

  // Show the most recent 40 years by default so the table isn't overwhelming
  const allYears = monthly?.map((r) => r.year) ?? []
  const defaultStart = Math.max(allYears[0] ?? 1880, (allYears[allYears.length - 1] ?? 2025) - 39)

  const [startYear, setStartYear] = useState(defaultStart)
  const visibleRows = monthly?.filter((r) => r.year >= startYear) ?? []

  return (
    <section className={styles.section}>
      <div className={styles.titleRow}>
        <h2 className={styles.chartTitle}>Monthly Anomaly Heatmap</h2>
        <label className={styles.sliderLabel}>
          Show from&nbsp;
          <input
            type="range"
            min={allYears[0] ?? 1880}
            max={allYears[allYears.length - 1] ?? 2025}
            value={startYear}
            onChange={(e) => setStartYear(Number(e.target.value))}
            className={styles.slider}
          />
          &nbsp;{startYear}
        </label>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.yearHead}>Year</th>
              {MONTHS.map((m) => <th key={m} className={styles.monthHead}>{m}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.year}>
                <td className={styles.yearCell}>{row.year}</td>
                {MONTHS.map((m) => {
                  const val = row[m]
                  return (
                    <td
                      key={m}
                      className={styles.cell}
                      style={{
                        background: anomalyColor(val),
                        color: textColor(val),
                      }}
                      title={val !== null ? `${m} ${row.year}: ${val >= 0 ? '+' : ''}${val.toFixed(2)} °C` : 'No data'}
                    >
                      {val !== null ? (val >= 0 ? `+${val.toFixed(2)}` : val.toFixed(2)) : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Colour scale legend */}
      <div className={styles.legend}>
        <span className={styles.legendLabel}>Cooler</span>
        <div className={styles.legendBar}>
          {[-1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0, 1.5].map((v) => (
            <div key={v} className={styles.legendSwatch} style={{ background: anomalyColor(v) }}>
              <span className={styles.legendTick}>{v > 0 ? '+' : ''}{v}</span>
            </div>
          ))}
        </div>
        <span className={styles.legendLabel}>Warmer</span>
      </div>
    </section>
  )
}
