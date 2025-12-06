import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './Login.css';
import { useAuth } from './AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) return setError('Please enter email');
    if (!password) return setError('Please enter password');

    setLoading(true);
    try {
      const resp = await fetch(`http://localhost:4000/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        
        // Backend returns { error: 'msg' } on failure
        const msg = data && data.error ? data.error : 'Login failed';
        setError(msg);
        setLoading(false);
        return;
      }

      // Success: backend returns safe user object (server also sets httpOnly token cookie)
      // Update global auth state; 'login' will also refresh /api/auth/me by default
      /// CHECK
      await login(data);
      //await login(data, { refresh: false });



      setLoading(false);
      navigate('/');

    } catch (err) {
      console.error('Login request failed', err);
      const msg = err && err.message ? err.message : 'Network error, please try again';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-box" onSubmit={handleSubmit}>
        <h2>Login</h2>

        <div className="input-group">
          <label>Email</label>
          <input
            type="email"
            placeholder="Enter email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            aria-label="email"
          />
        </div>

        <div className="input-group">
          <label>Password</label>
          <input
            type="password"
            placeholder="Enter password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            aria-label="password"
          />
        </div>

        {error && <p className="error">{error}</p>}

        <button type="submit" className="login-btn" disabled={loading}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
        <p className="forgot-password">Forgot password?</p>
      </form>
    </div>
  );
}
