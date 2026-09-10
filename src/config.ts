// 插件快捷设置：Schemastery schema 会渲染进 dsh 设置界面，
// 改动热重载后 apply(ctx, config) 以新配置重新执行。
// 默认值取自 brand_assets/wenying_academic.json 与 scripts/wx_config.json 现状。
import Schema from '@deepseek-ai/schemastery'

export interface WechatConfig {
  appid: string
  app_secret: string
  author_name: string
  brand_name: string
}

export interface ContentConfig {
  articles_per_day: number
  min_words: number
  topics: string[]
  forbidden_words: string[]
  ending_guide_required: boolean
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
  content_images_per_article: number
  image_lang_zh_only: boolean
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
  name: string
  enabled: boolean
  appid: string
  app_secret: string
  author_name: string
  brand_name: string
  content: ContentConfig
  brand_images: BrandImagesConfig
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
}

export interface Config {
  accounts: Record<string, AccountProfile>
  default_account: string
  image_providers: Record<string, ImageProviderConfig>
  wechat: WechatConfig
  content: ContentConfig
  typography: TypographyConfig
  image_api: ImageApiConfig
  brand_images: BrandImagesConfig
  runtime: RuntimeConfig
}

// gzh_components.py THEMES 的键，主题名映射见 styleGuide 工具
export type ThemeKey = 'wenying' | 'olive' | 'graphite' | 'moyu' | 'redwhite' | 'zen'
export type CoverRatio = '2.35:1' | '21:9' | '16:9' | '1:1'

export const THEME_KEYS: ThemeKey[] = ['wenying', 'olive', 'graphite', 'moyu', 'redwhite', 'zen']

export const THEME_NAMES: Record<ThemeKey, string> = {
  wenying: '文映学术（品牌专属 酒红+金）',
  olive: '橄榄手记',
  graphite: '石墨极简',
  moyu: '摸鱼绿',
  redwhite: '红白色系',
  zen: '留白禅意',
}

export const COVER_SIZES: Record<CoverRatio, [number, number]> = {
  '2.35:1': [3520, 1498],
  '21:9': [3520, 1500],
  '16:9': [3024, 1701],
  '1:1': [1920, 1920],
}

export const DEFAULT_BRAND_IMAGES: BrandImagesConfig = {
  header: {
    enabled: true,
    file: 'brand_top.jpg',
    width: 100,
    height: 0,
    fit: 'contain',
    position: 'center',
    radius: 0,
    margin_top: 0,
    margin_bottom: 0,
    frame: false,
  },
  footer: {
    enabled: true,
    file: 'brand_bot.jpg',
    width: 60,
    height: 0,
    fit: 'contain',
    position: 'center',
    radius: 0,
    margin_top: 20,
    margin_bottom: 0,
    frame: false,
  },
}

export const DEFAULT_IMAGE_PROVIDER: ImageProviderConfig = {
  enabled: true,
  name: '默认生图接口',
  base_url: 'https://api.a6api.com',
  api_key: '',
  model: 'gpt-image-2',
  priority: 0,
}

export const DEFAULT_TOPICS = [
  '期刊发表', '专著出版', '论文发表', '专利申办', '国际刊', 'SCI', 'EI', '职称评审',
]

export const DEFAULT_FORBIDDEN_WORDS = [
  '查重', '降重', '检测', '论文检测中心', 'AIGC查降重',
  '撤稿', '学术不端', '倒查', '论文工厂', '学术打假',
]

export const DEFAULT_CONTENT: ContentConfig = {
  articles_per_day: 6,
  min_words: 2000,
  topics: DEFAULT_TOPICS,
  forbidden_words: DEFAULT_FORBIDDEN_WORDS,
  ending_guide_required: true,
}

const ContentSchema = Schema.object({
  articles_per_day: Schema.number().min(1).max(10).step(1).default(6).description('每日文章数（组合为 1 个多图文草稿）'),
  min_words: Schema.number().min(500).max(10000).step(100).default(2000).description('每篇纯文字下限（字）'),
  topics: Schema.array(Schema.string()).role('table').default(DEFAULT_TOPICS).description('选题方向'),
  forbidden_words: Schema.array(Schema.string()).role('table').default(DEFAULT_FORBIDDEN_WORDS).description('禁词表（任何一篇出现即失败）'),
  ending_guide_required: Schema.boolean().default(true).description('结尾必须自然引导关注品牌'),
})

