import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

// PublicRoute: renders children only for NOT-authenticated users.

export default function PublicRoute({ children, redirectTo = '/' }) {
  const { user, loading } = useAuth();

  if (loading) return null;

  return user ? <Navigate to={redirectTo} replace /> : children;
}
