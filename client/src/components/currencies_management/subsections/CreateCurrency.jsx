import React, { useState } from 'react';

export default function CreateCurrency() {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const onChange = (e) => {
    // Allow only latin letters, uppercase, max 3 chars
    const v = String(e.target.value || '');
    const filtered = v.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 3);
    setCode(filtered);
    setError('');
    setSuccess(false);
  };

  const onCreate = async () => {
    setError('');
    setSuccess(false);
    if (code.length !== 3) {
      setError('Currency code must be exactly 3 letters');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('http://localhost:4000/api/update/update-createCurrency', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currencyCode: code })
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body && body.error ? body.error : `Create failed (${res.status})`);
        setLoading(false);
        return;
      }

      
      setSuccess(true); // Success
    } catch (err) {
      setError('Request failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <label style={{ fontWeight: 600 }}>Currency code</label>
        <input
          value={code}
          onChange={onChange}
          maxLength={3}
          placeholder="ABC"
          style={{ padding: '6px 8px', width: 80, textTransform: 'uppercase' }}
        />
        <button
          className="tab-btn"
          onClick={onCreate}
          disabled={loading || code.length !== 3}
          style={{ padding: '6px 10px' }}
        >
          {loading ? 'Creating...' : 'Create'}
        </button>
      </div>

      {error && <div className="error">{error}</div>}
      {success && <div style={{ color: '#7ee787' }}>Currency "{code}" created successfully.</div>}

      {/* {success && (
        <div style={{ marginTop: 12 }}>
          <h4 style={{ margin: '8px 0' }}>Updated rates table</h4>
          <CurrencyRatesTable />
        </div>
      )} */}
    </div>
  );
}
