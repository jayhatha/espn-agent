"use client";

import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
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
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  label: string;
  href: string; // relative to /leagues/[id]
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",      href: "",           icon: LayoutDashboard },
  { label: "Standings",      href: "/standings", icon: Trophy },
  { label: "Categories",     href: "/trends",    icon: BarChart3 },
  { label: "Roster",         href: "/lineup",    icon: Users },
  { label: "Waivers",        href: "/waivers",   icon: RefreshCw },
  { label: "FAAB Market",    href: "/moves",     icon: DollarSign },
  { label: "Pitching Usage", href: "/streaming", icon: Activity },
  { label: "Trades",         href: "/trades",    icon: ArrowLeftRight },
  { label: "Settings",       href: "/settings",  icon: Settings },
];

export function LeagueNav() {
  const pathname = usePathname();
  const params = useParams();
  const id = params?.id as string;

  const isActive = (href: string) => {
    const base = `/leagues/${id}`;
    if (href === "") {
      return pathname === base;
    }
    return pathname.startsWith(`${base}${href}`);
  };

  return (
    <nav className="fixed left-0 top-0 h-screen w-60 bg-shell-nav border-r border-shell-border flex flex-col z-30 overflow-y-auto">
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

          return (
            <li key={item.href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-shell-accent/10 text-shell-accent font-medium"
                    : "text-shell-muted hover:text-shell-text hover:bg-shell-panel"
                )}
              >
                <Icon size={18} className="flex-shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
