import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
export function SettingsSegmentedTabs({ items, activeId, value, onChange, onValueChange, className, }) {
    const current = activeId ?? value;
    const handleSelect = (key) => {
        onChange?.(key);
        onValueChange?.(key);
    };
    return (_jsx("div", { style: {
            display: 'inline-flex',
            gap: '4px',
            padding: '3px',
            borderRadius: '8px',
            background: 'var(--dsw-surface-subtle, rgba(0,0,0,0.05))',
            border: '1px solid var(--dsw-border-subtle, rgba(0,0,0,0.1))',
        }, className: className, children: items.map((tab, idx) => {
            const tabKey = (tab.id ?? tab.value ?? String(idx));
            const active = tabKey === current;
            return (_jsxs("button", { type: "button", onClick: () => handleSelect(tabKey), style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '4px 12px',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 400,
                    borderRadius: '6px',
                    border: 'none',
                    cursor: 'pointer',
                    background: active ? 'var(--dsw-surface-panel, #ffffff)' : 'transparent',
                    color: active ? 'var(--dsw-text-primary, #000000)' : 'var(--dsw-text-secondary, #666666)',
                    boxShadow: active ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                    transition: 'all 0.15s ease',
                }, children: [tab.icon, _jsx("span", { children: tab.label })] }, tabKey));
        }) }));
}
//# sourceMappingURL=SettingsSegmentedTabs.js.map