import { cva, type VariantProps } from "class-variance-authority";
import { Check, Clock, Dot, Info, TriangleAlert, Siren } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, InputHTMLAttributes, ReactNode } from "react";
import { Link, useInRouterContext, useLocation } from "react-router";
import { departmentOfPath, fullName } from "@/departments/labels";
import { cn } from "@/lib/cn";

/**
 * Console primitives (design system v1.0 section 3). Colours come from the tokens (`styles/tokens.css`); nothing here uses a raw colour.
 * Behaviour and props are unchanged from before the design pass: only the look changed.
 */
const button = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        /** Primary: once per view. */
        primary: "border border-brand-600 bg-brand-600 text-primary-ink hover:border-brand-700 hover:bg-brand-700",
        secondary: "border border-line-strong bg-surface text-ink hover:bg-n-50",
        ghost: "border border-transparent text-ink hover:bg-n-50",
        /** Danger: red text on white; a solid red button exists only inside a confirm dialog (`solid`). */
        danger: "border border-line-strong bg-surface text-breach-fg hover:bg-breach-bg",
      },
      size: { md: "h-8 py-0", sm: "h-7 py-0 text-[13px]", lg: "h-10 px-4 py-0" },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...props} />;
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn("h-8 w-full rounded-sm border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-n-500 aria-[invalid=true]:border-breach-fg", className)}
      {...props}
    />
  );
}

export type PillTone = "neutral" | "warn" | "ok" | "breach" | "info" | "critical";
const PILL: Record<PillTone, { cls: string; Icon: typeof Check }> = {
  ok: { cls: "border-ok-bd bg-ok-bg text-ok-fg", Icon: Check },
  warn: { cls: "border-warn-bd bg-warn-bg text-warn-fg", Icon: Clock },
  breach: { cls: "border-breach-bd bg-breach-bg text-breach-fg", Icon: TriangleAlert },
  info: { cls: "border-info-bd bg-info-bg text-info-fg", Icon: Info },
  neutral: { cls: "border-neutral-bd bg-neutral-bg text-neutral-fg", Icon: Dot },
  critical: { cls: "border-transparent bg-critical text-white", Icon: Siren },
};

/**
 * Status pill (design system 3): 12 px, 500, radius 6, icon plus text, never colour alone. `Badge` is the same component under its
 * older name, so every existing call site shows the new pill.
 */
export function StatusPill({ children, tone = "neutral", className }: { children: ReactNode; tone?: PillTone; className?: string }) {
  const { cls, Icon } = PILL[tone];
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium tabular-nums", cls, className)}>
      <Icon className={cn("shrink-0", tone === "neutral" ? "-mx-1 size-5" : "size-3")} aria-hidden />
      {children}
    </span>
  );
}
export const Badge = StatusPill;

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("rounded-md border border-line bg-surface p-5", className)} {...rest}>
      {children}
    </section>
  );
}

/**
 * A horizontally scrollable table wrapper. It is focusable and named, so keyboard users can reach it and scroll it
 * even when it holds no links or buttons (WCAG 2.1.1, axe rule scrollable-region-focusable).
 */
export function ScrollRegion({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="region" tabIndex={0} aria-label={label} className={cn("overflow-x-auto", className)}>
      {children}
    </div>
  );
}

/**
 * Page header (design system 2): optional breadcrumbs (12 px, muted), title 24/600, one-line description, and actions on the right
 * (at most one primary button; the others secondary or in a "More" menu).
 */
/** The department of the page, from its address: "4. Instant Services Operations" (full name and number), linked to the department page. */
function RouteCrumb() {
  const dept = departmentOfPath(useLocation().pathname);
  if (dept === null) return null;
  return (
    <nav aria-label="Breadcrumb" className="text-xs text-n-500">
      <Link to={`/departments/${dept}`} className="hover:text-ink hover:underline">{fullName(dept)}</Link>
    </nav>
  );
}

export function PageHeader({ title, subtitle, breadcrumbs, actions }: { title: string; subtitle?: string; breadcrumbs?: ReactNode; actions?: ReactNode }) {
  const inRouter = useInRouterContext();
  return (
    <header className="mb-6 flex flex-wrap items-start gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        {breadcrumbs ? <div className="text-xs text-n-500">{breadcrumbs}</div> : inRouter ? <RouteCrumb /> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
