import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import PublicRoute from './components/PublicRoute';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute'; ///
import Profile from './components/Profile';
import CurrencyManagement from './components/currencies_management/CurrencyManagement';
import MarginManagement from './components/margin_management/MarginManagement'; //////////
import './App.css';

import { AuthProvider } from './components/AuthContext'; ///

function App() {
  return (
    <AuthProvider>
    <BrowserRouter>
      <div className="app-container">
        <Routes>
          <Route path="/login" element={
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


          <Route path="/profile" element={
            <PrivateRoute>
              <Profile />
            </PrivateRoute>
          } />

        </Routes>
      </div>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
