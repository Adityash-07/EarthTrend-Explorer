// src/components/AnnualChart.jsx
//
// A line chart that shows the annual global temperature anomaly from 1880 to present.
// Uses Recharts (a popular React charting library).
//
// WHAT YOU SEE:
//   • Blue line = raw annual anomaly values
//   • Orange reference line at 0 °C = the 1951-1980 baseline (what "normal" means)
//   • Red reference line at +1.5 °C = the Paris Agreement target
//   • Year range slider lets you zoom into any period

import React, { useState, useMemo } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Legend,
} from 'recharts'
import styles from './AnnualChart.module.css'

// Custom tooltip that appears when you hover over the chart
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  const val = payload[0].value
  if (val === null || val === undefined) return null
  const sign = val >= 0 ? '+' : ''
  const color = val >= 0 ? '#fca5a5' : '#93c5fd'
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipYear}>{label}</div>
      <div className={styles.tooltipVal} style={{ color }}>
        {sign}{val.toFixed(2)} °C
      </div>
      <div className={styles.tooltipNote}>vs 1951–1980 mean</div>
    </div>
  )
}

export default function AnnualChart({ annual, fittedLine, movingAvg, extremes }) {
  const minYear = annual?.[0]?.year ?? 1880
  const maxYear = annual?.[annual.length - 1]?.year ?? 2025

  const [range, setRange] = useState([minYear, maxYear])

  // Filter data to the selected year range
  const filtered = useMemo(
    () => annual?.filter((r) => r.year >= range[0] && r.year <= range[1]) ?? [],
    [annual, range]
  )

  // Build lookup maps so we can join overlay series onto the filtered data by year.
  // Recharts requires all series in a single data array.
  const fittedMap = useMemo(() => {
    const m = {}
    ;(fittedLine ?? []).forEach(r => { m[r.year] = r.fitted })
    return m
  }, [fittedLine])

  const movingMap = useMemo(() => {
    const m = {}
    ;(movingAvg ?? []).forEach(r => { m[r.year] = r.avg })
    return m
  }, [movingAvg])

  // Record years where extremes places a dot — only high records shown on chart
  const extremeHighSet = useMemo(
    () => new Set((extremes?.records ?? []).filter(r => r.type === 'high').map(r => r.year)),
    [extremes]
  )

  // Merge overlay values into the filtered display data
  const chartData = useMemo(() => filtered.map(r => ({
    ...r,
    fitted:   fittedMap[r.year]  ?? null,
    moving:   movingMap[r.year]  ?? null,
    // isRecord holds the anomaly value only for record-high years so the dot
    // appears at the correct y-position; null for all other years (no dot)
    isRecord: extremeHighSet.has(r.year) ? r.anomaly : null,
  })), [filtered, fittedMap, movingMap, extremeHighSet])

  return (
    <section className={styles.section}>
      <div className={styles.titleRow}>
        <h2 className={styles.chartTitle}>Annual Mean Temperature Anomaly</h2>
        <span className={styles.rangeLabel}>{range[0]} – {range[1]}</span>
      </div>

      {/* Year range sliders */}
      <div className={styles.sliders}>
        <label className={styles.sliderLabel}>
          From&nbsp;
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={range[0]}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v < range[1]) setRange([v, range[1]])
            }}
            className={styles.slider}
          />
          &nbsp;{range[0]}
        </label>
        <label className={styles.sliderLabel}>
          To&nbsp;
          <input
            type="range"
            min={minYear}
            max={maxYear}
            value={range[1]}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (v > range[0]) setRange([range[0], v])
            }}
            className={styles.slider}
          />
          &nbsp;{range[1]}
        </label>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
          <XAxis
            dataKey="year"
            stroke="#4a6fa5"
            tick={{ fill: '#7ba7cc', fontSize: 12 }}
            tickLine={false}
          />
          <YAxis
            stroke="#4a6fa5"
            tick={{ fill: '#7ba7cc', fontSize: 12 }}
            tickLine={false}
            tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
            label={{
              value: '°C anomaly',
              angle: -90,
              position: 'insideLeft',
              fill: '#4a6fa5',
              fontSize: 11,
              dx: -4,
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          {/* Baseline: 0 means equal to the 1951-1980 average */}
          <ReferenceLine y={0} stroke="#4a6fa5" strokeDasharray="4 2" label={{ value: 'Baseline', fill: '#4a6fa5', fontSize: 10, position: 'right' }} />
          {/* Paris Agreement 1.5 °C warming target */}
          <ReferenceLine y={1.5} stroke="#f97316" strokeDasharray="4 2" label={{ value: '+1.5 °C', fill: '#f97316', fontSize: 10, position: 'right' }} />
          <Line
            type="monotone"
            dataKey="anomaly"
            name="Annual Anomaly"
            stroke="#3b82d4"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: '#60a5fa' }}
            connectNulls={false}
          />
          {/* OLS trend line — dashed orange, rendered only when fittedLine prop provided */}
          {fittedLine && (
            <Line
              type="linear"
              dataKey="fitted"
              name="OLS Trend"
              stroke="#f97316"
              strokeWidth={2}
              strokeDasharray="6 3"
              dot={false}
              activeDot={false}
              connectNulls={true}
            />
          )}
          {/* 11-year moving average — purple, rendered only when movingAvg prop provided */}
          {movingAvg && (
            <Line
              type="monotone"
              dataKey="moving"
              name="11-yr Average"
              stroke="#a78bfa"
              strokeWidth={2.5}
              dot={false}
              activeDot={false}
              connectNulls={false}
            />
          )}
          {/* Record high years — red dots, rendered only when extremes prop provided */}
          {extremes && (
            <Line
              type="monotone"
              dataKey="isRecord"
              name="Record High Year"
              stroke="transparent"
              strokeWidth={0}
              dot={{ r: 5, fill: '#ef4444', strokeWidth: 1, stroke: '#fff' }}
              activeDot={{ r: 7, fill: '#ef4444' }}
              connectNulls={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
