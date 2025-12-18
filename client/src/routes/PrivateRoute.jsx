import React from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../components/AuthContext'; // Import the auth hook

export default function PrivateRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();
  const { t } = useTranslation();

    if (loading) {
      return <div>{t('routes.loading')}</div>;
    }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
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