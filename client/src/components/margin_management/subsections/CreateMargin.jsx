import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import './CreateMargin.css';
import DatePicker, { registerLocale } from 'react-datepicker';
import enGB from 'date-fns/locale/en-GB';
// import 'react-datepicker/dist/react-datepicker.css';
registerLocale('en-GB', enGB);

export default function CreateMargin({ isOpen, onClose, onSuccess }) {
  // Form state
  const [marginValue, setMarginValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  
  // UI state
  const [createError, setCreateError] = useState('');
  const [conflictWarning, setConflictWarning] = useState(null);
  const [conflicts, setConflicts] = useState(null);

  const { t } = useTranslation();

  // Get current date in YYYY-MM-DD format for max date restriction
  const todayDate = new Date().toISOString().split('T')[0];

  const resetForm = () => {
    setMarginValue('');
    setStartDate('');
    setEndDate('');
    setCreateError('');
    setConflictWarning(null);
    setConflicts(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (force = false) => {
    setCreateError('');
    
    // Frontend Validation
    const normalizedValue = (marginValue || '').replace(/,/g, '.');

    if (!normalizedValue || !startDate) {
      setCreateError(t('createMargin.errorMarginRequired'));
      return;
    }

    // Check: Date cannot be in the future
    if (startDate > todayDate) {
      setCreateError(t('createMargin.errorFutureDate'));
      return;
    }

    const val = parseFloat(normalizedValue);
    if (val < 0 || val > 100) {
      setCreateError(t('createMargin.errorMarginRange'));
      return;
    }

    setLoading(true);

    try {
      const payload = {
        marginValue: normalizedValue,
        startDate: startDate,
        endDate: endDate || null,
        forceCreate: force
      };

      const res = await fetch('/api/margins/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        credentials: 'include'
      });

      const data = await res.json();

      if (res.status === 201) {
        // Success - reset and close
        resetForm();
        setLoading(false);
        if (onSuccess) onSuccess();
        onClose();
      } else if (res.status === 409) {
        // Single conflict - show confirmation
        setConflicts(data.conflicts);
        setConflictWarning(t('createMargin.warningConflict'));
        setLoading(false);
      } else {
        // Error
        setCreateError(data.error || t('createMargin.errorConflict'));
        setConflictWarning(null);
        setLoading(false);
      }
    } catch (err) {
      setCreateError('Network error');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-title">{t('createMargin.title')}</div>
        
        {createError && <div className="error-msg">{createError}</div>}
        
        {conflictWarning && (
            <div className="warning-msg">
                {conflictWarning}
            </div>
        )}
        
        <div className="form-group">
            <label>{t('createMargin.marginLabel')}</label>
            <input 
              type="text"
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              placeholder={t('createMargin.marginPlaceholder')}
              value={marginValue}
              onChange={(e) => setMarginValue(e.target.value)}
              disabled={!!conflictWarning || loading} 
            />
        </div>
        
        <div className="form-group">
          <label>{t('createMargin.startDateLabel')}</label>
          <DatePicker
            selected={startDate ? new Date(startDate) : null}
            onChange={(d) => {
              setStartDate(d ? d.toISOString().slice(0,10) : '');
              setConflictWarning(null);
              setCreateError('');
            }}
            dateFormat="yyyy-MM-dd"
            locale="en-GB"
            maxDate={todayDate ? new Date(todayDate) : undefined}
            className="date-picker-input"
            disabled={!!conflictWarning || loading}
          />
        </div>

        <div className="form-group">
          <label>{t('createMargin.endDateLabel')}</label>
          <DatePicker
            selected={endDate ? new Date(endDate) : null}
            onChange={(d) => setEndDate(d ? d.toISOString().slice(0,10) : '')}
            dateFormat="yyyy-MM-dd"
            locale="en-GB"
            maxDate={todayDate ? new Date(todayDate) : undefined}
            className="date-picker-input"
            disabled={!!conflictWarning || loading}
          />
        </div>

        <div className="modal-actions">
            <button className="btn-cancel" onClick={handleClose} disabled={loading}>{t('createMargin.cancel')}</button>
            
            {!conflictWarning ? (
                 <button className="btn-confirm" onClick={() => handleSubmit(false)} disabled={loading}>
                    {loading ? t('createMargin.creating') : t('createMargin.create')}
                 </button>
            ) : (
                 <button className="btn-confirm btn-warning" onClick={() => handleSubmit(true)} disabled={loading}>
                    {loading ? t('createMargin.creating') : t('createMargin.confirmOverwrite')}
                 </button>
            )}
        </div>
      </div>
    </div>
  );
}
