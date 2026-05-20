"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  Search,
  LayoutDashboard,
  Trophy,
  BarChart3,
  ScrollText,
  Users,
  RefreshCw,
  DollarSign,
  Activity,
  ArrowLeftRight,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Command {
  id: string;
  label: string;
  group: string;
  icon: LucideIcon | null;
  href?: string;
  action?: () => void;
  hint?: string;
}

function buildCommands(leagueId: string | undefined): Command[] {
  if (!leagueId) return [];
  const base = `/leagues/${leagueId}`;
  return [
    {
      id: "dashboard",
      label: "Dashboard",
      group: "Navigate",
      icon: LayoutDashboard,
      href: base,
      hint: "g d",
    },
    {
      id: "standings",
      label: "Standings",
      group: "Navigate",
      icon: Trophy,
      href: `${base}/standings`,
      hint: "g s",
    },
    {
      id: "categories",
      label: "Categories",
      group: "Navigate",
      icon: BarChart3,
      href: `${base}/trends`,
      hint: "g c",
    },
    {
      id: "streaming-log",
      label: "Streaming Log",
      group: "Navigate",
      icon: ScrollText,
      href: `${base}/changelog`,
    },
    {
      id: "roster",
      label: "Roster",
      group: "Navigate",
      icon: Users,
      href: `${base}/lineup`,
      hint: "g r",
    },
    {
      id: "waivers",
      label: "Waivers",
      group: "Navigate",
      icon: RefreshCw,
      href: `${base}/waivers`,
      hint: "g w",
    },
    {
      id: "faab",
      label: "FAAB Market",
      group: "Navigate",
      icon: DollarSign,
      href: `${base}/moves`,
    },
    {
      id: "pitcher-usage",
      label: "Pitcher Usage",
      group: "Navigate",
      icon: Activity,
      href: `${base}/streaming`,
    },
    {
      id: "trades",
      label: "Trades",
      group: "Navigate",
      icon: ArrowLeftRight,
      href: `${base}/trades`,
      hint: "g t",
    },
    {
      id: "settings",
      label: "Settings",
      group: "Navigate",
      icon: Settings,
      href: `${base}/settings`,
    },
  ];
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.id as string | undefined;

  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = buildCommands(leagueId);

  const filtered = query.trim()
    ? commands.filter(
        (c) =>
          c.label.toLowerCase().includes(query.toLowerCase()) ||
          c.group.toLowerCase().includes(query.toLowerCase()),
      )
    : commands;

  const run = useCallback(
    (cmd: Command) => {
      onClose();
      setQuery("");
      if (cmd.href) router.push(cmd.href);
      if (cmd.action) cmd.action();
    },
    [onClose, router],
  );

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filtered[activeIndex]) run(filtered[activeIndex]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, filtered, activeIndex, onClose, run]);

  // Scroll active item into view
  useEffect(() => {
    const el = listRef.current?.children[activeIndex] as
      | HTMLElement
      | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex]);

  // Reset activeIndex when filter changes
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  if (!open) return null;

  // Group filtered items
  const groups = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    if (!acc[cmd.group]) acc[cmd.group] = [];
    acc[cmd.group].push(cmd);
    return acc;
  }, {});

  // Build a flat index map for keyboard navigation
  const flatItems = filtered;

  let flatIdx = 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Palette */}
      <div
        role="dialog"
        aria-label="Command palette"
        aria-modal="true"
        className="fixed inset-x-4 top-[15vh] z-50 mx-auto max-w-lg"
      >
        <div className="rounded-xl border border-shell-border bg-shell-panel shadow-2xl overflow-hidden">
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-shell-border">
            <Search
              size={16}
              className="text-shell-muted flex-shrink-0"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              placeholder="Go to..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="flex-1 bg-transparent text-shell-text text-sm placeholder:text-shell-muted/60 outline-none"
              aria-autocomplete="list"
              aria-controls="cmd-list"
              aria-activedescendant={
                flatItems[activeIndex]
                  ? `cmd-${flatItems[activeIndex].id}`
                  : undefined
              }
            />
            <kbd className="hidden sm:inline-flex items-center rounded border border-shell-border px-1.5 py-0.5 font-mono text-[10px] text-shell-muted select-none">
              ESC
            </kbd>
          </div>

          {/* Results */}
          <ul
            ref={listRef}
            id="cmd-list"
            role="listbox"
            className="max-h-72 overflow-y-auto py-2"
          >
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-shell-muted">
                No results for &ldquo;{query}&rdquo;
              </li>
            )}
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <p className="px-4 py-1 text-[10px] font-semibold uppercase tracking-widest text-shell-muted/60 select-none">
                  {group}
                </p>
                {items.map((cmd) => {
                  const thisIdx = flatIdx++;
                  const isActive = thisIdx === activeIndex;
                  const Icon = cmd.icon;
                  return (
                    <li
                      key={cmd.id}
                      id={`cmd-${cmd.id}`}
                      role="option"
                      aria-selected={isActive}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors text-sm",
                        isActive
                          ? "bg-shell-accent/20 text-shell-accent"
                          : "text-shell-text hover:bg-shell-panel/80",
                      )}
                      onClick={() => run(cmd)}
                      onMouseEnter={() => setActiveIndex(thisIdx)}
                    >
                      {Icon && (
                        <Icon
                          size={16}
                          className="flex-shrink-0 text-shell-muted"
                          aria-hidden="true"
                        />
                      )}
                      <span className="flex-1">{cmd.label}</span>
                      {cmd.hint && (
                        <span className="hidden sm:flex gap-1">
                          {cmd.hint.split(" ").map((k) => (
                            <kbd
                              key={k}
                              className="inline-flex items-center rounded border border-shell-border px-1.5 py-0.5 font-mono text-[10px] text-shell-muted select-none"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      )}
                    </li>
                  );
                })}
              </div>
            ))}
          </ul>
        </div>
      </div>
    </>
  );
}
