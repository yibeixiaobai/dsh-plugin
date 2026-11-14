import * as React from 'react'

export interface ProFeatureGateModalProps {
  open: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
  featureId?: string
  featureTitle?: string
  description?: string
  onConfirmTrial?: () => void
  [key: string]: any
}

export function ProFeatureGateModal({
  open,
  onClose,
  onOpenChange,
  featureTitle,
  description,
  onConfirmTrial,
}: ProFeatureGateModalProps) {
  if (!open) return null
  const handleClose = () => {
    onClose?.()
    onOpenChange?.(false)
  }
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '24px',
          maxWidth: '400px',
          textAlign: 'center',
        }}
      >
        <h3>{featureTitle || '专业版功能'}</h3>
        <p style={{ margin: '16px 0', color: '#666' }}>
          {description || '此功能已在当前环境中全面开放使用。'}
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
          {onConfirmTrial && (
            <button
              type="button"
              onClick={() => {
                onConfirmTrial()
                handleClose()
              }}
              style={{ padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }}
            >
              开启体验
            </button>
          )}
          <button
            type="button"
            onClick={handleClose}
            style={{ padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }}
          >
            我知道了
          </button>
        </div>
      </div>
    </div>
  )
}
