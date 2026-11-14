import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function EmbeddedWebsiteHeader({ title, onClose, url, loading, canGoBack, canGoForward, onBack, onForward, onReload, }) {
    return (_jsxs("div", { style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            borderBottom: '1px solid var(--dsw-border-subtle, rgba(0,0,0,0.1))',
        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', gap: '8px' }, children: [canGoBack && onBack && (_jsx("button", { type: "button", onClick: onBack, style: { cursor: 'pointer' }, children: "\u2039" })), canGoForward && onForward && (_jsx("button", { type: "button", onClick: onForward, style: { cursor: 'pointer' }, children: "\u203A" })), onReload && (_jsx("button", { type: "button", onClick: onReload, style: { cursor: 'pointer' }, children: "\u21BB" })), _jsx("div", { style: { fontWeight: 600 }, children: title })] }), url && _jsx("div", { style: { fontSize: '11px', color: '#888' }, children: url }), onClose && (_jsx("button", { type: "button", onClick: onClose, style: { background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '16px' }, children: "\u2715" }))] }));
}
//# sourceMappingURL=EmbeddedWebsiteHeader.js.map