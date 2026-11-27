import { CircleAlert, Info, TriangleAlert } from "lucide-react";
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

const TONES = {
  info: { cls: "border-info-bd bg-info-bg text-info-fg", Icon: Info, role: "status" },
  warn: { cls: "border-warn-bd bg-warn-bg text-warn-fg", Icon: TriangleAlert, role: "status" },
  danger: { cls: "border-breach-bd bg-breach-bg text-breach-fg", Icon: CircleAlert, role: "alert" },
} as const;

/**
 * Banner (design system 3): a full-width message inside the page for a persistent state (info, a degraded provider, a problem). Never a
 * toast for a persistent problem. Icon plus text, so the meaning never rests on colour.
 */
export function Banner({ tone = "info", children, className, ...rest }: { tone?: keyof typeof TONES; children: ReactNode } & Omit<HTMLAttributes<HTMLElement>, "children">) {
  const { cls, Icon, role } = TONES[tone];
  return (
    <div role={role} className={cn("flex items-start gap-2 rounded-md border px-3 py-2 text-[13px]", cls, className)} {...rest}>
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
