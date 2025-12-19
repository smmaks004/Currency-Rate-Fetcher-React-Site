import React, { useEffect, useMemo, useRef, useState } from 'react';
import './ForgotPassword.css';

export const defaultRecoveryOptions = [
  {
    id: 'email',
    title: 'Recover password via email',
  },
];

export default function ForgotPassword({
  onBack,
  recoveryOptions = defaultRecoveryOptions,
  onSubmitEmail,
}) {
  const [step, setStep] = useState('choose'); // 'choose' | 'email' | 'code' | 'reset'
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  
  // Code input state
  const [codeChars, setCodeChars] = useState(() => Array.from({ length: 6 }, () => ''));
  const codeInputsRef = useRef([]);
  const prevFullRef = useRef(false);

  // Reset password state
  const [resetToken, setResetToken] = useState(null); // Security token from server
  const [resetPw, setResetPw] = useState('');
  const [resetPwRepeat, setResetPwRepeat] = useState('');
  
  // Status feedback
  const [statusText, setStatusText] = useState('');
  const [statusKind, setStatusKind] = useState('info'); // 'info' | 'error' | 'success'

  const options = useMemo(() => recoveryOptions ?? defaultRecoveryOptions, [recoveryOptions]);

  const handleBack = () => {
    setStatusText('');
    setStatusKind('info');
    
    if (step === 'reset') {
      setResetPw('');
      setResetPwRepeat('');
      setStep('choose');
      return;
    }
    if (step === 'code') {
      setCodeChars(Array.from({ length: 6 }, () => ''));
      setStep('email');
      return;
    }
    if (step === 'email') {
      setStep('choose');
      return;
    }
    onBack?.();
  };

  const handleOptionClick = (optionId) => {
    if (optionId === 'email') {
      setStep('email');
      return;
    }
  };

  // 1. Send Email / Request Code
  const handleSubmitEmail = async (e) => {
    e.preventDefault();
    if (sending) return;
    
    const trimmedEmail = String(email).trim();
    if (!trimmedEmail) return;

    setStatusText('');
    setStatusKind('info');
    setSending(true);

    try {
      const resp = await fetch('/api/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: trimmedEmail }),
      });
      
      const data = await resp.json().catch(() => ({}));

      // If account explicitly blocked/deleted -> show error
      if (resp.status === 403) {
        setStatusKind('error');
        setStatusText(data?.error || 'Account is deleted');
        setSending(false);
        return;
      }

      // Other server errors -> show generic server error
      if (!resp.ok) {
        setStatusKind('error');
        setStatusText(data?.error || 'Server error');
        setSending(false);
        return;
      }

      // Success
      setStatusKind('info');
      setStatusText('Code sent (check spam folder too)');
      onSubmitEmail?.(trimmedEmail);
      
      setCodeChars(Array.from({ length: 6 }, () => ''));
      setStep('code');
      
      setTimeout(() => {
        codeInputsRef.current?.[0]?.focus?.();
      }, 100);

    } catch (err) {
      setStatusKind('error');
      setStatusText(err?.message || 'Network error');
    } finally {
      setSending(false);
    }
  };

  // Helper: Code input logic
  const setCharAt = (index, value) => {
    setCodeChars((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleCodeChange = (index, rawValue) => {
    const value = String(rawValue || '').replace(/\s+/g, '').toUpperCase();
    const cleaned = value.replace(/[^A-Z0-9]/gi, '');
    
    if (!cleaned) {
      setCharAt(index, '');
      return;
    }

    const chars = cleaned.split('');
    setCodeChars((prev) => {
      const next = [...prev];
      chars.forEach((char, i) => {
        if (index + i < 6) next[index + i] = char;
      });
      return next;
    });

    const nextIndex = Math.min(index + chars.length, 5);
    codeInputsRef.current?.[nextIndex]?.focus?.();
  };

  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codeChars[index] && index > 0) {
      codeInputsRef.current?.[index - 1]?.focus?.();
    }
  };

  // 2. Verify Code
  const verifyCode = async (code) => {
    setStatusText('Verifying...');
    setStatusKind('info');
    setSending(true);

    try {
      const resp = await fetch('/api/password-reset/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: String(email).trim(), code }),
      });
      
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok) {
        setStatusKind('error');
        setStatusText(data?.error || 'Invalid or expired code');
        setSending(false);
        return;
      }

      setStatusKind('success');
      setStatusText('Code verified.');
      setResetToken(data.resetToken); // Store token
      setStep('reset');
      
    } catch (err) {
      setStatusKind('error');
      setStatusText(err?.message || 'Network error');
    } finally {
      setSending(false);
    }
  };

  // Auto-submit code when filled (trigger once on transition -> full)
  useEffect(() => {
    if (step !== 'code') return;
    const isFull = codeChars.every(c => Boolean(c));

    if (isFull && !prevFullRef.current && !sending) {
      prevFullRef.current = true;
      const code = codeChars.join('').toUpperCase();
      verifyCode(code);
      return;
    }

    // Reset the flag when it's not full so next full state triggers again
    if (!isFull) prevFullRef.current = false;

    
    // eslint-disable-next-line
  }, [codeChars, step, sending]);

  // 3. Set New Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (sending) return;

    setStatusText('');
    setStatusKind('info');

    if (!resetPw || !resetPwRepeat) {
      setStatusText('Enter and repeat new password.');
      setStatusKind('error');
      return;
    }
    if (resetPw.length < 6) {
      setStatusText('Password must be at least 6 characters.');
      setStatusKind('error');
      return;
    }
    // Require at least one digit or special character (keep same rule as user creation)
    const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/\?]/.test(resetPw);
    if (!hasDigitOrSymbol) {
      setStatusText('Password must include at least one digit or special character');
      setStatusKind('error');
      return;
    }
    if (resetPw !== resetPwRepeat) {
      setStatusText('Passwords do not match.');
      setStatusKind('error');
      return;
    }

    setSending(true);
    try {
      const resp = await fetch('/api/password-reset/set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          email: String(email).trim(), 
          password: resetPw,
          resetToken: resetToken 
        }),
      });
      
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data.ok) {
        setStatusText(data?.error || 'Failed to update password');
        setStatusKind('error');
        setSending(false);
        return;
      }

      setStatusText('Password changed successfully! Redirecting...');
      setStatusKind('success');
      
      setTimeout(() => {
        setStep('choose');
        setEmail('');
        setResetPw('');
        setResetPwRepeat('');
        setCodeChars(Array.from({ length: 6 }, () => ''));
        setStatusText('');
        setResetToken(null);
        onBack?.(); 
      }, 2000);

    } catch (err) {
      setStatusText(err?.message || 'Network error');
      setStatusKind('error');
      setSending(false);
    }
  };

  return (
    <div className="forgot-card" role="region" aria-label="Password recovery">
      <div className="forgot-top">
        <button type="button" className="forgot-back" onClick={handleBack}>
          ← Back
        </button>
      </div>

      {step === 'choose' && (
        <div className="forgot-content">
          <div className="forgot-options">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                className="forgot-option"
                onClick={() => handleOptionClick(opt.id)}
              >
                {opt.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'email' && (
        <div className="forgot-content">
          <h3 className="forgot-title">Recover password via email</h3>
          <form className="forgot-form" onSubmit={handleSubmitEmail}>
            <label className="forgot-label" htmlFor="forgot-email">Email</label>
            <input
              id="forgot-email"
              className="forgot-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Enter your email"
              required
              autoFocus
              maxLength={255}
            />
            <button className="forgot-submit" type="submit" disabled={sending}>
              {sending ? 'Sending…' : 'Send code'}
            </button>
            {statusText && <div className={`forgot-status forgot-status--${statusKind}`}>{statusText}</div>}
          </form>
        </div>
      )}

      {step === 'code' && (
        <div className="forgot-content">
          <h3 className="forgot-title">Enter the 6-digit code</h3>
          <p style={{fontSize: '0.9rem', color: '#666', marginBottom: '1rem'}}>
            Sent to {email}
          </p>
          <div className="code-inputs" aria-label="6 character code">
            {codeChars.map((ch, idx) => (
              <input
                key={idx}
                ref={(el) => {
                  codeInputsRef.current[idx] = el;
                }}
                className="code-input"
                inputMode="text"
                autoComplete="one-time-code"
                maxLength={1}
                value={ch}
                onChange={(e) => handleCodeChange(idx, e.target.value)}
                onKeyDown={(e) => handleCodeKeyDown(idx, e)}
                aria-label={`Code character ${idx + 1}`}
                disabled={sending}
              />
            ))}
          </div>
          {statusText && <div className={`forgot-status forgot-status--${statusKind}`}>{statusText}</div>}
        </div>
      )}

      {step === 'reset' && (
        <div className="forgot-content">
          <h3 className="forgot-title">Set new password</h3>
          <form className="forgot-form" onSubmit={handleResetPassword}>
            <label className="forgot-label" htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              className="forgot-input"
              type="password"
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              placeholder="Enter new password"
              minLength={6}
              maxLength={50}
              required
              autoFocus
            />
            <label className="forgot-label" htmlFor="reset-password-repeat">Repeat password</label>
            <input
              id="reset-password-repeat"
              className="forgot-input"
              type="password"
              value={resetPwRepeat}
              onChange={e => setResetPwRepeat(e.target.value)}
              placeholder="Repeat new password"
              minLength={6}
              maxLength={50}
              required
            />
            <button className="forgot-submit" type="submit" disabled={sending}>
              {sending ? 'Saving…' : 'Save new password'}
            </button>
            {statusText && <div className={`forgot-status forgot-status--${statusKind}`}>{statusText}</div>}
          </form>
        </div>
      )}
    </div>
  );
}