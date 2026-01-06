/*
Authentication & Performance Layer
This Context centralizes the user's login status and role data for the entire app
It performs a single secure check on load, caching the user object in memory
*/
import React, { createContext, useContext, useState, useEffect, useRef } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const didRunRef = useRef(false);


  // Run the auth check only once when the app first loads (on full page refresh).
  useEffect(() => {

    // Remove unnecessary double execution
    // if (didRunRef.current) return;
    // didRunRef.current = true;
    const checkUser = async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const userData = await res.json();
          setUser(userData);
        } else {
          setUser(null);
        }
      } catch (err) {
        console.error('Auth check failed', err);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  // Login: accept server response and optionally refresh authoritative user by calling /api/auth/me (reads httpOnly cookie)
  // This helps to avoid racey or duplicated fetches from multiple components
  const login = async (userData, { refresh = true } = {}) => {
    setUser(userData); // Optimistic set from login response (because it is first)

    if (refresh) {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (res.ok) {
          const u = await res.json();
          setUser(u);
        }
      } catch (err) {
        console.warn('AuthContext: refresh after login failed', err);
      }
    }
  };

  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.ok) {
        const u = await res.json();
        setUser(u);
        return u;
      }
    } catch (err) {
      console.warn('AuthContext: refreshUser failed', err);
    }
    
    return null; // Force-refresh user info from server (used after updates)
  };

  // Logout: call server and clear local user
  const logout = async () => {
    try {
        await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch(e) { }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);