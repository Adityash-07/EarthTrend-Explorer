
/**
 * crossCorrelation.js
 * Scientific cross-variable analysis:
 * GISTEMP temperature vs Rutgers NH snow cover.
 */

import { fractionalRanks } from './mannKendall.js';

const MIN_PAIRS = 3;

// ─── Numerical helpers: Student's t distribution ─────────────────────

// Lanczos approximation of log Gamma.
function logGamma(z) {
  const coefficients = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7
  ];

  if (z < 0.5) {
    return Math.log(Math.PI) -
      Math.log(Math.sin(Math.PI * z)) -
      logGamma(1 - z);
  }

  z -= 1;

  let x = 0.99999999999980993;

  for (let i = 0; i < coefficients.length; i++) {
    x += coefficients[i] / (z + i + 1);
  }

  const t = z + coefficients.length - 0.5;

  return (
    0.5 * Math.log(2 * Math.PI) +
    (z + 0.5) * Math.log(t) -
    t +
    Math.log(x)
  );
}

// Continued fraction for incomplete beta function.
function betaContinuedFraction(a, b, x) {
  const MAX_ITER = 200;
  const EPS = 3e-14;
  const FPMIN = 1e-300;

  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;

  let c = 1;
  let d = 1 - qab * x / qap;

  if (Math.abs(d) < FPMIN) d = FPMIN;

  d = 1 / d;

  let h = d;

  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;

    let aa =
      m * (b - m) * x /
      ((qam + m2) * (a + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;

    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;

    d = 1 / d;
    h *= d * c;

    aa =
      -(a + m) * (qab + m) * x /
      ((a + m2) * (qap + m2));

    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;

    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;

    d = 1 / d;

    const delta = d * c;
    h *= delta;

    if (Math.abs(delta - 1) < EPS) break;
  }

  return h;
}

// Regularized incomplete beta I_x(a,b).
function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;

  const bt = Math.exp(
    logGamma(a + b) -
    logGamma(a) -
    logGamma(b) +
    a * Math.log(x) +
    b * Math.log1p(-x)
  );

  if (x < (a + 1) / (a + b + 2)) {
    return (
      bt * betaContinuedFraction(a, b, x) / a
    );
  }

  return 1 - (
    bt * betaContinuedFraction(b, a, 1 - x) / b
  );
}

// Exact two-tailed p-value from Student's t distribution.
function tToP(t, df) {
  if (!Number.isFinite(df) || df <= 0 || Number.isNaN(t)) {
    return null;
  }

  if (!Number.isFinite(t)) {
    return 0;
  }

  const x = df / (df + t * t);

  const p = regularizedBeta(x, df / 2, 0.5);

  return Number.isFinite(p)
    ? Math.max(0, Math.min(1, p))
    : null;
}

// ─── Labels ──────────────────────────────────────────────────────────

function significanceLabel(p) {
  if (p === null) return 'unknown';
  if (p <= 0.001) return 'p ≤ 0.001 (very highly significant)';
  if (p <= 0.01) return 'p ≤ 0.01 (highly significant)';
  if (p <= 0.05) return 'p ≤ 0.05 (significant)';
  return 'p > 0.05 (not statistically significant)';
}

function strengthLabel(r) {
  if (r === null) return 'unknown';

  const abs = Math.abs(r);

  if (abs >= 0.9) return 'Very strong';
  if (abs >= 0.7) return 'Strong';
  if (abs >= 0.5) return 'Moderate';
  if (abs >= 0.3) return 'Weak';

  return 'Very weak or negligible';
}

function directionLabel(r) {
  if (r === null || r === 0) return '';
  return r > 0 ? 'positive' : 'negative';
}

function validNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function emptyCorrelation(n, error) {
  return {
    r: null,
    t: null,
    p: null,
    n,
    significance: 'unknown',
    strength: 'unknown',
    direction: '',
    error
  };
}


// ─── 1. Align datasets ────────────────────────────────────────────────

