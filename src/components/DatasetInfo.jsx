/**
 * DatasetInfo.jsx
 * ---------------
 * A small info panel shown below the sidebar dataset list.
 * Displays the currently-selected dataset's description, source,
 * and a link to the original data page.
 *
 * Props:
 *   dataset  {object}  – one entry from DATASETS (from dataRegistry.js)
 */

import styles from './DatasetInfo.module.css';

export default function DatasetInfo({ dataset }) {
  if (!dataset) return null;

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{dataset.label}</h3>
      <p className={styles.description}>{dataset.description}</p>

      <div className={styles.row}>
        <span className={styles.label}>Source</span>
        <a
          className={styles.link}
          href={dataset.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {dataset.source} ↗
        </a>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Variable</span>
        <span className={styles.value}>{dataset.variableName}</span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Unit</span>
        <span className={styles.value}>{dataset.unit}</span>
      </div>

      {dataset.baselinePeriod !== 'N/A' && (
        <div className={styles.row}>
          <span className={styles.label}>Baseline</span>
          <span className={styles.value}>{dataset.baselinePeriod}</span>
        </div>
      )}
    </div>
  );
}
