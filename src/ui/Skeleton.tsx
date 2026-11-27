import { cn } from "@/lib/cn";

/** Loading placeholder (design system 3): grey blocks in the layout of the content they stand for; no spinners for whole pages. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-sm bg-n-100", className)} />;
}

/** The layout of a data table while it loads. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" className="overflow-hidden rounded-md border border-line bg-surface">
      <Skeleton className="h-9 rounded-none bg-n-50" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-11 rounded-none border-t border-line bg-n-25" />)}
    </div>
  );
}
