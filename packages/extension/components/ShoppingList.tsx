import React from "react";
import type { ShoppingListSignal, PositionGroup, PositionTarget } from "../lib/engine";

interface ShoppingListProps {
  shoppingList: ShoppingListSignal | null;
}

function priorityBadge(score: number): { label: string; classes: string } {
  if (score >= 0.7) {
    return { label: "HIGH", classes: "bg-negative-light text-negative" };
  } else if (score >= 0.45) {
    return { label: "MED", classes: "bg-warning-light text-warning" };
  } else {
    return { label: "LOW", classes: "bg-info-light text-info" };
  }
}

function PlayerRow({ target }: { target: PositionTarget }) {
  const surplus = Math.round(target.valueSurplus);
  return (
    <div className="flex justify-between text-body-xs py-0.5">
      <span className="font-semibold text-content truncate max-w-[100px]">
        {target.playerName}
      </span>
      <div className="flex gap-2 text-right shrink-0">
        <span className="font-semibold text-content">
          ${Math.round(target.maxBid)}
        </span>
        <span className="text-content-secondary">
          ~${Math.round(target.expectedMarketPrice)}
        </span>
        <span className={surplus >= 0 ? "text-positive" : "text-negative"}>
          {surplus >= 0 ? "+" : ""}{surplus}
        </span>
      </div>
    </div>
  );
}

function PositionGroupSection({ group }: { group: PositionGroup }) {
  const badge = priorityBadge(group.priorityScore);
  return (
    <details className="border-t border-surface-tertiary">
      <summary className="py-1.5 cursor-pointer flex items-center justify-between select-none list-none">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-body-xs text-content">{group.position}</span>
          <span className={`text-body-xs font-semibold px-1.5 py-0.5 rounded ${badge.classes}`}>
            {badge.label}
          </span>
          <span className="text-body-xs text-content-tertiary">
            {group.unfilledSlots} slot{group.unfilledSlots !== 1 ? "s" : ""}
          </span>
        </div>
        <span className="text-body-xs text-content-secondary">▾</span>
      </summary>
      <div className="space-y-0.5 pt-1 pb-1">
        {group.targets.map((target) => (
          <PlayerRow key={target.playerName} target={target} />
        ))}
      </div>
    </details>
  );
}

export default function ShoppingList({ shoppingList }: ShoppingListProps) {
  if (shoppingList === null) {
    return null;
  }

  const { positionGroups } = shoppingList;

  return (
    <details open className="group">
      <summary className="px-3 py-2 cursor-pointer flex items-center justify-between bg-surface-secondary hover:bg-surface-tertiary/50 select-none border-t border-surface-tertiary">
        <div className="flex items-center gap-2">
          <span className="text-body-sm font-semibold text-content">Shopping List</span>
          {positionGroups.length > 0 && (
            <span className="text-body-xs text-content-tertiary">
              {positionGroups.length} pos
            </span>
          )}
        </div>
        <span className="text-body-xs text-content-secondary group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="px-3 pb-3 pt-1 bg-surface">
        {positionGroups.length === 0 ? (
          <div className="text-body-xs text-content-secondary text-center py-2">
            Roster positions filled
          </div>
        ) : (
          positionGroups.map((group) => (
            <PositionGroupSection key={group.position} group={group} />
          ))
        )}
      </div>
    </details>
  );
}
