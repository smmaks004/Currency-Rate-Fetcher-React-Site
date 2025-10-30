import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './login.css';

export default function Login() {
  const [email, setEmail] = useState('');       // State for email input (default empty)
  const [password, setPassword] = useState('');  // State for password input (default empty)
  const [error, setError] = useState('');        
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();

    // No server-side authentication right now
    // navigate('/');
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
        />
    </div>

    {error && <p className="error">{error}</p>}

        <button type="submit" className="login-btn">Log in</button>
        <p className="forgot-password">Forgot password?</p>
      </form>
    </div>
  );
}
