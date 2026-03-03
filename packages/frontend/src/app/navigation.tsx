"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X, Zap } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/cn";

export function Navigation() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const { user, logout: authLogout } = useAuth();

  const isLoggedIn = !!user;
  const isAdmin = user?.role === "admin";

  const isActive = (path: string) => {
    if (path === "/") return pathname === "/";
    return pathname.startsWith(path);
  };

  const handleLogout = () => {
    authLogout();
  };

  const navLinks = [
    { href: "/", label: "Home" },
    ...(isLoggedIn ? [{ href: "/leagues", label: "Leagues" }] : []),
    ...(isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  return (
    <nav
      aria-label="Main navigation"
      role="navigation"
      className="bg-white border-b border-neutral-200 sticky top-0 z-50"
    >
      <div className="max-w-content-wide mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Logo/Brand */}
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-2xl">&#9918;</span>
              <span className="text-lg sm:text-xl font-bold text-content hidden sm:inline">
                ESPN Fantasy Baseball Assistant
              </span>
              <span className="text-lg font-bold text-content sm:hidden">
                Fantasy BB
              </span>
            </Link>
            {isAdmin && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-info-light text-info border border-info-border">
                <Zap className="mr-1 h-3 w-3" />
                Admin
              </span>
            )}
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "px-3 py-2 rounded-md text-sm font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-accent-light text-content font-semibold"
                    : "text-content-secondary hover:text-content hover:bg-accent-light"
                )}
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn && (
              <>
                <div className="border-l border-neutral-200"></div>
                <span className="text-sm text-content-secondary">
                  {user?.displayName || user?.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3 py-2 rounded-md text-sm font-medium text-content-secondary hover:text-negative hover:bg-negative-light transition-colors"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <div className="md:hidden flex items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="inline-flex items-center justify-center p-2 rounded-md text-content-secondary hover:text-content hover:bg-accent-light focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-expanded={mobileMenuOpen}
            >
              <span className="sr-only">Open main menu</span>
              {mobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-neutral-200 bg-white">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  "block px-3 py-2 rounded-md text-base font-medium transition-colors",
                  isActive(link.href)
                    ? "bg-accent-light text-content font-semibold"
                    : "text-content-secondary hover:text-content hover:bg-accent-light"
                )}
              >
                {link.label}
              </Link>
            ))}
            {isLoggedIn && (
              <>
                <div className="px-3 py-2 border-t border-neutral-200 text-xs text-content-secondary">
                  {user?.displayName || user?.email}
                </div>
                <button
                  onClick={() => {
                    handleLogout();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full text-left block px-3 py-2 rounded-md text-base font-medium text-content-secondary hover:text-negative hover:bg-negative-light transition-colors"
                >
                  Sign Out
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
