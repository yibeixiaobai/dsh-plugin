export interface ProviderSettingsFormProvider {
  readonly id?: string
  readonly providerId?: string
  readonly name?: string
  readonly enabled?: boolean
  readonly models?: readonly any[]
  readonly config?: any
  readonly personalConfig?: any
}

export function getProviderFormLabel(provider: string): string {
  return provider || 'Provider'
}

export function getProviderFormApiKey(target: any): string {
  if (!target) return ''
  return target.config?.apiKey || target.config?.api?.key || target.personalConfig?.apiKey || ''
}
