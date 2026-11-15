// src/components/SeasonalChart.jsx
//
// A bar chart comparing the four meteorological seasons across time.
// DJF = Dec-Jan-Feb (winter),  MAM = spring,  JJA = summer,  SON = autumn.
// You can toggle individual seasons on/off.

import React, { useState } from 'react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts'
import styles from './SeasonalChart.module.css'

const SEASONS = [
  { key: 'DJF', label: 'DJF (Winter)', color: '#60a5fa' },
  { key: 'MAM', label: 'MAM (Spring)', color: '#4ade80' },
  { key: 'JJA', label: 'JJA (Summer)', color: '#fbbf24' },
  { key: 'SON', label: 'SON (Autumn)', color: '#f97316' },
]

function SeasonTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipYear}>{label}</div>
      {payload.map((p) => (
        p.value !== null && (
          <div key={p.dataKey} style={{ color: p.color, fontSize: '0.8rem' }}>
            {p.name}: {p.value >= 0 ? '+' : ''}{p.value?.toFixed(2)} °C
          </div>
        )
      ))}
    </div>
  )
}

export default function SeasonalChart({ seasonal }) {
  const [visible, setVisible] = useState({ DJF: true, MAM: true, JJA: true, SON: true })

  const toggle = (key) => setVisible((v) => ({ ...v, [key]: !v[key] }))

  // Guard: seasonal is undefined when Snow Cover data briefly reaches this
  // component during a dataset switch. Return null rather than crashing Recharts.
  if (!seasonal) return null

  return (
    <section className={styles.section}>
      <div className={styles.titleRow}>
        <h2 className={styles.chartTitle}>Seasonal Temperature Anomaly</h2>
        <div className={styles.toggleRow}>
          {SEASONS.map(({ key, label, color }) => (
            <button
              key={key}
              className={`${styles.toggleBtn} ${visible[key] ? styles.active : ''}`}
              style={visible[key] ? { borderColor: color, color } : {}}
              onClick={() => toggle(key)}
              aria-pressed={visible[key]}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={seasonal} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
          <XAxis dataKey="year" stroke="#4a6fa5" tick={{ fill: '#7ba7cc', fontSize: 11 }} tickLine={false} />
          <YAxis
            stroke="#4a6fa5"
            tick={{ fill: '#7ba7cc', fontSize: 11 }}
            tickLine={false}
            tickFormatter={(v) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
          />
          <Tooltip content={<SeasonTooltip />} />
          <ReferenceLine y={0} stroke="#4a6fa5" strokeDasharray="4 2" />
          {SEASONS.map(({ key, label, color }) =>
            visible[key] ? (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                name={label}
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                connectNulls={false}
              />
            ) : null
          )}
        </LineChart>
      </ResponsiveContainer>
    </section>
  )
}
