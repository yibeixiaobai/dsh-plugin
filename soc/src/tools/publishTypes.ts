/**
 * 发布工具相关接口与参数类型定义
 */

import type { WechatOriginalResult } from '../wechat-browser.ts'
import type { SocialWorkflowEvent } from '../adapters/types.ts'

export type { WechatOriginalResult }

export interface ZhihuDraftInfo {
  draft_id: string
  title: string
  url: string
  published?: boolean
}

export interface PublishOk {
  account_id: string
  platform: string
  publish_mode?: 'api' | 'browser'
  dry_run: boolean
  media_id?: string
  media_ids?: string[]
  drafts?: ZhihuDraftInfo[]
  draft_url?: string
  article_count: number
  titles?: string[]
  verify: { checked: boolean; article_count?: number; results?: unknown[] }
  result_file: string
  already_published?: boolean
  dedup_note?: string
  original_result?: WechatOriginalResult
  publish_action?: 'draft' | 'publish_now' | 'schedule'
  publish_status?: 'draft_saved' | 'publishing' | 'published' | 'scheduled' | 'failed'
  publish_id?: string
  scheduled_time?: string
  scheduled_job_id?: string
  /** 定时设置失败原因：出现即表示「定时未在微信后台生效」，草稿仍在草稿箱 */
  schedule_error?: string
  needs_qr_confirmation?: boolean
  qr_screenshot?: string
  receipt_screenshot?: string
  auto_delayed?: boolean
  delay_reason?: string
  cleaned_duplicates_count?: number
  synced_schedule_tasks_count?: number
  cloudflare_recipe_id?: string
  encrypted_workflow_used?: boolean
  _social_event?: SocialWorkflowEvent
  trace_id?: string
  failure_snapshot_dir?: string
  task_id?: string
  manifest_fingerprint?: string
  archived_path?: string
  /** 【中文注释说明】：API 传入草稿失败后自动降级为浏览器全流程模式标记 */
  fallback_from_api?: boolean
  /** 【中文注释说明】：API 传入草稿失败的具体错误原因 */
  api_fallback_reason?: string
}

export interface PublishArgs {
  titles?: string[]
  digests?: string[]
  article_files?: string[]
  article_type?: 'news' | 'newspic'
  force?: boolean
  platform?: string
  account_id?: string
  auto_enable_original?: boolean
  publish_mode?: 'api' | 'browser'
  publish_action?: 'draft' | 'publish_now' | 'schedule'
  schedule_time?: string
  auto_sync_schedule?: boolean
  auto_clean_duplicates?: boolean
  duplicate_keep_strategy?: 'newest' | 'oldest'
  dry_run?: boolean
  user_confirmed?: boolean
  trace_id?: string
  task_id?: string
  signed_manifest_hash?: string
  signed_article_hashes?: Record<number, string>
  target_article_indices?: number[]
  combine_as_batch?: boolean
  workspace?: string
  owner_task_id?: string
  publish_immediately?: boolean
  from_unified_tool?: boolean
}
