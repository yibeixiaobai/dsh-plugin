// 社媒发布插件默认配置常量与枚举映射
import type {
  BrandImagesConfig,
  ContentConfig,
  CoverRatio,
  ImageProviderConfig,
  ThemeKey,
} from './types.ts'

export const THEME_KEYS: ThemeKey[] = [
  'wenying',
  'olive',
  'graphite',
  'moyu',
  'redwhite',
  'zen',
]

export const THEME_NAMES: Record<ThemeKey, string> = {
  wenying: '典雅深红（酒红+金）',
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
  '3:4': [1080, 1440],
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
    width: 0,
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
  '人工智能', '开源生态', '前沿科技', '大模型演进', '计算架构', '开发者工具', '端侧算力', '云原生',
]

export const DEFAULT_FORBIDDEN_WORDS = [
  '保过', '暴富', '绝对第一', '极品', '独家秘籍',
  '枪手', '黑客破解', '无风险暴利', '包通过', '百分之百',
]

export const DEFAULT_CONTENT: ContentConfig = {
  article_type: 'news',
  sync_newspic: false,
  articles_per_day: 6,
  newspic_articles_per_day: 1,
  min_words: 2000,
  topics: DEFAULT_TOPICS,
  forbidden_words: DEFAULT_FORBIDDEN_WORDS,
  ending_guide_required: true,
  newspic_images_per_article: 4,
  newspic_image_ratio: '3:4',
  newspic_min_words: 100,
  headline_theme: 'graphite',
  secondary_theme: 'rotate',
  font_size: '13px',
  line_height: '20px',
  paragraph_margin: '25px',
  text_indent: '2em',
  headline_cover_ratio: '2.35:1',
  secondary_cover_ratio: '1:1',
  content_image_ratio: '16:9',
  content_images_per_article: 2,
  image_count_mode: 'auto',
  ai_images_per_article: 2,
  search_images_per_article: 1,
  cover_lang_zh_only: true,
  content_image_lang_zh_only: true,
  image_lang_zh_only: true,
  enable_hot_tracking: true,
  preferred_topic_angles: ['policy', 'trap', 'guide', 'myth', 'tools'],
}
