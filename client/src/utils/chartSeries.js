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

/*
*  Build all three series, preserving LOCF & EUR-fallback semantics
* + LOCF: when a value for a given date is missing in the
*   source maps ('mapTo' / 'mapFrom'), we reuse the most recent previous observation (if we have)
*   This keeps the series continuous and avoids gaps that would complicate grouping/aggregation
*   or cause misleading axis autoscaling. 
* + 'lastA'/'lastB' store the most recent non-empty entry and are copied forward for subsequent missing dates
* + EUR fallback: if one side of the pair is EUR and there is no entry for that date, we
*   substitute a synthetic record { rate: 1, margin: 0 } so cross-rate calculations remain valid
*   (needed jsut to show straight line)
* + Tooltip/hover implications: points filled via LOCF contain numeric values, so tooltips will
*   display the carried-forward number. If there is no previous observation (and no EUR fallback)
*   the point remains 'null' and will not show a value
*
* + LOCF only carries values forward in time (uses previous observations)
*   It does not look ahead (no backfill). The separate `computeLatestRates` routine scans
*   the timeline backwards only to find the most recent complete observation, which is a
*   different operation (used for obtaining the current/latest rate, not for filling the series)
*/
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

  let lastA = null; // LOCF for 'to' currency (most recent observed 'mapTo' value)
  let lastB = null; // LOCF for 'from' currency (most recent observed 'mapFrom' value)

  for (const ts of timeline) {
    if (ts >= rangeStart && ts <= rangeEnd) {
      const key = keyFromTimestampUTC(ts);

      // Fetch entries for this date (may be undefined)
      let a = mapTo.get(key);
      let b = mapFrom.get(key);

      // If current date lacks a value but we have a previously observed value carry it forward
      if (!a && lastA) a = lastA;
      if (!b && lastB) b = lastB;

      // If a real observation exists at this key, update the 'last*' pointers so future missing
      // dates will carry this new value forward
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
