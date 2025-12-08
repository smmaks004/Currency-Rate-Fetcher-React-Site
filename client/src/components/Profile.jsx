import React, { useState } from 'react';
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

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState({ text: '', kind: null });
  const { t } = useTranslation();

  React.useEffect(() => {
    setFirstName(user?.FirstName || '');
    setLastName(user?.LastName || '');
    setEmail(user?.Email || '');
  }, [user]);


  const onSaveProfile = async () => {
    setMessage({ text: '', kind: null });
    if (!firstName && !lastName) {
      setMessage({ text: t('profile.provideName'), kind: 'error' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('http://localhost:4000/api/update/update-profile', {
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
    if (!password) { setPwMessage({ text: t('profile.passwordRequired'), kind: 'error' }); return; }
    if (password !== confirmPassword) { setPwMessage({ text: t('profile.passwordMismatch'), kind: 'error' }); return; }
    setPwSaving(true);
    try {
      const res = await fetch('http://localhost:4000/api/auth/change-password', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setPwMessage({ text: err && err.error ? err.error : t('profile.passwordChangeFailed'), kind: 'error' });
      } else {
        setPwMessage({ text: t('profile.passwordUpdated'), kind: 'success' });
        setShowPasswordForm(false);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (e) {
      setPwMessage({ text: t('profile.passwordChangeFailed'), kind: 'error' });
    } finally {
      setPwSaving(false);
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
                  <div className="profile-role"><strong>{t('profile.role')}:</strong> {user.Role || 'user'}</div>
                </div>

                <div className="profile-controls">
                  <button className="btn-ghost" onClick={() => { setEditing(true); setShowPasswordForm(false); }}>{t('profile.changeData')}</button>
                  <button className="btn-ghost" onClick={() => setShowPasswordForm(s => !s)}>{showPasswordForm ? t('profile.hidePassword') : t('profile.changePassword')}</button>
                </div>

                {showPasswordForm && (
                  <div className="pw-grid">
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.newPassword')}</div>
                      <input className="input-small" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                    </label>
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.confirmPassword')}</div>
                      <input className="input-small" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
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
                  <input className="input-small" value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
                </label>

                <label className="profile-field">
                  <div className="profile-label">{t('profile.lastName')}</div>
                  <input className="input-small" value={lastName} onChange={e => setLastName(e.target.value)} />
                </label>

                <label className="profile-field full-width">
                  <div className="profile-label">{t('profile.email')}</div>
                  <input className="input-medium" value={email} onChange={e => setEmail(e.target.value)} />
                </label>

                <div className="profile-role"><strong>{t('profile.role')}:</strong> {user.Role || 'user'}</div>

                <div className="btn-row">
                  <button className="btn-ghost" onClick={() => { setEditing(false); setFirstName(user?.FirstName || ''); setLastName(user?.LastName || ''); setEmail(user?.Email || ''); setMessage({ text: '', kind: null }); setShowPasswordForm(false); }}>{t('profile.cancel')}</button>
                  <button className="btn-primary" onClick={onSaveProfile} disabled={saving}>{saving ? t('profile.saving') : t('profile.save')}</button>
                </div>

                {showPasswordForm && (
                  <div className="pw-grid">
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.newPassword')}</div>
                      <input className="input-small" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                    </label>
                    <label className="profile-field">
                      <div className="profile-label">{t('profile.confirmPassword')}</div>
                      <input className="input-small" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    </label>
                    <div className="pw-actions">
                      <button className="btn-primary" onClick={onChangePassword} disabled={pwSaving}>{pwSaving ? t('profile.saving') : t('profile.savePassword')}</button>
                      {pwMessage.text && <div className={`pw-message ${pwMessage.kind === 'error' ? 'message--error' : 'message--success'}`}>{pwMessage.text}</div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p>{t('profile.loading')}</p>
        )}
      </div>

      {message.text && <div className={`message ${message.kind === 'error' ? 'message--error' : 'message--success'}`}>{message.text}</div>}

    </div>
  );
}
