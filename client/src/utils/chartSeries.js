import { calculatePairRates } from './currencyCalculations';
import { keyFromTimestampUTC } from './date';

// Individual point builders (exported for clarity/reuse)
export function buildBuyPoint(ts, aa, bb) {
  if (!aa || !bb) return [ts, null];
  const rates = calculatePairRates(aa.rate, bb.rate, aa.margin || 0, bb.margin || 0);
  return [ts, rates.buy];
}

export function buildSellPoint(ts, aa, bb) {
  if (!aa || !bb) return [ts, null];
  const rates = calculatePairRates(aa.rate, bb.rate, aa.margin || 0, bb.margin || 0);
  return [ts, rates.sell];
}

export function buildOriginPoint(ts, aa, bb) {
  if (!aa || !bb) return [ts, null];
  const rates = calculatePairRates(aa.rate, bb.rate, aa.margin || 0, bb.margin || 0);
  return [ts, rates.origin];
}


// Orchestrator: build all three series, preserving LOCF & EUR-fallback semantics
export function buildSeriesPoints({ mapFrom = new Map(), mapTo = new Map(), timeline = [], isFromEUR = false, isToEUR = false, rangeStart = null, rangeEnd = null }) {
  // Default range: past 1 year if not provided
  if (!rangeStart || !rangeEnd) {
    const end = new Date();
    const start = new Date(end);
    start.setFullYear(end.getFullYear() - 1);
    rangeStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
    rangeEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  }

  const buyPoints = [];
  const sellPoints = [];
  const originPoints = [];

  let lastA = null; // LOCF for 'to' currency
  let lastB = null; // LOCF for 'from' currency

  for (const ts of timeline) {
    if (ts >= rangeStart && ts <= rangeEnd) {
      const key = keyFromTimestampUTC(ts);

      let a = mapTo.get(key);
      let b = mapFrom.get(key);

      if (!a && lastA) a = lastA;
      if (!b && lastB) b = lastB;

      if (mapTo.has(key)) lastA = a;
      if (mapFrom.has(key)) lastB = b;

      const aa = a || (isToEUR ? { rate: 1, margin: 0, date: undefined } : undefined);
      const bb = b || (isFromEUR ? { rate: 1, margin: 0, date: undefined } : undefined);

      if (!aa || !bb) {
        buyPoints.push([ts, null]);
        sellPoints.push([ts, null]);
        originPoints.push([ts, null]);
        continue;
      }

      buyPoints.push(buildBuyPoint(ts, aa, bb));
      sellPoints.push(buildSellPoint(ts, aa, bb));
      originPoints.push(buildOriginPoint(ts, aa, bb));
    } else {
      buyPoints.push([ts, null]);
      sellPoints.push([ts, null]);
      originPoints.push([ts, null]);
    }
  }

  return { buyPoints, sellPoints, originPoints };
}
