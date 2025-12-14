import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';
import 'highcharts/highcharts-more';
import { useTranslation } from 'react-i18next';
import './MarginChart.css';

// Parse an input value into a valid Date object or return null
const parseDate = (d) => {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt;
};

// Debounced callback hook
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

export default function MarginChart() {
  const [margins, setMargins] = useState([]); // Raw margin data from API
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [chartReady, setChartReady] = useState(false);
  const [latestMargin, setLatestMargin] = useState(null);

  const chartRef = useRef(null);
  const fullTimelineRef = useRef([]);
  const fullMinRef = useRef(null);
  const fullMaxRef = useRef(null);

  const { t, i18n } = useTranslation();
  const chartInstanceKey = useMemo(() => `margin-chart-${i18n.language}`, [i18n.language]);

  const logDebug = useCallback((msg) => {
    const line = `${new Date().toISOString()} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
    console.debug(line);
  }, []);

  // -----------------------------------------------------------
  // Load margin history from backend
  // -----------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    const maxRetries = 10;
    const retryDelay = 2000;

    const load = async (attempt = 1) => {
      try {
        const res = await fetch('/api/margins/history', { credentials: 'include' });
        if (!res.ok) throw new Error('margins history fetch failed');
        const data = await res.json();
        if (cancelled) return;
        if (Array.isArray(data)) {
          setMargins(data);
          setError('');
          return;
        }
        throw new Error('no margins in response');
      } catch (err) {
        logDebug(`Margins history fetch attempt ${attempt} failed: ${err && err.message ? err.message : err}`);
        if (cancelled) return;
        if (attempt < maxRetries) {
          setTimeout(() => load(attempt + 1), retryDelay);
        } else {
          setError(t('marginChart.errorLoad', { defaultValue: 'Failed to load margin history' }));
        }
      }
    };

    load();
    return () => { cancelled = true; };
  }, [logDebug, t]);

  // -----------------------------------------------------------
  // buildFullTimeline: compute the earliest and latest dates
  // across all margin records and populate timeline with daily timestamps
  // -----------------------------------------------------------
  const buildFullTimeline = useCallback(() => {
    if (!margins || margins.length === 0) {
      fullTimelineRef.current = [];
      fullMinRef.current = null;
      fullMaxRef.current = null;
      return;
    }

    const allDates = [];
    for (const m of margins) {
      const startDt = parseDate(m.StartDate);
      if (startDt) allDates.push(startDt);
      
      if (m.EndDate) {
        const endDt = parseDate(m.EndDate);
        if (endDt) allDates.push(endDt);
      }
    }

    // If no end date for last margin, use today
    const today = new Date();
    allDates.push(today);

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

    // Build list of daily UTC timestamps from min..max inclusive
    const timeline = [];
    const cursor = new Date(fullMinRef.current);
    while (cursor <= fullMaxRef.current) {
      timeline.push(Date.UTC(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
      cursor.setDate(cursor.getDate() + 1);
    }
    fullTimelineRef.current = timeline;
    logDebug(`Built margin timeline from ${fullMinRef.current.toISOString().slice(0,10)} to ${fullMaxRef.current.toISOString().slice(0,10)} length=${timeline.length}`);
  }, [margins, logDebug]);

  // -----------------------------------------------------------
  // keyFromTimestampUTC: convert UTC timestamp to YYYY-MM-DD key
  // -----------------------------------------------------------
  const keyFromTimestampUTC = (ts) => {
    const d = new Date(ts);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  // -----------------------------------------------------------
  // computeLatestMargin: find the most recent active margin
  // -----------------------------------------------------------
  const computeLatestMargin = useCallback(() => {
    if (!margins || margins.length === 0) {
      setLatestMargin(null);
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    
    // Find margin that covers today
    for (const m of margins) {
      const startDate = m.StartDate;
      const endDate = m.EndDate || '9999-12-31';
      
      if (startDate <= today && endDate >= today) {
        const marginPct = Number(m.MarginValue) * 100;
        setLatestMargin({
          value: marginPct,
          startDate: m.StartDate,
          endDate: m.EndDate,
          ts: Date.UTC(...today.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)))
        });
        return;
      }
    }

    // If no active margin, show the latest one
    const sorted = [...margins].sort((a, b) => b.StartDate.localeCompare(a.StartDate));
    if (sorted.length > 0) {
      const m = sorted[0];
      const marginPct = Number(m.MarginValue) * 100;
      setLatestMargin({
        value: marginPct,
        startDate: m.StartDate,
        endDate: m.EndDate,
        ts: Date.UTC(...m.StartDate.split('-').map((v, i) => i === 1 ? Number(v) - 1 : Number(v)))
      });
    } else {
      setLatestMargin(null);
    }
  }, [margins]);

  // -----------------------------------------------------------
  // buildSeriesFromMargins: construct margin series data for the chart
  // Uses step interpolation to show margin changes over time
  // -----------------------------------------------------------
  const buildSeriesFromMargins = useCallback((rangeStart = null, rangeEnd = null) => {
    if (!margins || margins.length === 0) return;
    if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) {
      buildFullTimeline();
      if (!fullTimelineRef.current || fullTimelineRef.current.length === 0) return;
    }

    // Default range: all time
    if (!rangeStart || !rangeEnd) {
      rangeStart = fullMinRef.current ? Date.UTC(fullMinRef.current.getFullYear(), fullMinRef.current.getMonth(), fullMinRef.current.getDate()) : null;
      rangeEnd = fullMaxRef.current ? Date.UTC(fullMaxRef.current.getFullYear(), fullMaxRef.current.getMonth(), fullMaxRef.current.getDate()) : null;
    }

    if (!rangeStart || !rangeEnd) return;

    const marginPoints = [];

    // Create a sorted copy of margins
    const sortedMargins = [...margins].sort((a, b) => a.StartDate.localeCompare(b.StartDate));

    // For each timestamp in timeline
    for (const ts of fullTimelineRef.current) {
      if (ts >= rangeStart && ts <= rangeEnd) {
        const key = keyFromTimestampUTC(ts);

        // Find which margin covers this date
        let currentMargin = null;
        for (const m of sortedMargins) {
          const startDate = m.StartDate;
          const endDate = m.EndDate || '9999-12-31';
          
          if (startDate <= key && endDate >= key) {
            currentMargin = m;
            break;
          }
        }

        if (currentMargin) {
          const marginPct = Number(currentMargin.MarginValue) * 100; // Convert to percentage
          marginPoints.push([ts, marginPct]);
        } else {
          marginPoints.push([ts, null]);
        }
      } else {
        marginPoints.push([ts, null]);
      }
    }

    // Update chart series
    const chart = chartRef.current?.chart;
    if (chart && chart.series && chart.series.length >= 1) {
      try {
        const marginSeries = chart.get('margin-series') || chart.series[0];
        const anim = { duration: 500 };
        marginSeries.setData(marginPoints, false, anim, false);
        chart.redraw();
      } catch (e) {
        logDebug('setData error: ' + (e && e.message ? e.message : e));
      }
    } else {
      logDebug('Chart not ready for setData');
    }
  }, [margins, buildFullTimeline, logDebug]);

  // -----------------------------------------------------------
  // Load range data with debouncing for zoom/pan
  // -----------------------------------------------------------
  const loadRangeData = useCallback(async (min, max) => {
    setLoading(true);
    try {
      buildSeriesFromMargins(min, max);
      logDebug(`Loaded margin range ${new Date(min).toISOString().slice(0,10)} -> ${new Date(max).toISOString().slice(0,10)}`);
    } catch (e) {
      logDebug('loadRangeData failed: ' + (e && e.message ? e.message : e));
    } finally {
      setLoading(false);
    }
  }, [buildSeriesFromMargins, logDebug]);

  const debouncedLoadRange = useDebounceCallback(loadRangeData, 450);

  const afterSetExtremes = useCallback((e) => {
    if (!e || !e.min || !e.max) return;
    debouncedLoadRange(e.min, e.max);
  }, [debouncedLoadRange]);

  // -----------------------------------------------------------
  // Highstock chart options
  // -----------------------------------------------------------
  const chartOptions = useMemo(() => {
    return {
      chart: {
        backgroundColor: '#0b0f18',
        style: { fontFamily: 'Inter, system-ui, -apple-system, sans-serif' },
        spacingLeft: 10,
        animation: { duration: 500 },
        events: {
          load() {
            try { setChartReady(true); } catch (e) {}
          }
        }
      },
      title: { 
        text: t('marginChart.title', { defaultValue: 'Margin History' }), 
        style: { color: '#e2e8f0', fontSize: '16px' }, 
        align: 'left' 
      },
      rangeSelector: {
        selected: 3, // Default to "All"
        inputEnabled: false,
        buttonTheme: {
          fill: 'rgba(255,255,255,0.05)',
          stroke: 'none',
          'stroke-width': 0,
          r: 8,
          style: { color: '#cbd5e1', fontWeight: '500' },
          states: {
            hover: { fill: '#1e293b', style: { color: '#fff' } },
            select: { fill: '#3b82f6', style: { color: '#fff' } }
          }
        },
        buttons: [
          { type: 'month', count: 1, text: '1M' },
          { type: 'year', count: 1, text: '1Y' },
          { type: 'year', count: 5, text: '5Y' },
          { type: 'all', text: t('marginChart.rangeAll', { defaultValue: 'All' }) }
        ]
      },
      navigator: {
        enabled: true,
        height: 30,
        maskFill: 'rgba(59, 130, 246, 0.2)',
        series: { color: '#3b82f6', lineWidth: 1, fillOpacity: 0.1 },
        xAxis: { labels: { style: { color: '#94a3b8' } } }
      },
      scrollbar: { enabled: false },
      tooltip: {
        shared: true,
        split: false,
        borderRadius: 12,
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderWidth: 0,
        shadow: true,
        style: { color: '#f8fafc' },
        headerFormat: '<span style="font-size: 12px; color: #94a3b8">{point.key}</span><br/>',
        pointFormat: `<span style="color:{point.color}">●</span> ${t('marginChart.margin', { defaultValue: 'Margin' })}: <b>{point.y}%</b><br/>`,
        valueDecimals: 2
      },
      xAxis: {
        gridLineWidth: 0,
        lineWidth: 0,
        tickWidth: 0,
        labels: { style: { color: '#64748b' }, y: 20 },
        ordinal: false,
        events: { afterSetExtremes: (e) => afterSetExtremes(e) }
      },
      yAxis: {
        opposite: false,
        gridLineColor: '#1e293b',
        gridLineDashStyle: 'Dash',
        labels: { 
          style: { color: '#64748b' }, 
          x: -10,
          format: '{value}%'
        },
        title: {
          text: t('marginChart.marginPercent', { defaultValue: 'Margin %' }),
          style: { color: '#94a3b8' }
        },
        startOnTick: false,
        endOnTick: false,
        maxPadding: 0.02,
        minPadding: 0.02,
      },
      plotOptions: {
        series: {
          dataGrouping: {
            enabled: true,
            forced: true,
            approximation: 'average',
            groupPixelWidth: 15
          },
          animation: { duration: 600 },
          marker: { enabled: false, states: { hover: { enabled: true } } }
        }
      },
      series: [
        {
          name: t('marginChart.margin', { defaultValue: 'Margin' }),
          id: 'margin-series',
          type: 'areaspline',
          data: [],
          color: '#0ea5e9',
          fillColor: {
            linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
            stops: [[0, 'rgba(14, 165, 233, 0.4)'], [1, 'rgba(14, 165, 233, 0.02)']]
          },
          lineWidth: 2,
          step: 'left', // Step interpolation for margin changes
          threshold: null
        }
      ],
      credits: { enabled: false },
      time: { useUTC: true }
    };
  }, [t, afterSetExtremes]);

  // Apply dark theme globally
  useEffect(() => {
    Highcharts.setOptions({
      colors: ['#0ea5e9', '#3b82f6', '#6c8cff', '#f6c85f'],
      chart: { backgroundColor: '#0b0f18', style: { color: '#cbd5e1' } },
      title: { style: { color: '#e6eef8' } },
      subtitle: { style: { color: '#e6eef8' } },
      xAxis: { gridLineColor: '#1f2937', labels: { style: { color: '#cbd5e1' } } },
      yAxis: { gridLineColor: '#1f2937', labels: { style: { color: '#cbd5e1' } } },
      legend: { itemStyle: { color: '#cbd5e1' } }
    });
  }, []);

  // Reflow/redraw on locale change
  useEffect(() => {
    const chart = chartRef.current?.chart;
    if (chart) {
      setTimeout(() => {
        if (chart && chart.reflow) chart.reflow();
        if (chart && chart.redraw) chart.redraw();
      }, 0);
    }
  }, [i18n.language]);

  // Build timeline when margins load
  useEffect(() => {
    if (margins && margins.length > 0) {
      buildFullTimeline();
    }
  }, [margins, buildFullTimeline]);

  // Initial data population
  useEffect(() => {
    if (!chartReady || !margins || margins.length === 0) return;

    buildSeriesFromMargins();
  }, [chartReady, margins, buildSeriesFromMargins]);

  // Compute latest margin
  useEffect(() => {
    computeLatestMargin();
  }, [margins, computeLatestMargin]);

  return (
    <div className="margin-chart-container">
      <div className="margin-chart-card">
        <div className="chart-header">
          <h3>{t('marginChart.title', { defaultValue: 'Margin History' })}</h3>
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
            <div style={{ 
              position: 'absolute', 
              inset: 0, 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center', 
              background: 'rgba(11,15,24,0.72)', 
              color: '#e6eef8', 
              zIndex: 10 
            }}>
              {t('marginChart.loading', { defaultValue: 'Loading...' })}
            </div>
          )}
        </div>

        {/* Latest margin info */}
        <div className="latest-margin-info">
          <div className="margin-info-card">
            <div className="label">{t('marginChart.currentMargin', { defaultValue: 'Current Margin' })}</div>
            <div className="value">{latestMargin ? `${latestMargin.value.toFixed(2)}%` : '—'}</div>
            <div className="date-range">
              {latestMargin ? (
                <>
                  {t('marginChart.from', { defaultValue: 'From' })}: {new Date(latestMargin.startDate).toLocaleDateString()}
                  {latestMargin.endDate && (
                    <> {t('marginChart.to', { defaultValue: 'to' })} {new Date(latestMargin.endDate).toLocaleDateString()}</>
                  )}
                </>
              ) : ''}
            </div>
          </div>
        </div>

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
}
