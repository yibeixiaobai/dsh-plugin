import * as React from 'react'

export interface MembershipUpgradeDialogProps {
  open: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
  reason?: string
}

export function MembershipUpgradeDialog({ open, onOpenChange, onClose, reason }: MembershipUpgradeDialogProps) {
  if (!open) return null
  const handleClose = () => {
    onClose?.()
    onOpenChange?.(false)
  }
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }}>
      <div style={{ background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '400px', textAlign: 'center' }}>
        <h3>账号配额提示</h3>
        <p style={{ margin: '16px 0', color: '#666' }}>{reason || '当前账号已激活完整多平台发布能力。'}</p>
        <button type="button" onClick={handleClose} style={{ padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }}>确定</button>
      </div>
    </div>
  )
}
