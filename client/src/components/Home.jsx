import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';

import RateConverter from './Converter';
import './Home.css';
import Header from './Header';
import { useAuth } from './AuthContext';

// Creates a debounced callback: delays invocation until 'wait' ms after the last call. 
// The returned function includes a 'cancel' method to abort a pending invocation.
function useDebounceCallback(fn, wait) {
  const timeoutRef = useRef(null);
  const callbackRef = useRef(fn);
  useEffect(() => { callbackRef.current = fn; }, [fn]);
  const debounced = useCallback((...args) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = null;
      callbackRef.current(...args);
    }, wait);
  }, [wait]);
  debounced.cancel = () => { if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; } };
  return debounced;
}

// Parse an input value into a valid Date object or return null
const parseDate = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  
  return dt;
};

export default function Home() {
  const [currencies, setCurrencies] = useState([]); 
  const [fromId, setFromId] = useState(null); // selected 'from' currency Id
  const [toId, setToId] = useState(null); // selected 'to' currency Id
  const [mode, setMode] = useState('mix'); // display mode: 'buy' | 'sell' | 'mix'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); 
  const [debugLogs, setDebugLogs] = useState([]); 

  const chartRef = useRef(null);
  const cacheRef = useRef({});
  const fullTimelineRef = useRef([]);
  const fullMinRef = useRef(null);
  const fullMaxRef = useRef(null);
  const initialPopulatedRef = useRef(false); // prevents forcing the initial range multiple times

  const [chartReady, setChartReady] = useState(false);
  const [latestRates, setLatestRates] = useState(null);
  const { user } = useAuth();
  
  
  const logDebug = useCallback((msg) => {
    const line = `${new Date().toISOString()} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    setDebugLogs((s) => [...s.slice(-200), line]);
    console.debug(line);
  }, []);

  // -----------------------------------------------------------
  // Load currency list from backend with retries
  // Populates 'currencies' and selects sensible defaults for 'fromId'/'toId'
  // Retries quietly up to 'maxRetries' on transient errors
  // -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const maxRetries = 10;
    const retryDelay = 2000; // ms

    const load = async (attempt = 1) => {
      try {
        const res = await fetch('http://localhost:4000/api/currencies');
        if (!res.ok) throw new Error('currencies fetch failed');
        const d = await res.json();
        if (cancelled) return;
        if (Array.isArray(d) && d.length > 0) {
          setCurrencies(d);
          setFromId((c) => c || d[0].Id);
          setToId((c) => c || (d[1] && d[1].Id) || d[0].Id);
          setError('');
          return;
        }
        throw new Error('no currencies in response');
      } catch (err) {
        logDebug(`Currencies fetch attempt ${attempt} failed: ${err && err.message ? err.message : err}`);
        if (cancelled) return;
        if (attempt < maxRetries) {
          setTimeout(() => load(attempt + 1), retryDelay);
        } else {
          setError('Failed to load currency list (server unavailable)');
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [logDebug]);

  // -----------------------------------------------------------
  // fetchRates: request full history for a currency and return a Map
  // keyed by 'YYYY-MM-DD' local date -> { rate, margin, date }
  // This is used to populate the per-currency cache once
  // -----------------------------------------------------------
  const fetchRates = useCallback(async (currencyId) => {
    try {
      // backend returns full history for GET /api/rates/:currencyId
      const url = `http://localhost:4000/api/rates/${currencyId}`;
      const res = await fetch(url);
      if (!res.ok) {
        logDebug(`fetchRates failed ${currencyId} status=${res.status}`);
        return new Map();
      }
      const rows = await res.json();
      const map = new Map();
      for (const r of rows) {
        const dt = parseDate(r.Date);
        if (!dt) continue;
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, '0');
        const d = String(dt.getDate()).padStart(2, '0');
        const key = `${y}-${m}-${d}`;

        // Store a local-date-based object
        map.set(key, { rate: Number(r.ExchangeRate), margin: r.MarginValue != null ? Number(r.MarginValue) : 0, date: new Date(y, dt.getMonth(), dt.getDate()) });
      }
      return map;
    } catch (err) {
      logDebug(`fetchRates error for ${currencyId}: ${err && err.message ? err.message : err}`);
      return new Map();
    }
  }, [logDebug]);

  // -----------------------------------------------------------
  // ensureCurrencyCached: load and memoize the full history for 'currencyId'
  // Returns an object { loaded: bool, map: Map }
  // -----------------------------------------------------------
  const ensureCurrencyCached = useCallback(async (currencyId) => {
    if (!currencyId) return { loaded: false, map: new Map() };
    if (cacheRef.current[currencyId]?.loaded) return cacheRef.current[currencyId];
    
    // mark placeholder to avoid duplicates
    cacheRef.current[currencyId] = { loaded: false, map: new Map() };
    const map = await fetchRates(currencyId);
    cacheRef.current[currencyId] = { loaded: true, map };
    logDebug(`Cached ${currencyId} rows=${map.size}`);
    return cacheRef.current[currencyId];
  }, [fetchRates, logDebug]);

  // -----------------------------------------------------------
  // buildFullTimeline: compute the earliest and latest recorded dates
  // across the two currencies and populate 'fullTimelineRef' with
  // daily UTC timestamps from min..max inclusive.
  // -----------------------------------------------------------
  const buildFullTimeline = useCallback(async (fId, tId) => {
    if (!fId || !tId) return;
    
    // Ensure both caches loaded
    const [fc, tc] = await Promise.all([ensureCurrencyCached(fId), ensureCurrencyCached(tId)]);
    const allDates = [];

    // Gather keys (dates) from both maps
    if (fc && fc.map) for (const v of fc.map.values()) if (v && v.date) allDates.push(v.date);
    if (tc && tc.map) for (const v of tc.map.values()) if (v && v.date) allDates.push(v.date);

    if (allDates.length === 0) {
      fullTimelineRef.current = [];
      fullMinRef.current = null;
      fullMaxRef.current = null;
      return;
    }

    allDates.sort((a, b) => a - b);
    const min = allDates[0];
    const max = allDates[allDates.length - 1];
    fullMinRef.current = new Date(min.getFullYear(), min.getMonth(), min.getDate());
    fullMaxRef.current = new Date(max.getFullYear(), max.getMonth(), max.getDate());

    // Build list of daily UTC timestamps (ms) from min..max inclusive
    const timeline = [];
    const cursor = new Date(fullMinRef.current);
    // use UTC normalized timestamps for chart (Date.UTC)
    while (cursor <= fullMaxRef.current) {
      timeline.push(Date.UTC(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    fullTimelineRef.current = timeline;
    logDebug(`Built full timeline from ${fullMinRef.current.toISOString().slice(0,10)} to ${fullMaxRef.current.toISOString().slice(0,10)} length=${timeline.length}`);
    return;
  }, [ensureCurrencyCached, logDebug]);

  
  // keyFromTimestampUTC: given a UTC timestamp used in the chart timeline
  const keyFromTimestampUTC = (ts) => {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

    // -----------------------------------------------------------
    // computeLatestRates: scan timeline from new to old and find the most recent for both buy and sell
    // Uses LOCF (last-observation-carried-forward) plus a synthetic EUR fallback when appropriate
    // -----------------------------------------------------------
    const computeLatestRates = useCallback(async (fId, tId) => {
      if (!fId || !tId) { setLatestRates(null); return; }
      try {
        // ensure cache + timeline
        await ensureCurrencyCached(fId);
        await ensureCurrencyCached(tId);
        if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
          await buildFullTimeline(fId, tId);
          if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
            setLatestRates(null);
            return;
          }
        }

        const mapFrom = cacheRef.current[fId]?.map || new Map();
        const mapTo = cacheRef.current[tId]?.map || new Map();

        const fromCur = currencies.find((c) => c.Id === fId);
        const toCur = currencies.find((c) => c.Id === tId);
        const isFromEUR = (fromCur?.CurrencyCode || '').toUpperCase() === 'EUR';
        const isToEUR = (toCur?.CurrencyCode || '').toUpperCase() === 'EUR';

        let lastA = null;
        let lastB = null;
        let found = null;

        const timeline = fullTimelineRef.current;
        // scan from newest to oldest
        for (let i = timeline.length - 1; i >= 0; i--) {
          const ts = timeline[i];
          const key = keyFromTimestampUTC(ts);

          if (mapTo.has(key)) lastA = mapTo.get(key);
          if (mapFrom.has(key)) lastB = mapFrom.get(key);

          const aa = lastA || (isToEUR ? { rate: 1, margin: 0, date: undefined } : null);
          const bb = lastB || (isFromEUR ? { rate: 1, margin: 0, date: undefined } : null);

          if (!aa || !bb) continue;

          const baseTo = aa.rate;
          const baseFrom = bb.rate;
          const marginTo = aa.margin || 0;
          const marginFrom = bb.margin || 0;

          // Calculate Buy rate
          const eurTo_sell = baseTo * (1 + (marginTo || 0) / 2);
          const eurFrom_buy = baseFrom * (1 - (marginFrom || 0) / 2);
          const buy = eurTo_sell / eurFrom_buy;

          // Calculate Sell rate
          const eurTo_buy = baseTo * (1 - (marginTo || 0) / 2);
          const eurFrom_sell = baseFrom * (1 + (marginFrom || 0) / 2);
          const sell = eurTo_buy / eurFrom_sell;

          found = { buy: Number(buy), sell: Number(sell), ts };
          break;
        }

        setLatestRates(found);
        if (found) logDebug(`Latest rates computed for pair ${fId}->${tId} date=${new Date(found.ts).toISOString().slice(0,10)}`);
      } catch (e) {
        logDebug('computeLatestRates failed: ' + (e && e.message ? e.message : e));
        setLatestRates(null);
    }
  }, [ensureCurrencyCached, buildFullTimeline, currencies, logDebug]);

  // -----------------------------------------------------------
  // buildSeriesFromCache: construct Buy/Sell series arrays aligned to 'fullTimelineRef'
  // Compute for each day pair rates and EUR synthetic rate when a currency is EUR
  // Inputs: fId, tId, optional 'rangeStart'/'rangeEnd' in epoch ms UTC
  // -----------------------------------------------------------
  const buildSeriesFromCache = useCallback(async (fId, tId, rangeStart = null, rangeEnd = null) => {
    if (!fId || !tId) return;
    if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
      // ensure timeline exists
      await buildFullTimeline(fId, tId);
      if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) return;
    }

    // Default range: past 1 year (but do not force axis)
    if (!rangeStart || !rangeEnd) {
      const end = new Date();
      const start = new Date(end);
      start.setFullYear(end.getFullYear() - 1);
      rangeStart = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
      rangeEnd = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
    }

    // Ensure caches present
    const fCached = await ensureCurrencyCached(fId);
    const tCached = await ensureCurrencyCached(tId);
    const mapFrom = fCached?.map || new Map();
    const mapTo = tCached?.map || new Map();

    const fromCur = currencies.find((c) => c.Id === fId);
    const toCur = currencies.find((c) => c.Id === tId);
    const isFromEUR = (fromCur?.CurrencyCode || '').toUpperCase() === 'EUR';
    const isToEUR = (toCur?.CurrencyCode || '').toUpperCase() === 'EUR';

    const buyPoints = [];
    const sellPoints = [];

    // ---------------------------------------------------------
    // Last Observation Carried Forward (LOCF) logic
    // Maintain the most recent actual recorded values so missing dates can be filled with the last known observation
    let lastA = null; // last known entry for 'to' currency
    let lastB = null; // last known entry for 'from' currency
    // ---------------------------------------------------------

    
    // Build for every timestamp in full timeline
    for (const ts of fullTimelineRef.current) {
      // If ts in requested range, compute, else null
      if (ts >= rangeStart && ts <= rangeEnd) {
        const key = keyFromTimestampUTC(ts);

        let a = mapTo.get(key);
        let b = mapFrom.get(key);

        // Apply LOCF: fall back to last recorded values when current date missing
        if (!a && lastA) { a = lastA; }
        if (!b && lastB) { b = lastB; }

        // Update LOCF only when the original map contained a value for this key
        // This prevents carrying forward synthetic substitutions
        if (mapTo.has(key)) { lastA = a; }
        if (mapFrom.has(key)) { lastB = b; }

        // Apply synthetic EUR fallback: if the currency is EUR, treat it as rate=1
        const aa = a || (isToEUR ? { rate: 1, margin: 0, date: undefined } : undefined);
        const bb = b || (isFromEUR ? { rate: 1, margin: 0, date: undefined } : undefined);

        // If pair cannot be computed after LOCF and EUR fallback, push null
        if (!aa || !bb) {
          buyPoints.push([ts, null]);
          sellPoints.push([ts, null]);
          continue;
        }

        const baseTo = aa.rate;
        const baseFrom = bb.rate;
        const marginTo = aa.margin || 0;
        const marginFrom = bb.margin || 0;

        // Compute pair Buy and Sell using provided margin conventions
        const eurTo_sell = baseTo * (1 + (marginTo || 0) / 2);
        const eurFrom_buy = baseFrom * (1 - (marginFrom || 0) / 2);
        const buy = eurTo_sell / eurFrom_buy;

        const eurTo_buy = baseTo * (1 - (marginTo || 0) / 2);
        const eurFrom_sell = baseFrom * (1 + (marginFrom || 0) / 2);
        const sell = eurTo_buy / eurFrom_sell;

        buyPoints.push([ts, Number(buy)]);
        sellPoints.push([ts, Number(sell)]);
      } else {
        // Outside requested range -> null to keep axis stable
        buyPoints.push([ts, null]);
        sellPoints.push([ts, null]);
      }
    }

    // Update chart series via setData to avoid axis changes
    const chart = chartRef.current?.chart;
    if (chart && chart.series && chart.series.length >= 2) {
      try {
        const buySeries = chart.series.find(s => s.name === 'Buy') || chart.series[0];
        const sellSeries = chart.series.find(s => s.name === 'Sell') || chart.series[1];
        // Replace whole series data (aligned to timeline)
        buySeries.setData(buyPoints, false, false, false);
        sellSeries.setData(sellPoints, false, false, false);
        chart.redraw();
      } catch (e) {
        logDebug('setData error: ' + (e && e.message ? e.message : e));
      }
    } else {
      logDebug('Chart not ready for setData');
    }
}, [buildFullTimeline, currencies, ensureCurrencyCached, logDebug]);



  // -----------------------------------------------------------
  // Debounced loader for afterSetExtremes (when user zooms/pans)
  // We'll use local cache to compute values for the visible range, and setData with nulls outside to keep axis stable
  // -----------------------------------------------------------
  const loadRangeData = useCallback(async (min, max) => {
    // min/max are epoch ms UTC
    if (!fromId || !toId) return;
    setLoading(true);
    try {
      await buildSeriesFromCache(fromId, toId, min, max);
      logDebug(`Loaded range ${new Date(min).toISOString().slice(0,10)} -> ${new Date(max).toISOString().slice(0,10)}`);
    } catch (e) {
      logDebug('loadRangeData failed: ' + (e && e.message ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [fromId, toId, buildSeriesFromCache, logDebug]);

  const debouncedLoadRange = useDebounceCallback(loadRangeData, 450);

  const afterSetExtremes = useCallback((e) => {
    if (!e || !e.min || !e.max) return;
    debouncedLoadRange(e.min, e.max);
  }, [debouncedLoadRange]);

  
  // -----------------------------------------------------------
  // Highstock options - memoized, includes load event to mark chart ready
  // -----------------------------------------------------------
  const chartOptions = useMemo(() => {
    return {
      chart: {
        backgroundColor: '#0b0f18',
        style: { fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial' },
        events: {
          load() {
            try {
              setChartReady(true);
            } catch (e) {
              // ignore
            }
          }
        }
      },
      title: { text: 'Exchange Rate Dynamics', style: { color: '#d8dee9' } },
      rangeSelector: {
        selected: 1, // default '1y'
        inputEnabled: false,
        buttons: [
          { type: 'month', count: 1, text: '1m' },
          { type: 'year', count: 1, text: '1y' },
          { type: 'year', count: 5, text: '5y' },
          { type: 'all', text: 'All' }
        ],
        buttonTheme: {
          fill: '#0b0f18',
          style: { color: '#cbd5e1' },
          states: { hover: { fill: '#121826' }, select: { fill: '#1f2937' } }
        }
      },
      navigator: { enabled: true, adaptToUpdatedData: true },
      scrollbar: { enabled: true },
      tooltip: {
        split: false,
        shared: true,
        valueDecimals: 6,
        backgroundColor: 'rgba(8,10,14,0.9)',
        style: { color: '#e6eef8' }
      },
      xAxis: {
        labels: { style: { color: '#cbd5e1' } },
        ordinal: false // Keep exact daily ticks
      },
      yAxis: {
        opposite: false,
        labels: { style: { color: '#cbd5e1' } }
      },
      legend: { enabled: true, itemStyle: { color: '#cbd5e1' } },
      plotOptions: {
        series: {
          turboThreshold: 0,
          marker: { enabled: false }
        }
      },
      series: [
        { name: 'Buy', data: [], tooltip: { valueDecimals: 6 }, color: '#28c76f' },
        { name: 'Sell', data: [], tooltip: { valueDecimals: 6 }, color: '#ff6b6b' }
      ],
      credits: { enabled: false },
      time: { useUTC: true }
    };
  }, []);

  // Apply a simple dark theme to Highcharts globally once
  useEffect(() => {
    Highcharts.setOptions({
      colors: ['#28c76f', '#ff6b6b', '#6c8cff', '#f6c85f'],
      chart: { backgroundColor: '#0b0f18', style: { color: '#cbd5e1' } },
      title: { style: { color: '#e6eef8' } },
      subtitle: { style: { color: '#e6eef8' } },
      xAxis: { gridLineColor: '#1f2937', labels: { style: { color: '#cbd5e1' } } },
      yAxis: { gridLineColor: '#1f2937', labels: { style: { color: '#cbd5e1' } } },
      legend: { itemStyle: { color: '#cbd5e1' } }
    });
  }, []);

  // -----------------------------------------------------------
  // Attach afterSetExtremes to xAxis after chart is created
  // -----------------------------------------------------------
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (!chart) return;
    try {
      const xAxis = chart.xAxis && chart.xAxis[0];
      if (xAxis) {
        xAxis.update({
          events: {
            afterSetExtremes: function (e) {
              afterSetExtremes(e);
            }
          }
        }, false);
      }
    } catch (e) {
      console.warn('Failed to attach afterSetExtremes', e);
    }
  }, [afterSetExtremes, chartReady]);

  // -----------------------------------------------------------
  // On pair change: ensure caches + timeline; but DON'T force axis resets
  // We will populate data for default 1y window (initial only if chart is ready)
  // -----------------------------------------------------------
  useEffect(() => {
    if (!fromId || !toId) return;
    (async () => {
      setLoading(true);
      try {
        await ensureCurrencyCached(fromId);
        await ensureCurrencyCached(toId);
        await buildFullTimeline(fromId, toId);

        // If chart is ready, populate initial 1y view
        if (chartReady) {
          // Compute default 1y window
          const end = new Date();
          const start = new Date(end);
          start.setFullYear(end.getFullYear() - 1);
          const rangeStartUTC = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
          const rangeEndUTC = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());

          await buildSeriesFromCache(fromId, toId, rangeStartUTC, rangeEndUTC);

          const chart = chartRef.current?.chart;
          if (chart && chart.xAxis && chart.xAxis[0] && chart.rangeSelector) {
            chart.xAxis[0].setExtremes(null, null, false);
            chart.rangeSelector.clickButton(1);
            logDebug('Forced chart range reset to 1y after pair change.');
          }
        }
      } catch (e) {
        logDebug('pair change error: ' + (e && e.message ? e.message : e));
      } finally {
        setLoading(false);
      }
    });
  }, [fromId, toId, buildFullTimeline, ensureCurrencyCached, buildSeriesFromCache, chartReady, logDebug]);

  useEffect(() => {
    if (!chartReady) return;
    if (!fromId || !toId) return;

    (async () => {
      // Ensure timeline exists
      if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
        await buildFullTimeline(fromId, toId);
      }
      if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) return; // If still empty, abort

      // Compute default 1y window
      const end = new Date();
      const start = new Date(end);
      start.setFullYear(end.getFullYear() - 1);
      await buildSeriesFromCache(fromId, toId, Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()), Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()));
      initialPopulatedRef.current = true;
    })();
  }, [chartReady, fromId, toId, buildFullTimeline, buildSeriesFromCache]);


  // Recompute latest rates when pair/caches/timeline update
  useEffect(() => {
    if (!fromId || !toId) { setLatestRates(null); return; }

    const tryChartThenCompute = async () => {
      // Prefer reading last computed values from the chart series if available
      const chart = chartRef.current?.chart;
      if (chart && chart.series && chart.series.length >= 2) {
        try {
          const buySeries = chart.series.find(s => s.name === 'Buy') || chart.series[0];
          const sellSeries = chart.series.find(s => s.name === 'Sell') || chart.series[1];

          // Find last non-null point (largest x) in each series
          const lastPoint = (series) => {
            if (!series || !series.data || series.data.length === 0) return null;
            for (let i = series.data.length - 1; i >= 0; i--) {
              const p = series.data[i];
              if (p && p.y != null && !Number.isNaN(p.y)) return p;
            }
            return null;
          };

          const pb = lastPoint(buySeries);
          const ps = lastPoint(sellSeries);

          // Prefer when both series have a point with same x (same date)
          if (pb && ps && pb.x === ps.x) {
            setLatestRates({ buy: Number(pb.y), sell: Number(ps.y), ts: pb.x });
            return;
          }

          // Otherwise fall back to best-available: prefer latest common timestamp, else pb.ts or ps.ts
          if (pb && ps) {
            const ts = Math.max(pb.x, ps.x);
            const buyVal = pb.x === ts ? Number(pb.y) : null;
            const sellVal = ps.x === ts ? Number(ps.y) : null;
            setLatestRates({ buy: buyVal, sell: sellVal, ts });
            return;
          }

          if (pb) { setLatestRates({ buy: Number(pb.y), sell: null, ts: pb.x }); return; }
          if (ps) { setLatestRates({ buy: null, sell: Number(ps.y), ts: ps.x }); return; }
        } catch (e) {
          logDebug('Reading latest from chart failed: ' + (e && e.message ? e.message : e));
        }
      }

      
      await computeLatestRates(fromId, toId); // Fallback: compute from cache/timeline
    };

    tryChartThenCompute();
  }, [fromId, toId, computeLatestRates]);


  
  // Update series visibility based on mode
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (!chart || !chart.series) return;
    try {
      if (mode === 'buy') {
        chart.series.forEach(s => s.name === 'Buy' ? s.show() : s.hide());
      } else if (mode === 'sell') {
        chart.series.forEach(s => s.name === 'Sell' ? s.show() : s.hide());
      } else { // mix
        chart.series.forEach(s => s.show());
      }
    } catch (e) {
      console.warn('Failed to update series visibility', e);
    }
  }, [mode]);

  return (
    <div className="home-container">
      <Header />

      <main className="main-card wide">
        <section className="controls">
          <div className="headline controls-head">{ (currencies.find(c => c.Id === fromId)?.CurrencyCode || '—') + ' → ' + (currencies.find(c => c.Id === toId)?.CurrencyCode || '—') }</div>
          <div className="select-row">
            <label>
              From
              <select value={fromId || ''} onChange={(e) => setFromId(Number(e.target.value))}>
                {currencies.map((c) => (<option key={c.Id} value={c.Id}>{c.CurrencyCode}</option>))}
              </select>
            </label>

            <label>
              To
              <select value={toId || ''} onChange={(e) => setToId(Number(e.target.value))}>
                {currencies.map((c) => (<option key={c.Id + '-to'} value={c.Id}>{c.CurrencyCode}</option>))}
              </select>
            </label>

            <div className="mode-control">
              <label className={`mode-btn ${mode === 'buy' ? 'active' : ''}`} onClick={() => setMode('buy')}>Buy</label>
              <label className={`mode-btn ${mode === 'sell' ? 'active' : ''}`} onClick={() => setMode('sell')}>Sell</label>
              <label className={`mode-btn ${mode === 'mix' ? 'active' : ''}`} onClick={() => setMode('mix')}>Mix</label>
            </div>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-header">
            <h3>Exchange Rate Dynamics</h3>
            <div className="chart-sub">Daily data · hover for details</div>
          </div>

          <div className="chart-area" style={{ minHeight: 420, position: 'relative' }}>
            <HighchartsReact
              highcharts={Highcharts}
              constructorType={'stockChart'}
              options={chartOptions}
              ref={chartRef}
            />
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,15,24,0.72)', color: '#e6eef8', zIndex: 10 }}>
                Loading...
              </div>
            )}
          </div>

          {/* Latest buy/sell currency point */}
          <div className="latest-currency-points">
            <div className="currency-point-card">
              <div className="label">Buy</div>
              <div className="value">{latestRates ? (Number.isFinite(latestRates.buy) ? latestRates.buy.toFixed(6) : '—') : '—'}</div>
              <div className="date">{latestRates ? new Date(latestRates.ts).toLocaleDateString() : ''}</div>
            </div>

            <div className="currency-point-card">
              <div className="label">Sell</div>
              <div className="value">{latestRates ? (Number.isFinite(latestRates.sell) ? latestRates.sell.toFixed(6) : '—') : '—'}</div>
              <div className="date">{latestRates ? new Date(latestRates.ts).toLocaleDateString() : ''}</div>
            </div>

            {/* <div className="currency-point-note">{latestRates ? `Last data: ${new Date(latestRates.ts).toLocaleString()}` : 'No recent data available'}</div> */}
          </div>
          

          {/* <div className="chart-legend">
            <div>Pair: <strong>{ (currencies.find(c => c.Id === fromId)?.CurrencyCode || '—') + ' → ' + (currencies.find(c => c.Id === toId)?.CurrencyCode || '—') }</strong></div>
            <div className="mini-stats">See points in the navigator & use range selector</div>
          </div> */}
          {error && <div className="error">{error}</div>}
        </section>
        <RateConverter currencies={currencies} /> 
      </main>
    </div>
  );
}
