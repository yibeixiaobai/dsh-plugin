import { jsx as _jsx } from "react/jsx-runtime";
import * as React from 'react';
import { cn } from '../lib/utils.js';
export const Button = React.forwardRef(function Button({ className, variant = 'default', size = 'default', style, disabled, ...props }, ref) {
    const baseClasses = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:pointer-events-none';
    const variantStyleMap = {
        default: {
            background: '#10b981',
            color: '#ffffff',
            border: '1px solid #059669',
            boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
        },
        outline: {
            background: 'transparent',
            color: 'var(--dsw-alias-label-primary, inherit)',
            border: '1px solid var(--dsw-alias-border-l2, rgba(125, 125, 125, 0.25))',
        },
        secondary: {
            background: 'var(--dsw-alias-bg-layer-2, rgba(125, 125, 125, 0.1))',
            color: 'var(--dsw-alias-label-primary, inherit)',
            border: '1px solid var(--dsw-alias-border-l1, rgba(125, 125, 125, 0.15))',
        },
        ghost: {
            background: 'transparent',
            color: 'var(--dsw-alias-label-secondary, #6b7280)',
            border: '1px solid transparent',
        },
        destructive: {
            background: '#ef4444',
            color: '#ffffff',
            border: '1px solid #dc2626',
        },
        warning: {
            background: '#d97706',
            color: '#ffffff',
            border: '1px solid #b45309',
        },
        link: {
            background: 'transparent',
            color: '#10b981',
            border: 'none',
            textDecoration: 'underline',
            padding: 0,
        },
    };
    const sizeStyleMap = {
        default: { height: 32, padding: '0 12px', fontSize: 13, gap: 6 },
        xs: { height: 22, padding: '0 6px', fontSize: 11, gap: 4 },
        sm: { height: 28, padding: '0 10px', fontSize: 12, gap: 5 },
        lg: { height: 38, padding: '0 16px', fontSize: 14, gap: 8 },
        icon: { width: 32, height: 32, padding: 0 },
        'icon-xs': { width: 20, height: 20, padding: 0 },
        'icon-sm': { width: 24, height: 24, padding: 0 },
        'icon-md': { width: 28, height: 28, padding: 0 },
        'icon-lg': { width: 36, height: 36, padding: 0 },
    };
    const computedStyle = {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 500,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.15s ease',
        boxSizing: 'border-box',
        lineHeight: 1,
        userSelect: 'none',
        ...variantStyleMap[variant],
        ...sizeStyleMap[size],
        ...style,
    };
    return (_jsx("button", { ref: ref, disabled: disabled, style: computedStyle, className: cn(baseClasses, className), ...props }));
});
//# sourceMappingURL=button.js.map