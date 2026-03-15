"use client";

import React, { createContext, useContext } from "react";

// =============================================================================
// AUTH BYPASSED: Single-user mode (v4.0)
// Always provides a mock admin user. No login/logout/refresh.
// =============================================================================

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

const MOCK_USER: User = {
  id: 1,
  email: "local@espn-agent.local",
  role: "admin",
  displayName: "Local User",
  avatarUrl: null,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const noop = async () => {};

  return (
    <AuthContext.Provider
      value={{
        user: MOCK_USER,
        loading: false,
        error: null,
        login: noop,
        signup: noop,
        logout: () => {},
        loginWithGoogle: () => {},
        loginWithGitHub: () => {},
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
