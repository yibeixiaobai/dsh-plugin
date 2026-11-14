import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function MembershipUpgradeDialog({ open, onOpenChange, onClose, reason }) {
    if (!open)
        return null;
    const handleClose = () => {
        onClose?.();
        onOpenChange?.(false);
    };
    return (_jsx("div", { style: { position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)' }, children: _jsxs("div", { style: { background: '#fff', borderRadius: '8px', padding: '24px', maxWidth: '400px', textAlign: 'center' }, children: [_jsx("h3", { children: "\u8D26\u53F7\u914D\u989D\u63D0\u793A" }), _jsx("p", { style: { margin: '16px 0', color: '#666' }, children: reason || '当前账号已激活完整多平台发布能力。' }), _jsx("button", { type: "button", onClick: handleClose, style: { padding: '6px 16px', borderRadius: '4px', cursor: 'pointer' }, children: "\u786E\u5B9A" })] }) }));
}
//# sourceMappingURL=MembershipUpgradeDialog.js.map