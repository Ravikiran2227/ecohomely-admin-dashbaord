import { C } from '../theme'

export default function Modal({ isOpen, title, onClose, children, size = 'md', footer = null }) {
  if (!isOpen) return null

  const sizeClass = {
    sm: '400px',
    md: '600px',
    lg: '800px',
    xl: '1000px',
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', zIndex: 9999,
    }} onClick={onClose}>
      <div
        style={{
          background: C.white, borderRadius: 16, boxShadow: C.shadowLg,
          width: 'calc(100% - 32px)', maxWidth: sizeClass[size],
          maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 24px', borderBottom: `1px solid ${C.border}`,
        }}>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.text }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: 28, color: C.muted,
              cursor: 'pointer', padding: 0, lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px', color: C.text }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '16px 24px', borderTop: `1px solid ${C.border}`,
            display: 'flex', gap: 10, justifyContent: 'flex-end',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}
