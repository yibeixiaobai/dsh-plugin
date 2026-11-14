import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '../lib/utils.js';
export const Input = React.forwardRef(function Input({ className, type = 'text', style, disabled, ...props }, ref) {
    const computedStyle = {
        display: 'flex',
        height: 32,
        width: '100%',
        borderRadius: 6,
        border: '1px solid var(--dsw-alias-border-l2, rgba(125, 125, 125, 0.25))',
        background: 'var(--dsw-alias-bg-layer-2, rgba(125, 125, 125, 0.05))',
        color: 'var(--dsw-alias-label-primary, inherit)',
        padding: '4px 10px',
        fontSize: 13,
        outline: 'none',
        boxSizing: 'border-box',
        transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'text',
        ...style,
    };
    return (_jsx("input", { type: type, ref: ref, disabled: disabled, style: computedStyle, className: cn('flex h-8 w-full rounded-md border border-border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className), ...props }));
});
//# sourceMappingURL=input.js.map