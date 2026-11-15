
import { useState } from 'react';
import ComparisonChart from './ComparisonChart.jsx';
import styles from './CrossAnalysisPanel.module.css';

function fmtR(r) {
  if (r == null || !Number.isFinite(r)) return 'N/A';
  return (r >= 0 ? '+' : '') + r.toFixed(3);
}

function fmtP(p) {
  if (p == null || !Number.isFinite(p)) return 'N/A';
  if (p < 0.001) return '< 0.001';
  return p.toFixed(3);
}

function rColor(r) {
  if (r == null) return '#64748b';
  if (Math.abs(r) >= 0.7) return r > 0 ? '#86efac' : '#f87171';
  if (Math.abs(r) >= 0.5) return r > 0 ? '#bbf7d0' : '#fca5a5';
  return '#94a3b8';
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className={styles.statCard}>
      <span className={styles.cardLabel}>{label}</span>
      <span className={styles.cardValue} style={{ color: color ?? '#e2e8f0' }}>
        {value}
      </span>
      {sub && <span className={styles.cardSub}>{sub}</span>}
    </div>
  );
}

function downloadCrossCSV(crossStats) {
  const rows = crossStats?.normalised?.normalised || [];
  if (!rows.length) return;

  const headers = [
    'Year',
    'Temperature Anomaly (C)',
    'Snow Cover (Mkm2)',
    'Temperature Z-Score',
    'Snow Cover Z-Score'
  ];

  const escapeCSV = value => {
    if (value == null) return '';
    return `"${String(value).replace(/"/g, '""')}"`;
  };

  const csvRows = rows.map(row => [
    row.year,
    row.tempOrig,
    row.snowOrig,
    row.tempZ,
    row.snowZ
  ]);

  const csv = [headers, ...csvRows]
    .map(row => row.map(escapeCSV).join(','))
    .join('\r\n');

  const blob = new Blob(['\uFEFF', csv], {
    type: 'text/csv;charset=utf-8;'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'EarthTrend_Cross_Analysis.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function CrossAnalysisPanel({ crossStats }) {
  const [showMethod, setShowMethod] = useState(false);
  const [showExcluded, setShowExcluded] = useState(false);

  if (!crossStats) {
    return (
      <div className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Cross-Variable Analysis</h2>
        </div>
        <div className={styles.errorCard}>
          Cross-variable analysis is not yet available.
          Both datasets must load successfully before this section can be computed.
        </div>
      </div>
    );
  }

  const {
    alignment,
    pearson,
    spearman,
    normalised: normResult,
    error,
    caveat
  } = crossStats;

  if (error && !alignment?.pairs?.length) {
    return (
      <div className={styles.panel}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Cross-Variable Analysis</h2>
        </div>
        <div className={styles.errorCard}>
          <strong>Analysis unavailable:</strong> {error}
        </div>
        <p className={styles.caveat}>{caveat}</p>
      </div>
    );
  }

  const { n, commonStart, commonEnd, excludedYears } = alignment;
  const pR = pearson.r;
  const sR = spearman.r;

  const interpPearson = pR != null
    ? `${pearson.strength} ${pearson.direction} linear association (Pearson r = ${fmtR(pR)}, ${pearson.significance}).`
    : `Pearson correlation could not be computed: ${pearson.error}`;

  const interpSpearman = sR != null
    ? `${spearman.strength} ${spearman.direction} monotonic association (Spearman ρ = ${fmtR(sR)}, ${spearman.significance}).`
    : `Spearman correlation could not be computed: ${spearman.error}`;

  const downloadReady = Boolean(normResult?.normalised?.length);

  const downloadButtonStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    margin: '14px 0 20px',
    padding: '13px 22px',
    background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
    color: '#ffffff',
    border: '2px solid #60a5fa',
    borderRadius: '10px',
    fontSize: '14px',
    fontWeight: 800,
    letterSpacing: '0.3px',
    cursor: downloadReady ? 'pointer' : 'not-allowed',
    opacity: downloadReady ? 1 : 0.5,
    boxShadow: '0 5px 18px rgba(37, 99, 235, 0.35)',
    transition: 'all 0.2s ease'
  };

  return (
    <div className={styles.panel}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Cross-Variable Analysis</h2>
        <span className={styles.sectionSub}>
          Temperature Anomaly (°C) vs NH Snow Cover Extent (Mkm²)
          &nbsp;·&nbsp;{commonStart}–{commonEnd}&nbsp;·&nbsp;n = {n} paired years
        </span>
      </div>

      <div className={styles.cardGrid}>
        <StatCard label="Pearson r" value={fmtR(pR)} sub={`p ${fmtP(pearson.p)}`} color={rColor(pR)} />
        <StatCard label="Spearman ρ" value={fmtR(sR)} sub={`p ${fmtP(spearman.p)}`} color={rColor(sR)} />
        <StatCard label="Paired years (n)" value={String(n)} sub={`${commonStart}–${commonEnd}`} />
        <StatCard label="Excluded years" value={String(excludedYears?.length ?? 0)} sub="Missing in one or both datasets" />
      </div>

      <div className={styles.interp}>
        <p className={styles.interpRow}><strong>Pearson:</strong> {interpPearson}</p>
        <p className={styles.interpRow}><strong>Spearman:</strong> {interpSpearman}</p>
      </div>

      <div className={styles.causationBox}>
        ⚠ <strong>Correlation ≠ causation.</strong> {caveat}
      </div>

      <div className={styles.chartWrapper}>
        <h3 className={styles.chartTitle}>
          Normalised Time-Series Comparison
        </h3>

        <button
          type="button"
          style={downloadButtonStyle}
          disabled={!downloadReady}
          onClick={() => downloadCrossCSV(crossStats)}
          onMouseEnter={e => {
            if (downloadReady) {
              e.currentTarget.style.background = '#1e40af';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb, #1d4ed8)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
        >
          <span>⬇</span>
          DOWNLOAD ANALYSIS CSV
        </button>

        <ComparisonChart normalisedResult={normResult} />
      </div>

      <div className={styles.expandSection}>
        <button
          className={styles.expandBtn}
          onClick={() => setShowMethod(v => !v)}
          aria-expanded={showMethod}
        >
          {showMethod ? '▾' : '▸'} Statistical methodology
        </button>

        {showMethod && (
          <div className={styles.expandContent}>
            <p><strong>Pearson r</strong> measures the strength and direction of the linear relationship between the two variables across paired years. It is sensitive to outliers.</p>
            <p><strong>Spearman ρ</strong> measures monotonic association using fractional average ranks. It can capture non-linear monotonic relationships.</p>
            <p><strong>Normalisation:</strong> {normResult?.method ?? 'Z-score standardisation over the common paired period.'}</p>

            {normResult?.tempMean != null && (
              <p>
                Temperature: mean = {normResult.tempMean} °C,
                s = {normResult.tempStd} °C.
                Snow Cover: mean = {normResult.snowMean} Mkm²,
                s = {normResult.snowStd} Mkm².
              </p>
            )}

            <p><strong>Year alignment:</strong> Only years with valid annual means in both datasets are included. Years with missing observations are excluded.</p>
            <p><strong>p-values:</strong> Two-tailed statistical significance estimates. Temporal autocorrelation can reduce the effective sample size, so interpret p-values with caution.</p>
          </div>
        )}
      </div>

      {excludedYears && excludedYears.length > 0 && (
        <div className={styles.expandSection}>
          <button
            className={styles.expandBtn}
            onClick={() => setShowExcluded(v => !v)}
            aria-expanded={showExcluded}
          >
            {showExcluded ? '▾' : '▸'} Excluded years ({excludedYears.length})
          </button>

          {showExcluded && (
            <ul className={styles.excludedList}>
              {excludedYears.map(e => (
                <li key={e.year}>
                  <strong>{e.year}</strong> — {e.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
