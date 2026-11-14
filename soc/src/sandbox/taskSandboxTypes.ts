/**
 * 任务沙箱与物料清单类型定义契约
 * 遵循 specs/social-publisher-task-isolation-and-dedup.md
 */
import type { Config, CoverRatio } from '../config.ts'

/**
 * 阶段一规划的配图槽位蓝图契约 (Visual Blueprint)
 * 用于在正文创作时同步规划配图占位与构思描述，阶段二异步实体化
 */
export interface VisualSlotBlueprint {
  slotId: string // 如 "cover_1", "content_1_1", "pic_1_1"
  index: number // 篇目序号 (1~N)
  sub?: number // 篇内子图序号
  kind: 'cover' | 'content' | 'pic'
  ratio: CoverRatio
  title?: string
  contextText?: string // 所在段落的核心上下文
  intentDescription?: string // 画面构思描述
  generationPrompt?: string // 生图提示词
  searchKeywords?: string[] // 备选真实搜图关键词
  status: 'planned' | 'processing' | 'completed' | 'failed'
  resolvedImagePath?: string
  resolvedImageHash?: string
}

export interface SandboxedArticleMeta {
  index: number
  title: string
  digest: string
  format: 'html' | 'markdown' | 'text'
  filePath: string // 绝对路径
  fileName: string // 相对文件名
  contentHash: string // sha256
  coverImage?: {
    path: string
    fileName: string
    hash: string
    ratio: CoverRatio
  }
  contentImages: Array<{
    sub: number
    path: string
    fileName: string
    hash: string
    key?: string
  }>
  visualSlots?: VisualSlotBlueprint[]
  /** 篇级独立防篡改指纹 (sha256 of index + contentHash + coverHash + contentImagesHashes) */
  articleFingerprint?: string
}

export interface PhysicalIntegrityResult {
  valid: boolean
  mismatchedFiles: Array<{
    filePath: string
    expectedHash: string
    actualHash: string
    fileKind: 'article' | 'cover' | 'content_image'
  }>
  missingFiles: string[]
}

export interface SandboxedTargetGroup {
  platform: 'gzh' | 'xiaohongshu' | 'zhihu' | 'baijiahao' | 'toutiao'
  accountId: string
  accountName?: string
  articleType: 'news' | 'newspic'
  targetDir: string // 绝对路径: tasks/active/<taskId>/<platform>_<accountId>
  articlesDir: string
  imagesDir: string
  articles: SandboxedArticleMeta[]
  validation?: {
    passed: boolean
    checkedAt: string
    errors: string[]
  }
  review?: {
    confirmed: boolean
    signedHash?: string
    /** 按篇独立审校指纹集合 (篇号 -> 指纹) */
    signedArticleHashes?: Record<number, string>
    confirmedAt?: string
  }
  publishResult?: {
    status: 'success' | 'failed' | 'scheduled' | 'dry_run'
    mediaId?: string
    draftUrl?: string
    publishedAt?: string
    scheduledTime?: string
    receiptFile?: string
    error?: string
  }
}

export type PipelineMode = 'batch_phase' | 'per_article'

export interface PipelineTracker {
  mode: PipelineMode
  totalArticles: number
  writtenIndexes: number[]
  imagedIndexes: number[]
  phase: 'writing' | 'imaging' | 'reviewing'
}

export interface TaskMaterialManifest {
  version: 2
  taskId: string
  traceId?: string
  workspacePath?: string // 执行该任务会话所属的项目文件夹绝对路径
  createdAt: string
  updatedAt: string
  stage: 'initialized' | 'content_ready' | 'images_ready' | 'validated' | 'reviewed' | 'published'
  sealed?: boolean // 发布终局封签锁定标志：一旦确认发布即物理封签，严禁二次修改
  targets: Record<string, SandboxedTargetGroup> // key: `${platform}_${accountId}`
  visualSlots?: VisualSlotBlueprint[]
  pipelineTracker?: PipelineTracker
}

export interface TaskSandboxContext {
  cfg: Partial<Config> | undefined
  taskId: string
  rootDir: string
  manifestPath: string
  manifest: TaskMaterialManifest
  targetKey: string
  targetGroup: SandboxedTargetGroup
  scriptsDir: string
  workspacePath?: string
}
