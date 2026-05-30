// Port of PlatesCore/Calculators/PerformanceAnalytics.swift.
// Trend signals over a (date, value) series: plateau, OLS velocity, predicted 1RM.
// Dates are epoch-ms numbers (the iOS version uses Date).

const DAY = 86_400_000;

export interface Point {
  date: number;
  value: number;
}

export interface Plateau {
  windowSize: number;
  spreadPercent: number;
}

export interface Velocity {
  unitsPerMonth: number;
  firstDate: number;
  lastDate: number;
  intercept: number;
  slopePerDay: number;
}

export const Performance = {
  /** Plateau when the last `windowSize` points sit within `thresholdPercent` of the latest. */
  detectPlateau(points: Point[], windowSize = 4, thresholdPercent = 3): Plateau | null {
    if (windowSize < 2 || points.length < windowSize) return null;
    const window = points.slice(-windowSize);
    const values = window.map((p) => p.value);
    const mn = Math.min(...values);
    const mx = Math.max(...values);
    const latest = values[values.length - 1];
    if (!(latest > 0)) return null;
    const spread = ((mx - mn) / latest) * 100;
    if (spread > thresholdPercent) return null;
    return { windowSize, spreadPercent: spread };
  },

  /** OLS slope vs days-since-first, normalised to units/month. */
  velocity(points: Point[], minPoints = 3, minSpanDays = 7): Velocity | null {
    if (points.length < minPoints) return null;
    const first = points[0].date;
    const last = points[points.length - 1].date;
    const spanDays = (last - first) / DAY;
    if (spanDays < minSpanDays) return null;

    const xs = points.map((p) => (p.date - first) / DAY);
    const ys = points.map((p) => p.value);
    const n = points.length;
    const sumX = xs.reduce((a, b) => a + b, 0);
    const sumY = ys.reduce((a, b) => a + b, 0);
    const sumXY = xs.reduce((a, x, i) => a + x * ys[i], 0);
    const sumX2 = xs.reduce((a, x) => a + x * x, 0);
    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return null;
    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;
    return { unitsPerMonth: slope * 30, firstDate: first, lastDate: last, intercept, slopePerDay: slope };
  },

  /** Project the regression line `daysAhead` from `lastDate`. */
  projection(v: Velocity, daysAhead: number): Point {
    const date = v.lastDate + daysAhead * DAY;
    const xDays = (date - v.firstDate) / DAY;
    return { date, value: v.intercept + v.slopePerDay * xDays };
  },

  /** Projected e1RM `daysAhead` ahead; holds the last value when signal is thin. */
  predict1RM(points: Point[], daysAhead = 30): Point | null {
    const last = points[points.length - 1];
    if (!last) return null;
    const v = Performance.velocity(points);
    if (!v) return { date: last.date + daysAhead * DAY, value: last.value };
    return Performance.projection(v, daysAhead);
  },
};
