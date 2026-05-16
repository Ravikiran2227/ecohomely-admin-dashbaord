import React from 'react';
import Icon from './Icon';

/**
 * Reusable InfoRow component for Label + Value pairs
 * Adheres to 8px grid system and specific typography requirements.
 */
export default function InfoRow({ label, value, icon, className = "", vertical = false }) {
  // Professional alignment, 8px grid, and typography hierarchy
  return (
    <div
      className={`flex ${vertical ? 'flex-col gap-2' : 'items-center gap-3'} mb-4 last:mb-0 ${className}`}
      style={{ minHeight: 40 }}
    >
      {icon && !vertical && (
        <div className="shrink-0 flex items-center justify-center" style={{ marginRight: 8 }}>
          <Icon name={icon} size={18} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex flex-col gap-1">
          <span
            className="block text-[14px] font-semibold text-[var(--text-muted)] leading-tight truncate"
            style={{ letterSpacing: 0.5 }}
          >
            {label}
          </span>
          <div className="flex items-center gap-2">
            {icon && vertical && (
              <span className="shrink-0 flex items-center justify-center" style={{ marginRight: 8 }}>
                <Icon name={icon} size={16} />
              </span>
            )}
            <span
              className="block text-[16px] font-normal text-[var(--text-main)] leading-snug break-words whitespace-pre-wrap"
              style={{ minHeight: 20 }}
            >
              {value || '—'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
