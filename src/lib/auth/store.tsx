import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../email/api";
import { clearToken, getToken, setToken } from "./token";

export type Role = "MANAGER" | "TEAM_MEMBER";

export interface CurrentUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  teamId: string | null;
  isActive: boolean;
}

interface AuthContextValue {
  currentUser: CurrentUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api<{ user: CurrentUser }>("/api/auth/me");
        if (active) setCurrentUser(res.user);
      } catch {
        // api() already cleared the token / redirected on a 401.
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    try {
      const res = await api<{ token: string; user: CurrentUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setToken(res.token);
      setCurrentUser(res.user);
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError("Login failed");
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      // best-effort — clear locally regardless
    }
    clearToken();
    setCurrentUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    try {
      await api("/api/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (e) {
      throw e instanceof ApiError ? e : new ApiError("Could not change password");
    }
  }, []);

  const value = useMemo(
    () => ({ currentUser, loading, login, logout, changePassword }),
    [currentUser, loading, login, logout, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
