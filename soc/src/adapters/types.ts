import type { RecipeTicket } from '../cf-worker/types.ts'
import type { Config, PublishAction } from '../config.ts'

export type PlatformType = 'gzh' | 'zhihu' | 'baijiahao' | 'toutiao' | 'xiaohongshu'

/** 平台发布与交互能力自省契约 */
export interface PlatformCapabilities {
  readonly id: PlatformType
  readonly displayName: string
  readonly supportedModes: ('api' | 'browser')[]
  readonly supportedActions: PublishAction[]
  readonly articleFormat: 'html' | 'markdown' | 'text' | 'json'
  readonly maxTitleLength: number
  readonly maxDigestLength: number
  readonly maxArticlesPerBatch: number
  readonly coverAspectRatios: string[]
  readonly supportsOriginalDeclaration: boolean
  readonly supportsBrandImages: boolean
  readonly supportsScheduledSlots: boolean
  readonly supportedArticleTypes?: ('news' | 'newspic' | 'xhs_note' | 'article')[]
  readonly supportsBatchCombination?: boolean
}

/** 统一发布执行上下文（标准化入参） */
export interface PublishContext {
  cfg: Config
  accountId: string
  ownerTaskId?: string
  platform: PlatformType
  titles: string[]
  digests: string[]
  articleFiles?: string[]
  articleType?: 'news' | 'newspic'
  publishMode?: 'api' | 'browser'
  publishAction?: PublishAction
  scheduleTime?: string
  force?: boolean
  autoEnableOriginal?: boolean
  scriptsDir: string
  /** 可选：定时发布时是否自动同步云端微信后台定时任务（缺省 true） */
  autoSyncSchedule?: boolean
  /** 可选：定时发布前是否自动同步草稿箱并清理重复冗余草稿（缺省 true） */
  autoCleanDuplicates?: boolean
  /** 可选：清理重复草稿时的保留策略（keep_latest: 保留最新，keep_complete: 保留最完整，keep_oldest: 保留最早，缺省 keep_latest） */
  duplicateKeepStrategy?: 'keep_latest' | 'keep_complete' | 'keep_oldest'
  /** 可选：是否以演练模式执行（默认读取 cfg.runtime.dry_run） */
  dryRun?: boolean
  /** 全链路链路追踪 ID（修复依据：贯穿各层日志与快照定位） */
  traceId?: string
  /** 任务沙箱标识符与沙箱上下文 */
  taskId?: string
  sandbox?: any
  signedManifestHash?: string
  /** 可选：按篇独立审校签名指纹映射表（篇号 -> 签名指纹） */
  signedArticleHashes?: Record<number, string>
  /** 可选：局部发布目标篇目序号列表（缺省发布沙箱内全量文章） */
  targetArticleIndices?: number[]
  /** 可选：微信公众号多篇长文是否组合为一个多图文合辑草稿（定时发布缺省 false 独立多槽位，草稿/群发缺省 true） */
  combineAsBatch?: boolean
  needsInteractiveLogin?: boolean
  recipeTicket?: RecipeTicket
  encryptedWorkflowUsed?: boolean
}

/** 规范化的单篇文章发布状态与信息条目 */
export interface StandardPublishItem {
  index: number
  title: string
  digest?: string
  draftId?: string
  url?: string
  published?: boolean
  status: 'draft_saved' | 'publishing' | 'published' | 'scheduled' | 'unconfirmed' | 'failed'
  warning?: string
  note?: string
  rawId?: string
}

/** 规范化的批量发布执行结果 */
export interface StandardPublishResult {
  accountId: string
  platform: PlatformType
  publishMode?: 'api' | 'browser'
  publishAction?: PublishAction
  dryRun: boolean
  alreadyPublished?: boolean
  dedupNote?: string
  articleCount: number
  titles: string[]
  items: StandardPublishItem[]
  mediaId?: string
  mediaIds?: string[]
  resultFile: string
  scheduledTime?: string
  scheduledJobId?: string
  /** 定时设置失败原因（后台定时未生效时给出；有此字段即表示定时未成立） */
  scheduleError?: string
  originalResult?: unknown
  needsQrConfirmation?: boolean
  cloudflareRecipeId?: string
  encryptedWorkflowUsed?: boolean
  qrScreenshot?: string
  receiptScreenshot?: string
  verify: { checked: boolean; article_count?: number; results?: unknown[] }
  /** 自动清理重复草稿的篇数 */
  cleanedDuplicatesCount?: number
  /** 自动同步最新云端定时任务的项数 */
  syncedScheduleTasksCount?: number
  /** 全链路链路追踪 ID（修复依据：贯穿各层日志与快照定位） */
  traceId?: string
  /** 任务沙箱标识符与沙箱上下文 */
  taskId?: string
  sandbox?: any
  signedManifestHash?: string
  /** 发生严重异常或熔断时的现场快照目录（修复依据：提供秒级排障快照路径） */
  failureSnapshotDir?: string
  /** 【中文注释说明】：微信 API 传入草稿失败后自动降级为浏览器全流程模式标记 */
  fallbackFromApi?: boolean
  /** 【中文注释说明】：微信 API 传入草稿失败的具体错误原因 */
  apiFallbackReason?: string
}

/** 统一的登录态自检结果 */
export interface LoginCheckResult {
  loggedIn: boolean
  accountId: string
  platform: PlatformType
  error?: string
  data?: unknown
}

/** 统一的扫码登录触发结果 */
export interface QrLoginResult {
  ok: boolean
  accountId: string
  platform: PlatformType
  qrReady?: boolean
  qrImage?: string
  message?: string
  error?: string
  data?: unknown
}

/** 标准社交媒体平台发布驱动适配器接口 (Target Interface) */
export interface ISocialPlatformAdapter {
  readonly capabilities: PlatformCapabilities

  /** 检测指定账号的登录态 */
  checkLogin(cfg: Config, accountId: string): Promise<LoginCheckResult>

  /** 触发指定账号的扫码登录流程 */
  triggerQrLogin(cfg: Config, accountId: string, options?: { timeoutMs?: number }): Promise<QrLoginResult>

  /** 发布前业务规则与参数前置校验 */
  validateBeforePublish(ctx: PublishContext): Promise<{ valid: boolean; errors: string[] }>

  /** 执行多文章发布（草稿/直发/排期） */
  publish(ctx: PublishContext): Promise<StandardPublishResult>

  /** 可选：自愈式状态回查核验（如小红书 note-manager 补核对） */
  reconcile?(cfg: Config, accountId: string): Promise<void>
}

/** 社媒工作流阶段状态枚举 */
export type SocialWorkflowStage = 'idle' | 'topics' | 'generating' | 'review' | 'publishing' | 'published'

/** 工作流文章条目信息 */
export interface SocialWorkflowArticle {
  index: number
  title: string
  digest?: string
  format?: 'html' | 'markdown' | 'text' | 'json'
  content?: string
  images?: string[]
  articleFile?: string
}

/** 候选选题条目信息 */
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
    receiptScreenshot?: string
    qrScreenshot?: string
  }
}

/** 弹性 DOM 元素选择器定义 */
export interface ElementRecipe {
  name: string
  description?: string
  /** 候选选择器降级链：高优先级在前，一旦匹配成功立即返回 */
  selectors: string[]
  /** 匹配失败时的行为：throw（报错熔断）| skip（跳过并警告）| retry（重试） */
  fallbackBehavior?: 'throw' | 'skip' | 'retry'
}

/** 平台专属 DOM 动作配方字典 */
export type PlatformRecipe = Record<string, ElementRecipe>
