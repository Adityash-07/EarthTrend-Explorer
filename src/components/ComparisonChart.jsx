/**
 * ComparisonChart.jsx
 * -------------------
 * Normalised time-series comparison of temperature anomaly vs snow cover extent.
 *
 * Both series are displayed as Z-scores (standard deviations from their own
 * mean over the COMMON PAIRED PERIOD).  This is the only honest way to overlay
 * two variables measured in different units (°C and Mkm²) on a single axis.
 *
 * The Y-axis is ALWAYS labelled "Standard deviations from mean" — never °C,
 * never Mkm².  Tooltips show both the Z-score and the original value with
 * its correct unit.
 *
 * Props:
 *   normalisedResult  {object}  – result of normaliseSeries() from crossCorrelation.js
 *                                 { normalised, tempMean, tempStd, snowMean, snowStd,
 *                                   n, method, error }
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import styles from './ComparisonChart.module.css';

// ── Custom tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label, tempMean, tempStd, snowMean, snowStd }) {
  if (!active || !payload || !payload.length) return null;

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipYear}>{label}</p>
      {payload.map(p => {
        if (p.value == null) return null;
        const isTemp = p.dataKey === 'tempZ';
        const mean  = isTemp ? tempMean : snowMean;
        const std   = isTemp ? tempStd  : snowStd;
        const unit  = isTemp ? '°C' : 'Mkm²';
        // Reconstruct original value: z * std + mean
        const orig  = std != null && std !== 0
          ? (p.value * std + mean).toFixed(2)
          : '—';
        return (
          <p key={p.dataKey} style={{ color: p.color }} className={styles.tooltipRow}>
            {p.name}:&nbsp;
            <strong>{p.value >= 0 ? '+' : ''}{p.value.toFixed(2)} σ</strong>
            <span className={styles.tooltipOrig}> ({orig} {unit})</span>
          </p>
        );
      })}
    </div>
  );
}

export default function ComparisonChart({ normalisedResult }) {
  if (!normalisedResult) return null;

  const { normalised, tempMean, tempStd, snowMean, snowStd, method, error } = normalisedResult;

  if (!normalised || normalised.length === 0) {
    return (
      <div className={styles.emptyState}>
        <p>{error ?? 'No data available for comparison chart.'}</p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {/* Method disclosure — always visible */}
      <p className={styles.methodNote}>{method}</p>

      {/* Warn if constant series */}
      {error && (
        <p className={styles.warnNote}>⚠ {error}</p>
      )}

      <ResponsiveContainer width="100%" height={320}>
        <LineChart
          data={normalised}
          margin={{ top: 8, right: 24, bottom: 8, left: 8 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />

          <XAxis
            dataKey="year"
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1e3a5f' }}
          />

          <YAxis
            tick={{ fill: '#64748b', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: '#1e3a5f' }}
            tickFormatter={v => `${v > 0 ? '+' : ''}${v.toFixed(1)}`}
            label={{
              value: 'Std devs from mean (σ)',
              angle: -90,
              position: 'insideLeft',
              fill: '#475569',
              fontSize: 10,
              dx: -4,
            }}
          />

          <Tooltip
            content={
              <CustomTooltip
                tempMean={tempMean}
                tempStd={tempStd}
                snowMean={snowMean}
                snowStd={snowStd}
              />
            }
          />

          <Legend
            wrapperStyle={{ fontSize: '0.75rem', color: '#94a3b8', paddingTop: '8px' }}
          />

          {/* Zero line = common mean of each series */}
          <ReferenceLine
            y={0}
            stroke="#334155"
            strokeDasharray="4 4"
            label={{ value: 'Common mean', fill: '#475569', fontSize: 10, position: 'right' }}
          />

          {/* Temperature anomaly (orange) */}
          <Line
            type="monotone"
            dataKey="tempZ"
            name="Temp Anomaly (Z)"
            stroke="#f97316"
            strokeWidth={1.8}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, fill: '#f97316' }}
          />

          {/* Snow cover extent (icy blue) */}
          <Line
            type="monotone"
            dataKey="snowZ"
            name="Snow Cover (Z)"
            stroke="#38bdf8"
            strokeWidth={1.8}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, fill: '#38bdf8' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
