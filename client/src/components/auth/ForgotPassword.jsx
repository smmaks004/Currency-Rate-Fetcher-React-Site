import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import './ForgotPassword.css';

// Default recovery options - currently only email supported
export const defaultRecoveryOptions = [
  { id: 'email' },
];

export default function ForgotPassword({
  onBack,
  recoveryOptions = defaultRecoveryOptions,
  onSubmitEmail,
}) {
  
  // step flow: 'choose' -> 'email' -> 'code' -> 'reset'
  const [step, setStep] = useState('choose');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  
  // Code input state: six-character code broken into inputs
  const [codeChars, setCodeChars] = useState(() => Array.from({ length: 6 }, () => ''));
  const codeInputsRef = useRef([]);
  const prevFullRef = useRef(false);

  // Reset password state: token and password fields
  const [resetToken, setResetToken] = useState(null); // Security token from server
  const [resetPw, setResetPw] = useState('');
  const [resetPwRepeat, setResetPwRepeat] = useState('');
  
  // Status feedback for user: message and kind (info/error/success)
  const [statusText, setStatusText] = useState('');
  const [statusKind, setStatusKind] = useState('info');

  const { t } = useTranslation();
  const options = useMemo(() => recoveryOptions ?? defaultRecoveryOptions, [recoveryOptions]);

  // Navigate one step back/cleanup state depending on current step
  const handleBack = () => {
    setStatusText('');
    setStatusKind('info');
    
    if (step === 'reset') {
      // Cancel reset flow -> go back to choosing method
      setResetPw('');
      setResetPwRepeat('');
      setStep('choose');
      return;
    }
    if (step === 'code') {
      // Clear code inputs and go back to email entry
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

  // Handle user selecting a recovery option (only email supported)
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
        setStatusText(data?.error || t('forgot.accountDeleted'));
        setSending(false);
        return;
      }

      // Other server errors -> show generic server error
      if (!resp.ok) {
        setStatusKind('error');
        setStatusText(data?.error || t('forgot.serverError'));
        setSending(false);
        return;
      }

      // Success: notify user and transition to code entry
      setStatusKind('info');
      setStatusText(t('forgot.codeSent'));
      onSubmitEmail?.(trimmedEmail);
      
      setCodeChars(Array.from({ length: 6 }, () => ''));
      setStep('code');
      
      setTimeout(() => {
        codeInputsRef.current?.[0]?.focus?.();
      }, 100);

    } catch (err) {
      setStatusKind('error');
      setStatusText(err?.message || t('forgot.networkError'));
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

  // Handle pasted/typed values into a code input: sanitize and auto-advance
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

  // Backspace behavior: jump to previous input when empty
  const handleCodeKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !codeChars[index] && index > 0) {
      codeInputsRef.current?.[index - 1]?.focus?.();
    }
  };

  // 2. Verify Code: send entered code to server and store reset token on success
  const verifyCode = async (code) => {
    setStatusText(t('forgot.verifying'));
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
        setStatusText(data?.error || t('forgot.invalidOrExpiredCode'));
        setSending(false);
        return;
      }

      setStatusKind('success');
      setStatusText(t('forgot.codeVerified'));
      setResetToken(data.resetToken); // Store token
      setStep('reset');
      
    } catch (err) {
      setStatusKind('error');
      setStatusText(err?.message || 'Network error');
    } finally {
      setSending(false);
    }
  };

  // Auto-submit code when all inputs are filled
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

  // 3. Set New Password: validate locally and POST to server with reset token
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (sending) return;

    setStatusText('');
    setStatusKind('info');

    if (!resetPw || !resetPwRepeat) {
      setStatusText(t('forgot.enterAndRepeat'));
      setStatusKind('error');
      return;
    }
    if (resetPw.length < 6) {
      setStatusText(t('forgot.passwordTooShort'));
      setStatusKind('error');
      return;
    }
    // Require at least one digit or special character (keep same rule as user creation)
    const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/\?]/.test(resetPw);
    if (!hasDigitOrSymbol) {
      setStatusText(t('forgot.passwordRequiresDigitSymbol'));
      setStatusKind('error');
      return;
    }
    if (resetPw !== resetPwRepeat) {
      setStatusText(t('forgot.passwordsDoNotMatch'));
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
        setStatusText(data?.error || t('forgot.updateFailed'));
        setStatusKind('error');
        setSending(false);
        return;
      }

      // Success: inform user then reset internal state and go back
      setStatusText(t('forgot.passwordChangedSuccess'));
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
      setStatusText(err?.message || t('forgot.networkError'));
      setStatusKind('error');
      setSending(false);
    }
  };

  return (
    <div className="forgot-card" role="region" aria-label="Password recovery">
      <div className="forgot-top">
        <button type="button" className="forgot-back" onClick={handleBack}>
          {t('profile.back')}
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
                {opt.id === 'email' ? t('forgot.recoverViaEmail') : opt.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === 'email' && (
        <div className="forgot-content">
          <h3 className="forgot-title">{t('forgot.titleEmail')}</h3>
          <form className="forgot-form" onSubmit={handleSubmitEmail}>
            <label className="forgot-label" htmlFor="forgot-email">{t('login.emailLabel')}</label>
            <input
              id="forgot-email"
              className="forgot-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('login.emailPlaceholder')}
              required
              autoFocus
              maxLength={255}
            />
            <button className="forgot-submit" type="submit" disabled={sending}>
              {sending ? t('forgot.sending') : t('forgot.sendCode')}
            </button>
            {statusText && <div className={`forgot-status forgot-status--${statusKind}`}>{statusText}</div>}
          </form>
        </div>
      )}

      {step === 'code' && (
        <div className="forgot-content">
          <h3 className="forgot-title">{t('forgot.enterCodeTitle')}</h3>
          <p style={{fontSize: '0.9rem', color: '#666', marginBottom: '1rem'}}>
            {t('forgot.sentTo', { email })}
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
          <h3 className="forgot-title">{t('forgot.setNewPassword')}</h3>
          <form className="forgot-form" onSubmit={handleResetPassword}>
            <label className="forgot-label" htmlFor="reset-password">{t('forgot.newPasswordLabel')}</label>
            <input
              id="reset-password"
              className="forgot-input"
              type="password"
              value={resetPw}
              onChange={e => setResetPw(e.target.value)}
              placeholder={t('forgot.enterNewPassword')}
              minLength={6}
              maxLength={50}
              required
              autoFocus
            />
            <label className="forgot-label" htmlFor="reset-password-repeat">{t('forgot.repeatPasswordLabel')}</label>
            <input
              id="reset-password-repeat"
              className="forgot-input"
              type="password"
              value={resetPwRepeat}
              onChange={e => setResetPwRepeat(e.target.value)}
              placeholder={t('forgot.repeatNewPassword')}
              minLength={6}
              maxLength={50}
              required
            />
            <button className="forgot-submit" type="submit" disabled={sending}>
              {sending ? t('forgot.saving') : t('forgot.saveNewPassword')}
            </button>
            {statusText && <div className={`forgot-status forgot-status--${statusKind}`}>{statusText}</div>}
          </form>
        </div>
      )}
    </div>
  );
}