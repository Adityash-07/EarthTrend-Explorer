/**
 * dataRegistry.js
 * ---------------
 * Central registry of every dataset the app knows about.
 *
 * Each entry describes ONE dataset:
 *   id            – unique key used throughout the app
 *   label         – human-readable name shown in the sidebar
 *   description   – one-sentence summary shown in the DatasetInfo panel
 *   source        – agency / project name
 *   sourceUrl     – link to the official data page
 *   file          – path under /public (fetched at runtime)
 *   parser        – import reference (set dynamically below)
 *   variableName  – what the y-axis measures  (shown in charts)
 *   unit          – physical unit string       (shown in charts / stats)
 *   baselinePeriod– reference period string    (informational)
 *   color         – accent colour for this dataset's charts
 */

// We store parser functions here so the registry stays serialisable
// everywhere except when actually loading data.
import { parseGistemp }    from './parseGistemp.js';
import { parseSnowCover }  from './parseSnowCover.js';

export const DATASETS = [
  {
    id:             'gistemp',
    label:          'Global Surface Temperature',
    description:    'NASA GISS Surface Temperature Analysis (GISTEMP v4) — global mean surface temperature anomalies relative to the 1951–1980 baseline.',
    source:         'NASA GISS',
    sourceUrl:      'https://data.giss.nasa.gov/gistemp/',
    file:           '/data/GLB.Ts+dSST.csv',
    parser:         parseGistemp,
    variableName:   'Temperature Anomaly',
    unit:           '°C',
    baselinePeriod: '1951–1980',
    color:          '#f97316',   // warm orange
  },
  {
    id:             'snowcover',
    label:          'NH Snow Cover Extent',
    description:    'Rutgers University Global Snow Lab — Northern Hemisphere monthly land snow cover extent since November 1966.',
    source:         'Rutgers Global Snow Lab',
    sourceUrl:      'https://climate.rutgers.edu/snowcover/',
    file:           '/data/NHsnowcover.txt',
    parser:         parseSnowCover,
    variableName:   'Snow Cover Extent',
    unit:           'Mkm²',
    baselinePeriod: 'N/A',
    color:          '#38bdf8',   // icy blue
  },
];

/** Convenience: look up a dataset entry by id. Throws if not found. */
export function getDataset(id) {
  const ds = DATASETS.find(d => d.id === id);
  if (!ds) throw new Error(`Unknown dataset id: "${id}"`);
  return ds;
}
