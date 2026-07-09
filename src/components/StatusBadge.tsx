type Status = 'idle' | 'fetching' | 'success' | 'error';

/** Pill-shaped status indicator for in-progress / completed / failed fetches. */
export function StatusBadge({ status }: { status: Status }) {
  if (status === 'fetching') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 animate-pulse flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-ping" />
        Fetching...
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
        Success
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20">
        Error
      </span>
    );
  }
  return (
    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground">
      Waiting...
    </span>
  );
}
