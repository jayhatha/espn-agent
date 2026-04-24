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
    <nav className="sticky bottom-0 z-50 bg-grafana-bg border-t border-grafana-border">
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
                  ? "bg-grafana-panel text-white border-t-2 border-info"
                  : "bg-grafana-bg text-grafana-muted border-t-2 border-transparent"
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
