export function setPendingSettingsSectionIntent(intent: any): void {
  if (typeof window !== 'undefined') {
    (window as any).__pendingSettingsSectionIntent = intent
  }
}
