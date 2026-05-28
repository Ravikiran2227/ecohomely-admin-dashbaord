import React from 'react'
import SectionCard from './SectionCard'
import Badge from './Badge'

/**
 * Reusable PricingCard component for highlighting service and pricing.
 * Adheres to consistent green theme for pricing.
 */
export default function PricingCard({ title, amount, unit, details = [], status, className = '' }) {
  const hasAmount = amount !== undefined && amount !== null && amount !== ''
  const numericAmount = Number(amount || 0)

  return (
    <SectionCard
      title={title}
      className={`border-l-4 border-l-emerald-500 ${className}`}
      action={status && <Badge label={status} color="#10B981" size="xs" dot />}
    >
      <div className="space-y-5">
        <div className="flex items-end gap-2">
          <span className="text-[28px] font-extrabold text-emerald-600 leading-none">
            {hasAmount ? `Rs ${numericAmount.toLocaleString('en-IN')}` : ''}
          </span>
          {hasAmount && unit && (
            <span className="text-[14px] font-medium text-[var(--text-muted)] lowercase tracking-tight mb-0.5">
              / {unit}
            </span>
          )}
        </div>
        {details.length > 0 && (
          <ul className="space-y-2 ml-4 list-disc text-[14px] text-[var(--text-muted)]">
            {details.map((detail, index) => (
              <li key={index} className="leading-relaxed">
                {detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionCard>
  )
}
