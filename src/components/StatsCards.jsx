// src/components/StatsCards.jsx
// Displays four summary cards at the top of the dashboard.
import React from 'react'
import styles from './StatsCards.module.css'

function getStats(annual) {
  if (!annual || annual.length === 0) return null
  const valid = annual.filter((r) => r.anomaly !== null)
  if (valid.length === 0) return null
  const hottest  = valid.reduce((a, b) => (b.anomaly > a.anomaly ? b : a))
  const coldest  = valid.reduce((a, b) => (b.anomaly < a.anomaly ? b : a))
  const latest   = valid[valid.length - 1]
  const firstYear = valid[0].year
  const trend    = (latest.anomaly - valid[0].anomaly).toFixed(2)
  return { hottest, coldest, latest, firstYear, trend }
}

function Card({ label, value, unit, sub, highlight }) {
  return (
    <div className={`${styles.card} ${highlight ? styles[highlight] : ''}`}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        {value}
        {unit && <span className={styles.unit}>{unit}</span>}
      </span>
      {sub && <span className={styles.sub}>{sub}</span>}
    </div>
  )
}

// unit       – physical unit string from dataRegistry (e.g. "°C" or "Mkm²")
//              defaults to "°C" for backward compatibility with GISTEMP
export default function StatsCards({ annual, unit = '°C' }) {
  const stats = getStats(annual)
  if (!stats) return null

  const { hottest, coldest, latest, firstYear, trend } = stats

  // Label wording depends on the dataset type
  const isAnomaly  = unit === '°C'
  const recentLabel = isAnomaly ? 'Most Recent Annual Mean'    : 'Most Recent Annual Mean'
  const highLabel   = isAnomaly ? 'Hottest Year on Record'     : 'Highest Extent on Record'
  const lowLabel    = isAnomaly ? 'Coldest Year on Record'     : 'Lowest Extent on Record'
  const changeLabel = isAnomaly ? `Total Change Since ${firstYear}` : `Total Change Since ${firstYear}`

  const fmtVal = (v) => v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)

  return (
    <div className={styles.grid}>
      <Card
        label={recentLabel}
        value={fmtVal(latest.anomaly)}
        unit={` ${unit}`}
        sub={`Year ${latest.year}`}
        highlight="warm"
      />
      <Card
        label={highLabel}
        value={fmtVal(hottest.anomaly)}
        unit={` ${unit}`}
        sub={`Year ${hottest.year}`}
        highlight="hot"
      />
      <Card
        label={lowLabel}
        value={fmtVal(coldest.anomaly)}
        unit={` ${unit}`}
        sub={`Year ${coldest.year}`}
        highlight="cold"
      />
      <Card
        label={changeLabel}
        value={fmtVal(parseFloat(trend))}
        unit={` ${unit}`}
        sub={`${firstYear} → ${latest.year}`}
        highlight="trend"
      />
    </div>
  )
}
