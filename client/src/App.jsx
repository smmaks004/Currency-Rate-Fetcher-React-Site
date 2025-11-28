import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import PublicRoute from './components/PublicRoute';
import Home from './components/Home';
import PrivateRoute from './components/PrivateRoute'; ///
import AdminPage from './components/AdminPage';       ///
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


          {/* !!!! Example protected route: only Admin role can access /admin */}
          <Route path="/admin" element={
            <PrivateRoute allowedRoles={[ 'admin' ]}>
              <AdminPage />
            </PrivateRoute>
          } />

        </Routes>
      </div>
    </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
