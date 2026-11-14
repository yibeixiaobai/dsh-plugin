import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Component } from 'react';
export class ScopedErrorBoundary extends Component {
    state = { error: null };
    static getDerivedStateFromError(error) {
        return { error: error instanceof Error ? error : new Error(String(error)) };
    }
    componentDidCatch(error, info) {
        console.error(`[ScopedErrorBoundary:${this.props.scope}] crashed:`, error, info.componentStack);
    }
    componentDidUpdate(prevProps) {
        if (this.state.error && prevProps.resetKeys !== this.props.resetKeys) {
            this.setState({ error: null });
        }
    }
    render() {
        if (this.state.error) {
            if (this.props.fallback)
                return this.props.fallback;
            if (this.props.variant === 'silent')
                return null;
            return (_jsxs("div", { style: {
                    padding: '8px 12px',
                    color: 'var(--dsw-danger-text, #ef4444)',
                    fontSize: '12px',
                    background: 'var(--dsw-danger-subtle, rgba(239,68,68,0.1))',
                    borderRadius: '6px',
                    margin: '4px 0',
                }, children: [_jsxs("div", { children: [_jsxs("strong", { children: ["[", this.props.scope, "]"] }), " ", this.state.error.message] }), _jsx("button", { type: "button", style: {
                            marginTop: '4px',
                            fontSize: '11px',
                            padding: '2px 8px',
                            cursor: 'pointer',
                            borderRadius: '4px',
                            border: '1px solid currentColor',
                            background: 'transparent',
                            color: 'inherit',
                        }, onClick: () => this.setState({ error: null }), children: "Retry" })] }));
        }
        return this.props.children;
    }
}
//# sourceMappingURL=ErrorBoundary.js.map