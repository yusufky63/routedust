import type { ReactNode } from "react";

/**
 * The page's decision, at the end of the page: a line of status on the left and
 * the primary action(s) on the right, large enough to be the obvious next step.
 * Route and batch pages put it directly above the log.
 */
export function ActionBar({ status, hint, children, tone = "default" }: { status: ReactNode; hint?: ReactNode; children: ReactNode; tone?: "default" | "done" | "warn" }) {
  const border = tone === "done" ? "border-success/40" : tone === "warn" ? "border-warning/40" : "border-border-strong";
  return (
    <section className={`module module-raised flex flex-col gap-4 ${border} md:flex-row md:items-center md:justify-between`}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={`text-sm ${tone === "done" ? "text-success" : tone === "warn" ? "text-warning" : ""}`}>{status}</span>
        {hint ? <span className="meta">{hint}</span> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">{children}</div>
    </section>
  );
}
