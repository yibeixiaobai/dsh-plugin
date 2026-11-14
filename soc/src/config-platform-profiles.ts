import {
  DEFAULT_BRAND_IMAGES,
  DEFAULT_CONTENT,
  type AccountProfile,
  type BrandImageConfig,
  type Config,
} from './config.ts'

function clone<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}

export function normalizeBrandImage(
  value: Partial<BrandImageConfig> | undefined,
  fallback: BrandImageConfig,
): BrandImageConfig {
  return {
    ...clone(fallback),
    ...(value ?? {}),
  }
}

/**
 * 针对各平台的专属内容规则与品牌头尾图配置进行归一化
 * [中文修复依据]：将平台特定配置拆分至独立模块，控制单文件行数 <= 400 行，
 * 并确保各平台（尤其是微信公众号、百家号、头条号、知乎、小红书）持有各自独立的品牌图与内容规范。
 */
export function normalizeAccountPlatformProfile(profile: AccountProfile, config: Config): void {
  const existingContent: Record<string, any> =
    profile.content && typeof profile.content === 'object' ? profile.content : {}

  const commonTopics = Array.isArray(existingContent.topics)
    ? existingContent.topics
    : (typeof existingContent.topics === 'string' && existingContent.topics
      ? (existingContent.topics as string).split(/[\r\n,]+/).map((s: string) => s.trim()).filter(Boolean)
      : (Array.isArray(config.content?.topics) ? config.content.topics : DEFAULT_CONTENT.topics))

  const commonForbidden = Array.isArray(existingContent.forbidden_words)
    ? existingContent.forbidden_words
    : (typeof existingContent.forbidden_words === 'string' && existingContent.forbidden_words
      ? (existingContent.forbidden_words as string).split(/[\r\n,]+/).map((s: string) => s.trim()).filter(Boolean)
      : (Array.isArray(config.content?.forbidden_words) ? config.content.forbidden_words : DEFAULT_CONTENT.forbidden_words))

  const commonEndingGuide = existingContent.ending_guide_required !== undefined
    ? Boolean(existingContent.ending_guide_required)
    : (config.content?.ending_guide_required !== undefined ? Boolean(config.content.ending_guide_required) : true)

  const commonHotTracking = existingContent.enable_hot_tracking !== undefined
    ? Boolean(existingContent.enable_hot_tracking)
    : (config.content?.enable_hot_tracking !== undefined ? Boolean(config.content.enable_hot_tracking) : true)

  const commonAngles = Array.isArray(existingContent.preferred_topic_angles) && existingContent.preferred_topic_angles.length > 0
    ? existingContent.preferred_topic_angles
    : (Array.isArray(config.content?.preferred_topic_angles) && config.content.preferred_topic_angles.length > 0
      ? config.content.preferred_topic_angles
      : ['policy', 'trap', 'guide', 'myth', 'tools'])

  const commonLangZh = existingContent.image_lang_zh_only !== undefined
    ? Boolean(existingContent.image_lang_zh_only)
    : (config.image_api?.image_lang_zh_only !== undefined ? Boolean(config.image_api.image_lang_zh_only) : true)

  const commonCoverLangZh = existingContent.cover_lang_zh_only !== undefined
    ? Boolean(existingContent.cover_lang_zh_only)
    : (config.image_api?.cover_lang_zh_only !== undefined ? Boolean(config.image_api.cover_lang_zh_only) : commonLangZh)

  const commonContentImgLangZh = existingContent.content_image_lang_zh_only !== undefined
    ? Boolean(existingContent.content_image_lang_zh_only)
    : (config.image_api?.content_image_lang_zh_only !== undefined ? Boolean(config.image_api.content_image_lang_zh_only) : commonLangZh)

  const commonContentImgs = Number.isFinite(existingContent.content_images_per_article)
    ? Math.max(0, Math.min(4, Math.floor(Number(existingContent.content_images_per_article))))
    : (Number.isFinite(config.image_api?.content_images_per_article)
      ? Math.max(0, Math.min(4, Math.floor(Number(config.image_api.content_images_per_article))))
      : 2)

  if (profile.platform === 'xiaohongshu') {
    profile.content = {
      ...clone(DEFAULT_CONTENT),
      ...existingContent,
      articles_per_day: Number.isFinite(existingContent.articles_per_day)
        ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day))))
        : 1,
      headline_cover_ratio: '3:4',
      secondary_cover_ratio: '3:4',
      xhs_images_per_note: Number.isFinite(existingContent.xhs_images_per_note)
        ? Math.max(1, Math.min(18, Math.floor(Number(existingContent.xhs_images_per_note))))
        : 4,
      xhs_min_words: Number.isFinite(existingContent.xhs_min_words)
        ? Math.max(0, Math.min(1000, Math.floor(Number(existingContent.xhs_min_words))))
        : 200,
      xhs_tags: Array.isArray(existingContent.xhs_tags)
        ? existingContent.xhs_tags
        : (typeof existingContent.xhs_tags === 'string' && existingContent.xhs_tags
          ? (existingContent.xhs_tags as string).split(/[\r\n,]+/).map((s: string) => s.trim()).filter(Boolean)
          : []),
      topics: commonTopics,
      forbidden_words: commonForbidden,
      ending_guide_required: commonEndingGuide,
      enable_hot_tracking: commonHotTracking,
      preferred_topic_angles: commonAngles,
      cover_lang_zh_only: commonCoverLangZh,
      content_image_lang_zh_only: commonContentImgLangZh,
      image_lang_zh_only: commonLangZh,
    }
    profile.brand_images = {
      header: normalizeBrandImage(profile.brand_images?.header, { ...DEFAULT_BRAND_IMAGES.header, enabled: false }),
      footer: normalizeBrandImage(profile.brand_images?.footer, { ...DEFAULT_BRAND_IMAGES.footer, enabled: false }),
    }
  } else if (profile.platform === 'zhihu') {
    profile.content = {
      ...clone(DEFAULT_CONTENT),
      ...existingContent,
      articles_per_day: Number.isFinite(existingContent.articles_per_day)
        ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day))))
        : 1,
      min_words: Number.isFinite(existingContent.min_words)
        ? Math.max(0, Math.floor(Number(existingContent.min_words)))
        : 2000,
      headline_cover_ratio: '16:9',
      secondary_cover_ratio: '16:9',
      content_images_per_article: commonContentImgs,
      topics: commonTopics,
      forbidden_words: commonForbidden,
      ending_guide_required: commonEndingGuide,
      enable_hot_tracking: commonHotTracking,
      preferred_topic_angles: commonAngles,
      cover_lang_zh_only: commonCoverLangZh,
      content_image_lang_zh_only: commonContentImgLangZh,
      image_lang_zh_only: commonLangZh,
    }
    profile.brand_images = {
      header: normalizeBrandImage(profile.brand_images?.header, { ...DEFAULT_BRAND_IMAGES.header, enabled: false }),
      footer: normalizeBrandImage(profile.brand_images?.footer, { ...DEFAULT_BRAND_IMAGES.footer, enabled: false }),
    }
  } else if (profile.platform === 'baijiahao') {
    profile.content = {
      ...clone(DEFAULT_CONTENT),
      ...existingContent,
      articles_per_day: Number.isFinite(existingContent.articles_per_day)
        ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day))))
        : 1,
      min_words: Number.isFinite(existingContent.min_words)
        ? Math.max(0, Math.floor(Number(existingContent.min_words)))
        : 2000,
      headline_cover_ratio: '2.35:1',
      secondary_cover_ratio: '2.35:1',
      content_images_per_article: commonContentImgs,
      topics: commonTopics,
      forbidden_words: commonForbidden,
      ending_guide_required: commonEndingGuide,
      enable_hot_tracking: commonHotTracking,
      preferred_topic_angles: commonAngles,
      cover_lang_zh_only: commonCoverLangZh,
      content_image_lang_zh_only: commonContentImgLangZh,
      image_lang_zh_only: commonLangZh,
    }
    // 百家号完整支持首尾品牌图
    profile.brand_images = {
      header: normalizeBrandImage(profile.brand_images?.header, DEFAULT_BRAND_IMAGES.header),
      footer: normalizeBrandImage(profile.brand_images?.footer, DEFAULT_BRAND_IMAGES.footer),
    }
  } else if (profile.platform === 'toutiao') {
    profile.content = {
      ...clone(DEFAULT_CONTENT),
      ...existingContent,
      articles_per_day: Number.isFinite(existingContent.articles_per_day)
        ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day))))
        : 1,
      min_words: Number.isFinite(existingContent.min_words)
        ? Math.max(0, Math.floor(Number(existingContent.min_words)))
        : 2000,
      headline_cover_ratio: '16:9',
      secondary_cover_ratio: '16:9',
      content_images_per_article: commonContentImgs,
      topics: commonTopics,
      forbidden_words: commonForbidden,
      ending_guide_required: commonEndingGuide,
      enable_hot_tracking: commonHotTracking,
      preferred_topic_angles: commonAngles,
      cover_lang_zh_only: commonCoverLangZh,
      content_image_lang_zh_only: commonContentImgLangZh,
      image_lang_zh_only: commonLangZh,
    }
    // 头条号正文支持插入图片，完整支持首尾品牌图
    profile.brand_images = {
      header: normalizeBrandImage(profile.brand_images?.header, DEFAULT_BRAND_IMAGES.header),
      footer: normalizeBrandImage(profile.brand_images?.footer, DEFAULT_BRAND_IMAGES.footer),
    }
  } else {
    // 微信公众号
    profile.content = {
      ...clone(DEFAULT_CONTENT),
      ...existingContent,
      article_type: existingContent.article_type ?? config.content?.article_type ?? 'news',
      sync_newspic: existingContent.sync_newspic !== undefined
        ? Boolean(existingContent.sync_newspic)
        : (config.content?.sync_newspic !== undefined ? Boolean(config.content.sync_newspic) : false),
      articles_per_day: Number.isFinite(existingContent.articles_per_day)
        ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day))))
        : 6,
      newspic_articles_per_day: Number.isFinite(existingContent.newspic_articles_per_day)
        ? Math.max(1, Math.min(20, Math.floor(Number(existingContent.newspic_articles_per_day))))
        : 1,
      min_words: Number.isFinite(existingContent.min_words)
        ? Math.max(0, Math.floor(Number(existingContent.min_words)))
        : 2000,
      newspic_images_per_article: Number.isFinite(existingContent.newspic_images_per_article)
        ? Math.max(1, Math.min(20, Math.floor(Number(existingContent.newspic_images_per_article))))
        : 4,
      newspic_image_ratio: existingContent.newspic_image_ratio ?? '3:4',
      newspic_min_words: Number.isFinite(existingContent.newspic_min_words)
        ? Math.max(0, Math.floor(Number(existingContent.newspic_min_words)))
        : 100,
      headline_theme: existingContent.headline_theme ?? config.typography?.headline_theme ?? 'graphite',
      secondary_theme: existingContent.secondary_theme ?? config.typography?.secondary_theme ?? 'rotate',
      font_size: existingContent.font_size ?? config.typography?.font_size ?? '13px',
      line_height: existingContent.line_height ?? config.typography?.line_height ?? '20px',
      paragraph_margin: existingContent.paragraph_margin ?? config.typography?.paragraph_margin ?? '25px',
      text_indent: existingContent.text_indent ?? config.typography?.text_indent ?? '2em',
      headline_cover_ratio: existingContent.headline_cover_ratio ?? config.image_api?.headline_cover_ratio ?? '2.35:1',
      secondary_cover_ratio: existingContent.secondary_cover_ratio ?? config.image_api?.secondary_cover_ratio ?? '1:1',
      content_images_per_article: commonContentImgs,
      topics: commonTopics,
      forbidden_words: commonForbidden,
      ending_guide_required: commonEndingGuide,
      enable_hot_tracking: commonHotTracking,
      preferred_topic_angles: commonAngles,
      cover_lang_zh_only: commonCoverLangZh,
      content_image_lang_zh_only: commonContentImgLangZh,
      image_lang_zh_only: commonLangZh,
    }
    profile.brand_images = {
      header: normalizeBrandImage(profile.brand_images?.header, DEFAULT_BRAND_IMAGES.header),
      footer: normalizeBrandImage(profile.brand_images?.footer, DEFAULT_BRAND_IMAGES.footer),
    }
  }
}
