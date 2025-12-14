import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../AuthContext';
import '../common/TableStyles.css';
import './CurrencyRatesTable.css';
import { calculatePairRates } from '../../utils/currencyCalculations';

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
  const { t } = useTranslation();

  // Load currencies
  useEffect(() => {
    let cancelled = false;
    setCurrenciesLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/currencies');
        if (!res.ok) throw new Error('Failed to load currencies');
        const d = await res.json();
        if (cancelled) return;
        setCurrencies(d || []);
      } catch (e) {
        if (!cancelled) setError(t('currencyTable.errorLoadCurrencies'));
      } finally {
        if (!cancelled) setCurrenciesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [t]);

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
        const url = `/api/rates/bulk?ids=${encodeURIComponent(ids)}`;
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
        setError(t('currencyTable.errorLoadRates'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currencies, t]);

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

          // Calculate rates using utility function
          const rates = calculatePairRates(baseTo, baseFrom, marginTo, marginFrom);

          const [yy, mm, dd] = key.split('-').map(Number);
          const date = new Date(yy, mm - 1, dd);

          rowsAcc.push({ fromId: from.Id, toId: to.Id, from: fromCode, to: toCode, ecb: rates.origin, sell: rates.sell, buy: rates.buy, date, dateKey: key, toRateId: toVal && toVal.id ? toVal.id : null, fromRateId: fromVal && fromVal.id ? fromVal.id : null });
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
    if (Number.isNaN(newEcb)) { setError(t('currencyTable.errorInvalidValue')); setEditingKey(null); return; }
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
        setError(t('currencyTable.errorMissingBase')); setEditingKey(null); return;
      }
    }

    const baseFrom = Number(fromEntry.rate);
    const baseTo = newEcb * baseFrom;

    try {
      // Strict mode: require specific CurrencyRates row id
      const rateRowId = row.toRateId || null;
      if (!rateRowId) { setError(t('currencyTable.errorMissingRateId')); setEditingKey(null); return; }
      const res = await fetch('/api/update/update-ecbRate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', ////
        body: JSON.stringify({ rateId: rateRowId, exchangeRate: baseTo })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body && body.error ? body.error : t('currencyTable.errorUpdateFailed'));
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
      setError(t('currencyTable.errorUpdateFailed'));
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
      {loading && <div>{t('currencyTable.loading')}</div>}
      {error && <div className="error">{error}</div>}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <button className="tab-btn" onClick={() => setShowFromDropdown(s => !s)} style={{ padding: '6px 10px' }}>
            {`${t('currencyTable.fromFilter')} (${pendingFrom && pendingFrom.length ? pendingFrom.length : t('currencyTable.all')}) ▾`}
          </button>
          {showFromDropdown && (
            <div className="filter-dropdown">
              <div className="filter-button-row">
                <button onClick={() => { setPendingFrom(currencies.map(c => String(c.Id))); }} className="btn-plain filter-select-btn">{t('currencyTable.selectAll')}</button>
                <button onClick={() => { setPendingFrom([]); }} className="btn-plain filter-clear-btn">{t('currencyTable.clear')}</button>
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
            {`${t('currencyTable.toFilter')} (${pendingTo && pendingTo.length ? pendingTo.length : t('currencyTable.all')}) ▾`}
          </button>
          {showToDropdown && (
            <div className="filter-dropdown">
              <div className="filter-button-row">
                <button onClick={() => { setPendingTo(currencies.map(c => String(c.Id))); }} className="btn-plain filter-select-btn">{t('currencyTable.selectAll')}</button>
                <button onClick={() => { setPendingTo([]); }} className="btn-plain filter-clear-btn">{t('currencyTable.clear')}</button>
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
          }}>{t('currencyTable.apply')}</button>
        </div>
      </div>

      <div className="table-wrapper table-surface">
        {isLoading && (
          <div className="table-loading">
            <div className="spinner" aria-hidden="true" />
            <span>{t('currencyTable.loading')}</span>
          </div>
        )}
        <table className="curr-table">
          <thead>
            <tr>
              <th onClick={() => onHeaderClick('from')}>{t('currencyTable.fromCode')} {sortBy === 'from' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('to')}>{t('currencyTable.toCode')} {sortBy === 'to' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('ecb')}>{t('currencyTable.ecbRate')} {sortBy === 'ecb' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('sell')}>{t('currencyTable.sellRate')} {sortBy === 'sell' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('buy')}>{t('currencyTable.buyRate')} {sortBy === 'buy' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('date')}>{t('currencyTable.date')} {sortBy === 'date' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
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
                            title={t('currencyTable.cancel')}
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
                                title={t('currencyTable.editEcb')}

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
              <tr><td colSpan={6} className="no-data-cell">{t('currencyTable.noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div>{t('currencyTable.showing', { from: Math.min((page - 1)*pageSize + 1, total), to: Math.min(page*pageSize, total), total })}</div>
        <div className="pagination-controls">
          <button onClick={() => setPage(1)} disabled={page === 1}>« {t('currencyTable.first')}</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ {t('currencyTable.prev')}</button>
          <span>{t('currencyTable.page', { page, total: totalPages })}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page === totalPages}>{t('currencyTable.next')} ›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>{t('currencyTable.last')} »</button>
        </div>
      </div>


      <ExportTable rows={sorted} />
    </div>
  );
}
