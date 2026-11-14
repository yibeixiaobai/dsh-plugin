export interface ArticleProduceItem {
  index?: number
  title: string
  content: string
  digest?: string
  format?: 'html' | 'markdown' | 'text'
  visual_slots?: Array<{
    role?: 'cover' | 'inline' | 'card'
    aspect_ratio?: '3:4' | '16:9' | '1:1' | '2.35:1'
    description: string
    prompt: string
    source?: 'gen' | 'search'
    search_query?: string
  }>
}

export interface SocialPublisherToolArgs {
  action: 'detect_login' | 'get_content_rules' | 'produce' | 'publish' | 'manage_schedule'
  action_type?: 'sync' | 'cancel' | 'list'
  schedule_action?: 'sync' | 'cancel' | 'list'
  schedule_task_id?: string
  account_id?: string
  platform?: string
  workspace?: string
  title?: string
  titles?: string[]
  digests?: string[]
  article_files?: string[]
  article_type?: 'news' | 'newspic'
  content?: string
  articles?: ArticleProduceItem[]
  visual_slots?: Array<{
    role?: 'cover' | 'inline' | 'card'
    aspect_ratio?: '3:4' | '16:9' | '1:1' | '2.35:1'
    description: string
    prompt: string
    source?: 'gen' | 'search'
    search_query?: string
  }>
  task_id?: string
  dry_run?: boolean
  publish_action?: 'draft' | 'publish_now' | 'schedule'
  schedule_time?: string
  publish_immediately?: boolean
  user_confirmed?: boolean
  signed_manifest_hash?: string
  signed_article_hashes?: Record<number, string>
  target_article_indices?: number[]
  combine_as_batch?: boolean
  force?: boolean
}
