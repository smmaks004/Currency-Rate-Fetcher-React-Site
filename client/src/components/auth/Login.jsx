import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import './Login.css';
import { useAuth } from '../AuthContext';

import ForgotPassword from './ForgotPassword'; ////

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { t } = useTranslation();

  const [showForgot, setShowForgot] = useState(false); ///


  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) return setError(t('login.errorEmailRequired'));
    if (!password) return setError(t('login.errorPasswordRequired'));

    setLoading(true);
    try {
      const resp = await fetch(`/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        // Backend returns { error: 'msg' } on failure
        const msg = data && data.error ? data.error : t('login.loginFailed');
        setError(msg);
        setLoading(false);
        return;
      }

      // Success: backend returns safe user object (server also sets httpOnly token cookie)
      // Update global auth state; 'login' will also refresh /api/auth/me by default
      await login(data);

      setLoading(false);
      navigate('/');

    } catch (err) {
      console.error('Login request failed', err);
      const msg = err && err.message ? err.message : t('login.networkError');
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      {showForgot ? (
        <ForgotPassword
          onBack={() => setShowForgot(false)}
          onSubmitEmail={() => {
            // Placeholder: real sending will be added later
          }}
        />
      ) : (
        <form className="login-box" onSubmit={handleSubmit}>
          <div className="login-top">
            <button
              type="button"
              className="login-back"
              onClick={() => navigate('/')}
            >
              {t('profile.back')}
            </button>
          </div>
          <h2>{t('login.title')}</h2>

          <div className="input-group">
            <label>{t('login.emailLabel')}</label>
            <input
              type="email"
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-label="email"
              maxLength={255}
            />
          </div>

          <div className="input-group">
            <label>{t('login.passwordLabel')}</label>
              <input
                type="password"
                placeholder={t('login.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-label="password"
                maxLength={50}
              />
          </div>

          {error && <p className="error">{error}</p>}

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? t('login.loading') : t('login.submit')}
          </button>
          <p
            className="forgot-password"
            role="button"
            tabIndex={0}
            onClick={() => setShowForgot(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShowForgot(true);
            }}
          >
            {t('login.forgot')}
          </p>
        </form>
      )}
    </div>
  );
}
