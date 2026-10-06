import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { LoadingState } from '../components/ui/LoadingState';

export function AdminRoute(): JSX.Element {
  const { user, isLoading } = useAuth();
  if (isLoading) return <LoadingState label="Checking administrator access…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== 'admin') return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}
