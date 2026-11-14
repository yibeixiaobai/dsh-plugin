import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '../lib/utils.js';
export function Switch({ checked, defaultChecked, onCheckedChange, disabled, className, id, title, style, }) {
    const [internalChecked, setInternalChecked] = React.useState(defaultChecked ?? false);
    const isChecked = checked !== undefined ? checked : internalChecked;
    const trackStyle = {
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        width: 36,
        height: 20,
        flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        borderRadius: 10,
        border: 'none',
        padding: 2,
        background: isChecked ? '#10b981' : 'var(--dsw-alias-border-l2, rgba(125, 125, 125, 0.3))',
        transition: 'background-color 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
        opacity: disabled ? 0.5 : 1,
        outline: 'none',
        boxSizing: 'border-box',
        ...style,
    };
    const thumbStyle = {
        pointerEvents: 'none',
        display: 'block',
        width: 16,
        height: 16,
        borderRadius: '50%',
        background: '#ffffff',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)',
        transform: isChecked ? 'translateX(16px)' : 'translateX(0px)',
        transition: 'transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    };
    return (_jsx("button", { type: "button", role: "switch", id: id, title: title, "aria-checked": isChecked, disabled: disabled, style: trackStyle, onClick: () => {
            const next = !isChecked;
            if (checked === undefined)
                setInternalChecked(next);
            onCheckedChange?.(next);
        }, className: cn('peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', isChecked ? 'bg-primary' : 'bg-muted', className), children: _jsx("span", { style: thumbStyle }) }));
}
//# sourceMappingURL=switch.js.map