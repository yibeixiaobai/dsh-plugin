import * as React from 'react'

export interface EmbeddedWebsiteHeaderProps {
  title: string
  onClose?: () => void
  url?: string
  loading?: boolean
  canGoBack?: boolean
  canGoForward?: boolean
  onBack?: () => any
  onForward?: () => any
  onReload?: () => any
  [key: string]: any
}

export function EmbeddedWebsiteHeader({
  title,
  onClose,
  url,
  loading,
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  onReload,
}: EmbeddedWebsiteHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 16px',
        borderBottom: '1px solid var(--dsw-border-subtle, rgba(0,0,0,0.1))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {canGoBack && onBack && (
          <button type="button" onClick={onBack} style={{ cursor: 'pointer' }}>
            ‹
          </button>
        )}
        {canGoForward && onForward && (
          <button type="button" onClick={onForward} style={{ cursor: 'pointer' }}>
            ›
          </button>
        )}
        {onReload && (
          <button type="button" onClick={onReload} style={{ cursor: 'pointer' }}>
            ↻
          </button>
        )}
        <div style={{ fontWeight: 600 }}>{title}</div>
      </div>
      {url && <div style={{ fontSize: '11px', color: '#888' }}>{url}</div>}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }}
        >
          ✕
        </button>
      )}
    </div>
  )
}
