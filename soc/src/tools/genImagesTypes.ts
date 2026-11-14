/**
 * 生图工具接口与参数类型定义
 */

export interface GenItem {
  kind: 'cover' | 'content' | 'pic'
  index: number
  sub?: number
  prompt: string
  out: string
  size: [number, number]
  source?: 'ai' | 'search'
  search_query?: string
  zh_only?: boolean
}

export interface GenReport {
  account_id: string
  task_id?: string
  manifest_fingerprint?: string
  generated: Array<{ out: string; w?: number; h?: number; dry_run?: boolean; fallback?: boolean; source?: string }>
  failed: Array<{ index?: number; sub?: number; error: string }>
  dry_run: boolean
  provider_used?: string
  provider_attempts?: Array<{ provider_id: string; error: string }>
}

export interface ImageItemInput {
  kind?: string
  type?: string
  index: number | string
  sub?: number | string
  prompt?: string
  description?: string
  text?: string
  title?: string
  source?: 'ai' | 'search'
  search_query?: string
}
