"use client";

import { useState, useEffect, useCallback } from "react";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function ShellProvider({ children }: { children: React.ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  const open = useCallback(() => setPaletteOpen(true), []);
  const close = useCallback(() => setPaletteOpen(false), []);

  // Global Cmd+K / Ctrl+K handler
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <>
      {children}
      <CommandPalette open={paletteOpen} onClose={close} />
    </>
  );
}
