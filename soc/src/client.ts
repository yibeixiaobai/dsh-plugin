/** Browser-safe Social Publisher vocabulary. @module @deepseek-ai/dsh-social-publisher/client */
export type * from './types.ts'
export * from './shared/types.ts'
export * from './shared/authCredentials.ts'
export * from './shared/socialAccountQuota.ts'

export function isBrandGeoEnabled(): boolean {
  return false
}

export function buildLocalMediaPreviewUrl(filePath: string): string {
  if (!filePath) return ''
  if (filePath.startsWith('http://') || filePath.startsWith('https://') || filePath.startsWith('data:')) {
    return filePath
  }
  return `dsh-resource://file/${encodeURIComponent(filePath)}`
}
