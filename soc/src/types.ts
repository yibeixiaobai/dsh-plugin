// 社媒发布插件基础协议与类型定义
import type { CloudflareWorkerConfig } from './cf-worker/types.ts'

export interface WechatConfig {
  appid: string
  app_secret: string
  author_name: string
  brand_name: string
  auto_enable_original?: boolean
}

export type ArticleType = 'news' | 'newspic' | 'both'

export type ThemeKey = 'wenying' | 'olive' | 'graphite' | 'moyu' | 'redwhite' | 'zen'
export type CoverRatio = '2.35:1' | '21:9' | '16:9' | '1:1' | '3:4'

export type PublishAction = 'draft' | 'publish_now' | 'schedule'
export type PublishMode = 'api' | 'browser'
export type Platform = 'gzh' | 'zhihu' | 'xiaohongshu' | 'baijiahao' | 'toutiao' | (string & {})

export interface ContentConfig {
  article_type?: ArticleType
  sync_newspic?: boolean
  articles_per_day: number
  newspic_articles_per_day?: number
  min_words: number
  topics: string[]
  forbidden_words: string[]
  ending_guide_required: boolean
  newspic_images_per_article?: number
  newspic_image_ratio?: CoverRatio
  newspic_min_words?: number
  multi_article_pipeline_mode?: 'batch_phase' | 'per_article'

  // 融合：正文排版设计（实现一号一配置）
  headline_theme?: ThemeKey | 'rotate'
  secondary_theme?: ThemeKey | 'rotate'
  font_size?: string
  line_height?: string
  paragraph_margin?: string
  text_indent?: string

  // 融合：封面与配图规格（实现一号一配置）
  headline_cover_ratio?: CoverRatio
  secondary_cover_ratio?: CoverRatio
  /** 【中文说明】：正文高清插图比例（默认 16:9 宽屏信息看板与架构图谱） */
  content_image_ratio?: CoverRatio
  content_images_per_article?: number
  image_count_mode?: 'auto' | 'custom'
  ai_images_per_article?: number
  search_images_per_article?: number
  cover_lang_zh_only?: boolean
  content_image_lang_zh_only?: boolean
  image_lang_zh_only?: boolean

  // 动态热点与搜索追踪
  enable_hot_tracking?: boolean
  preferred_topic_angles?: string[]

  // 小红书专属配置
  xhs_images_per_note?: number
  xhs_image_count_mode?: 'auto' | 'custom'
  xhs_ai_images_per_note?: number
  xhs_search_images_per_note?: number
  xhs_min_words?: number
  xhs_tags?: string[]

  // 发布动作与定时设置
  publish_action_default?: PublishAction
  schedule_default_time?: string
}

export interface TypographyConfig {
  headline_theme: ThemeKey | 'rotate'
  secondary_theme: ThemeKey | 'rotate'
  font_size: string
  line_height: string
  paragraph_margin: string
  text_indent: string
}

export interface ImageApiConfig {
  base_url: string
  api_key: string
  model: string
  headline_cover_ratio: CoverRatio
  secondary_cover_ratio: CoverRatio
  content_image_ratio?: CoverRatio
  content_images_per_article: number
  cover_lang_zh_only?: boolean
  content_image_lang_zh_only?: boolean
  image_lang_zh_only: boolean
  concurrency?: number
}

export type BrandImageFit = 'contain' | 'cover' | 'fill'
export type BrandImagePosition = 'top' | 'center' | 'bottom'

export interface BrandImageConfig {
  enabled: boolean
  file: string
  width: number
  height: number
  fit: BrandImageFit
  position: BrandImagePosition
  radius: number
  margin_top: number
  margin_bottom: number
  frame: boolean
}

export interface BrandImagesConfig {
  header: BrandImageConfig
  footer: BrandImageConfig
}

export interface AccountProfile {
  platform: Platform
  name: string
  enabled: boolean
  publish_mode?: PublishMode
  appid?: string
  app_secret?: string
  author_name?: string
  brand_name?: string
  publish_immediately?: boolean
  publish_action_default?: PublishAction
  schedule_default_time?: string
  /** 普通长文排期候选时段列表，如 ["08:30", "20:00"] */
  schedule_times_article?: string[]
  /** 小绿书排期候选时段列表，如 ["12:00", "18:00", "21:30"] */
  schedule_times_newspic?: string[]
  /** 当排期时段已被占用或已过去时，是否自动向后顺延（默认 true） */
  schedule_auto_delay?: boolean
  /** 发生时间冲突时顺延的最小分钟间隔（默认 30） */
  schedule_conflict_interval_mins?: number
  auto_enable_original?: boolean
  content?: ContentConfig
  brand_images?: BrandImagesConfig
}

export interface ImageProviderConfig {
  enabled: boolean
  name: string
  base_url: string
  api_key: string
  model: string
  priority: number
}

export interface RuntimeConfig {
  project_root: string
  python_path: string
  request_timeout_ms: number
  dry_run: boolean
  verify_after_publish: boolean
  use_upload_cache: boolean
  need_open_comment: boolean
  chrome_path: string
  zhihu_headless: boolean
  gzh_headless?: boolean
  xhs_headless?: boolean
  baijiahao_headless?: boolean
  baijiahao_reveal_on_challenge?: boolean
  toutiao_headless?: boolean
  toutiao_reveal_on_challenge?: boolean
  api_port?: number
}

export interface Config {
  accounts: Record<string, AccountProfile>
  default_account: string
  image_providers: Record<string, ImageProviderConfig>
  wechat: WechatConfig
  content: ContentConfig
  typography: TypographyConfig
  image_api: ImageApiConfig
  brand_images?: BrandImagesConfig
  runtime: RuntimeConfig
  cloudflare_worker?: CloudflareWorkerConfig
}
