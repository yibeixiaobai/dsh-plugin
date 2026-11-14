import { Component, type ErrorInfo, type ReactNode } from 'react';
export type ScopedErrorBoundaryVariant = 'panel' | 'inline' | 'compact' | 'silent';
export interface ScopedErrorBoundaryProps {
    scope: string;
    variant?: ScopedErrorBoundaryVariant;
    children: ReactNode;
    fallback?: ReactNode;
    onReset?: () => void;
    resetKeys?: unknown[];
}
export declare class ScopedErrorBoundary extends Component<ScopedErrorBoundaryProps, {
    error: Error | null;
}> {
    state: {
        error: Error | null;
    };
    static getDerivedStateFromError(error: unknown): {
        error: Error | null;
    };
    componentDidCatch(error: unknown, info: ErrorInfo): void;
    componentDidUpdate(prevProps: ScopedErrorBoundaryProps): void;
    render(): ReactNode;
}
//# sourceMappingURL=ErrorBoundary.d.ts.map