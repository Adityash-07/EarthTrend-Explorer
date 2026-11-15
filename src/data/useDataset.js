/**
 * useDataset.js
 * -------------
 * React hook that fetches and parses any registered dataset on demand.
 *
 * Usage:
 *   const { data, loading, error } = useDataset('gistemp');
 *   const { data, loading, error } = useDataset('snowcover');
 *
 * Returns:
 *   loading  {boolean}  – true while the file is being fetched / parsed
 *   error    {string|null} – error message, or null if OK
 *   data     {object|null} – parsed result: { annual, monthly, meta }
 *
 * The hook:
 *   - Looks the dataset up in the registry (so the caller only needs the id)
 *   - Fetches the file from /public via fetch()
 *   - Calls the correct parser function
 *   - Caches the result in a module-level Map so the same file is never
 *     fetched twice across re-renders or dataset switches
 */

import { useState, useEffect } from 'react';
import { getDataset } from './dataRegistry.js';

// Module-level cache: datasetId → parsed result
// Lives outside the component so it persists across renders.
const cache = new Map();

export function useDataset(datasetId) {
  // State shape: { loadedId, loading, error, data }
  //
  // `loadedId` tracks which datasetId the current `data` belongs to.
  // This is the key fix: when activeDatasetId changes, the caller immediately
  // sees loading=true (because loadedId !== datasetId) before the effect fires.
  // Without this, React would render one frame with the previous dataset's data
  // under the new dataset's conditional block, causing SeasonalChart to receive
  // `undefined` for its `seasonal` prop and crash the entire tree.
  const [state, setState] = useState({
    loadedId: null,   // which id the current `data` belongs to
    loading:  true,
    error:    null,
    data:     null,
  });

  // Derive whether we are still loading FOR THE CURRENT datasetId.
  // If the cached data in state is from a different id, treat as loading.
  const isLoadingForCurrentId = state.loadedId !== datasetId || state.loading;

  useEffect(() => {
    if (!datasetId) return;

    // Return cached result immediately (no flicker on dataset switch-back)
    if (cache.has(datasetId)) {
      setState({ loadedId: datasetId, loading: false, error: null, data: cache.get(datasetId) });
      return;
    }

    let cancelled = false;   // prevents state update if component unmounts

    setState(prev => ({
      loadedId: prev.loadedId,  // keep old loadedId so callers see loading correctly
      loading:  true,
      error:    null,
      data:     null,
    }));

    async function load() {
      try {
        const ds       = getDataset(datasetId);         // throws if unknown id
        const response = await fetch(ds.file);

        if (!response.ok) {
          throw new Error(
            `Failed to fetch "${ds.file}": HTTP ${response.status} ${response.statusText}`
          );
        }

        const rawText  = await response.text();
        const parsed   = ds.parser(rawText);            // call the right parser

        cache.set(datasetId, parsed);                   // store in cache

        if (!cancelled) {
          setState({ loadedId: datasetId, loading: false, error: null, data: parsed });
        }
      } catch (err) {
        if (!cancelled) {
          setState({ loadedId: datasetId, loading: false, error: err.message, data: null });
        }
      }
    }

    load();

    // Cleanup: if the component unmounts or datasetId changes before load
    // finishes, ignore the stale result.
    return () => { cancelled = true; };
  }, [datasetId]);

  // Return the derived loading flag, not the raw state.loading.
  // This ensures the caller sees loading=true during the one-frame gap between
  // a dataset switch and the effect firing.
  return {
    loading: isLoadingForCurrentId,
    error:   state.loadedId === datasetId ? state.error : null,
    data:    state.loadedId === datasetId ? state.data  : null,
  };
}
