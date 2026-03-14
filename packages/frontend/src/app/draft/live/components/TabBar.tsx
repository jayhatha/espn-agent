"use client";

const TABS = [
  { key: "live", label: "Live" },
  { key: "strategy", label: "Strategy" },
  { key: "queue", label: "Queue" },
] as const;

export function TabBar({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <nav className="sticky bottom-0 z-50 bg-neutral-900 border-t border-neutral-800">
      <div className="max-w-lg mx-auto flex">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => onTabChange(tab.key)}
              className={`flex-1 min-h-[44px] text-sm font-semibold uppercase tracking-wide transition-colors ${
                isActive
                  ? "bg-neutral-800 text-white border-t-2 border-blue-500"
                  : "bg-neutral-900 text-neutral-500 border-t-2 border-transparent"
              }`}
              aria-label={`${tab.label} tab`}
              aria-selected={isActive}
              role="tab"
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