const BrandImageSchema = Schema.object({
  enabled: Schema.boolean().default(true).description('是否使用该品牌图'),
  file: Schema.string().default('').description('brand_assets 目录内的图片文件名或相对路径'),
  width: Schema.number().min(10).max(100).step(1).default(100).description('显示宽度（文章宽度百分比）'),
  height: Schema.number().min(0).max(2000).step(10).default(0).description('固定显示高度（px，0=按原图比例）'),
  fit: Schema.union(['contain', 'cover', 'fill']).default('contain').description('图片适配方式'),
  position: Schema.union(['top', 'center', 'bottom']).default('center').description('裁切或留白时的垂直对齐'),
  radius: Schema.number().min(0).max(100).step(1).default(0).description('图片圆角（px）'),
  margin_top: Schema.number().min(0).max(200).step(1).default(0).description('图片上方间距（px）'),
  margin_bottom: Schema.number().min(0).max(200).step(1).default(0).description('图片下方间距（px）'),
  frame: Schema.boolean().default(false).description('是否使用白色卡片边框和阴影包裹'),
})

const AccountSchema = Schema.object({
  name: Schema.string().default('默认账号').description('账号显示名称'),
  enabled: Schema.boolean().default(true).description('是否启用'),
  appid: Schema.string().default('').description('公众号 AppID'),
  app_secret: Schema.string().role('secret').default('').description('公众号 AppSecret'),
  author_name: Schema.string().default('文映学术win00.cn').description('文章作者名'),
  brand_name: Schema.string().default('文映千秋学术网').description('品牌名（结尾引导语必须包含）'),
  content: ContentSchema,
  brand_images: Schema.object({
    header: BrandImageSchema,
    footer: BrandImageSchema,
  }).description('该账号的头尾品牌图'),
})

const ImageProviderSchema = Schema.object({
  enabled: Schema.boolean().default(true).description('是否启用该接口'),
  name: Schema.string().default('生图接口').description('接口显示名称'),
  base_url: Schema.string().default('https://api.a6api.com').description('OpenAI 兼容 API 地址'),
  api_key: Schema.string().role('secret').default('').description('生图 API Key'),
  model: Schema.string().default('gpt-image-2').description('生图模型'),
  priority: Schema.number().min(0).max(999).step(1).default(0).description('优先级，数值越小越先使用'),
})

