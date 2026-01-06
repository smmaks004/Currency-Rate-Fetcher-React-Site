import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

// Libraries used to generate downloadable PDFs and tables
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Download a Blob as a file
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Escape a value for inclusion in a CSV cell
function escapeCsvCell(v) {
  if (v == null) return '';
  const s = String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Read currently visible table rows from DOM when 'propRows' not provided
function readVisibleTable() {
  const table = document.querySelector('.curr-table');
  if (!table) return { headers: [], rows: [] };

  const headers = Array.from(table.querySelectorAll('thead th')).map(h => h.textContent.trim());

  const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
    const style = window.getComputedStyle(tr);
    if (style.display === 'none') return null;
    const cells = Array.from(tr.querySelectorAll('td')).map(td => td.textContent.trim());
    return cells;
  }).filter(r => r && r.length > 0);

  return { headers, rows };
}

// ExportTable: export the shown currency table to CSV/XLSX/PDF
export default function ExportTable({ rows: propRows, headers: propHeaders, filename: propFilename }) {
  const { t } = useTranslation();
  const [format, setFormat] = useState('csv');
  const [filename, setFilename] = useState(propFilename || 'currency_export');
  const [isExporting, setIsExporting] = useState(false);
  
  // New state to store the generated PDF URL
  const [pdfUrl, setPdfUrl] = useState(null);
  const [showPdfViewer, setShowPdfViewer] = useState(false);

  // Clean up URL when component unmounts (to avoid memory bloat)
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  const toCsvLines = (headers, rows) => {
    const lines = [];
    lines.push(headers.map(escapeCsvCell).join(','));
    for (const r of rows) lines.push(r.map(escapeCsvCell).join(','));
    return lines.join('\n');
  };

  const formatRowToCells = (r) => {
    if (!r) return [];
    if (Array.isArray(r)) return r;
    const dateStr = r.date ? (new Date(r.date)).toLocaleDateString() : '';
    return [r.from, r.to, (r.ecb != null ? Number(r.ecb).toFixed(6) : ''), (r.sell != null ? Number(r.sell).toFixed(6) : ''), (r.buy != null ? Number(r.buy).toFixed(6) : ''), dateStr];
  };

  const makeHeaders = (headersFromDom) => {
    if (propHeaders && propHeaders.length) return propHeaders;
    if (headersFromDom && headersFromDom.length) return headersFromDom;
    return ['From', 'To', 'ECB rate', 'Sell rate', 'Buy rate', 'Date'];
  };

  const handleAction = () => {
    if (isExporting) return;
    setIsExporting(true);

    // Defer heavy work to next tick so the overlay paints first
    setTimeout(() => {
      try {
        // Collect data
        let headers = [];
        let rows = [];

        if (propRows && Array.isArray(propRows) && propRows.length > 0) {
          headers = makeHeaders(propHeaders);
          rows = propRows.map(formatRowToCells);
        } else {
          const dom = readVisibleTable();
          headers = makeHeaders(dom.headers);
          rows = dom.rows;
        }

        if (!headers.length || !rows.length) {
          alert(t('ExportTable.tableNotFound'));
          return;
        }

        // Format-specific logic
        if (format === 'csv') {
          const csv = toCsvLines(headers, rows);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
          downloadBlob(blob, filename + '.csv');
          setShowPdfViewer(false);
          return;
        }

        
        if (format === 'xlsx') {
          const aoa = [headers, ...rows];
          const ws = XLSX.utils.aoa_to_sheet(aoa);
          const wb = XLSX.utils.book_new();
          XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
          const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
          const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
          downloadBlob(blob, filename + '.xlsx');
          setShowPdfViewer(false);
          return;
        }


        if (format === 'pdf') {
          /* GENERATE REAL PDF */
          const doc = new jsPDF();

          // Add title (centered on page)
          const pageWidth = (doc.internal.pageSize && typeof doc.internal.pageSize.getWidth === 'function')
            ? doc.internal.pageSize.getWidth()
            : doc.internal.pageSize.width;
          doc.setFontSize(20);
          try { doc.setFont(undefined, 'bold'); } catch (e) { 
            try { doc.setFontStyle && doc.setFontStyle('bold'); } catch (e) { /* ignore */ } 
          }
          doc.text("Report", pageWidth / 2, 18, { align: 'center' });


          // Generate table inside PDF
          autoTable(doc, {
            head: [headers],
            body: rows,
            startY: 30,
            theme: 'grid', // Table style (grid, striped, plain)
            styles: { fontSize: 10 },
          });

          const blob = doc.output('blob');
          const url = URL.createObjectURL(blob);
          
          setPdfUrl(url);
          setShowPdfViewer(true);
        }
      } finally {
        setIsExporting(false);
      }
    }, 0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" name="format" value="csv" checked={format === 'csv'} onChange={() => setFormat('csv')} />
          <strong>{t('ExportTable.formatNameCsv')}</strong>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" name="format" value="xlsx" checked={format === 'xlsx'} onChange={() => setFormat('xlsx')} />
          <strong>{t('ExportTable.formatNameExcel')}</strong>
        </label>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer' }}>
          <input type="radio" name="format" value="pdf" checked={format === 'pdf'} onChange={() => setFormat('pdf')} />
          <strong>{t('ExportTable.formatNamePdf')}</strong>
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <label style={{ minWidth: 80 }}>{t('ExportTable.filenameLabel')}</label>
        <input value={filename} onChange={(e) => setFilename(e.target.value)} style={{ padding: '6px 8px', flex: 1 }} />
      </div>

      <div>
        <button 
          className="tab-btn" 
          onClick={handleAction} 
          style={{ padding: '8px 12px', cursor: 'pointer', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px' }}
        >
          {format === 'pdf' ? t('ExportTable.downloadButtonPdf') : t('ExportTable.downloadButtonDefault')}
        </button>
      </div>

      <div style={{ color: '#6b7280', fontSize: 13 }}>
        - {t('ExportTable.helpCsv')}<br />
        - {t('ExportTable.helpXlsx')}<br />
        - {t('ExportTable.helpPdf')}
      </div>

      {/* === PDF PREVIEW BLOCK === */}
      {showPdfViewer && pdfUrl && format === 'pdf' && (
        <div style={{ marginTop: 20, border: '1px solid #ccc', borderRadius: 4, overflow: 'hidden' }}>
          <div style={{ background: '#f0f0f0', padding: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc' }}>
            <span style={{ fontWeight: 'bold' }}>{t('ExportTable.pdfPreviewTitle')}</span>
            <button 
              onClick={() => setShowPdfViewer(false)} 
              style={{ cursor: 'pointer', padding: '4px 8px' }}
            >
              {t('ExportTable.close')}
            </button>
          </div>
          <iframe 
            src={pdfUrl} 
            width="100%" 
            height="700px" 
            style={{ border: 'none', display: 'block' }}
            title={t('ExportTable.pdfPreviewTitle')}
          />
        </div>
      )}

      {/* Full-screen blur overlay while exporting */}
      {isExporting && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(116, 114, 114, 0.6)',
          backdropFilter: 'blur(2px)', WebkitBackdropFilter: 'blur(2px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999,
        }}>
          <style>{`
            @keyframes export-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          `}</style>
          <div
            aria-label={t('ExportTable.overlayAria')}
            style={{
              width: 72, height: 72,
              border: '8px solid rgba(0,0,0,0.1)',
              borderTop: '8px solid #2d66a3ff',
              borderRadius: '50%',
              animation: 'export-spin 1s linear infinite',
              boxShadow: '0 0 18px rgba(0,0,0,0.2)',
            }}
          />
        </div>
      )}
    </div>
  );
}