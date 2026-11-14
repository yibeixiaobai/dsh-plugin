import { Component, type ErrorInfo, type ReactNode } from 'react'

export type ScopedErrorBoundaryVariant = 'panel' | 'inline' | 'compact' | 'silent'

export interface ScopedErrorBoundaryProps {
  scope: string
  variant?: ScopedErrorBoundaryVariant
  children: ReactNode
  fallback?: ReactNode
  onReset?: () => void
  resetKeys?: unknown[]
}

export class ScopedErrorBoundary extends Component<
  ScopedErrorBoundaryProps,
  { error: Error | null }
> {
  override state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: Error | null } {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[ScopedErrorBoundary:${this.props.scope}] crashed:`, error, info.componentStack)
  }

  override componentDidUpdate(prevProps: ScopedErrorBoundaryProps): void {
    if (this.state.error && prevProps.resetKeys !== this.props.resetKeys) {
      this.setState({ error: null })
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback
      if (this.props.variant === 'silent') return null
      return (
        <div
          style={{
            padding: '8px 12px',
            color: 'var(--dsw-danger-text, #ef4444)',
            fontSize: '12px',
            background: 'var(--dsw-danger-subtle, rgba(239,68,68,0.1))',
            borderRadius: '6px',
            margin: '4px 0',
          }}
        >
          <div>
            <strong>[{this.props.scope}]</strong> {this.state.error.message}
          </div>
          <button
            type="button"
            style={{
              marginTop: '4px',
              fontSize: '11px',
              padding: '2px 8px',
              cursor: 'pointer',
              borderRadius: '4px',
              border: '1px solid currentColor',
              background: 'transparent',
              color: 'inherit',
            }}
            onClick={() => this.setState({ error: null })}
          >
            Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
