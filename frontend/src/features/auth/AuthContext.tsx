import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, setUnauthorizedHandler, tokenStore } from "../../services/api";
import type { User } from "../../types/api";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(() => tokenStore.get());

  const me = useQuery({ queryKey: ["me", token], queryFn: api.me, enabled: !!token, retry: false });

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => setUnauthorizedHandler(logout), [logout]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await api.login(email, password);
      tokenStore.set(res.access_token);
      queryClient.setQueryData(["me", res.access_token], res.user);
      setToken(res.access_token);
      return res.user;
    },
    [queryClient],
  );

  const value = useMemo<AuthState>(
    () => ({ user: token ? (me.data ?? null) : null, loading: !!token && me.isPending, login, logout }),
    [token, me.data, me.isPending, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
