import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
export function Popover({ children, open, onOpenChange }) {
    const [internalOpen, setInternalOpen] = React.useState(false);
    const isOpened = open !== undefined ? open : internalOpen;
    return (_jsx("div", { style: { position: 'relative', display: 'inline-block' }, children: typeof children === 'function' ? children({ open: isOpened, setOpen: onOpenChange || setInternalOpen }) : children }));
}
export function PopoverTrigger({ asChild, children, ...props }) {
    return _jsx("div", { ...props, children: children });
}
export function PopoverContent({ className, children, style, ...props }) {
    const popoverStyle = {
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
    };
    return (_jsx("div", { style: popoverStyle, className: className, ...props, children: children }));
}
//# sourceMappingURL=popover.js.map