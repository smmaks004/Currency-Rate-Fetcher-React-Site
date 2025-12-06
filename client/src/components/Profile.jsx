import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const [message, setMessage] = useState('');

  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState('');

  React.useEffect(() => {
    setFirstName(user?.FirstName || '');
    setLastName(user?.LastName || '');
    setEmail(user?.Email || '');
  }, [user]);


  const onSaveProfile = async () => {
    setMessage('');
    if (!firstName && !lastName) {
      setMessage('Provide at least first or last name');
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
        setMessage(err && err.error ? err.error : 'Update failed');
      } else {
        await refreshUser();
        setMessage('Profile updated');
        setEditing(false);
      }
    } catch (e) {
      setMessage('Update failed');
    } finally {
      setSaving(false);
    }
  };


  const onChangePassword = async () => {
    setPwMessage('');
    if (!password) { setPwMessage('Password required'); return; }
    if (password !== confirmPassword) { setPwMessage('Passwords do not match'); return; }
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
        setPwMessage(err && err.error ? err.error : 'Password change failed');
      } else {
        setPwMessage('Password updated');
        setShowPasswordForm(false);
        setPassword('');
        setConfirmPassword('');
      }
    } catch (e) {
      setPwMessage('Password change failed');
    } finally {
      setPwSaving(false);
    }
  };

  
  return (
    <div className="main-card profile-card">
      <div className="profile-header">
        <h2>Profile</h2>
        <div>
          <button className="btn-ghost" onClick={() => navigate(-1)}>Back</button>
        </div>
      </div>

      <div className="profile-body">
        {user ? (
          <div className="profile-grid">
            {!editing ? (
              // Read-only view
              <>
                <div className="profile-read">
                  <div><strong className="profile-label">First Name:</strong> <span className="profile-value">{firstName || '—'}</span></div>
                  <div><strong className="profile-label">Last Name:</strong> <span className="profile-value">{lastName || '—'}</span></div>
                  <div><strong className="profile-label">Email:</strong> <span className="profile-value">{email || '—'}</span></div>
                  <div className="profile-role"><strong>Role:</strong> {user.Role || 'user'}</div>
                </div>

                <div className="profile-controls">
                  <button className="btn-ghost" onClick={() => { setEditing(true); setShowPasswordForm(false); }}>Change Profile Data</button>
                  <button className="btn-ghost" onClick={() => setShowPasswordForm(s => !s)}>{showPasswordForm ? 'Hide Password' : 'Change Password'}</button>
                </div>

                {showPasswordForm && (
                  <div className="pw-grid">
                    <label className="profile-field">
                      <div className="profile-label">New Password</div>
                      <input className="input-small" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                    </label>
                    <label className="profile-field">
                      <div className="profile-label">Confirm Password</div>
                      <input className="input-small" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    </label>
                    <div className="pw-actions">
                      <button className="btn-primary" onClick={onChangePassword} disabled={pwSaving}>{pwSaving ? 'Saving...' : 'Save Password'}</button>
                      {pwMessage && <div className={`pw-message ${pwMessage.includes('failed') ? 'message--error' : 'message--success'}`}>{pwMessage}</div>}
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Editing view */
              <>
                <label className="profile-field">
                  <div className="profile-label">First Name</div>
                  <input className="input-small" value={firstName} onChange={e => setFirstName(e.target.value)} autoFocus />
                </label>

                <label className="profile-field">
                  <div className="profile-label">Last Name</div>
                  <input className="input-small" value={lastName} onChange={e => setLastName(e.target.value)} />
                </label>

                <label className="profile-field full-width">
                  <div className="profile-label">Email</div>
                  <input className="input-medium" value={email} onChange={e => setEmail(e.target.value)} />
                </label>

                <div className="profile-role"><strong>Role:</strong> {user.Role || 'user'}</div>

                <div className="btn-row">
                  <button className="btn-ghost" onClick={() => { setEditing(false); setFirstName(user?.FirstName || ''); setLastName(user?.LastName || ''); setEmail(user?.Email || ''); setMessage(''); setShowPasswordForm(false); }}>Cancel</button>
                  <button className="btn-primary" onClick={onSaveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
                </div>

                {showPasswordForm && (
                  <div className="pw-grid">
                    <label className="profile-field">
                      <div className="profile-label">New Password</div>
                      <input className="input-small" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                    </label>
                    <label className="profile-field">
                      <div className="profile-label">Confirm Password</div>
                      <input className="input-small" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
                    </label>
                    <div className="pw-actions">
                      <button className="btn-primary" onClick={onChangePassword} disabled={pwSaving}>{pwSaving ? 'Saving...' : 'Save Password'}</button>
                      {pwMessage && <div className={`pw-message ${pwMessage.includes('failed') ? 'message--error' : 'message--success'}`}>{pwMessage}</div>}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p>Loading user data...</p>
        )}
      </div>


      {message && <div className={`message ${message.includes('failed') ? 'message--error' : 'message--success'}`}>{message}</div>}

    </div>
  );
}
