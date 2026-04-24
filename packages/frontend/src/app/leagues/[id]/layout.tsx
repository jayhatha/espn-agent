import { LeagueNav } from "@/components/shell/LeagueNav";
import { TopBar } from "@/components/shell/TopBar";
import { SignalsPanel } from "@/components/shell/SignalsPanel";

interface LeagueLayoutProps {
  children: React.ReactNode;
}

export default function LeagueLayout({ children }: LeagueLayoutProps) {
  return (
    <div className="flex h-screen bg-shell-bg text-shell-text overflow-hidden">
      <LeagueNav />
      {/* Offset main content area by sidebar width on desktop only (mobile: no sidebar offset) */}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden pl-0 md:pl-60">
        <TopBar />
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          {children}
        </main>
      </div>
      <SignalsPanel />
    </div>
  );
}
