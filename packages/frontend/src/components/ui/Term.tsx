"use client";

import { GLOSSARY } from "@espn-fantasy/shared";
import { Tooltip } from "./Tooltip";

interface TermProps {
  id: keyof typeof GLOSSARY;
  children?: React.ReactNode;
}

export function Term({ id, children }: TermProps) {
  const definition = GLOSSARY[id];
  if (!definition) {
    // Fallback: render plain text in muted color
    return (
      <span className="dark:text-shell-muted">{children ?? id}</span>
    );
  }
  return <Tooltip content={definition}>{children ?? id.toUpperCase()}</Tooltip>;
}
