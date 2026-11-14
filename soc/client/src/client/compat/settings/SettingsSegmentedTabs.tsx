import * as React from 'react'

export interface SettingsTabItem<T extends string = string> {
  id?: T
  value?: T
  label: string
  icon?: React.ReactNode
}

export interface SettingsSegmentedTabsProps<T extends string = string> {
  items: readonly SettingsTabItem<any>[]
  activeId?: string
  value?: string
  onChange?: (id: any) => void
  onValueChange?: (val: any) => void
  className?: string
}

export function SettingsSegmentedTabs<T extends string = string>({
  items,
  activeId,
  value,
  onChange,
  onValueChange,
  className,
}: SettingsSegmentedTabsProps<T>) {
  const current = activeId ?? value
  const handleSelect = (key: any) => {
    onChange?.(key)
    onValueChange?.(key)
  }
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: '4px',
        padding: '3px',
        borderRadius: '8px',
        background: 'var(--dsw-surface-subtle, rgba(0,0,0,0.05))',
        border: '1px solid var(--dsw-border-subtle, rgba(0,0,0,0.1))',
      }}
      className={className}
    >
      {items.map((tab, idx) => {
        const tabKey = (tab.id ?? tab.value ?? String(idx)) as string
        const active = tabKey === current
        return (
          <button
            key={tabKey}
            type="button"
            onClick={() => handleSelect(tabKey)}
            style={{
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
            }}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        )
      })}
    </div>
  )
}
