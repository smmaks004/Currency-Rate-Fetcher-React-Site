import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import '../common/TableStyles.css';
import './MarginTable.css';
import CreateMargin from './subsections/CreateMargin';

// Date formatting
const formatDateDisplay = (dateStr) => {
  if (!dateStr) return '—';
  return dateStr; 
};

// Status determination
const describeStatusKey = (start, end) => {
  const today = new Date().toISOString().split('T')[0];
  const startDate = start || '—';
  const endDate = end || '—';

  // If end date is in the past - expired
  if (endDate !== '—' && endDate < today) return 'expired';
  
  // Otherwise active
  return 'active';
};

export default function MarginTable() {
  const [margins, setMargins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Pagination and sorting
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState(null);
  const [sortDir, setSortDir] = useState('asc');
  
  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { t } = useTranslation();
  const pageSize = 20;

  const fetchMargins = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/margins', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json();
      setMargins(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(t('marginTable.errorLoad'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMargins();
  }, []);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
  };

  // --- Table Logic ---
  const rows = useMemo(() => {
    return (margins || []).map((m) => {
      const marginPct = Number(m.MarginValue);
      const marginDisplay = Number.isFinite(marginPct) ? `${(marginPct * 100).toFixed(2)}%` : '—';
      const userName = [m.UserFirstName, m.UserLastName].filter(Boolean).join(' ').trim();
      const owner = userName || m.UserEmail || t('marginTable.userFallback', { id: m.UserId ?? '—' });

      return {
        key: m.Id,
        id: m.Id,
        marginDisplay, 
        marginRaw: marginPct,
        startDate: formatDateDisplay(m.StartDate),
        endDate: formatDateDisplay(m.EndDate),
        owner,
        statusKey: describeStatusKey(m.StartDate, m.EndDate)
      };
    });
  }, [margins, t]);

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows;
    const s = [...rows];
    s.sort((a, b) => {
      let va = a[sortBy === 'marginValue' ? 'marginRaw' : sortBy];
      let vb = b[sortBy === 'marginValue' ? 'marginRaw' : sortBy];
      
      if (va == null) return 1; 
      if (vb == null) return -1;
      
      if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    return s;
  }, [rows, sortBy, sortDir]);

  const total = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const pageRows = sortedRows.slice((page - 1) * pageSize, page * pageSize);

  const onHeaderClick = (key) => {
    if (sortBy === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(key); setSortDir('asc'); }
    setPage(1);
  };

  return (
    <div className="margin-table-wrapper">
      <div className="margin-header">
        <div className="headline">{t('marginTable.title')}</div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {loading && <span className="muted">{t('marginTable.loading')}</span>}
            <button className="create-btn" onClick={handleOpenModal}>{t('marginTable.createNew')}</button>
        </div>
      </div>
      
      {error && <div className="error">{error}</div>}

      <div className="table-wrapper table-surface">
        <table className="curr-table margin-table">
          <thead>
            <tr>
              <th onClick={() => onHeaderClick('id')}>ID {sortBy === 'id' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('marginValue')}>{t('marginTable.colMargin')} {sortBy === 'marginValue' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('startDate')}>{t('marginTable.colStartDate')} {sortBy === 'startDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('endDate')}>{t('marginTable.colEndDate')} {sortBy === 'endDate' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('statusKey')}>{t('marginTable.colStatus')} {sortBy === 'statusKey' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
              <th onClick={() => onHeaderClick('owner')}>{t('marginTable.colCreatedBy')} {sortBy === 'owner' ? (sortDir === 'asc' ? '↑' : '↓') : ''}</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((row) => (
              <tr key={row.key}>
                <td>{row.id}</td>
                <td>{row.marginDisplay}</td>
                <td>{row.startDate}</td>
                <td>{row.endDate}</td>
                <td>
                  <span className={`status-chip status-${row.statusKey}`}>
                    {t(`marginTable.status${row.statusKey.charAt(0).toUpperCase()}${row.statusKey.slice(1)}`)}
                  </span>
                </td>
                <td>{row.owner}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="no-data-cell">{t('marginTable.noData')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      
      <div className="pagination">
        <div>{t('marginTable.showing', { from: Math.min((page - 1) * pageSize + 1, total), to: Math.min(page * pageSize, total), total })}</div>
        <div className="pagination-controls">
          <button onClick={() => setPage(1)} disabled={page === 1}>«</button>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>‹</button>
          <span>{page} / {totalPages}</span>         
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>›</button>
          <button onClick={() => setPage(totalPages)} disabled={page === totalPages}>»</button>
        </div>
      </div>

      <CreateMargin 
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSuccess={() => {
          fetchMargins(); // Refresh table after successful creation
        }}
      />
    </div>
  );
}