export const Config: Schema<Config> = Schema.object({
  accounts: Schema.dict(AccountSchema).default({}).description('公众号账号档案'),
  default_account: Schema.string().default('default').description('默认公众号账号 ID'),
  image_providers: Schema.dict(ImageProviderSchema).default({}).description('AI 生图接口池'),
  wechat: Schema.object({
    appid: Schema.string().default('').description('公众号 AppID（wx 开头，留空则沿用 scripts/wx_config.json）'),
    app_secret: Schema.string().role('secret').default('').description('公众号 AppSecret（留空则沿用现有 wx_config.json）'),
    author_name: Schema.string().default('文映学术win00.cn').description('固定作者名（硬性规则）'),
    brand_name: Schema.string().default('文映千秋学术网').description('品牌名（结尾引导语必须包含）'),
  }).description('① 公众号凭据'),
  content: Schema.object({
    articles_per_day: Schema.number().min(1).max(10).step(1).default(6).description('每日文章数（组合为 1 个多图文草稿）'),
    min_words: Schema.number().min(500).max(10000).step(100).default(2000).description('每篇纯文字下限（字）'),
    topics: Schema.array(Schema.string()).role('table').default(DEFAULT_TOPICS).description('选题方向'),
    forbidden_words: Schema.array(Schema.string()).role('table').default(DEFAULT_FORBIDDEN_WORDS).description('禁词表（任何一篇出现即失败）'),
    ending_guide_required: Schema.boolean().default(true).description('结尾必须自然引导关注品牌'),
  }).description('② 内容规则'),
  typography: Schema.object({
    headline_theme: Schema.union([...THEME_KEYS]).default('wenying').description('头条主题（wenying=文映学术品牌专属）'),
    secondary_theme: Schema.union([...THEME_KEYS, 'rotate']).default('rotate').description('次条主题：rotate=按题材轮换'),
    font_size: Schema.string().default('13px').description('正文字号铁律'),
    line_height: Schema.string().default('20px').description('正文行高铁律'),
    paragraph_margin: Schema.string().default('25px').description('段落间距'),
    text_indent: Schema.string().default('2em').description('首行缩进'),
  }).description('③ 排版（13px 铁律）'),
  image_api: Schema.object({
    base_url: Schema.string().default('https://api.a6api.com').description('生图 API 地址（OpenAI 兼容 /v1/images/generations）'),
    api_key: Schema.string().role('secret').default('').description('生图 API Key（sk- 开头，留空则沿用现有 wx_config.json）'),
    model: Schema.string().default('gpt-image-2').description('生图模型'),
    headline_cover_ratio: Schema.union(['2.35:1', '21:9', '16:9', '1:1']).default('2.35:1').description('头条封面比例'),
    secondary_cover_ratio: Schema.union(['21:9', '16:9', '1:1']).default('1:1').description('次条封面比例'),
    content_images_per_article: Schema.number().min(0).max(4).step(1).default(2).description('每篇正文配图数（第1张AI信息图+第2张真实图）'),
    image_lang_zh_only: Schema.boolean().default(true).description('图中文字仅中文（提示词自动附加约束）'),
  }).description('④ AI 配图'),
  brand_images: Schema.object({
    header: Schema.object({
      enabled: Schema.boolean().default(true).description('是否在每篇文章顶部插入品牌图'),
      file: Schema.string().default(DEFAULT_BRAND_IMAGES.header.file).description('brand_assets 目录内的图片文件名或相对路径'),
      width: Schema.number().min(10).max(100).step(1).default(100).description('显示宽度（文章宽度百分比）'),
      height: Schema.number().min(0).max(2000).step(10).default(0).description('固定显示高度（px，0=按原图比例）'),
      fit: Schema.union(['contain', 'cover', 'fill']).default('contain').description('图片适配：contain 完整显示 / cover 裁切铺满 / fill 拉伸'),
      position: Schema.union(['top', 'center', 'bottom']).default('center').description('裁切或留白时的垂直对齐'),
      radius: Schema.number().min(0).max(100).step(1).default(0).description('图片圆角（px）'),
      margin_top: Schema.number().min(0).max(200).step(1).default(0).description('图片上方间距（px）'),
      margin_bottom: Schema.number().min(0).max(200).step(1).default(0).description('图片下方间距（px）'),
      frame: Schema.boolean().default(false).description('是否使用白色卡片边框和阴影包裹'),
    }).description('头部品牌图'),
    footer: Schema.object({
      enabled: Schema.boolean().default(true).description('是否在每篇文章末尾插入品牌图'),
      file: Schema.string().default(DEFAULT_BRAND_IMAGES.footer.file).description('brand_assets 目录内的图片文件名或相对路径'),
      width: Schema.number().min(10).max(100).step(1).default(60).description('显示宽度（文章宽度百分比）'),
      height: Schema.number().min(0).max(2000).step(10).default(0).description('固定显示高度（px，0=按原图比例）'),
      fit: Schema.union(['contain', 'cover', 'fill']).default('contain').description('图片适配：contain 完整显示 / cover 裁切铺满 / fill 拉伸'),
      position: Schema.union(['top', 'center', 'bottom']).default('center').description('裁切或留白时的垂直对齐'),
      radius: Schema.number().min(0).max(100).step(1).default(0).description('图片圆角（px）'),
      margin_top: Schema.number().min(0).max(200).step(1).default(20).description('图片上方间距（px）'),
      margin_bottom: Schema.number().min(0).max(200).step(1).default(0).description('图片下方间距（px）'),
      frame: Schema.boolean().default(false).description('是否使用白色卡片边框和阴影包裹'),
    }).description('尾部品牌图'),
  }).description('兼容旧配置：全局品牌头尾图'),
  runtime: Schema.object({
    project_root: Schema.string().default('').description('任务工作区；留空使用插件内置 tasks/default，也可填写其它工作区路径'),
    python_path: Schema.string().default('python').description('Python 解释器（需 3.12 + requests + Pillow）'),
    request_timeout_ms: Schema.number().min(5000).max(600000).step(1000).default(30000).description('单次请求超时（毫秒）'),
    dry_run: Schema.boolean().default(false).description('演练模式：全部机器校验照跑，但不联网生图、不发布'),
    verify_after_publish: Schema.boolean().default(true).description('发布后自动 draft/get 核验'),
    use_upload_cache: Schema.boolean().default(true).description('素材上传缓存断点续跑（uploaded_urls.json）'),
    need_open_comment: Schema.boolean().default(true).description('草稿开启留言'),
  }).description('⑥ 运行'),
}) as Schema<Config>
