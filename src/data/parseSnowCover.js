/**
 * parseSnowCover.js
 * -----------------
 * Parses the Rutgers NH Land Snow Cover file (moncov.nhland.txt).
 *
 * FILE FORMAT (no header, no footer):
 *   YEAR  MONTH  AREA_KM2
 *   1966  11  34943905
 *   1966  12  43004840
 *   ...
 *
 * Rules applied here:
 *  - Raw unit is km².  We convert to million km² (Mkm²) by dividing by 1 000 000.
 *  - Missing months are simply absent rows — not flagged with a sentinel value.
 *  - Annual mean is computed only when ≥ 10 of 12 months are present; otherwise null.
 *  - The returned shape matches what every other component expects:
 *      { annual: [{year, anomaly}], monthly: [...], meta: {...} }
 *    "anomaly" here means "value" (Mkm²).  The word is a technical field
 *    name used internally; charts read the dataset's `variableName` / `unit`
 *    from the registry for display.
 *
 * @param {string} rawText  – full text content of the file
 * @returns {{ annual, monthly, meta }}
 */
export function parseSnowCover(rawText) {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];

  // ── 1. Parse every valid line ──────────────────────────────────────────
  // Build a nested map: yearMonthMap[year][month] = areaMkm2
  const yearMonthMap = {};   // { 1966: { 11: 34.94, 12: 43.00 }, ... }

  const lines = rawText.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;                     // skip blank lines

    const parts = trimmed.split(/\s+/);
    if (parts.length < 3) continue;             // malformed line — skip

    const year  = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const areaKm2 = parseFloat(parts[2]);

    // Reject clearly invalid entries
    if (isNaN(year) || isNaN(month) || isNaN(areaKm2)) continue;
    if (month < 1 || month > 12) continue;

    if (!yearMonthMap[year]) yearMonthMap[year] = {};
    yearMonthMap[year][month] = areaKm2 / 1_000_000;  // → Mkm²
  }

  const years = Object.keys(yearMonthMap).map(Number).sort((a, b) => a - b);

  // ── 2. Build the monthly flat array (used by heatmap / seasonal charts) ─
  const monthly = [];
  for (const year of years) {
    for (let m = 1; m <= 12; m++) {
      const val = yearMonthMap[year][m];        // undefined when row absent
      monthly.push({
        year,
        month: m,
        monthName: MONTHS[m - 1],
        value: val !== undefined ? val : null,  // null = missing
      });
    }
  }

  // ── 3. Build the annual array ──────────────────────────────────────────
  // Rule: annual mean is null if fewer than 10 months are available.
  const annual = [];
  for (const year of years) {
    const monthVals = Object.values(yearMonthMap[year]);  // only present months
    const count     = monthVals.length;
    const mean      = count >= 10
      ? monthVals.reduce((s, v) => s + v, 0) / count
      : null;

    annual.push({
      year,
      anomaly: mean,          // field name kept as "anomaly" for shape compatibility
      monthsAvailable: count,
    });
  }

  // ── 4. Meta information ───────────────────────────────────────────────
  const validAnnual = annual.filter(d => d.anomaly !== null).map(d => d.anomaly);
  const allMonthly  = monthly.filter(d => d.value !== null).map(d => d.value);

  const meta = {
    // Standard fields shared by all datasets (used by Header, TrendPanel, insights)
    minYear:  years[0],
    maxYear:  years[years.length - 1],
    source:   'Rutgers University Global Snow Lab',
    baseline: null,   // no anomaly baseline for this dataset

    // Snow-cover-specific fields
    firstYear:  years[0],
    lastYear:   years[years.length - 1],
    totalYears: years.length,
    // Annual stats (from annual means)
    annualMin:  validAnnual.length ? Math.min(...validAnnual) : null,
    annualMax:  validAnnual.length ? Math.max(...validAnnual) : null,
    annualMean: validAnnual.length
      ? validAnnual.reduce((s, v) => s + v, 0) / validAnnual.length
      : null,
    // Monthly extremes (from raw monthly readings)
    monthlyMin: allMonthly.length ? Math.min(...allMonthly) : null,
    monthlyMax: allMonthly.length ? Math.max(...allMonthly) : null,
    // Coverage
    totalMonthlyReadings:  allMonthly.length,
    missingMonthlyReadings: monthly.filter(d => d.value === null).length,
    unit: 'Mkm²',
  };

  return { annual, monthly, meta };
}