export function alignDatasets(gAnnual, sAnnual) {
  if (!Array.isArray(gAnnual) || !Array.isArray(sAnnual)) {
    return {
      pairs: [],
      excludedYears: [],
      commonStart: null,
      commonEnd: null,
      n: 0,
      error: 'One or both datasets are missing.'
    };
  }

  const tempMap = new Map();
  const snowMap = new Map();

  for (const row of gAnnual) {
    if (row && validNumber(row.year)) {
      tempMap.set(row.year, row.anomaly);
    }
  }

  for (const row of sAnnual) {
    if (row && validNumber(row.year)) {
      snowMap.set(row.year, row.anomaly);
    }
  }

  // Find actual snow-cover dataset coverage.
  const snowYears = [...snowMap.keys()].sort((a, b) => a - b);

  const snowStart = snowYears.length ? snowYears[0] : Infinity;
  const snowEnd = snowYears.length
    ? snowYears[snowYears.length - 1]
    : -Infinity;

  // Only compare years within snow-cover dataset coverage.
  const allYears = [...new Set([
    ...tempMap.keys(),
    ...snowMap.keys()
  ])]
    .filter(year => year >= snowStart && year <= snowEnd)
    .sort((a, b) => a - b);

  const pairs = [];
  const excludedYears = [];

  for (const year of allYears) {
    const temp = tempMap.get(year);
    const snow = snowMap.get(year);

    const tempValid = validNumber(temp);
    const snowValid = validNumber(snow);

    if (!tempValid && !snowValid) {
      excludedYears.push({
        year,
        reason: 'Annual mean missing or invalid in both datasets'
      });
    } else if (!tempValid) {
      excludedYears.push({
        year,
        reason: 'Temperature annual mean missing or invalid in GISTEMP'
      });
    } else if (!snowValid) {
      excludedYears.push({
        year,
        reason: 'Snow cover annual mean missing or invalid'
      });
    } else {
      pairs.push({ year, temp, snow });
    }
  }

  const n = pairs.length;

  return {
    pairs,
    excludedYears,
    commonStart: n ? pairs[0].year : null,
    commonEnd: n ? pairs[n - 1].year : null,
    n,
    error: n < MIN_PAIRS
      ? `Insufficient paired observations (n = ${n}, minimum = ${MIN_PAIRS}).`
      : null
  };
}

// ─── 2. Pearson correlation ──────────────────────────────────────────

export function pearsonCorrelation(pairs) {
  if (!Array.isArray(pairs) || pairs.length < MIN_PAIRS) {
    return emptyCorrelation(
      pairs?.length ?? 0,
      `Need at least ${MIN_PAIRS} paired observations.`
    );
  }

  if (!pairs.every(p =>
    validNumber(p.temp) && validNumber(p.snow)
  )) {
    return emptyCorrelation(
      pairs.length,
      'Invalid or non-finite observations detected.'
    );
  }

  const n = pairs.length;

  const xs = pairs.map(p => p.temp);
  const ys = pairs.map(p => p.snow);

  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;

  let Sxx = 0;
  let Syy = 0;
  let Sxy = 0;

  for (let i = 0; i < n; i++) {
    const dx = xs[i] - xMean;
    const dy = ys[i] - yMean;

    Sxx += dx * dx;
    Syy += dy * dy;
    Sxy += dx * dy;
  }

  if (!Number.isFinite(Sxx) || !Number.isFinite(Syy) ||
      !Number.isFinite(Sxy)) {
    return emptyCorrelation(n, 'Numerical overflow during calculation.');
  }

  if (Sxx === 0) {
    return emptyCorrelation(
      n,
      'Zero variance in temperature series — correlation undefined.'
    );
  }

  if (Syy === 0) {
    return emptyCorrelation(
      n,
      'Zero variance in snow cover series — correlation undefined.'
    );
  }

  const rawR = Sxy / Math.sqrt(Sxx * Syy);

  if (!Number.isFinite(rawR)) {
    return emptyCorrelation(n, 'Correlation calculation was not finite.');
  }

  const r = Math.max(-1, Math.min(1, rawR));
  const df = n - 2;

  let t;
  let p;

  if (Math.abs(r) === 1) {
    t = r > 0 ? Infinity : -Infinity;
    p = 0;
  } else {
    t = r * Math.sqrt(df) / Math.sqrt(1 - r * r);
    p = tToP(t, df);
  }

  return {
    r: +r.toFixed(6),
    t: Number.isFinite(t) ? +t.toFixed(4) : t,
    p,
    n,
    significance: significanceLabel(p),
    strength: strengthLabel(r),
    direction: directionLabel(r),
    error: p === null ? 'Unable to calculate p-value.' : null
  };
}

// ─── 3. Spearman rank correlation ────────────────────────────────────

export function spearmanCorrelation(pairs) {
  if (!Array.isArray(pairs) || pairs.length < MIN_PAIRS) {
    return emptyCorrelation(
      pairs?.length ?? 0,
      `Need at least ${MIN_PAIRS} paired observations.`
    );
  }

  if (!pairs.every(p =>
    validNumber(p.temp) && validNumber(p.snow)
  )) {
    return emptyCorrelation(
      pairs.length,
      'Invalid or non-finite observations detected.'
    );
  }

  const tempRanks = fractionalRanks(pairs.map(p => p.temp));
  const snowRanks = fractionalRanks(pairs.map(p => p.snow));

  if (
    !Array.isArray(tempRanks) ||
    !Array.isArray(snowRanks) ||
    tempRanks.length !== pairs.length ||
    snowRanks.length !== pairs.length ||
    !tempRanks.every(validNumber) ||
    !snowRanks.every(validNumber)
  ) {
    return emptyCorrelation(
      pairs.length,
      'Unable to calculate valid average ranks.'
    );
  }

  const rankPairs = pairs.map((p, i) => ({
    year: p.year,
    temp: tempRanks[i],
    snow: snowRanks[i]
  }));

  return pearsonCorrelation(rankPairs);
}

