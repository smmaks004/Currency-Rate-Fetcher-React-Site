import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import './Header.css';

export default function Header() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

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
        <Link to="/" className="brand" style={{ color: '#cbd5e1', textDecoration: 'none' }}>Exchange Explorer</Link>
        {user && (
          <div className="nav-tab">
            <Link to="/currencies_management" className="btn-link" style={{ color: '#cbd5e1', textDecoration: 'none' }}>
              Currency management
            </Link>
          </div>
        )}
      </div>
      <div className="top-actions">
        {user ? (
          <div className="user-block" ref={userMenuRef}>
            <span className="user-label"><strong>{`${user.FirstName || ''} ${user.LastName || ''}`.trim()}</strong></span>
            <button
              className="btn-link"
              aria-haspopup="true"
              aria-expanded={showUserMenu}
              onClick={(e) => { e.stopPropagation(); setShowUserMenu(s => !s); }}
              title="User menu"
            >
              ▾
            </button>

            {showUserMenu && (
              <div className="user-menu" role="menu">
                <button className="btn-plain" onClick={() => { setShowUserMenu(false); navigate('/profile'); }}>Profile</button>
                <button className="btn-plain" onClick={() => { setShowUserMenu(false); handleLogout(); }}>Logout</button>
              </div>
            )}
          </div>
        ) : (
          <button className="btn-primary" onClick={() => navigate('/login')}>Login</button>
        )}
      </div>
    </header>
  );
}
