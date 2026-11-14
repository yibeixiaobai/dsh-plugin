import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function ProFeatureGateModal({ open, onClose, onOpenChange, featureTitle, description, onConfirmTrial, }) {
    if (!open)
        return null;
    const handleClose = () => {
        onClose?.();
        onOpenChange?.(false);
    };
    return (_jsx("div", { style: {
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
        }, children: _jsxs("div", { style: {
                background: '#fff',
                borderRadius: '8px',
                padding: '24px',
                maxWidth: '400px',
                textAlign: 'center',
            }, children: [_jsx("h3", { children: featureTitle || '专业版功能' }), _jsx("p", { style: { margin: '16px 0', color: '#666' }, children: description || '此功能已在当前环境中全面开放使用。' }), _jsxs("div", { style: { display: 'flex', justifyContent: 'center', gap: '8px' }, children: [onConfirmTrial && (_jsx("button", { type: "button", onClick: () => {
                                onConfirmTrial();
                                handleClose();
                            }, style: { padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }, children: "\u5F00\u542F\u4F53\u9A8C" })), _jsx("button", { type: "button", onClick: handleClose, style: { padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }, children: "\u6211\u77E5\u9053\u4E86" })] })] }) }));
}
//# sourceMappingURL=ProFeatureGateModal.js.map