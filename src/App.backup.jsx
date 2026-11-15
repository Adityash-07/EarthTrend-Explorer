// src/App.jsx
//
// Root component of EarthTrend Explorer.
//
// Phase 2 changes:
//   - Added a Sidebar that lists all registered datasets
//   - `activeDatasetId` state controls which dataset is loaded
//   - useDataset() hook fetches + parses the active dataset on demand
//   - When GISTEMP is active → renders the original full dashboard
//   - When Snow Cover is active → renders SnowCoverChart + TrendPanel
//   - The app layout now has a sidebar column beside the main content

import React, { useState, useMemo } from 'react'

// ── Data layer ──────────────────────────────────────────────────────────────
import { DATASETS, getDataset }  from './data/dataRegistry.js'
import { useDataset }            from './data/useDataset.js'

// ── Analysis (GISTEMP only — unchanged from Phase 1) ───────────────────────
import { olsRegression }   from './analysis/regression.js'
import { mannKendallTest } from './analysis/mannKendall.js'
import { rollingMean }     from './analysis/rollingAverage.js'
import { findExtremes }    from './analysis/extremes.js'

// ── Components ──────────────────────────────────────────────────────────────
import Header         from './components/Header.jsx'
import Sidebar        from './components/Sidebar.jsx'
import StatsCards     from './components/StatsCards.jsx'
import AnnualChart    from './components/AnnualChart.jsx'
import MonthlyHeatmap from './components/MonthlyHeatmap.jsx'
import SeasonalChart  from './components/SeasonalChart.jsx'
import TrendPanel     from './components/TrendPanel.jsx'
import SnowCoverChart from './components/SnowCoverChart.jsx'

import styles from './App.module.css'

export default function App() {
  // Which dataset is the user viewing right now?
  // Starts with GISTEMP (the original default).
  const [activeDatasetId, setActiveDatasetId] = useState('gistemp')

  // useDataset fetches + parses the file for the active dataset.
  // Results are cached, so switching back to GISTEMP is instant.
  const { data, loading, error } = useDataset(activeDatasetId)

  // Registry entry for the active dataset (gives us color, unit, etc.)
  const activeDs = getDataset(activeDatasetId)

  // ── GISTEMP statistics (Phase 1 — unchanged) ─────────────────────────────
  // Only computed when GISTEMP data is loaded. useMemo re-runs only if
  // `data` or `activeDatasetId` changes.
  const gistempStats = useMemo(() => {
    if (activeDatasetId !== 'gistemp' || !data) return null
    const regression = olsRegression(data.annual)
    const mk         = mannKendallTest(data.annual)
    const movingAvg  = rollingMean(data.annual, 11)
    const extremes   = findExtremes(data.annual)
    return { regression, mk, movingAvg, extremes }
  }, [data, activeDatasetId])

  // ── Snow Cover statistics (Phase 2) ──────────────────────────────────────
  // For now we reuse the same OLS + MK + extremes pipeline.
  // The annual array shape is identical: [{ year, anomaly }]
  const snowStats = useMemo(() => {
    if (activeDatasetId !== 'snowcover' || !data) return null
    const regression = olsRegression(data.annual)
    const mk         = mannKendallTest(data.annual)
    const movingAvg  = rollingMean(data.annual, 11)
    const extremes   = findExtremes(data.annual)
    return { regression, mk, movingAvg, extremes }
  }, [data, activeDatasetId])

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={styles.centred}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>Loading {activeDs.label} data…</p>
      </div>
    )
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={styles.centred}>
        <p className={styles.errorText}>⚠ Failed to load data</p>
        <p className={styles.errorDetail}>{error}</p>
        <p className={styles.errorHint}>
          Make sure the file <code>{activeDs.file}</code> exists in <code>public/</code> and
          the dev server is running (<code>npm run dev</code>).
        </p>
      </div>
    )
  }

  // ── Shared footer text ───────────────────────────────────────────────────
  const footerText = activeDatasetId === 'gistemp'
    ? 'Data: NASA GISS Surface Temperature Analysis (GISTEMP v4)'
    : 'Data: Rutgers University Global Snow Lab — NH Land Snow Cover'

  // ── Main render ───────────────────────────────────────────────────────────
  return (
    <div className={styles.app}>
      {/* Top bar — always visible */}
      <Header meta={data.meta} datasetLabel={activeDs.label} />

      <div className={styles.body}>
        {/* Left sidebar — dataset switcher */}
        <Sidebar
          datasets={DATASETS}
          activeDatasetId={activeDatasetId}
          onSelect={setActiveDatasetId}
        />

        {/* Right content — changes based on active dataset */}
        <main className={styles.main}>

          {/* ── GISTEMP dashboard (Phase 1, unchanged) ── */}
          {activeDatasetId === 'gistemp' && (
            <>
              <StatsCards annual={data.annual} />

              <div className={styles.chartGrid}>
                <AnnualChart
                  annual={data.annual}
                  fittedLine={gistempStats?.regression?.fittedLine}
                  movingAvg={gistempStats?.movingAvg?.series}
                  extremes={gistempStats?.extremes}
                />
                {gistempStats && (
                  <TrendPanel
                    regression={gistempStats.regression}
                    mk={gistempStats.mk}
                    extremes={gistempStats.extremes}
                    meta={data.meta}
                  />
                )}
              </div>

              <div className={styles.chartGrid2}>
                <SeasonalChart seasonal={data.seasonal} />
                <MonthlyHeatmap monthly={data.monthly} />
              </div>
            </>
          )}

          {/* ── Snow Cover dashboard (Phase 2) ── */}
          {activeDatasetId === 'snowcover' && (
            <>
              {/* Stats cards reused — they read the `anomaly` field which
                  holds Mkm² for snow cover.  Labels inside StatsCards
                  say "anomaly" but that is acceptable for now; Phase 3
                  will make them unit-aware. */}
              <StatsCards annual={data.annual} unit={activeDs.unit} />

              <div className={styles.chartGrid}>
                <SnowCoverChart
                  data={data}
                  color={activeDs.color}
                  fittedLine={snowStats?.regression?.fittedLine}
                  movingAvg={snowStats?.movingAvg?.series}
                  regression={snowStats?.regression}
                />
                {snowStats && (
                  <TrendPanel
                    regression={snowStats.regression}
                    mk={snowStats.mk}
                    extremes={snowStats.extremes}
                    meta={data.meta}
                    unit={activeDs.unit}
                    variableName={activeDs.variableName}
                  />
                )}
              </div>
            </>
          )}

        </main>
      </div>

      <footer className={styles.footer}>
        {footerText} · Built for NASA Space Apps Challenge
      </footer>
    </div>
  )
}
