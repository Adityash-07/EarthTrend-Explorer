// src/data/parseGistemp.js
//
// PURPOSE:
//   Loads the NASA GISTEMP v4 CSV from public/data/GLB.Ts+dSST.csv and
//   parses it into clean JavaScript objects the charts can use.
//
// WHY THIS FILE IS CAREFUL:
//   The CSV has a quirky structure:
//     Row 1  → plain-text title  ("Land-Ocean: Global Means")  ← skip this
//     Row 2  → real column headers (Year, Jan, Feb, … SON)
//     Row 3+ → data rows
//   Missing values are marked as "***" — we convert them to null.
//
// WHAT IT RETURNS:
//   {
//     annual: [ { year:1880, anomaly:−0.18 }, … ]   ← J-D (annual mean) column
//     monthly: [ { year:1880, Jan:−0.19, Feb:−0.25, … Dec:−0.18 }, … ]
//     seasonal: [ { year:1880, DJF:…, MAM:…, JJA:…, SON:… }, … ]
//     meta: { minYear, maxYear, baseline: '1951-1980' }
//   }

import Papa from 'papaparse'

const CSV_URL = '/data/GLB.Ts+dSST.csv'

const MONTH_COLS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const SEASON_COLS = ['DJF','MAM','JJA','SON']
const ANNUAL_COL = 'J-D'   // the column NASA uses for the calendar-year mean

/** Convert a raw CSV cell value to a number, or null if it is missing ("***"). */
function toNum(raw) {
  if (raw === undefined || raw === null) return null
  const trimmed = String(raw).trim()
  if (trimmed === '***' || trimmed === '') return null
  const n = parseFloat(trimmed)
  return isNaN(n) ? null : n
}

/**
 * Synchronous parser — takes the raw CSV text string and returns
 * { annual, monthly, seasonal, meta }.
 * This is the function imported by dataRegistry.js for the useDataset hook.
 */
export function parseGistemp(text) {
  // PapaParse turns the raw CSV text into an array of row arrays.
  // We use header:false so we control header detection ourselves.
  const { data: rows } = Papa.parse(text, {
    header: false,
    skipEmptyLines: true,
  })

  // Find the row that contains "Year" as its first cell — that is row index 1
  // (the second line of the file).  Doing this dynamically means we don't break
  // if NASA ever adds or removes comment lines at the top.
  const headerRowIndex = rows.findIndex(
    (row) => String(row[0]).trim() === 'Year'
  )
  if (headerRowIndex === -1) {
    throw new Error('Could not find the header row (Year, Jan, Feb …) in the CSV.')
  }

  // Build a map of  column-name → column-index  from the header row.
  const headers = rows[headerRowIndex].map((h) => String(h).trim())
  const colIndex = {}
  headers.forEach((name, i) => { colIndex[name] = i })

  // Rows after the header row are the actual data.
  const dataRows = rows.slice(headerRowIndex + 1)

  const annual = []
  const monthly = []
  const seasonal = []

  for (const row of dataRows) {
    const yearRaw = String(row[colIndex['Year']] ?? '').trim()
    const year = parseInt(yearRaw, 10)
    if (isNaN(year)) continue   // skip any stray non-data lines

    // ── Annual mean ──────────────────────────────────────────────────────────
    const annualAnomaly = toNum(row[colIndex[ANNUAL_COL]])
    annual.push({ year, anomaly: annualAnomaly })

    // ── Monthly anomalies ────────────────────────────────────────────────────
    const monthRow = { year }
    for (const m of MONTH_COLS) {
      monthRow[m] = toNum(row[colIndex[m]])
    }
    monthly.push(monthRow)

    // ── Seasonal anomalies ───────────────────────────────────────────────────
    const seasonRow = { year }
    for (const s of SEASON_COLS) {
      seasonRow[s] = toNum(row[colIndex[s]])
    }
    seasonal.push(seasonRow)
  }

  const years = annual.map((r) => r.year)
  return {
    annual,
    monthly,
    seasonal,
    meta: {
      minYear: Math.min(...years),
      maxYear: Math.max(...years),
      baseline: '1951–1980',
      source: 'NASA GISTEMP v4 — Land-Ocean Temperature Index',
    },
  }
}

/**
 * Fetch and parse the GISTEMP CSV.
 * Returns a Promise that resolves to { annual, monthly, seasonal, meta }.
 * Kept for backward compatibility — App.jsx no longer calls this directly
 * (useDataset hook calls parseGistemp instead), but tests may still use it.
 */
export async function loadGistempData() {
  const response = await fetch(CSV_URL)
  if (!response.ok) {
    throw new Error(`Failed to fetch CSV: ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  return parseGistemp(text)
}
