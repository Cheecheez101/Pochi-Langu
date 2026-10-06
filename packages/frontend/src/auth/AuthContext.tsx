import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type User } from '../api/client';

interface AuthContextValue {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  login: (phone: string, password: string) => Promise<void>;
  register: (displayName: string, phone: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getCurrentUser()
      .then(({ user: currentUser }) => setUser(currentUser))
      .catch(() => setUser(null))
      .finally(() => setIsLoading(false));
  }, []);

  const login = useCallback(async (phone: string, password: string) => {
    setError(null);
    try {
      const response = await api.login(phone, password);
      setUser(response.user);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to sign in.';
      setError(message);
      throw cause;
    }
  }, []);

  const register = useCallback(async (displayName: string, phone: string, password: string) => {
    setError(null);
    try {
      const response = await api.register(displayName, phone, password);
      setUser(response.user);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to create your account.';
      setError(message);
      throw cause;
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    try {
      await api.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, isLoading, error, login, register, logout }),
    [user, isLoading, error, login, register, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
}
