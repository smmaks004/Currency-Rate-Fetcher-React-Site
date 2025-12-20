import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';

import 'highcharts/highcharts-more'; 

import RateConverter from './Converter';
import './Home.css';
import Header from './Header';
import { useAuth } from './AuthContext';
import { useTranslation } from 'react-i18next';
import { calculatePairRates } from '../utils/currencyCalculations';
import { useRates } from '../contexts/RatesContext';

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
  const [mode, setMode] = useState('mix'); // display mode: 'buy' | 'sell' | 'mix' | 'origin'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(''); 
  const [debugLogs, setDebugLogs] = useState([]); 

  const chartRef = useRef(null);
  const fullTimelineRef = useRef([]);
  const fullMinRef = useRef(null);
  const fullMaxRef = useRef(null);
  const initialPopulatedRef = useRef(false); // prevents forcing the initial range multiple times

  const [chartReady, setChartReady] = useState(false);
  const [latestRates, setLatestRates] = useState(null);
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const { ensureRates } = useRates();
  const chartInstanceKey = useMemo(() => `chart-${i18n.language}`, [i18n.language]);
  
  
  const logDebug = useCallback((msg) => {
    const line = `${new Date().toISOString()} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    setDebugLogs((s) => [...s.slice(-200), line]);
    console.debug(line);
  }, []);

  const handleModeChange = useCallback((nextMode) => {
    if (nextMode === 'origin' && !user) {
      setError(t('home.originAuthRequired'));
      return;
    }
    setError('');
    setMode(nextMode);
  }, [t, user]);

  // If the user signs out while "origin" is selected, revert to mix
  useEffect(() => {
    if (!user && mode === 'origin') {
      setMode('mix');
    }
  }, [user, mode]);

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
        const res = await fetch('/api/currencies');
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
          setError(t('home.errorLoadCurrencies'));
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [logDebug, t]);

  // cache & loading handled by RatesContext (ensureRates/getMap)

  // -----------------------------------------------------------
  // buildFullTimeline: compute the earliest and latest recorded dates
  // across the two currencies and populate 'fullTimelineRef' with
  // daily UTC timestamps from min..max inclusive.
  // -----------------------------------------------------------
  const buildFullTimeline = useCallback(async (fId, tId) => {
    if (!fId || !tId) return;
    
    // Ensure both caches loaded (RatesContext)
    const [fc, tc] = await Promise.all([ensureRates(fId), ensureRates(tId)]);
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
  }, [ensureRates, logDebug]);

  
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
        // ensure cache + timeline using RatesContext
        const fCachedInit = await ensureRates(fId);
        const tCachedInit = await ensureRates(tId);
        if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
          await buildFullTimeline(fId, tId);
          if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
            setLatestRates(null);
            return;
          }
        }

        const mapFrom = (fCachedInit && fCachedInit.map) || new Map();
        const mapTo = (tCachedInit && tCachedInit.map) || new Map();

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

          // Calculate rates using utility function
          const rates = calculatePairRates(baseTo, baseFrom, marginTo, marginFrom);

          found = { buy: rates.buy, sell: rates.sell, origin: rates.origin, ts, originTs: ts };
          break;
        }

        setLatestRates(found);
        if (found) logDebug(`Latest rates computed for pair ${fId}->${tId} date=${new Date(found.ts).toISOString().slice(0,10)}`);
      } catch (e) {
        logDebug('computeLatestRates failed: ' + (e && e.message ? e.message : e));
        setLatestRates(null);
    }
  }, [ensureRates, buildFullTimeline, currencies, logDebug]);

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

    // Ensure caches present (RatesContext)
    const fCached = await ensureRates(fId);
    const tCached = await ensureRates(tId);
    const mapFrom = fCached?.map || new Map();
    const mapTo = tCached?.map || new Map();

    const fromCur = currencies.find((c) => c.Id === fId);
    const toCur = currencies.find((c) => c.Id === tId);
    const isFromEUR = (fromCur?.CurrencyCode || '').toUpperCase() === 'EUR';
    const isToEUR = (toCur?.CurrencyCode || '').toUpperCase() === 'EUR';

    const buyPoints = [];
    const sellPoints = [];
    const originPoints = [];

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
          originPoints.push([ts, null]);
          continue;
        }

        const baseTo = aa.rate;
        const baseFrom = bb.rate;
        const marginTo = aa.margin || 0;
        const marginFrom = bb.margin || 0;

        // Compute pair Buy and Sell using utility function
        const rates = calculatePairRates(baseTo, baseFrom, marginTo, marginFrom);

        buyPoints.push([ts, rates.buy]);
        sellPoints.push([ts, rates.sell]);
        originPoints.push([ts, rates.origin]);
      } else {
        // Outside requested range -> null to keep axis stable
        buyPoints.push([ts, null]);
        sellPoints.push([ts, null]);
        originPoints.push([ts, null]);
      }
    }

    // Update chart series via setData to avoid axis changes
    const chart = chartRef.current?.chart;
    if (chart && chart.series && chart.series.length >= 2) {
      try {
        // Prefer IDs to avoid localization/name mismatches
        const buySeries = chart.get('buy-series') || chart.series[0];
        const sellSeries = chart.get('sell-series') || chart.series[1];
        const originSeries = chart.get('origin-series');
        // Replace whole series data (aligned to timeline) with a light animation for smoother transitions
        const anim = { duration: 500 };
        buySeries.setData(buyPoints, false, anim, false);
        sellSeries.setData(sellPoints, false, anim, false);
        if (originSeries) originSeries.setData(originPoints, false, anim, false);
        chart.redraw();
      } catch (e) {
        logDebug('setData error: ' + (e && e.message ? e.message : e));
      }
    } else {
      logDebug('Chart not ready for setData');
    }
}, [buildFullTimeline, currencies, ensureRates, logDebug]);



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
        style: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
        // Add a bit more left padding so Y-axis labels never overlap the plot
        spacingLeft: 10,
        animation: { duration: 500 },
        events: {
          load() {
            try { setChartReady(true); } catch (e) {}
          }
        }
      },
      title: { text: t('home.title'), style: { color: '#e2e8f0', fontSize: '16px' }, align: 'left' },
      rangeSelector: {
        selected: 4, // Default to the "All" button
        inputEnabled: false,
        buttonTheme: {
          fill: 'rgba(255,255,255,0.05)',
          stroke: 'none',
          'stroke-width': 0,
          r: 8,
          style: { color: '#cbd5e1', fontWeight: '500' },
          states: {
            hover: { fill: '#1e293b', style: { color: '#fff' } },
            select: { fill: '#3b82f6', style: { color: '#fff' } } // Highlighted button when selected
          }
        },
        buttons: [
          { type: 'month', count: 1, text: '1M' },
          { type: 'year', count: 1, text: '1Y' },
          { type: 'year', count: 5, text: '5Y' },
          { type: 'all', text: t('home.rangeAll') }
        ]
      },

      navigator: {
        enabled: true,
        height: 30,
        maskFill: 'rgba(59, 130, 246, 0.2)', // Blue selection mask
        series: { color: '#3b82f6', lineWidth: 1, fillOpacity: 0.1 },
        xAxis: { labels: { style: { color: '#94a3b8' } } }
      },

      scrollbar: { enabled: false }, // Hide scrollbar; navigator is enough

      tooltip: {
        shared: true,
        split: false,
        borderRadius: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderWidth: 0,
        shadow: true,
        style: { color: '#f8fafc' },
        headerFormat: '<span style="font-size: 12px; color: #94a3b8">{point.key}</span><br/>',
        pointFormat: `<span style="color:{point.color}">●</span> ${t('home.rate')}: <b>{point.y}</b><br/>`,
        valueDecimals: 4 
      },

      xAxis: {
        gridLineWidth: 0,
        lineWidth: 0,
        tickWidth: 0,
        labels: { style: { color: '#64748b' }, y: 20 }, // Push date labels slightly down
        ordinal: false,
        events: { afterSetExtremes: (e) => afterSetExtremes(e) }
      },

      yAxis: {
        opposite: false, // Axis on the left
        gridLineColor: '#1e293b',
        gridLineDashStyle: 'Dash', // Dashed grid lines
        labels: { style: { color: '#64748b' }, x: -10 },

        // Key for spacing/scale
        startOnTick: false, 
        endOnTick: false,
        maxPadding: 0.02, // Minimal top padding
        minPadding: 0.02, // Minimal bottom padding
      },

      plotOptions: {
        series: {
          // Key for smoothing on large zooms
          dataGrouping: {
            enabled: true,
            forced: true, // Force grouping at deep zoom levels
            approximation: 'average', // Average values when grouped
            groupPixelWidth: 15 // Higher number -> smoother chart
          },
          animation: { duration: 600 },
          marker: { enabled: false, states: { hover: { enabled: true } } }
        }
      },

      series: [
        { 
          name: t('home.seriesBuy'), 
          id: 'buy-series', 
          type: 'areaspline',
          data: [], 
          color: '#28c76f',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(34, 197, 94, 0.4)'], [1, 'rgba(34, 197, 94, 0.02)']]
          },
          lineWidth: 2,
          threshold: null
        },
        { 
          name: t('home.seriesSell'), 
          id: 'sell-series',
          type: 'areaspline',
          data: [], 
          color: '#ff6b6b', 
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(239, 68, 68, 0.4)'], [1, 'rgba(239, 68, 68, 0.02)']]
          },
          lineWidth: 2,
          threshold: null
        },

        // SPREAD (MIX MODE)
        {
          name: t('home.seriesSpread'),
          id: 'spread-series',
          type: 'arearange', 
          data: [],
          // Keep spread lines thin but make the fill obvious
          color: '#3b82f6', 
          lineWidth: 1,
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [
              [0, 'rgba(59, 130, 246, 0.5)'], 
              [1, 'rgba(59, 130, 246, 0.1)']
            ]
          },
          
          // Enable grouping for spread as well
          dataGrouping: { enabled: true, approximation: 'averages' },
          visible: false,
          tooltip: {
            pointFormat: `<span style="color:#3b82f6">●</span> ${t('home.rate')}: <b>{point.low} - {point.high}</b><br/>`
          }
        },
        {
          name: t('home.seriesOrigin'),
          id: 'origin-series',
          type: 'areaspline',
          data: [],
          color: '#0ea5e9',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(14, 165, 233, 0.35)'], [1, 'rgba(14, 165, 233, 0.04)']]
          },
          lineWidth: 2,
          visible: false,
          threshold: null,
          tooltip: {
            pointFormat: `<span style="color:#0ea5e9">●</span> ${t('home.rate')}: <b>{point.y}</b><br/>`
          }
        }
      ],
      credits: { enabled: false },
      time: { useUTC: true }
    };
  }, [t]);

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

  // Reflow/redraw on locale change to keep plot aligned after label width changes
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (chart) {
      setTimeout(() => {
        if (chart && chart.reflow) chart.reflow();
        if (chart && chart.redraw) chart.redraw();
      }, 0);
    }
  }, [i18n.language]);

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
        await ensureRates(fromId);
        await ensureRates(toId);
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
  }, [fromId, toId, buildFullTimeline, ensureRates, buildSeriesFromCache, chartReady, logDebug]);

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

  
  // When the pair changes, immediately reload the current visible range so the chart updates without requiring a manual range change
  useEffect(() => {
    if (!chartReady || !fromId || !toId) return;

    const chart = chartRef.current?.chart;
    const xAxis = chart?.xAxis && chart.xAxis[0];
    const min = xAxis?.min;
    const max = xAxis?.max;

    (async () => {
      if (Number.isFinite(min) && Number.isFinite(max)) {
        await loadRangeData(min, max);
      } else {
        const end = new Date();
        const start = new Date(end);
        start.setFullYear(end.getFullYear() - 1);
        await loadRangeData(
          Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()),
          Date.UTC(end.getFullYear(), end.getMonth(), end.getDate())
        );
      }
    })();
  }, [fromId, toId, chartReady, loadRangeData]);


  // Recompute latest rates when pair/caches/timeline update
  useEffect(() => {
    if (!fromId || !toId) { setLatestRates(null); return; }

    const tryChartThenCompute = async () => {
      // Prefer reading last computed values from the chart series if available
      const chart = chartRef.current?.chart;
      if (chart && chart.series && chart.series.length >= 2) {
        try {
          const buySeries = chart.get('buy-series') || chart.series[0];
          const sellSeries = chart.get('sell-series') || chart.series[1];
          const originSeries = chart.get('origin-series');

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
          const po = lastPoint(originSeries);

          // Prefer aligned latest when buy/sell share same timestamp
          if (pb && ps && pb.x === ps.x) {
            setLatestRates({ buy: Number(pb.y), sell: Number(ps.y), origin: po ? Number(po.y) : null, ts: pb.x, originTs: po ? po.x : null });
            return;
          }

          // Otherwise pick the freshest timestamp among available series
          const candidates = [pb?.x, ps?.x, po?.x].filter((v) => Number.isFinite(v));
          if (candidates.length) {
            const ts = Math.max(...candidates);
            const buyVal = pb && pb.x === ts ? Number(pb.y) : null;
            const sellVal = ps && ps.x === ts ? Number(ps.y) : null;
            const originVal = po && po.x === ts ? Number(po.y) : (po ? Number(po.y) : null);
            const originTs = po ? po.x : null;
            setLatestRates({ buy: buyVal, sell: sellVal, origin: originVal, ts, originTs });
            return;
          }

          if (pb) { setLatestRates({ buy: Number(pb.y), sell: null, origin: po ? Number(po.y) : null, ts: pb.x, originTs: po ? po.x : null }); return; }
          if (ps) { setLatestRates({ buy: null, sell: Number(ps.y), origin: po ? Number(po.y) : null, ts: ps.x, originTs: po ? po.x : null }); return; }
          if (po) { setLatestRates({ buy: null, sell: null, origin: Number(po.y), ts: po.x, originTs: po.x }); return; }
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
      const buySeries = chart.get('buy-series');
      const sellSeries = chart.get('sell-series');
      const spreadSeries = chart.get('spread-series');
      const originSeries = chart.get('origin-series');

      if (mode === 'buy') {
        buySeries?.setVisible(true, false);
        sellSeries?.setVisible(false, false);
        spreadSeries?.setVisible(false, false);
        originSeries?.setVisible(false, false);
      } else if (mode === 'sell') {
        buySeries?.setVisible(false, false);
        sellSeries?.setVisible(true, false);
        spreadSeries?.setVisible(false, false);
        originSeries?.setVisible(false, false);
      } else if (mode === 'origin') {
        buySeries?.setVisible(false, false);
        sellSeries?.setVisible(false, false);
        spreadSeries?.setVisible(false, false);
        originSeries?.setVisible(true, false);
      } else { // mix
        buySeries?.setVisible(true, false);
        sellSeries?.setVisible(true, false);
        spreadSeries?.setVisible(true, false);
        originSeries?.setVisible(false, false);
      }

      // Keep navigator in sync with the currently visible primary series so the mini-chart does not disappear
      const baseSeriesId = mode === 'sell' ? 'sell-series' : (mode === 'origin' ? 'origin-series' : 'buy-series');
      if (chart.navigator) {
        chart.update({ navigator: { baseSeries: baseSeriesId } }, false);
      }

      chart.redraw();
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
              {t('home.from')}
              <select value={fromId || ''} onChange={(e) => setFromId(Number(e.target.value))}>
                {currencies.map((c) => (<option key={c.Id} value={c.Id}>{c.CurrencyCode}</option>))}
              </select>
            </label>

            <label>
              {t('home.to')}
              <select value={toId || ''} onChange={(e) => setToId(Number(e.target.value))}>
                {currencies.map((c) => (<option key={c.Id + '-to'} value={c.Id}>{c.CurrencyCode}</option>))}
              </select>
            </label>

            <div className="mode-control">
              <button type="button" className={`mode-btn ${mode === 'buy' ? 'active' : ''}`} onClick={() => handleModeChange('buy')}>{t('home.modeBuy')}</button>
              <button type="button" className={`mode-btn ${mode === 'sell' ? 'active' : ''}`} onClick={() => handleModeChange('sell')}>{t('home.modeSell')}</button>
              <button type="button" className={`mode-btn ${mode === 'mix' ? 'active' : ''}`} onClick={() => handleModeChange('mix')}>{t('home.modeMix')}</button>
              {user && (
                <button
                  type="button"
                  className={`mode-btn ${mode === 'origin' ? 'active' : ''}`}
                  onClick={() => handleModeChange('origin')}
                  title={!user ? t('home.originAuthRequired') : ''}
                >
                  {t('home.modeOrigin')}
                </button>
              )}
            </div>
          </div>
        </section>

        <section className="chart-card">
          <div className="chart-header">
            <h3>{t('home.title')}</h3>
            <div className="chart-sub">{t('home.subtitle')}</div>
          </div>

          <div className="chart-area" style={{ minHeight: 420, position: 'relative' }}>
            <HighchartsReact
              highcharts={Highcharts}
              constructorType={'stockChart'}
              key={chartInstanceKey}
              options={chartOptions}
              ref={chartRef}
            />
            {loading && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,15,24,0.72)', color: '#e6eef8', zIndex: 10 }}>
                {t('home.loading')}
              </div>
            )}
          </div>

          {/* Latest buy/sell currency point */}
          <div className="latest-currency-points">
            <div className="currency-point-card">
              <div className="label">{t('home.latestBuy')}</div>
              <div className="value">{latestRates ? (Number.isFinite(latestRates.buy) ? latestRates.buy.toFixed(6) : '—') : '—'}</div>
              <div className="date">{latestRates ? new Date(latestRates.ts).toLocaleDateString() : ''}</div>
            </div>

            <div className="currency-point-card">
              <div className="label">{t('home.latestSell')}</div>
              <div className="value">{latestRates ? (Number.isFinite(latestRates.sell) ? latestRates.sell.toFixed(6) : '—') : '—'}</div>
              <div className="date">{latestRates ? new Date(latestRates.ts).toLocaleDateString() : ''}</div>
            </div>

            {user && (
              <div className="currency-point-card">
                <div className="label">{t('home.latestOrigin')}</div>
                <div className="value">{latestRates ? (Number.isFinite(latestRates.origin) ? latestRates.origin.toFixed(6) : '—') : '—'}</div>
                <div className="date">{latestRates ? (latestRates.originTs ? new Date(latestRates.originTs).toLocaleDateString() : (latestRates.ts ? new Date(latestRates.ts).toLocaleDateString() : '')) : ''}</div>
              </div>
            )}

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
