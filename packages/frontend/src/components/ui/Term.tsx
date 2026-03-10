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
    return <span>{children ?? id}</span>;
  }
  return <Tooltip content={definition}>{children ?? id.toUpperCase()}</Tooltip>;
}
