"use client";

export function ConnectionBanner({
  extensionConnected,
  wsConnected,
}: {
  extensionConnected: boolean;
  wsConnected: boolean;
}) {
  // When WS not connected, page already has its own "Connecting..." state
  if (!wsConnected) return null;

  // Both connected — no banner needed
  if (extensionConnected) return null;

  // WS connected but extension not connected — show warning
  return (
    <div className="bg-grafana-warning/20 border-b border-grafana-warning px-4 py-2">
      <div className="max-w-lg mx-auto flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-grafana-warning opacity-75" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-grafana-warning" />
        </span>
        <p className="text-sm text-grafana-text">
          Extension not connected — make sure the ESPN draft page has the extension sidebar open.
        </p>
      </div>
    </div>
  );
}
