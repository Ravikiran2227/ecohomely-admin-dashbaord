import React from 'react';
import { Card } from './Card';

/**
 * Reusable SectionCard component for structured dashboard sections.
 * Adheres to 16px–24px padding and 8px grid system.
 */
export default function SectionCard({ title, subtitle, icon, children, className = "", action, footer }) {
  return (
    <Card className={`ui-shell p-4 md:p-5 ${className}`}>
      {(title || subtitle || icon || action) && (
        <div className="mb-4 flex flex-col gap-3 border-b border-[var(--border-main)]/60 pb-3 sm:flex-row sm:items-start sm:justify-between last:mb-0 last:border-0 last:pb-0">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand-500/15 bg-brand-500/10 text-brand-600 dark:text-brand-300">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              {title && (
                <h3 className="ui-section-title break-words">
                  {title}
                </h3>
              )}
              {subtitle && (
                <p className="ui-section-subtitle mt-1 break-words">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          {action && <div className="shrink-0 sm:self-start">{action}</div>}
        </div>
      )}
      <div className="grid gap-4">
        {children}
      </div>
      {footer && (
        <div className="mt-4 pt-3 border-t border-[var(--border-main)]/60">
          {footer}
        </div>
      )}
    </Card>
  );
}