// ─── 4. Z-score normalisation ─────────────────────────────────────────

export function normaliseSeries(pairs) {
  const method =
    'Z-score standardisation: z = (x − mean) / s, ' +
    'where s is sample standard deviation (n−1), ' +
    'calculated over the common paired period.';

  if (!Array.isArray(pairs) || pairs.length < 2) {
    return {
      normalised: [],
      tempMean: null,
      tempStd: null,
      snowMean: null,
      snowStd: null,
      n: pairs?.length ?? 0,
      method,
      error: 'Need at least 2 paired observations to normalise.'
    };
  }

  if (!pairs.every(p =>
    validNumber(p.temp) && validNumber(p.snow)
  )) {
    return {
      normalised: [],
      tempMean: null,
      tempStd: null,
      snowMean: null,
      snowStd: null,
      n: pairs.length,
      method,
      error: 'Invalid or non-finite observations detected.'
    };
  }

  const n = pairs.length;

  const temps = pairs.map(p => p.temp);
  const snows = pairs.map(p => p.snow);

  const mean = values =>
    values.reduce((a, b) => a + b, 0) / values.length;

  const std = (values, avg) =>
    Math.sqrt(
      values.reduce((sum, value) =>
        sum + (value - avg) ** 2, 0
      ) / (values.length - 1)
    );

  const tempMean = mean(temps);
  const snowMean = mean(snows);

  const tempStd = std(temps, tempMean);
  const snowStd = std(snows, snowMean);

  if (
    !Number.isFinite(tempMean) ||
    !Number.isFinite(snowMean) ||
    !Number.isFinite(tempStd) ||
    !Number.isFinite(snowStd)
  ) {
    return {
      normalised: [],
      tempMean: null,
      tempStd: null,
      snowMean: null,
      snowStd: null,
      n,
      method,
      error: 'Numerical overflow during normalisation.'
    };
  }

  let error = null;

  if (tempStd === 0) {
    error = 'Temperature series is constant — Z-scores are all 0.';
  }

  if (snowStd === 0) {
    error = (error ? error + ' ' : '') +
      'Snow cover series is constant — Z-scores are all 0.';
  }

  const normalised = pairs.map(p => ({
    year: p.year,
    tempZ: tempStd !== 0 ? (p.temp - tempMean) / tempStd : 0,
    snowZ: snowStd !== 0 ? (p.snow - snowMean) / snowStd : 0,
    tempOrig: p.temp,
    snowOrig: p.snow
  }));

  return {
    normalised,
    tempMean: +tempMean.toFixed(4),
    tempStd: +tempStd.toFixed(4),
    snowMean: +snowMean.toFixed(4),
    snowStd: +snowStd.toFixed(4),
    n,
    method,
    error
  };
}

// ─── 5. Complete analysis pipeline ───────────────────────────────────

export function computeCrossStats(gAnnual, sAnnual) {
  const CAVEAT =
    'Correlation describes statistical association in this sample. ' +
    'It does not establish causation, mechanism, or physical forcing. ' +
    'Both datasets have independent sources of uncertainty and measurement error. ' +
    'Temporal autocorrelation may make conventional p-values optimistic.';

  const alignment = alignDatasets(gAnnual, sAnnual);

  if (alignment.error) {
    return {
      alignment,
      pearson: emptyCorrelation(alignment.n, alignment.error),
      spearman: emptyCorrelation(alignment.n, alignment.error),
      normalised: {
        normalised: [],
        n: alignment.n,
        tempMean: null,
        tempStd: null,
        snowMean: null,
        snowStd: null,
        method: 'Z-score (sample standard deviation, common period only)',
        error: alignment.error
      },
      error: alignment.error,
      caveat: CAVEAT
    };
  }

  const pairs = alignment.pairs;

  const pearson = pearsonCorrelation(pairs);
  const spearman = spearmanCorrelation(pairs);
  const normalised = normaliseSeries(pairs);

  const topError =
    pearson.error || spearman.error || null;

  return {
    alignment,
    pearson,
    spearman,
    normalised,
    error: topError,
    caveat: CAVEAT
  };
}
