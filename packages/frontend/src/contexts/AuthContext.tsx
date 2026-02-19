"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  // Check if user is logged in on mount
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      api.getProfile()
        .then((userData) => {
          setUser(userData);
          setLoading(false);
        })
        .catch(() => {
          localStorage.removeItem("auth_token");
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  // Listen for storage changes (logout from other tabs or components)
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "auth_token" && !e.newValue) {
        // Token was removed
        setUser(null);
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const { token, user: userData } = await api.login(email, password);
      localStorage.setItem("auth_token", token);
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
      const { token, user: userData } = await api.signup(email, password, displayName);
      localStorage.setItem("auth_token", token);
      setUser(userData);
    } catch (err) {
      setError((err as Error).message);
      throw err;
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
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
