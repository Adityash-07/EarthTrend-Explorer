/**
 * Sidebar.jsx
 * -----------
 * Left-hand navigation panel.
 * Lists all registered datasets as clickable tiles.
 * Highlights the currently active one.
 * Shows DatasetInfo for the selected dataset below the list.
 *
 * Props:
 *   datasets         {Array}   – full DATASETS array from dataRegistry.js
 *   activeDatasetId  {string}  – id of the currently selected dataset
 *   onSelect         {fn}      – called with the new dataset id when user clicks
 */

import DatasetInfo from './DatasetInfo.jsx';
import styles from './Sidebar.module.css';

export default function Sidebar({ datasets, activeDatasetId, onSelect }) {
  const activeDs = datasets.find(d => d.id === activeDatasetId);

  return (
    <aside className={styles.sidebar}>
      {/* ── Title ─────────────────────────────────────── */}
      <div className={styles.header}>
        <span className={styles.headerIcon}>🌍</span>
        <span className={styles.headerText}>Datasets</span>
      </div>

      {/* ── Dataset list ──────────────────────────────── */}
      <ul className={styles.list}>
        {datasets.map(ds => {
          const isActive = ds.id === activeDatasetId;
          return (
            <li key={ds.id}>
              <button
                className={`${styles.item} ${isActive ? styles.active : ''}`}
                onClick={() => onSelect(ds.id)}
                aria-pressed={isActive}
              >
                {/* Coloured dot using the dataset's accent colour */}
                <span
                  className={styles.dot}
                  style={{ background: ds.color }}
                  aria-hidden="true"
                />
                <span className={styles.itemLabel}>{ds.label}</span>
                {isActive && <span className={styles.arrow}>›</span>}
              </button>
            </li>
          );
        })}
      </ul>

      {/* ── Info card for active dataset ──────────────── */}
      <DatasetInfo dataset={activeDs} />

      {/* ── Footer note ───────────────────────────────── */}
      <p className={styles.footer}>
        More datasets coming in future phases.
      </p>
    </aside>
  );
}
