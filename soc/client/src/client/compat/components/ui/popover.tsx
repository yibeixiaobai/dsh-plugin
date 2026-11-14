import * as React from 'react'

export interface PopoverProps {
  children: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function Popover({ children, open, onOpenChange }: PopoverProps) {
  const [internalOpen, setInternalOpen] = React.useState(false)
  const isOpened = open !== undefined ? open : internalOpen

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {typeof children === 'function' ? (children as any)({ open: isOpened, setOpen: onOpenChange || setInternalOpen }) : children}
    </div>
  )
}

export function PopoverTrigger({ asChild, children, ...props }: any) {
  return <div {...props}>{children}</div>
}

export function PopoverContent({ className, children, style, ...props }: any) {
  const popoverStyle: React.CSSProperties = {
    position: 'absolute',
    top: '100%',
    left: 0,
    zIndex: 100,
    marginTop: 6,
    borderRadius: 8,
    border: '1px solid var(--dsw-alias-border-l2, rgba(125, 125, 125, 0.2))',
    background: 'var(--dsw-alias-bg-layer-3, #ffffff)',
    color: 'var(--dsw-alias-label-primary, inherit)',
    padding: 12,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
    ...style,
  }

  return (
    <div style={popoverStyle} className={className} {...props}>
      {children}
    </div>
  )
}
