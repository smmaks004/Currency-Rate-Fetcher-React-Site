import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import './Home.css';
import './Profile.css';

export default function Profile() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [editing, setEditing] = useState(false);
  const [firstName, setFirstName] = useState(user?.FirstName || '');
  const [lastName, setLastName] = useState(user?.LastName || '');
  const [email, setEmail] = useState(user?.Email || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: '', kind: null });
  const [fieldErrors, setFieldErrors] = useState({});

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState({ text: '', kind: null });
  const [pwFieldErrors, setPwFieldErrors] = useState({});
  const { t } = useTranslation();

  const displayRole = (user && typeof user.Role === 'string' && user.Role.trim())
    ? user.Role.charAt(0).toUpperCase() + user.Role.slice(1).toLowerCase()
    : 'User';

  // AI chat (Ollama)
  const [aiMessages, setAiMessages] = useState([
    { role: 'system', content: 'You are a helpful assistant.' }
  ]);
  const [aiInput, setAiInput] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState('');

  const aiWordQueueRef = useRef([]);
  const aiFlushTimerRef = useRef(null);


  useEffect(() => {
    return () => {
      if (aiFlushTimerRef.current) {
        clearInterval(aiFlushTimerRef.current);
        aiFlushTimerRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    setFirstName(user?.FirstName || '');
    setLastName(user?.LastName || '');
    setEmail(user?.Email || '');
  }, [user]);


  const onSaveProfile = async () => {
    setMessage({ text: '', kind: null });
    setFieldErrors({});

    const errs = {};
    if (!String(firstName || '').trim()) errs.firstName = 'First name is required';
    if (!String(lastName || '').trim()) errs.lastName = 'Last name is required';
    if (!String(email || '').trim()) errs.email = 'Email is required';

    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/update/update-profile', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ firstName, lastName, email })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setMessage({ text: err && err.error ? err.error : t('profile.updateFailed'), kind: 'error' });
      } else {
        await refreshUser();
        setMessage({ text: t('profile.profileUpdated'), kind: 'success' });
        setEditing(false);
      }
    } catch (e) {
      setMessage({ text: t('profile.updateFailed'), kind: 'error' });
    } finally {
      setSaving(false);
    }
  };


  const onChangePassword = async () => {
    setPwMessage({ text: '', kind: null });
    setPwFieldErrors({});

    const errs = {};
    if (!String(password || '').trim()) errs.password = 'Password is required';
    if (!String(confirmPassword || '').trim()) errs.confirmPassword = 'Please confirm password';
    if (password && confirmPassword && password !== confirmPassword) errs.confirmPassword = 'Passwords do not match';
    
    if (password && password.length < 6) errs.password = 'Password must be at least 6 characters long';

    const hasDigitOrSymbol = /[0-9!@#$%^&*()_+\-=[\]{};':"\\|,.<>\/\?]/.test(password || '');
    if (password && !hasDigitOrSymbol) errs.password = 'Password must include at least one digit or special character';

    if (Object.keys(errs).length > 0) {
      setPwFieldErrors(errs);
      return;
    }

    setPwSaving(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPwMessage({ text: err && err.error ? err.error : 'Failed to change password', kind: 'error' });
      } else {
        setPwMessage({ text: 'Password updated', kind: 'success' });
        setShowPasswordForm(false);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (e) {
      setPwMessage({ text: 'Failed to change password', kind: 'error' });
    } finally {
      setPwSaving(false);
    }
  };

  const handleUnauthorized = async (setErr, fallbackPrefix = 'Unauthorized') => {
    setErr(`${fallbackPrefix}: please log in again.`);
    try { await refreshUser(); } catch { /* ignore */ }
    navigate('/auth/login');
  };

  const onSendAi = async () => {
    const text = aiInput.trim();
    if (!text || aiSending) return;

    setAiError('');
    setAiSending(true);

    const assistantId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const nextMessages = [...aiMessages, { role: 'user', content: text }, { role: 'assistant', content: '', id: assistantId }];
    setAiMessages(nextMessages);
    setAiInput('');

    const tokenize = (s) => (typeof s === 'string' ? s.split(/(\s+)/).filter(Boolean) : []);

    const ensureFlushTimer = () => {
      if (aiFlushTimerRef.current) return;
      aiFlushTimerRef.current = setInterval(() => {
        const part = aiWordQueueRef.current.shift();
        if (!part) {
          // Stop timer if nothing to flush
          clearInterval(aiFlushTimerRef.current);
          aiFlushTimerRef.current = null;
          return;
        }

        setAiMessages((prev) => prev.map((m) => {
          if (m && m.id === assistantId) return { ...m, content: (m.content || '') + part };
          return m;
        }));
      }, 35);
    };

    try {
      const res = await fetch('/api/ai/chat-stream', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextMessages.filter((m) => m.role !== 'assistant' || m.id !== assistantId) })
      });

      if (res.status === 401) {
        const err = await res.json().catch(() => null);
        const msg = err && err.error ? err.error : 'Unauthorized';
        await handleUnauthorized(setAiError, msg);
        return;
      }

      if (!res.ok || !res.body) {
        const bodyText = await res.text().catch(() => '');
        setAiError(bodyText || 'AI request failed');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buf = '';
      let sawAnyDelta = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        while (true) {
          const nl = buf.indexOf('\n');
          if (nl === -1) break;

          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;

          let obj = null;
          try { obj = JSON.parse(line); } catch { obj = null; }
          if (!obj) continue;

          if (obj.error) {
            setAiError(typeof obj.details === 'string' && obj.details ? `${obj.error}: ${obj.details}` : obj.error);
            return;
          }

          if (obj.delta) {
            sawAnyDelta = true;
            aiWordQueueRef.current.push(...tokenize(obj.delta));
            ensureFlushTimer();
          }

          if (obj.done) {
            // Keep flushing remaining queue
            ensureFlushTimer();
            break;
          }
        }
      }

      if (!sawAnyDelta) {
        setAiMessages((prev) => prev.map((m) => {
          if (m && m.id === assistantId) return { ...m, content: '(empty response)' };
          return m;
        }));
      }
    } catch (e) {
      setAiError('Network error while contacting AI');
    } finally {
      setAiSending(false);
    }
  };

  return (
    <div className="main-card profile-card">
      <div className="profile-header">
        <h2>{t('profile.title')}</h2>
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>{t('profile.back')}</button>
        </div>
      </div>

      <div className="profile-body">
        {user ? (
          <div className="profile-grid">
            {!editing ? (
              // Read-only view
              <>
                <div className="profile-read">
                  <div><strong className="profile-label">{t('profile.firstName')}:</strong> <span className="profile-value">{firstName || '—'}</span></div>
                  <div><strong className="profile-label">{t('profile.lastName')}:</strong> <span className="profile-value">{lastName || '—'}</span></div>
                  <div><strong className="profile-label">{t('profile.email')}:</strong> <span className="profile-value">{email || '—'}</span></div>
                  <div><strong className="profile-label">{t('profile.role')}:</strong> <span className="profile-value">{displayRole || '—'}</span></div>
                </div>

                <div className="profile-controls">
                  <button className="btn-ghost" onClick={() => { setEditing(true); setShowPasswordForm(false); }}>{t('profile.changeData')}</button>
                  <button className="btn-ghost" onClick={() => setShowPasswordForm(s => !s)}>{showPasswordForm ? t('profile.hidePassword') : t('profile.changePassword')}</button>
                </div>

                {showPasswordForm && (
                  <div className="pw-grid">
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.newPassword')}</div>
                      <input className="input-small" type="password" value={password} onChange={e => { setPassword(e.target.value); setPwFieldErrors(prev => ({ ...prev, password: '' })); }} maxLength={50} />
                      {pwFieldErrors.password && <div className="pw-message message--error">{pwFieldErrors.password}</div>}
                    </label>
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.confirmPassword')}</div>
                      <input className="input-small" type="password" value={confirmPassword} onChange={e => { setConfirmPassword(e.target.value); setPwFieldErrors(prev => ({ ...prev, confirmPassword: '' })); }} maxLength={50} />
                      {pwFieldErrors.confirmPassword && <div className="pw-message message--error">{pwFieldErrors.confirmPassword}</div>}
                    </label>
                    <div className="pw-actions">
                      <button className="btn-primary" onClick={onChangePassword} disabled={pwSaving}>{pwSaving ? t('profile.saving') : t('profile.savePassword')}</button>
                      {pwMessage.text && <div className={`pw-message ${pwMessage.kind === 'error' ? 'message--error' : 'message--success'}`}>{pwMessage.text}</div>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Editing view */
              <>
                <label className="profile-field">
                  <div className="profile-label">{t('profile.firstName')}</div>
                  <input
                    className="input-small"
                    value={firstName}
                    onChange={e => { setFirstName(e.target.value); setFieldErrors(prev => ({ ...prev, firstName: '' })); }}
                    autoFocus
                    maxLength={50}
                  />
                  {fieldErrors.firstName && <div className="message--error">{fieldErrors.firstName}</div>}
                </label>

                <label className="profile-field">
                  <div className="profile-label">{t('profile.lastName')}</div>
                  <input
                    className="input-small"
                    value={lastName}
                    onChange={e => { setLastName(e.target.value); setFieldErrors(prev => ({ ...prev, lastName: '' })); }}
                    maxLength={50}
                  />
                  {fieldErrors.lastName && <div className="message--error">{fieldErrors.lastName}</div>}
                </label>

                <label className="profile-field full-width">
                  <div className="profile-label">{t('profile.email')}</div>
                  <input
                    className="input-medium"
                    value={email}
                    onChange={e => { setEmail(e.target.value); setFieldErrors(prev => ({ ...prev, email: '' })); }}
                  />
                  {fieldErrors.email && <div className="message--error">{fieldErrors.email}</div>}
                </label>

                <div className="profile-role">
                  <strong style={{ color: "#cfe1ff" }}>{t('profile.role')}: </strong> 
                  {displayRole}
                </div>

                <div className="btn-row">
                  <button className="btn-ghost" onClick={() => { setEditing(false); setFirstName(user?.FirstName || ''); setLastName(user?.LastName || ''); setEmail(user?.Email || ''); setMessage({ text: '', kind: null }); setShowPasswordForm(false); }}>{t('profile.cancel')}</button>
                  <button className="btn-primary" onClick={onSaveProfile} disabled={saving}>{saving ? t('profile.saving') : t('profile.save')}</button>
                </div>

                {showPasswordForm && (
                  <div className="pw-grid">
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.newPassword')}</div>
                      <input className="input-small" type="password" value={password} onChange={e => setPassword(e.target.value)} maxLength={50} />
                    </label>
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.confirmPassword')}</div>
                      <input className="input-small" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} maxLength={50} />
                    </label>
                    <div className="pw-actions">
                      <button className="btn-primary" onClick={onChangePassword} disabled={pwSaving}>{pwSaving ? t('profile.saving') : t('profile.savePassword')}</button>
                      {pwMessage.text && <div className={`pw-message ${pwMessage.kind === 'error' ? 'message--error' : 'message--success'}`}>{pwMessage.text}</div>}
                    </div>
                  </div>
                )}
              </>
            )}









            <div className="ai-chat">
              <h3 className="ai-chat-title">AI chat (Ollama)</h3>

              <div className="ai-chat-log" role="log" aria-label="Chat messages">
                {aiMessages.filter((m) => m.role !== 'system').map((m, idx) => (
                  <div key={idx} className={`ai-chat-line ai-chat-line--${m.role}`}>
                    <strong className="ai-chat-role">{m.role === 'user' ? 'You' : 'Assistant'}:</strong>
                    <span className="ai-chat-content">{m.content}</span>
                  </div>
                ))}
              </div>

              <div className="ai-chat-controls">
                <textarea
                  className="input-medium ai-chat-input"
                  rows={3}
                  value={aiInput}
                  onChange={(e) => setAiInput(e.target.value)}
                  placeholder="Write a message…"
                  disabled={aiSending}
                />

                <div className="ai-chat-actions">
                  <button className="btn-primary" onClick={onSendAi} disabled={aiSending || !aiInput.trim()}>
                    {aiSending ? 'Sending…' : 'Send'}
                  </button>
                  <button
                    className="btn-ghost"
                    onClick={() => { setAiMessages([{ role: 'system', content: 'You are a helpful assistant.' }]); setAiError(''); }}
                    disabled={aiSending}
                  >
                    Clear chat
                  </button>
                </div>
              </div>

              {aiError && <div className="message message--error">{aiError}</div>}
            </div>
          </div>
        ) : (
          <p>{t('profile.loading')}</p>
        )}
      </div>

      {message.text && <div className={`message ${message.kind === 'error' ? 'message--error' : 'message--success'}`}>{message.text}</div>}

    </div>
  );
}
