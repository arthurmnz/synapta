import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  apiClient,
  getStoredToken,
  registerUnauthorizedListener,
  setStoredToken,
} from '../lib/apiClient';
import type { LoginPayload, RegisterPayload, UserOut } from '../types/api';

interface AuthContextValue {
  user: UserOut | null;
  token: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (payload: LoginPayload) => Promise<UserOut>;
  register: (payload: RegisterPayload) => Promise<UserOut>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserOut | null>(null);
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [isLoading, setIsLoading] = useState<boolean>(() => Boolean(getStoredToken()));

  const logout = useCallback(() => {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    registerUnauthorizedListener(() => {
      logout();
    });
    return () => {
      registerUnauthorizedListener(null);
    };
  }, [logout]);

  const refreshUser = useCallback(async () => {
    const activeToken = getStoredToken();
    if (!activeToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const me = await apiClient.me();
      setUser(me);
      setToken(activeToken);
    } catch {
      setStoredToken(null);
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (token) {
      void refreshUser();
    } else {
      setIsLoading(false);
    }
    // Only validate initial stored token on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = useCallback(async (payload: LoginPayload): Promise<UserOut> => {
    const res = await apiClient.login(payload);
    setStoredToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (payload: RegisterPayload): Promise<UserOut> => {
    const res = await apiClient.register(payload);
    setStoredToken(res.access_token);
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: Boolean(user && token),
        login,
        register,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth deve ser utilizado dentro de AuthProvider');
  }
  return ctx;
}
