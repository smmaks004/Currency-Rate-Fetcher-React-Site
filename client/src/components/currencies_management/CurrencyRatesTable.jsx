import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useAuth } from '../AuthContext';
import './CurrencyRatesTable.css';

import ExportTable from './subsections/ExportTable';

const parseDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d;
  
  const s = String(d);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); ///

  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const day = Number(m[3]);
    return new Date(y, mo, day);
  }
  
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return null;
  
  return dt;
};

// Format a Date object into local YYYY-MM-DD
const formatDateLocal = (d) => {
  if (!d) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export default function CurrencyRatesTable() {
  const [currencies, setCurrencies] = useState([]);
  const [ratesByCurrency, setRatesByCurrency] = useState({});
  const [loading, setLoading] = useState(false);
  const [currenciesLoading, setCurrenciesLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingKey, setEditingKey] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const cancelingRef = useRef(false);

  // table state
  const [page, setPage] = useState(1);
  const [pendingFrom, setPendingFrom] = useState([]);
  const [showFromDropdown, setShowFromDropdown] = useState(false);
  const [appliedFrom, setAppliedFrom] = useState([]);
  const [pendingTo, setPendingTo] = useState([]);
  const [showToDropdown, setShowToDropdown] = useState(false);
  const [appliedTo, setAppliedTo] = useState(null);
  const defaultsAppliedRef = useRef(false);

  // Max page size
  const pageSize = 20;
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  // Load currencies
  useEffect(() => {
    let cancelled = false;
    setCurrenciesLoading(true);
    (async () => {
      try {
        const res = await fetch('http://localhost:4000/api/currencies');
        if (!res.ok) throw new Error('Failed to load currencies');
        const d = await res.json();
        if (cancelled) return;
        setCurrencies(d || []);
      } catch (e) {
        if (!cancelled) setError('Failed to load currencies');
      } finally {
        if (!cancelled) setCurrenciesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // When currencies load, default the selectedFrom to the first currency
  useEffect(() => {
    if (!currencies || currencies.length === 0) return;
    if (defaultsAppliedRef.current) return;

    const eur = currencies.find(c => (c.CurrencyCode || '').toUpperCase() === 'EUR');
    const eurId = eur ? String(eur.Id) : String(currencies[0].Id);
    const allIds = currencies.map(c => String(c.Id));

    setPendingFrom([eurId]);
    setAppliedFrom([eurId]);
    setPendingTo(allIds);
    setAppliedTo(allIds);

    defaultsAppliedRef.current = true;
  }, [currencies]);

  // Load last-known rate for all currencies in one bulk request (fewer network calls)
  useEffect(() => {
    if (!currencies || currencies.length === 0) return;

    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);

    (async () => {
      try {
        const ids = currencies.map(c => c.Id).join(',');
        const url = `http://localhost:4000/api/rates/bulk?ids=${encodeURIComponent(ids)}`;
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) throw new Error('Failed to load rates');
        const payload = await res.json();
        if (cancelled) return;

        const data = (payload && payload.data) ? payload.data : payload;
        const out = {};

        Object.entries(data || {}).forEach(([currencyId, rows]) => {
          if (!rows || !Array.isArray(rows) || rows.length === 0) return;

          const map = new Map();
          let latest = null;

          for (const r of rows) {
            const dt = parseDate(r.Date);
            if (!dt) continue;
            const dateLocal = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
            const key = formatDateLocal(dateLocal);
            const entry = { rate: Number(r.ExchangeRate), margin: r.MarginValue != null ? Number(r.MarginValue) : 0, date: dateLocal, id: r.Id };
            map.set(key, entry);
            if (!latest || dateLocal.getTime() > latest.dt.getTime()) {
              latest = { dt: dateLocal, rate: entry.rate, margin: entry.margin };
            }
          }

          if (latest) {
            out[currencyId] = { last: { rate: latest.rate, margin: latest.margin, date: latest.dt }, map };
            try { console.debug(`Rates loaded for ${currencyId}: latest ${formatDateLocal(latest.dt)}`); } catch (e) { /* noop */ }
          }
        });

        setRatesByCurrency(out);
      } catch (e) {
        if (controller.signal.aborted || cancelled) return;
        setError('Failed to load rates');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currencies]);

  const rows = useMemo(() => {
    const rowsAcc = [];
    if (!currencies || currencies.length === 0) return rowsAcc;

    const dateSet = new Set();
    for (const id of Object.keys(ratesByCurrency)) {
      const item = ratesByCurrency[id];
      if (!item || !item.map) continue;
      for (const k of item.map.keys()) dateSet.add(k);
    }
    if (dateSet.size === 0) return rowsAcc;

    const timeline = Array.from(dateSet).sort();

    const fromList = appliedFrom ? (appliedFrom.length ? currencies.filter(c => appliedFrom.includes(String(c.Id))) : []) : currencies;
    const toList = appliedTo ? (appliedTo.length ? currencies.filter(c => appliedTo.includes(String(c.Id))) : []) : currencies;
    if (fromList.length === 0 || toList.length === 0) return rowsAcc;

    const lastKnown = {};
    const activeIds = new Set([
      ...fromList.map(c => String(c.Id)),
      ...toList.map(c => String(c.Id))
    ]);

    for (const key of timeline) {
      // Update last-known only for currencies we actually need
      for (const c of currencies) {
        if (!activeIds.has(String(c.Id))) continue;
        const item = ratesByCurrency[c.Id];
        if (item && item.map && item.map.has(key)) {
          lastKnown[c.Id] = item.map.get(key);
        }
      }

      for (const from of fromList) {
        for (const to of toList) {
          if (from.Id === to.Id) continue;
          const fromCode = (from.CurrencyCode || '').toUpperCase();
          const toCode = (to.CurrencyCode || '').toUpperCase();
          if (fromCode === 'EUR' && toCode === 'EUR') continue;

          const fromVal = lastKnown[from.Id] || (fromCode === 'EUR' ? { rate: 1, margin: 0, date: null } : null);
          const toVal = lastKnown[to.Id] || (toCode === 'EUR' ? { rate: 1, margin: 0, date: null } : null);
          if (!fromVal || !toVal) continue;

          const baseTo = toVal.rate;
          const baseFrom = fromVal.rate;
          const marginTo = toVal.margin || 0;
          const marginFrom = fromVal.margin || 0;

          const ecb = baseTo / baseFrom;
          const eurTo_sell = baseTo * (1 + (marginTo || 0) / 2);
          const eurFrom_buy = baseFrom * (1 - (marginFrom || 0) / 2);
          const buy = eurTo_sell / eurFrom_buy;
          const eurTo_buy = baseTo * (1 - (marginTo || 0) / 2);
          const eurFrom_sell = baseFrom * (1 + (marginFrom || 0) / 2);
          const sell = eurTo_buy / eurFrom_sell;

          const [yy, mm, dd] = key.split('-').map(Number);
          const date = new Date(yy, mm - 1, dd);

          rowsAcc.push({ fromId: from.Id, toId: to.Id, from: fromCode, to: toCode, ecb: Number(ecb), sell: Number(sell), buy: Number(buy), date, dateKey: key, toRateId: toVal && toVal.id ? toVal.id : null, fromRateId: fromVal && fromVal.id ? fromVal.id : null });
        }
      }
    }

    return rowsAcc;
  }, [currencies, ratesByCurrency, appliedFrom, appliedTo]);

  const sorted = useMemo(() => {
    if (!sortBy) return rows;
    const s = [...rows];
    s.sort((a, b) => {
      let va = a[sortBy];
      let vb = b[sortBy];
      if (va == null) return 1;
      if (vb == null) return -1;
      if (va instanceof Date) va = va.getTime();
      if (vb instanceof Date) vb = vb.getTime();
      if (typeof va === 'string') {
        const r = va.localeCompare(vb);
        return sortDir === 'asc' ? r : -r;
      }
      const r = va - vb;
      return sortDir === 'asc' ? r : -r;
    });
    return s;
  }, [rows, sortBy, sortDir]);

  const isLoading = currenciesLoading || loading;

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = page * pageSize;
    return sorted.slice(start, end);
  }, [sorted, page, pageSize]);

  const getCurrencyById = (id) => {
    return currencies.find(c => String(c.Id) === String(id)) || null;
  };

  const { user } = useAuth();
  const isAdmin = !!(user && ((user.Role).toString().toLowerCase() === 'admin'));

  const commitEdit = async (row) => {
    // Only allow editing for admin and if the 'from' currency is EUR
    if (!isAdmin || (!row || (row.from || '').toUpperCase() !== 'EUR')) {
      // setError('Only admin users can edit ECB');
      setEditingKey(null);
      return;
    }
    // if (!row || (row.from || '').toUpperCase() !== 'EUR') {
    //   // setError('ECB can be edited only when From currency is EUR');
    //   setEditingKey(null);
    //   return;
    // }


    if (!editingKey) return;
    const newEcb = Number(editingValue);
    if (Number.isNaN(newEcb)) { setError('Invalid value'); setEditingKey(null); return; }
    const fromId = row.fromId;
    const toId = row.toId;
    const dateKey = row.dateKey;

    const getMapEntry = (id) => {
      const item = ratesByCurrency[id] || ratesByCurrency[String(id)];
      if (!item || !item.map) return null;
      return item.map.get(dateKey);
    };

    let fromEntry = getMapEntry(fromId);
    if (!fromEntry) {
      const fromCurrency = getCurrencyById(fromId);
      if (fromCurrency && (fromCurrency.CurrencyCode || '').toUpperCase() === 'EUR') {
        fromEntry = { rate: 1, margin: 0 };
      } else {
        setError('Missing base rate for source currency'); setEditingKey(null); return;
      }
    }

    const baseFrom = Number(fromEntry.rate);
    const baseTo = newEcb * baseFrom;

    try {
      // Strict mode: require specific CurrencyRates row id
      const rateRowId = row.toRateId || null;
      if (!rateRowId) { setError('Cannot update: missing rate row id (refresh data)'); setEditingKey(null); return; }
      const res = await fetch('http://localhost:4000/api/update/update-ecbRate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', ////
        body: JSON.stringify({ rateId: rateRowId, exchangeRate: baseTo })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body && body.error ? body.error : 'Update failed');
        setEditingKey(null);
        return;
      }

      setRatesByCurrency(prev => {
        const clone = { ...prev };
        const key = String(toId);
        const item = clone[key] || clone[toId];
        if (!item) return prev;
        const newMap = new Map(item.map);
        // const dateObj = null;
        const existing = (item.map && item.map.get(dateKey)) || {};
        const existingMargin = existing.margin || 0;
        const existingId = existing.id || existing.Id || null;
        newMap.set(dateKey, { rate: Number(baseTo), margin: existingMargin, id: existingId });
        clone[key] = { ...item, map: newMap, last: item.last };
        return clone;
      });

      setEditingKey(null);
    } catch (err) {
      setError('Update failed');
      setEditingKey(null);
    }
  };

  const onHeaderClick = (key) => {
    if (sortBy === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
    setPage(1);
  };

  return (
    <div>
      {loading && <div>Loading...</div>}
      {error && <div className="error">{error}</div>}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <button className="tab-btn" onClick={() => setShowFromDropdown(s => !s)} style={{ padding: '6px 10px' }}>
            From filter ({pendingFrom && pendingFrom.length ? pendingFrom.length : 'All'}) ▾
          </button>
          {showFromDropdown && (
            <div className="filter-dropdown">
              <div className="filter-button-row">
                <button onClick={() => { setPendingFrom(currencies.map(c => String(c.Id))); }} className="btn-plain filter-select-btn">Select all</button>
                <button onClick={() => { setPendingFrom([]); }} className="btn-plain filter-clear-btn">Clear</button>
              </div>
              <div className="filter-list">
                {currencies.map((c) => (
                  <label key={c.Id} className="filter-label">
                    <input
                      type="checkbox"
                      checked={pendingFrom.includes(String(c.Id))}
                      onChange={(e) => {
                        const id = String(c.Id);
                        setPendingFrom(prev => {
                          let next;
                          if (e.target.checked) {
                            next = [...prev, id];
                          } else {
                            next = prev.filter(x => x !== id);
                          }
                          return next;
                        });
                      }}
                    />
                    <span className="currency-code">{c.CurrencyCode}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div style={{ position: 'relative' }}>
          <button className="tab-btn" onClick={() => setShowToDropdown(s => !s)} style={{ padding: '6px 10px' }}>
            To filter ({pendingTo && pendingTo.length ? pendingTo.length : 'All'}) ▾
          </button>
          {showToDropdown && (
            <div className="filter-dropdown">
              <div className="filter-button-row">
                <button onClick={() => { setPendingTo(currencies.map(c => String(c.Id))); }} className="btn-plain filter-select-btn">Select all</button>
                <button onClick={() => { setPendingTo([]); }} className="btn-plain filter-clear-btn">Clear</button>
              </div>
              <div className="filter-list">
                {currencies.map((c) => {
                  const id = String(c.Id);
                  const checked = pendingTo && pendingTo.includes(id);
                  return (
                    <label key={c.Id} className="filter-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const checkedNow = e.target.checked;
                          setPendingTo(prev => {
                            const prevArr = Array.isArray(prev) ? prev : [];
                            if (checkedNow) {
                              if (!prevArr.includes(id)) return [...prevArr, id];
                              return prevArr;
                            } else {
                              return prevArr.filter(x => x !== id);
                            }
                          });
                        }}
                      />
                      <span className="currency-code">{c.CurrencyCode}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div style={{ marginLeft: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
          <button className="tab-btn apply-btn" onClick={() => {
            setAppliedFrom(pendingFrom);
            setAppliedTo(pendingTo);
            setPage(1);
            setShowFromDropdown(false);
            setShowToDropdown(false);
          }}>Apply filters</button>
        </div>
      </div>

      <div className="table-wrapper">
        {isLoading && (
          <div className="table-loading">
            <div className="spinner" aria-hidden="true" />
            <span>Loading data...</span>
          </div>
        )}
        <table className="curr-table">
          <thead>
            <tr>
              <th onClick={() => onHeaderClick('from')}>From currency code {sortBy === 'from' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('to')}>To currency code {sortBy === 'to' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('ecb')}>ECB rate {sortBy === 'ecb' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('sell')}>Sell rate {sortBy === 'sell' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('buy')}>Buy rate {sortBy === 'buy' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('date')}>Date {sortBy === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, idx) => (
              <tr key={idx}>
                  <td>{r.from}</td>
                  <td>{r.to}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {editingKey === `${r.from}-${r.to}-${r.dateKey}` ? (
                        <div style={{ position: 'relative' }}>
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={() => {
                              // If user clicked cancel button, avoid committing
                              setTimeout(() => {
                                if (cancelingRef.current) {
                                  cancelingRef.current = false;
                                  setEditingKey(null);
                                  setEditingValue('');
                                  return;
                                }
                                commitEdit(r);
                              }, 0);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitEdit(r);
                              if (e.key === 'Escape') setEditingKey(null);
                            }}
                            autoFocus
                            style={{ width: 120, padding: '4px 6px', paddingRight: 28 }}
                          />
                          <button
                            title="Cancel"
                            onMouseDown={() => { cancelingRef.current = true; }}
                            onClick={() => { setEditingKey(null); setEditingValue(''); cancelingRef.current = false; }}
                            style={{
                              position: 'absolute',
                              right: 4,
                              top: '50%',
                              transform: 'translateY(-50%)',
                              border: 'none',
                              background: 'transparent',
                              cursor: 'pointer',
                              opacity: 0.6,
                              padding: 2,
                              fontSize: 12,
                            }}
                          >×</button>
                        </div>
                      ) : (
                        <>
                          <span>{r.ecb.toFixed(6)}</span>
                          { isAdmin && (r.from || '').toUpperCase() === 'EUR' ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setEditingKey(`${r.from}-${r.to}-${r.dateKey}`); setEditingValue(String(r.ecb)); }}
                                title="Edit ECB"

                                // Just miroring pencil
                                style={{ border: 'none', background: 'transparent', cursor: 'pointer', transform: 'scaleX(-1)', display: 'inline-block', paddingBottom: 0, paddingTop: 0 }}
                              >✎</button>
                          ) : null }
                        </>
                      )}
                    </div>
                  </td>

                  <td>{r.sell.toFixed(6)}</td>
                  <td>{r.buy.toFixed(6)}</td>
                  <td>{formatDateLocal(r.date)}</td>
                </tr>
            ))}
            {pageRows.length === 0 && !isLoading && (
              <tr><td colSpan={6} className="no-data-cell">No data available.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div>Showing {Math.min((page - 1)*pageSize + 1, total)} - {Math.min(page*pageSize, total)} of {total}</div>
        <div className="pagination-controls">
          <button onClick={() => setPage(1)} disabled={page === 1}>« First</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>Next ›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>Last »</button>
        </div>
      </div>


      <ExportTable rows={sorted} />
    </div>
  );
}
