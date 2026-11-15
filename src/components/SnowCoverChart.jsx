/**
 * SnowCoverChart.jsx
 * ------------------
 * Line chart showing annual mean NH snow cover extent (Mkm²) over time,
 * with an OLS trend line and an 11-year centred moving average overlay —
 * mirroring the AnnualChart design but styled in icy blue.
 *
 * Props:
 *   data        {object}  – parsed snow cover data { annual, monthly, meta }
 *   color       {string}  – accent colour from the dataset registry
 *   fittedLine  {Array}   – pre-computed OLS fitted values from App.jsx
 *                           (array of { year, fitted } or same length as annual)
 *   movingAvg   {Array}   – pre-computed 11-yr moving avg series from App.jsx
 *                           (array of numbers, null-padded at edges)
 *   regression  {object}  – regression result (for slope/intercept to build trendLabel)
 */

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ReferenceLine, ResponsiveContainer,
} from 'recharts';
import { useMemo } from 'react';
import styles from './SnowCoverChart.module.css';

// ── Custom tooltip ──────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipYear}>{label}</p>
      {payload.map(p => (
        p.value != null && (
          <p key={p.dataKey} style={{ color: p.color }} className={styles.tooltipRow}>
            {p.name}: <strong>{Number(p.value).toFixed(2)} Mkm²</strong>
          </p>
        )
      ))}
    </div>
  );
}

export default function SnowCoverChart({ data, color = '#38bdf8', fittedLine, movingAvg, regression }) {
  if (!data) return null;

  const { annual } = data;

  // ── Merge into chart-ready objects ─────────────────────────────────────
  // fittedLine: array of { year, fitted }   (from regression.fittedLine)
  // movingAvg:  array of { year, avg }      (from rollingMean().series)
  // Both are keyed by year so we build lookup maps — same pattern as AnnualChart.
  const chartData = useMemo(() => {
    const fitMap = {};
    if (Array.isArray(fittedLine)) {
      fittedLine.forEach(pt => { if (pt?.year != null) fitMap[pt.year] = pt.fitted; });
    }
    const avgMap = {};
    if (Array.isArray(movingAvg)) {
      movingAvg.forEach(r => { if (r?.year != null) avgMap[r.year] = r.avg; });
    }

    return annual.map(d => ({
      year:   d.year,
      extent: d.anomaly,              // Mkm² (null = missing)
      trend:  fitMap[d.year] ?? null, // OLS fitted value
      movAvg: avgMap[d.year] ?? null, // 11-yr moving average
    }));
  }, [annual, fittedLine, movingAvg]);

  // ── Trend direction label (derived from regression prop) ────────────────
  const trendLabel = useMemo(() => {
    if (!regression || regression.error) return null;
    const dec  = (regression.slopePerDecade ?? 0);
    const sign = dec >= 0 ? '+' : '';
    const dir  = dec < 0 ? '▼ Declining' : '▲ Increasing';
    return `${dir}  ${sign}${dec.toFixed(2)} Mkm²/decade`;
  }, [regression]);

  const trendColor = regression?.slopePerDecade < 0 ? '#38bdf8' : '#86efac';

  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <h2 className={styles.title}>Annual NH Snow Cover Extent</h2>
        {trendLabel && (
          <span className={styles.trendBadge} style={{ color: trendColor }}>
            {trendLabel}
          </span>
        )}
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
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
            tickFormatter={v => v.toFixed(1)}
            label={{
              value: 'Mkm²',
              angle: -90,
              position: 'insideLeft',
              fill: '#475569',
              fontSize: 11,
              dx: -4,
            }}
          />

          <Tooltip content={<CustomTooltip />} />

          <Legend
            wrapperStyle={{ fontSize: '0.75rem', color: '#94a3b8', paddingTop: '8px' }}
          />

          {/* Long-term annual mean reference line */}
          {data.meta.annualMean != null && (
            <ReferenceLine
              y={data.meta.annualMean}
              stroke="#334155"
              strokeDasharray="4 4"
              label={{ value: 'Long-term mean', fill: '#475569', fontSize: 10, position: 'right' }}
            />
          )}

          {/* Raw annual extent */}
          <Line
            type="monotone"
            dataKey="extent"
            name="Annual Mean"
            stroke={color}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            activeDot={{ r: 4, fill: color }}
          />

          {/* OLS trend */}
          <Line
            type="monotone"
            dataKey="trend"
            name="OLS Trend"
            stroke="#f97316"
            strokeWidth={2}
            dot={false}
            strokeDasharray="6 3"
            connectNulls
          />

          {/* 11-yr moving average */}
          <Line
            type="monotone"
            dataKey="movAvg"
            name="11-yr Avg"
            stroke="#a78bfa"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>

      <p className={styles.caption}>
        OLS trend line (orange dashed) and 11-year centred moving average (purple)
        overlaid on annual mean snow cover extent. Gaps indicate years where fewer
        than 10 monthly readings were available.
      </p>
    </div>
  );
}
