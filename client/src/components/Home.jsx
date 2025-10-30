import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Home.css';

import { Chart as ChartJS, LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend, Title } from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Tooltip, Legend, Title);

  const parseDate = (d) => {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt;
  };

  export default function Home() {
    const [currencies, setCurrencies] = useState([]);
    const [fromId, setFromId] = useState(null);
    const [toId, setToId] = useState(null);
    const [mode, setMode] = useState('mix'); // 'buy' | 'sell' | 'mix' | 'mid'
    const [chart, setChart] = useState({ labels: [], midValues: [], buyValues: [], sellValues: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [debugLogs, setDebugLogs] = useState([]);

    const logDebug = (msg) => {
      const line = `${new Date().toISOString()} ${typeof msg === 'string' ? msg : JSON.stringify(msg)}`;
      setDebugLogs((s) => [...s.slice(-200), line]);
      console.debug(line);
    };

    const navigate = useNavigate();

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
          console.warn(`Currencies fetch attempt ${attempt} failed`, err);
          logDebug(`Currencies fetch attempt ${attempt} failed: ${err && err.message ? err.message : err}`);
          if (cancelled) return;
          if (attempt < maxRetries) {
            setTimeout(() => load(attempt + 1), retryDelay);
          } else {
            // after retries, leave currencies empty but do not show a blocking error
              setError('Failed to load currency list (server unavailable)');
              console.warn('Currencies fetch exhausted retries');
              logDebug('Currencies fetch exhausted retries');
          }
        }
      };

      load();
      return () => { cancelled = true; };
    }, []);

    const fetchRates = useCallback(async (currencyId) => {
      try {
        const res = await fetch(`http://localhost:4000/api/rates/${currencyId}`);
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new Error(`rates fetch failed status=${res.status} body=${body}`);
        }
        const rows = await res.json();
        const map = new Map();
        for (const r of rows) {
          const dt = parseDate(r.Date);
          if (!dt) continue;
          const key = dt.toISOString().slice(0, 10);
          map.set(key, { rate: Number(r.ExchangeRate), margin: r.MarginValue != null ? Number(r.MarginValue) : 0, date: dt });
        }
        return map;
      } catch (err) {
        console.warn('fetchRates failed for', currencyId, err);
        logDebug(`fetchRates failed for ${currencyId}: ${err && err.message ? err.message : err}`);
        return new Map();
      }
    }, []);

    const buildChart = useCallback(async (fId, tId) => {
      if (!fId || !tId) return;
      setLoading(true);
      setError('');
      try {
        const [mapFromRaw, mapToRaw] = await Promise.all([fetchRates(fId), fetchRates(tId)]);

        // DB stores only EUR -> other currencies. If user selected EUR as one side,
        // there will be no rows for EUR in CurrencyRates. We synthesize rate=1 entries
        // for EUR using the dates present in the other currency so daily intersection works.
        const fromCur = currencies.find((c) => c.Id === fId);
        const toCur = currencies.find((c) => c.Id === tId);
        const isFromEUR = (fromCur?.CurrencyCode || '').toUpperCase() === 'EUR';
        const isToEUR = (toCur?.CurrencyCode || '').toUpperCase() === 'EUR';

  const mapFrom = new Map(mapFromRaw);
  const mapTo = new Map(mapToRaw);

  // debug info
  console.debug('buildChart: mapFrom size', mapFrom.size, 'mapTo size', mapTo.size, 'fromId', fId, 'toId', tId);

        // If one side has no data but the other side does, synthesize rate=1 entries
        // for the empty side. This covers the case where the DB only stores EUR->X
        // and there are no rows for EUR itself.
        if (mapFrom.size === 0 && mapTo.size > 0) {
          console.debug('synthesizing mapFrom (EUR) from mapTo keys, first keys:', Array.from(mapTo.keys()).slice(0,5));
          mapTo.forEach((v, k) => mapFrom.set(k, { rate: 1, margin: 0, date: v.date }));
        }
        if (mapTo.size === 0 && mapFrom.size > 0) {
          console.debug('synthesizing mapTo (EUR) from mapFrom keys, first keys:', Array.from(mapFrom.keys()).slice(0,5));
          mapFrom.forEach((v, k) => mapTo.set(k, { rate: 1, margin: 0, date: v.date }));
        }

        // intersection of dates (daily)
        let dates = Array.from(mapTo.keys()).filter((k) => mapFrom.has(k));

        // If intersection is empty but one side is EUR, fall back to using the other's dates
        if (dates.length === 0 && (isFromEUR || isToEUR)) {
          const source = (mapTo.size > 0) ? mapTo : mapFrom;
          dates = Array.from(source.keys());
        }
        if (dates.length === 0) {
          setChart({ labels: [], midValues: [], buyValues: [], sellValues: [] });
          setLoading(false);
          return;
        }
        dates.sort();

        const labels = [];
        const midValues = [];
        const buyValues = [];
        const sellValues = [];

        for (const key of dates) {
          const a = mapTo.get(key);
          const b = mapFrom.get(key);
          if (!a || !b) continue;

          const baseTo = a.rate;
          const baseFrom = b.rate;
          const marginTo = a.margin || 0;
          const marginFrom = b.margin || 0;

          const mid = baseTo / baseFrom;

          const eurTo_sell = baseTo * (1 + (marginTo || 0) / 2);
          const eurFrom_buy = baseFrom * (1 - (marginFrom || 0) / 2);
          const buy = eurTo_sell / eurFrom_buy;

          const eurTo_buy = baseTo * (1 - (marginTo || 0) / 2);
          const eurFrom_sell = baseFrom * (1 + (marginFrom || 0) / 2);
          const sell = eurTo_buy / eurFrom_sell;

          labels.push(new Date(key).toISOString());
          midValues.push(Number(mid));
          buyValues.push(Number(buy));
          sellValues.push(Number(sell));
        }

        setChart({ labels, midValues, buyValues, sellValues });
      } catch (err) {
        console.error(err);
  setError('Error loading data');
      } finally {
        setLoading(false);
      }
    }, [fetchRates]);

    useEffect(() => {
      if (fromId && toId) buildChart(fromId, toId);
    }, [fromId, toId, buildChart]);

    const headline = useMemo(() => {
      const f = currencies.find((c) => c.Id === fromId)?.CurrencyCode || '—';
      const t = currencies.find((c) => c.Id === toId)?.CurrencyCode || '—';
      return `${f} → ${t}`;
    }, [fromId, toId, currencies]);

    const chartData = useMemo(() => {
      if (!chart.labels || chart.labels.length === 0) return { labels: [], datasets: [] };
      const datasets = [];
      if (mode === 'buy') {
        datasets.push({ label: 'Buy', data: chart.buyValues.map((v, i) => ({ x: chart.labels[i], y: v })), borderColor: '#28c76f', backgroundColor: 'rgba(40,199,111,0.12)', tension: 0.12, pointRadius: 2 });
      } else if (mode === 'sell') {
        datasets.push({ label: 'Sell', data: chart.sellValues.map((v, i) => ({ x: chart.labels[i], y: v })), borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.12)', tension: 0.12, pointRadius: 2 });
      } else if (mode === 'mix') {
        datasets.push({ label: 'Buy', data: chart.buyValues.map((v, i) => ({ x: chart.labels[i], y: v })), borderColor: '#28c76f', backgroundColor: 'rgba(40,199,111,0.08)', tension: 0.12, pointRadius: 1 });
        datasets.push({ label: 'Sell', data: chart.sellValues.map((v, i) => ({ x: chart.labels[i], y: v })), borderColor: '#ff6b6b', backgroundColor: 'rgba(255,107,107,0.08)', tension: 0.12, pointRadius: 1 });
      } else if (mode === 'mid') {
        datasets.push({ label: 'Mid', data: chart.midValues.map((v, i) => ({ x: chart.labels[i], y: v })), borderColor: '#6c8cff', backgroundColor: 'rgba(108,140,255,0.12)', tension: 0.12, pointRadius: 2 });
      }
      return { labels: chart.labels, datasets };
    }, [chart, mode]);

    const options = useMemo(() => ({
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          mode: 'index',
          intersect: false,
          callbacks: {
            title: (items) => {
              const d = new Date(items[0].label || items[0].parsed?.x);
              return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
            },
            label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.raw.y ?? ctx.raw).toFixed(6)}`,
          },
        },
      },
      scales: {
        x: { type: 'time', time: { unit: 'day', tooltipFormat: 'PPP' }, ticks: { maxRotation: 0, minRotation: 0 } },
        y: { beginAtZero: false },
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    }), []);

    const [userMenuOpen, setUserMenuOpen] = useState(false);
    // No auth: header only has Login button that navigates to /login
    const handleLogout = () => {
      setUserMenuOpen(false);
    };

    return (
      <div className="home-container">
        <header className="topbar">
          <div className="brand">Exchange Explorer</div>
          <div className="top-actions">
            <button className="btn-primary" onClick={() => navigate('/login')}>
              Login
            </button>
          </div>
        </header>

        <main className="main-card wide">
          <section className="controls">
            <div className="headline controls-head">{headline}</div>
            <div className="select-row">
              <label>
                From
                <select value={fromId || ''} onChange={(e) => setFromId(Number(e.target.value))}>
                  {currencies.map((c) => (
                    <option key={c.Id} value={c.Id}>{c.CurrencyCode}</option>
                  ))}
                </select>
              </label>

              <label>
                To
                <select value={toId || ''} onChange={(e) => setToId(Number(e.target.value))}>
                  {currencies.map((c) => (
                    <option key={c.Id + '-to'} value={c.Id}>{c.CurrencyCode}</option>
                  ))}
                </select>
              </label>

              <div className="mode-control">
                <label className={`mode-btn ${mode === 'mid' ? 'active' : ''}`} onClick={() => setMode('mid')}>Mid</label>
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

            <div className="chart-area">
              {loading ? (
                <div>Loading...</div>
              ) : chart.labels && chart.labels.length ? (
                <div style={{ height: 420 }}>
                  <Line data={chartData} options={options} />
                </div>
              ) : (
                <div>No data for the selected pair</div>
              )}
            </div>

            <div className="chart-legend">
              <div>Pair: <strong>{headline}</strong></div>
              <div className="mini-stats">Points: {chart.labels?.length ?? 0}</div>
            </div>
            {error && <div className="error">{error}</div>}
          </section>
        </main>
      </div>
    );
  }
