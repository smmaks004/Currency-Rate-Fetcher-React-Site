import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext'; // Import the auth hook

export default function PrivateRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();

    if (loading) {
      return <div>Loading...</div>;
    }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Role check
  const userRole = (user.Role || user.role || '').toLowerCase(); 
  
  if (allowedRoles.length > 0) {
      const hasRole = allowedRoles.some(role => role.toLowerCase() === userRole);
      if (!hasRole) {
          return <Navigate to="/" replace />;
      }
  }

  return children;
}