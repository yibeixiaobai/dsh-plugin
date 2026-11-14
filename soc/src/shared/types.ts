export interface SocialPublisherGenericRouteResult {
  readonly status: number
  readonly data: any
  readonly headers?: Record<string, string>
}

/**
 * 社媒工作流阶段状态枚举
 */
export type SocialWorkflowStage = 'idle' | 'topics' | 'generating' | 'review' | 'publishing' | 'published'

/**
 * 工作流文章条目信息（供事件信封与前端高保真预览使用）
 */
export interface SocialWorkflowArticle {
  index: number
  title: string
  digest?: string
  format?: 'html' | 'markdown' | 'text' | 'json'
  content?: string
  images?: string[]
  articleFile?: string
}

/**
 * 候选选题条目信息
 */
export interface SocialWorkflowTopic {
  index: number
  title: string
  angle?: string
  risk?: string
  score?: number
  selected?: boolean
}

/**
 * 社媒多平台发布流水线结构化事件信封 (Social Workflow Event Envelope)
 * 用于工具执行与会话流之间进行 O(1) 确定性状态同步，彻底消除前端大文件正则猜测与脆弱性。
 */
export interface SocialWorkflowEvent {
  v: 1
  stage: SocialWorkflowStage
  platform: string
  accountId?: string
  accountName?: string
  topics?: SocialWorkflowTopic[]
  articles?: SocialWorkflowArticle[]
  step?: {
    id: string
    label?: string
    status: 'running' | 'completed' | 'failed'
  }
  publishedInfo?: {
    mediaId?: string
    draftId?: string
    scheduledTime?: string
    isVerified?: boolean
  }
}

/** 单篇文章发布明细 */
export interface SocialPublishArticleDetail {
  index: number
  title: string
  digest?: string
  url?: string
  draft_id?: string
  published?: boolean
  publish_id?: string
  status?: 'published' | 'unconfirmed' | 'failed' | 'scheduled' | 'draft_saved'
}

/** 任务执行与发布批次记录 */
export interface SocialPublishBatchRecord {
  id: string
  account_id: string
  account_name?: string
  platform: 'gzh' | 'zhihu' | 'xiaohongshu' | 'baijiahao' | 'toutiao' | string
  publish_mode?: 'api' | 'browser'
  article_type?: 'news' | 'newspic' | 'both'
  article_count: number
  author?: string
  timestamp: string
  draft_media_id?: string
  draft_media_ids?: string[]
  articles: string[]
  digests?: string[]
  status?: 'success' | 'unconfirmed' | 'failed'
  publish_action?: 'draft' | 'publish_now' | 'schedule'
  publish_status?: 'draft_saved' | 'publishing' | 'published' | 'scheduled' | 'failed'
  publish_id?: string
  scheduled_time?: string
  published_at?: string
  items?: SocialPublishArticleDetail[]
  session_id?: string
  batch_id?: string
}

export interface SocialPublishHistoryResponse {
  ok: boolean
  total_batches: number
  total_articles: number
  records: SocialPublishBatchRecord[]
  summary?: {
    success_count?: number
    failed_count?: number
    scheduled_count?: number
    draft_saved_count?: number
  }
}

export interface ISocialPublisherService {
  getConfig(options?: { includeSecrets?: boolean; scope?: string }): Promise<any>
  saveConfig(config: any): Promise<{ ok: boolean; message?: string; config?: any }>
  importConfig(
    data: any,
    mode?: 'merge' | 'overwrite',
  ): Promise<{ ok: boolean; summary?: any; message?: string; config?: any }>
  validateConfig(
    data: any,
  ): Promise<{ valid: boolean; summary?: any; errors?: string[]; warnings?: string[] }>
  loginPlatform(
    platform: string,
    accountId?: string,
  ): Promise<{ ok: boolean; message?: string; data?: any }>
  checkLoginStatus(
    platform: string,
    accountId?: string,
  ): Promise<{ valid: boolean; message?: string; data?: any }>
  testImageProvider(params: {
    base_url: string
    api_key?: string
    model: string
  }): Promise<{ ok: boolean; duration_ms?: number; error?: string }>
  getPublishHistory(accountId?: string): Promise<any>
  /**
   * 通用路由透明桥接器：将客户端按路径(/api/gzh-publisher/...)发起的调用直接在进程内调度执行，
   * 彻底避免经由 127.0.0.1:3088 本地端口转发，实现 0 端口原生 RPC。
   */
  handleGenericRoute(
    route: string,
    method?: string,
    body?: any,
    query?: Record<string, string>,
  ): Promise<SocialPublisherGenericRouteResult>
}
