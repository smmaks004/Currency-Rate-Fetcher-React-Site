import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './AuthContext';
import './Header.css';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);
  const { t, i18n } = useTranslation();

  const handleLogout = async () => {
    try { await logout(); } catch (e) { console.warn('Logout failed', e); }
  };

  useEffect(() => {
    const onDocClick = (e) => {
      if (!showUserMenu) return;
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setShowUserMenu(false); };
    window.addEventListener('click', onDocClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', onDocClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [showUserMenu]);



  return (
    <header className="topbar">
      <div className="brand-and-nav" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <Link to="/" className="brand" style={{ color: '#cbd5e1', textDecoration: 'none' }}>{t('header.brand')}</Link>
        {user && (
          <div className="nav-tabs">
            <Link to="/currencies_management" className="btn-link" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              {t('header.currencyManagement')}
            </Link>

            <Link to="/margin_management" className="btn-link" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Margin management
            </Link>

            <Link to="/admin_management" className="btn-link" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Admin Management
            </Link>
          </div>
          
        )}
      </div>
      <div className="top-actions">
        <div className="lang-switch" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginRight: '12px' }}>
          <span className="lang-label" aria-hidden="true" style={{ color: '#cbd5e1', fontSize: '12px' }}>{t('header.language')}</span>
          <div style={{ display: 'flex', gap: '4px' }}>
            {['en', 'lv'].map((lng) => (
              <button
                key={lng}
                className={`btn-link ${i18n.language === lng ? 'active' : ''}`}
                onClick={() => i18n.changeLanguage(lng)}
                aria-label={t('header.switchTo', { lng: lng.toUpperCase() })}
              >
                {lng.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {user ? (
          <div className="user-block" ref={userMenuRef}>
            <span className="user-label"><strong>{`${user.FirstName || ''} ${user.LastName || ''}`.trim()}</strong></span>
            <button
              className="btn-link"
              aria-haspopup="true"
              aria-expanded={showUserMenu}
              onClick={(e) => { e.stopPropagation(); setShowUserMenu(s => !s); }}
              title={t('header.userMenu')}
            >
              ▾
            </button>

            {showUserMenu && (
              <div className="user-menu" role="menu">
                <button className="btn-plain" onClick={() => { setShowUserMenu(false); navigate('/profile'); }}>{t('header.profile')}</button>
                <button className="btn-plain" onClick={() => { setShowUserMenu(false); handleLogout(); }}>{t('header.logout')}</button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn-primary" onClick={() => navigate('/auth/login')}>{t('header.login')}</button>
        )}
      </div>
    </header>
  );
}
