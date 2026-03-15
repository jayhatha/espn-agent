// =============================================================================
// AUTH BYPASSED: Single-user mode (v4.0)
// ProtectedRoute and AdminRoute are pass-through — no auth checks.
// =============================================================================

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

export function AdminRoute({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
