"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Trophy,
  BarChart3,
  Users,
  RefreshCw,
  DollarSign,
  Activity,
  ArrowLeftRight,
  Settings,
  Menu,
  X,
  ScrollText,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { api } from "@/lib/api";

interface NavItem {
  label: string;
  href: string; // relative to /leagues/[id]
  icon: LucideIcon;
  badgeKey?: "waivers" | "trades";
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",      href: "",           icon: LayoutDashboard },
  { label: "Standings",      href: "/standings", icon: Trophy },
  { label: "Change Log",     href: "/changelog", icon: ScrollText },
  { label: "Categories",     href: "/trends",    icon: BarChart3 },
  { label: "Roster",         href: "/lineup",    icon: Users },
  { label: "Waivers",        href: "/waivers",   icon: RefreshCw, badgeKey: "waivers" },
  { label: "FAAB Market",    href: "/moves",     icon: DollarSign },
  { label: "Pitching Usage", href: "/streaming", icon: Activity },
  { label: "Trades",         href: "/trades",    icon: ArrowLeftRight, badgeKey: "trades" },
  { label: "Settings",       href: "/settings",  icon: Settings },
];

export function LeagueNav() {
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;

  const [teamId, setTeamId] = useState<number | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!id) return;
    const stored = localStorage.getItem(`league_${id}_team`);
    if (stored) {
      const parsed = parseInt(stored, 10);
      if (!isNaN(parsed)) setTeamId(parsed);
    }
  }, [id]);

  // Mobile nav: focus trap, Escape to close, body overflow lock
  useEffect(() => {
    if (!mobileOpen) return;

    document.body.classList.add("overflow-hidden");

    // Focus first link in nav
    const firstLink = navRef.current?.querySelector("a") as HTMLElement | null;
    firstLink?.focus();

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMobileOpen(false);
        hamburgerRef.current?.focus();
        return;
      }

      if (e.key === "Tab" && navRef.current) {
        const focusable = navRef.current.querySelectorAll<HTMLElement>(
          'a, button, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.classList.remove("overflow-hidden");
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileOpen]);

  const leagueId = id ? parseInt(id, 10) : 0;

  const { data: waiverData } = useQuery({
    queryKey: ["waivers-recommendations", id, teamId],
    queryFn: () => api.getWaiverRecommendations(leagueId, teamId!, { maxRecommendations: 5 }),
    enabled: !!teamId && !!id,
    staleTime: 5 * 60_000,
  });

  const { data: tradeData } = useQuery({
    queryKey: ["trades-recommendations", id, teamId],
    queryFn: () => api.getTradeRecommendations(leagueId, teamId!),
    enabled: !!teamId && !!id,
    staleTime: 5 * 60_000,
  });

  const badgeCounts: Record<string, number> = {
    waivers: waiverData?.recommendations?.length ?? 0,
    trades: tradeData?.candidates?.length ?? 0,
  };

  const isActive = (href: string) => {
    const base = `/leagues/${id}`;
    if (href === "") {
      return pathname === base;
    }
    return pathname.startsWith(`${base}${href}`);
  };

  return (
    <>
      {/* Mobile hamburger toggle — visible only on mobile */}
      <button
        ref={hamburgerRef}
        onClick={() => setMobileOpen(!mobileOpen)}
        className="fixed top-3 left-3 z-40 md:hidden p-2 rounded-lg bg-shell-panel border border-shell-border text-shell-text"
        aria-label="Toggle navigation"
        aria-expanded={mobileOpen}
        aria-controls="mobile-nav"
      >
        {mobileOpen ? <X size={20} /> : <Menu size={20} />}
      </button>

      {/* Mobile backdrop overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <nav
        ref={navRef}
        id="mobile-nav"
        className={cn(
        "fixed left-0 top-0 h-screen w-60 bg-shell-nav border-r border-shell-border flex-col z-30 overflow-y-auto",
        mobileOpen ? "flex" : "hidden",
        "md:flex"
      )}>
        {/* App logo / branding */}
        <div className="px-4 py-5 border-b border-shell-border flex-shrink-0">
          <span className="text-shell-text font-semibold text-sm tracking-wide">
            Fantasy CMD
          </span>
        </div>

        {/* Nav items */}
        <ul className="flex-1 px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            const href = `/leagues/${id}${item.href}`;
            const Icon = item.icon;
            const count = item.badgeKey ? badgeCounts[item.badgeKey] : 0;

            return (
              <li key={item.href}>
                <Link
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 min-h-[44px] rounded-md text-sm transition-colors",
                    active
                      ? "bg-shell-accent/20 text-shell-accent font-medium"
                      : "text-shell-muted hover:text-shell-text hover:bg-shell-panel"
                  )}
                >
                  <Icon size={18} className="flex-shrink-0" />
                  <span className="flex-1">{item.label}</span>
                  {count > 0 && (
                    <span className="bg-shell-accent text-shell-bg text-xs rounded-full min-w-[18px] h-[18px] flex items-center justify-center font-medium">
                      {count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
