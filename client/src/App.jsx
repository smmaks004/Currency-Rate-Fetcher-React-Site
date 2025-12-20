import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import PrivateRoute from './routes/PrivateRoute';
import PublicRoute from './routes/PublicRoute';

import Login from './components/auth/Login';
import Home from './components/Home';
import Profile from './components/Profile';
import CurrencyManagement from './components/currencies_management/CurrencyManagement';
import MarginManagement from './components/margin_management/MarginManagement'; //////////
import AdminManagement from './components/admin_management/AdminManagement';
import './App.css';

import { AuthProvider } from './components/AuthContext'; ///
import { RatesProvider } from './contexts/RatesContext'; ///

function App() {
  return (
    <AuthProvider>
    <RatesProvider>
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/auth/login" element={
            <PublicRoute redirectTo="/">
              <Login />
            </PublicRoute>
          } />


          <Route path="/" element={<Home />} />


          <Route path="/currencies_management" element={
            <PrivateRoute>
              <CurrencyManagement />
            </PrivateRoute>
          } />

          <Route path="/margin_management" element={
            <PrivateRoute>
              <MarginManagement />
            </PrivateRoute>
          } />

          <Route path="/admin_management" element={
            <PrivateRoute>
              <AdminManagement />
            </PrivateRoute>
          } />


          <Route path="/profile" element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } />

        </Routes>
      </div>
    </BrowserRouter>
    </RatesProvider>
    </AuthProvider>
  );
}

export default App;
