
// src/App.jsx
// EarthTrend Explorer - Main Application

import React, { useState, useMemo } from 'react'

// Data layer
import { DATASETS, getDataset } from './data/dataRegistry.js'
import { useDataset } from './data/useDataset.js'

// Statistical analysis
import { olsRegression } from './analysis/regression.js'
import { mannKendallTest } from './analysis/mannKendall.js'
import { rollingMean } from './analysis/rollingAverage.js'
import { findExtremes } from './analysis/extremes.js'
import { computeCrossStats } from './analysis/crossCorrelation.js'

// Components
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import StatsCards from './components/StatsCards.jsx'
import AnnualChart from './components/AnnualChart.jsx'
import MonthlyHeatmap from './components/MonthlyHeatmap.jsx'
import SeasonalChart from './components/SeasonalChart.jsx'
import TrendPanel from './components/TrendPanel.jsx'
import SnowCoverChart from './components/SnowCoverChart.jsx'
import CrossAnalysisPanel from './components/CrossAnalysisPanel.jsx'

import styles from './App.module.css'

export default function App() {
  // Dataset selection
  const [activeDatasetId, setActiveDatasetId] = useState('gistemp')

  // Load both datasets independently.
  // This allows Cross Analysis to use both datasets together.
  const gistempResult = useDataset('gistemp')
  const snowResult = useDataset('snowcover')

  // Currently selected dataset
  const activeResult =
    activeDatasetId === 'gistemp'
      ? gistempResult
      : snowResult

  const { data, loading, error } = activeResult

  // Current dataset information
  const activeDs = getDataset(activeDatasetId)

  // Cross-variable analysis
  const crossStats = useMemo(() => {
    if (!gistempResult.data || !snowResult.data) {
      return null
    }

    return computeCrossStats(
      gistempResult.data.annual,
      snowResult.data.annual
    )
  }, [gistempResult.data, snowResult.data])

  // GISTEMP statistics
  const gistempStats = useMemo(() => {
    if (!data || activeDatasetId !== 'gistemp') {
      return null
    }

    const regression = olsRegression(data.annual)
    const mk = mannKendallTest(data.annual)
    const movingAvg = rollingMean(data.annual, 11)
    const extremes = findExtremes(data.annual)

    return {
      regression,
      mk,
      movingAvg,
      extremes
    }
  }, [data, activeDatasetId])

  // Snow Cover statistics
  const snowStats = useMemo(() => {
    if (!data || activeDatasetId !== 'snowcover') {
      return null
    }

    const regression = olsRegression(data.annual)
    const mk = mannKendallTest(data.annual)
    const movingAvg = rollingMean(data.annual, 11)
    const extremes = findExtremes(data.annual)

    return {
      regression,
      mk,
      movingAvg,
      extremes
    }
  }, [data, activeDatasetId])

  // Loading state
  if (loading) {
    return (
      <div className={styles.centred}>
        <div className={styles.spinner} />
        <p className={styles.loadingText}>
          Loading {activeDs.label} data...
        </p>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className={styles.centred}>
        <p className={styles.errorText}>
          Failed to load data
        </p>

        <p className={styles.errorDetail}>
          {error}
        </p>

        <p className={styles.errorHint}>
          Make sure the file <code>{activeDs.file}</code> exists
          in the public folder and the development server is running.
        </p>
      </div>
    )
  }

  // Footer source
  const footerText =
    activeDatasetId === 'gistemp'
      ? 'Data: NASA GISS Surface Temperature Analysis (GISTEMP v4)'
      : 'Data: Rutgers University Global Snow Lab — NH Land Snow Cover'

  return (
    <div className={styles.app}>

      {/* Header */}
      <Header
        meta={data.meta}
        datasetLabel={activeDs.label}
      />

      <div className={styles.body}>

        {/* Dataset sidebar */}
        <Sidebar
          datasets={DATASETS}
          activeDatasetId={activeDatasetId}
          onSelect={setActiveDatasetId}
        />

        {/* Main dashboard */}
        <main className={styles.main}>

          {/* GISTEMP Dashboard */}
          {activeDatasetId === 'gistemp' && (
            <>
              <StatsCards
                annual={data.annual}
              />

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

                <SeasonalChart
                  seasonal={data.seasonal}
                />

                <MonthlyHeatmap
                  monthly={data.monthly}
                />

              </div>
            </>
          )}

          {/* Snow Cover Dashboard */}
          {activeDatasetId === 'snowcover' && (
            <>
              <StatsCards
                annual={data.annual}
                unit={activeDs.unit}
              />

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

          {/* Phase 3: Cross-variable analysis */}
          <CrossAnalysisPanel
            crossStats={crossStats}
          />

        </main>
      </div>

      {/* Footer */}
      <footer className={styles.footer}>
        {footerText} · Built for NASA Space Apps Challenge
      </footer>

    </div>
  )
}
