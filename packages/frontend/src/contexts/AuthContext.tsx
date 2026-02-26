"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/constants";

interface User {
  id: number;
  email: string;
  role: "user" | "admin";
  displayName: string | null;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    displayName?: string,
  ) => Promise<void>;
  logout: () => void;
  loginWithGoogle: () => void;
  loginWithGitHub: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Refresh interval: 14 minutes (access token expires at 15 min)
const REFRESH_INTERVAL_MS = 14 * 60 * 1000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Start auto-refresh timer when user is logged in
  const startRefreshTimer = useCallback(() => {
    // Clear any existing timer
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
    }

    refreshTimerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${API_URL}/api/auth/refresh`, {
          method: 'POST',
          credentials: 'include',
        });
        if (!res.ok) {
          // Refresh failed - session expired
          if (refreshTimerRef.current) {
            clearInterval(refreshTimerRef.current);
            refreshTimerRef.current = null;
          }
          setUser(null);
        }
      } catch {
        // Network error - stop refreshing
        if (refreshTimerRef.current) {
          clearInterval(refreshTimerRef.current);
          refreshTimerRef.current = null;
        }
        setUser(null);
      }
    }, REFRESH_INTERVAL_MS);
  }, []);

  const stopRefreshTimer = useCallback(() => {
    if (refreshTimerRef.current) {
      clearInterval(refreshTimerRef.current);
      refreshTimerRef.current = null;
    }
  }, []);

  // Check session on mount via /api/auth/me (cookies sent automatically)
  useEffect(() => {
    api.getProfile()
      .then((userData) => {
        setUser(userData);
        setLoading(false);
      })
      .catch(() => {
        setUser(null);
        setLoading(false);
      });
  }, []);

  // Manage refresh timer based on user state
  useEffect(() => {
    if (user) {
      startRefreshTimer();
    } else {
      stopRefreshTimer();
    }

    return () => {
      stopRefreshTimer();
    };
  }, [user, startRefreshTimer, stopRefreshTimer]);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const { user: userData } = await api.login(email, password);
      setUser(userData);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const signup = async (
    email: string,
    password: string,
    displayName?: string,
  ) => {
    setError(null);
    try {
      const { user: userData } = await api.signup(email, password, displayName);
      setUser(userData);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const logout = async () => {
    await api.logout();
    setUser(null);
    router.push("/");
  };

  const loginWithGoogle = () => {
    window.location.href = `${API_URL}/api/auth/google`;
  };

  const loginWithGitHub = () => {
    window.location.href = `${API_URL}/api/auth/github`;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        signup,
        logout,
        loginWithGoogle,
        loginWithGitHub,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
