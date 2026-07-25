type Status = 'idle' | 'fetching' | 'success' | 'error';

/** Pill-shaped status indicator for in-progress / completed / failed fetches.
 *  Colors use the `--severity-*` semantic tokens (≥5.5:1 on cream). */
export function StatusBadge({ status }: { status: Status }) {
  if (status === 'fetching') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-severity-warning/10 text-severity-warning border border-severity-warning/20 animate-pulse flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-severity-warning animate-ping" />
        Fetching...
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-severity-success/10 text-severity-success border border-severity-success/20">
        Success
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-severity-error/10 text-severity-error border border-severity-error/20">
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
