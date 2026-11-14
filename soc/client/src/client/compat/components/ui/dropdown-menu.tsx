import * as React from 'react'

export function DropdownMenu({ children }: any) {
  return <div style={{ position: 'relative', display: 'inline-block' }}>{children}</div>
}

export function DropdownMenuTrigger({ children, asChild, ...props }: any) {
  return <div {...props}>{children}</div>
}

export function DropdownMenuContent({ children, className, style, ...props }: any) {
  const contentStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    right: 0,
    zIndex: 100,
    minWidth: 140,
    marginTop: 4,
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2, rgba(125, 125, 125, 0.2))',
    background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
    color: 'var(--dsw-alias-label-primary, #111827)',
    padding: 4,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    ...style,
  }

  return (
    <div style={contentStyle} className={className} {...props}>
      {children}
    </div>
  )
}

export function DropdownMenuItem({ children, className, style, onClick, ...props }: any) {
  const [hovered, setHovered] = React.useState(false)
  const itemStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 10px',
    borderRadius: 6,
    fontSize: 12,
    cursor: 'pointer',
    background: hovered ? 'var(--dsw-alias-interactive-bg-hover, rgba(125, 125, 125, 0.08))' : 'transparent',
    color: 'var(--dsw-alias-label-primary, inherit)',
    userSelect: 'none',
    transition: 'background-color 0.15s ease',
    ...style,
  }

  return (
    <div
      role="menuitem"
      tabIndex={0}
      style={itemStyle}
      className={className}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
      {...props}
    >
      {children}
    </div>
  )
}

export function DropdownMenuSeparator({ className }: { className?: string } = {}) {
  return (
    <hr
      style={{
        margin: '4px 0',
        height: 1,
        border: 'none',
        background: 'var(--dsw-alias-border-l1, rgba(125, 125, 125, 0.15))',
      }}
      className={className}
    />
  )
}
