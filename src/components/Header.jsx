// src/components/Header.jsx
// The top banner of the dashboard.
// Displays the mission name, data source credit, and a subtle animated star background.
import React from 'react'
import styles from './Header.module.css'

// datasetLabel – name of the active dataset (from dataRegistry), shown in subtitle
export default function Header({ meta, datasetLabel }) {
  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <div className={styles.logoRow}>
          {/* Simple SVG Earth icon — no external image needed */}
          <svg className={styles.earthIcon} viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#1a3a5c" stroke="#3b82d4" strokeWidth="2"/>
            <ellipse cx="32" cy="32" rx="12" ry="30" fill="none" stroke="#3b82d4" strokeWidth="1.2" opacity="0.5"/>
            <line x1="2" y1="32" x2="62" y2="32" stroke="#3b82d4" strokeWidth="1.2" opacity="0.5"/>
            <path d="M20 14 Q32 22 44 14" stroke="#4ade80" strokeWidth="1.5" fill="none" opacity="0.7"/>
            <path d="M12 42 Q24 36 36 44 Q48 52 56 42" stroke="#4ade80" strokeWidth="1.5" fill="none" opacity="0.7"/>
          </svg>
          <div>
            <h1 className={styles.title}>EarthTrend Explorer</h1>
            <p className={styles.subtitle}>
              {datasetLabel ?? 'Global Surface Temperature Anomaly — NASA GISTEMP v4'}
            </p>
          </div>
        </div>
        {meta && (
          <div className={styles.metaRow}>
            {meta.source  && <span className={styles.badge}>📡 {meta.source}</span>}
            {meta.minYear && <span className={styles.badge}>📅 {meta.minYear}–{meta.maxYear}</span>}
            {meta.baseline && <span className={styles.badge}>📏 Baseline: {meta.baseline}</span>}
          </div>
        )}
      </div>
    </header>
  )
}
