import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../common/TableStyles.css';
import './MarginTable.css';

const normalizeDate = (value) => {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const formatDate = (value) => {
  const d = normalizeDate(value);
  if (!d) return '—';
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${dd}`;
};

const describeStatusKey = (start, end) => {
  const today = new Date();
  const anchor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startDate = normalizeDate(start);
  const endDate = normalizeDate(end);

  if (startDate && startDate > anchor) return 'scheduled';
  if (endDate && endDate < anchor) return 'expired';
  return 'active';
};

export default function MarginTable() {
  const [margins, setMargins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  const { t } = useTranslation();

  // Match the pagination feel of CurrencyRatesTable (20 rows per page, controls appear when data is long).
  const pageSize = 20;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('http://localhost:4000/api/margins', { credentials: 'include' });
        if (!res.ok) throw new Error('Failed to load margins');
        const data = await res.json();
        if (cancelled) return;
        setMargins(Array.isArray(data) ? data : []);
        setPage(1);
      } catch (err) {
        if (!cancelled) setError(t('marginTable.errorLoad'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const rows = useMemo(() => {
    return (margins || []).map((m) => {
      const marginPct = Number(m.MarginValue);
      const marginDisplay = Number.isFinite(marginPct) ? `${(marginPct * 100).toFixed(2)}%` : '—';
      const startDate = normalizeDate(m.StartDate);
      const endDate = normalizeDate(m.EndDate);
      const statusKey = describeStatusKey(startDate, endDate);
      const userName = [m.UserFirstName, m.UserLastName].filter(Boolean).join(' ').trim();
      const owner = userName || m.UserEmail || t('marginTable.userFallback', { id: m.UserId ?? '—' });////

      return {
        key: m.Id || `${marginDisplay}-${Math.random()}`,
        id: m.Id,
        marginDisplay,
        marginValue: Number.isFinite(marginPct) ? marginPct : null,
        startDate,
        endDate,
        owner,
        statusKey
      };
    });
  }, [margins, t]);


  const sortedRows = useMemo(() => {
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

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return sortedRows.slice(start, end);
  }, [sortedRows, page, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);


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
    <div className="margin-table-wrapper">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div className="headline">{t('marginTable.title')}</div>
        {loading && <span className="muted">{t('marginTable.loading')}</span>}
      </div>
      {error && <div className="error">{error}</div>}

      <div className="table-wrapper table-surface">
        <table className="curr-table margin-table">
          <thead>
            <tr>
              <th style={{ width: '80px' }} onClick={() => onHeaderClick('id')}>{t('marginTable.colId')} {sortBy === 'id' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('marginValue')}>{t('marginTable.colMargin')} {sortBy === 'marginValue' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('startDate')}>{t('marginTable.colStartDate')} {sortBy === 'startDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('endDate')}>{t('marginTable.colEndDate')} {sortBy === 'endDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('statusKey')}>{t('marginTable.colStatus')} {sortBy === 'statusKey' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('owner')}>{t('marginTable.colCreatedBy')} {sortBy === 'owner' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td className="no-data-cell" colSpan={6}>{t('marginTable.noData')}</td>
              </tr>
            )}
            {pageRows.map((row) => (
              <tr key={row.key}>
                <td>{row.id ?? '—'}</td>
                <td>{row.marginDisplay}</td>
                <td>{formatDate(row.startDate)}</td>
                <td>{formatDate(row.endDate)}</td>
                <td>
                  <span className={`status-chip status-${row.statusKey}`}>
                    {t(`marginTable.status${row.statusKey.charAt(0).toUpperCase()}${row.statusKey.slice(1)}`)}
                  </span>
                </td>
                <td>{row.owner}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pagination">
        <div>{t('marginTable.showing', { from: Math.min((page - 1) * pageSize + 1, total || 0), to: Math.min(page * pageSize, total || 0), total })}</div>
        <div className="pagination-controls">
          <button onClick={() => setPage(1)} disabled={page === 1}>« {t('marginTable.first')}</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹ {t('marginTable.prev')}</button>
          <span>{t('marginTable.page', { page, total: totalPages })}</span>         
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>{t('marginTable.next')} ›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>{t('marginTable.last')} »</button>
        </div>
      </div>
    </div>
  );
}
