import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function CreateCurrency() {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { t } = useTranslation();

  const onChange = (e) => {
    // Allow only latin letters, uppercase, max 3 chars
    const v = String(e.target.value || '');
    const filtered = v.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    setCode(filtered);
    setError('');
    setSuccess(false);
  };

  const onNameChange = (e) => {
    setName(e.target.value || '');
    setError('');
    setSuccess(false);
  };

  const onCreate = async () => {
    setError('');
    setSuccess(false);
    if (code.length !== 3) {
      setError(t('createCurrency.errorCode'));
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/update/update-createCurrency', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currencyCode: code, currencyName: name })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body && body.error ? body.error : t('createCurrency.errorCreateFailed', { status: res.status }));
        setLoading(false);
        return;
      }

      
      setSuccess(true); // Success
      setName('');
      setCode('');
    } catch (err) {
      setError(t('createCurrency.errorRequest'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontWeight: 600 }}>{t('createCurrency.label')}</label>
        <input
          value={code}
          onChange={onChange}
          maxLength={3}
          placeholder={t('createCurrency.placeholder')}
          style={{ padding: '6px 8px', width: 80, textTransform: 'uppercase' }}
        />
        <input
          value={name}
          onChange={onNameChange}
          placeholder={t('createCurrency.namePlaceholder')}
          maxLength={50}
          style={{ padding: '6px 8px', width: 220 }}
        />
        <button
          className="tab-btn"
          onClick={onCreate}
          disabled={loading}
          style={{ padding: '6px 10px' }}
        >
          {loading ? t('createCurrency.creating') : t('createCurrency.create')}
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div style={{ color: '#7ee787' }}>{t('createCurrency.success', { code })}</div>}

      {/* {success && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: '8px 0' }}>Updated rates table</h4>
          <CurrencyRatesTable />
        </div>
      )} */}
    </div>
  );
}
