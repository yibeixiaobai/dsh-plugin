import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { X } from 'lucide-react';
import css from './WechatCanvasLightbox.module.css';
export function WechatCanvasLightbox({ url, onClose }) {
    if (!url)
        return null;
    return (_jsxs("div", { className: css.backdrop, onClick: onClose, children: [_jsx("button", { type: "button", className: css.closeButton, onClick: onClose, "aria-label": "\u5173\u95ED\u9884\u89C8", children: _jsx(X, { size: 20 }) }), _jsx("img", { src: url, alt: "\u5927\u56FE\u5168\u5C4F\u9884\u89C8", className: css.image })] }));
}
//# sourceMappingURL=WechatCanvasLightbox.js.map