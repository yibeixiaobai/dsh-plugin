import {
  DEFAULT_BRAND_IMAGES,
  DEFAULT_CONTENT,
  DEFAULT_IMAGE_PROVIDER,
  type AccountProfile,
  type BrandImageConfig,
  type Config,
  type ContentConfig,
  type ImageProviderConfig,
} from './config.ts'

export interface ResolvedAccount {
  id: string
  profile: AccountProfile
}

export function cloneConfig<T>(value: T): T {
  if (value === undefined || value === null) return value
  return JSON.parse(JSON.stringify(value)) as T
}
const clone = cloneConfig


function normalizeBrandImage(value: Partial<BrandImageConfig> | undefined, fallback: BrandImageConfig): BrandImageConfig {
  return {
    ...clone(fallback),
    ...(value ?? {}),
  }
}

function legacyAccount(config: Config): AccountProfile {
  return {
    platform: 'gzh',
    name: '默认账号',
    enabled: true,
    publish_mode: 'api',
    appid: config.wechat?.appid ?? '',
    app_secret: config.wechat?.app_secret ?? '',
    author_name: config.wechat?.author_name ?? '文映学术win00.cn',
    brand_name: config.wechat?.brand_name ?? '文映千秋学术网',
    publish_immediately: false,
    auto_enable_original: config.wechat?.auto_enable_original ?? false,
    content: {
      ...clone(DEFAULT_CONTENT),
      ...(config.content ?? {}),
      headline_theme: config.content?.headline_theme ?? config.typography?.headline_theme ?? 'wenying',
      secondary_theme: config.content?.secondary_theme ?? config.typography?.secondary_theme ?? 'rotate',
      font_size: config.content?.font_size ?? config.typography?.font_size ?? '13px',
      line_height: config.content?.line_height ?? config.typography?.line_height ?? '20px',
      paragraph_margin: config.content?.paragraph_margin ?? config.typography?.paragraph_margin ?? '25px',
      text_indent: config.content?.text_indent ?? config.typography?.text_indent ?? '2em',
      headline_cover_ratio: config.content?.headline_cover_ratio ?? config.image_api?.headline_cover_ratio ?? '2.35:1',
      secondary_cover_ratio: config.content?.secondary_cover_ratio ?? config.image_api?.secondary_cover_ratio ?? '1:1',
      content_images_per_article: config.content?.content_images_per_article ?? config.image_api?.content_images_per_article ?? 2,
      image_lang_zh_only: config.content?.image_lang_zh_only ?? config.image_api?.image_lang_zh_only ?? true,
    },
    brand_images: {
      header: normalizeBrandImage(config.brand_images?.header, DEFAULT_BRAND_IMAGES.header),
      footer: normalizeBrandImage(config.brand_images?.footer, DEFAULT_BRAND_IMAGES.footer),
    },
  }
}

function legacyProvider(config: Config): ImageProviderConfig {
  return {
    ...DEFAULT_IMAGE_PROVIDER,
    name: '默认生图接口',
    base_url: config.image_api?.base_url || DEFAULT_IMAGE_PROVIDER.base_url,
    api_key: config.image_api?.api_key || '',
    model: config.image_api?.model || DEFAULT_IMAGE_PROVIDER.model,
  }
}

/** Normalize new dictionary fields while keeping the pre-multi-account shape usable. */
export function normalizeConfig(config: Config): Config {
  const next = clone(config)
  const rawAccounts = next.accounts && typeof next.accounts === 'object' && !Array.isArray(next.accounts)
    ? next.accounts
    : {}
  const accounts = Object.keys(rawAccounts).length > 0
    ? clone(rawAccounts)
    : { default: legacyAccount(config) }

  for (const profile of Object.values(accounts)) {
    profile.name = profile.name || '未命名账号'
    profile.enabled = profile.enabled !== false
    profile.platform = profile.platform === 'zhihu' ? 'zhihu' : profile.platform === 'xiaohongshu' ? 'xiaohongshu' : profile.platform === 'baijiahao' ? 'baijiahao' : 'gzh'
    profile.publish_mode = profile.platform === 'gzh'
      ? (profile.publish_mode === 'browser' ? 'browser' : 'api')
      : 'browser'

    // 凭据严格隔离：非公众号账号绝不混入微信 AppID/Secret
    if (profile.platform === 'gzh') {
      profile.appid = profile.appid || ''
      profile.app_secret = profile.app_secret || ''
      profile.auto_enable_original = profile.auto_enable_original === true || (profile.auto_enable_original === undefined && config.wechat?.auto_enable_original === true)
    } else {
      profile.appid = profile.appid || ''
      profile.app_secret = profile.app_secret || ''
      profile.auto_enable_original = false
    }

    profile.author_name = profile.author_name || config.wechat?.author_name || '文映学术win00.cn'
    profile.brand_name = profile.brand_name || config.wechat?.brand_name || '文映千秋学术网'
    profile.publish_immediately = profile.publish_immediately === true

    // 内容配置精确归一化（区分 0、false 与 undefined，杜绝默认值强制反冲）
    const existingContent = (profile.content && typeof profile.content === 'object') ? profile.content : {}
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
    const commonContentImgs = Number.isFinite(existingContent.content_images_per_article)
      ? Math.max(0, Math.min(4, Math.floor(Number(existingContent.content_images_per_article))))
      : (Number.isFinite(config.image_api?.content_images_per_article) ? Math.max(0, Math.min(4, Math.floor(Number(config.image_api.content_images_per_article)))) : 2)

    if (profile.platform === 'xiaohongshu') {
      profile.content = {
        ...clone(DEFAULT_CONTENT),
        ...existingContent,
        articles_per_day: Number.isFinite(existingContent.articles_per_day) ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day)))) : 1,
        headline_cover_ratio: '3:4',
        secondary_cover_ratio: '3:4',
        xhs_images_per_note: Number.isFinite(existingContent.xhs_images_per_note) ? Math.max(1, Math.min(18, Math.floor(Number(existingContent.xhs_images_per_note)))) : 4,
        xhs_min_words: Number.isFinite(existingContent.xhs_min_words) ? Math.max(0, Math.min(1000, Math.floor(Number(existingContent.xhs_min_words)))) : 200,
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
        articles_per_day: Number.isFinite(existingContent.articles_per_day) ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day)))) : 1,
        min_words: Number.isFinite(existingContent.min_words) ? Math.max(0, Math.floor(Number(existingContent.min_words))) : 2000,
        headline_cover_ratio: '16:9',
        secondary_cover_ratio: '16:9',
        content_images_per_article: commonContentImgs,
        topics: commonTopics,
        forbidden_words: commonForbidden,
        ending_guide_required: commonEndingGuide,
        enable_hot_tracking: commonHotTracking,
        preferred_topic_angles: commonAngles,
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
        articles_per_day: Number.isFinite(existingContent.articles_per_day) ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day)))) : 1,
        min_words: Number.isFinite(existingContent.min_words) ? Math.max(0, Math.floor(Number(existingContent.min_words))) : 2000,
        headline_cover_ratio: '2.35:1',
        secondary_cover_ratio: '2.35:1',
        content_images_per_article: commonContentImgs,
        topics: commonTopics,
        forbidden_words: commonForbidden,
        ending_guide_required: commonEndingGuide,
        enable_hot_tracking: commonHotTracking,
        preferred_topic_angles: commonAngles,
        image_lang_zh_only: commonLangZh,
      }
      // 百家号完整支持首尾品牌图
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
        sync_newspic: existingContent.sync_newspic !== undefined ? Boolean(existingContent.sync_newspic) : (config.content?.sync_newspic !== undefined ? Boolean(config.content.sync_newspic) : false),
        articles_per_day: Number.isFinite(existingContent.articles_per_day) ? Math.max(1, Math.min(10, Math.floor(Number(existingContent.articles_per_day)))) : 6,
        newspic_articles_per_day: Number.isFinite(existingContent.newspic_articles_per_day) ? Math.max(1, Math.min(20, Math.floor(Number(existingContent.newspic_articles_per_day)))) : 1,
        min_words: Number.isFinite(existingContent.min_words) ? Math.max(0, Math.floor(Number(existingContent.min_words))) : 2000,
        newspic_images_per_article: Number.isFinite(existingContent.newspic_images_per_article) ? Math.max(1, Math.min(20, Math.floor(Number(existingContent.newspic_images_per_article)))) : 4,
        newspic_image_ratio: existingContent.newspic_image_ratio ?? '3:4',
        newspic_min_words: Number.isFinite(existingContent.newspic_min_words) ? Math.max(0, Math.floor(Number(existingContent.newspic_min_words))) : 100,
        headline_theme: existingContent.headline_theme ?? config.typography?.headline_theme ?? 'wenying',
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
        image_lang_zh_only: commonLangZh,
      }
      profile.brand_images = {
        header: normalizeBrandImage(profile.brand_images?.header, DEFAULT_BRAND_IMAGES.header),
        footer: normalizeBrandImage(profile.brand_images?.footer, DEFAULT_BRAND_IMAGES.footer),
      }
    }
  }

  const accountIds = Object.keys(accounts)
  const defaultAccount = accountIds.includes(next.default_account)
    ? next.default_account
    : accountIds.find((id) => accounts[id].enabled) ?? accountIds[0] ?? 'default'

  const rawProviders = next.image_providers && typeof next.image_providers === 'object' && !Array.isArray(next.image_providers)
    ? next.image_providers
    : {}
  const providers = Object.keys(rawProviders).length > 0
    ? clone(rawProviders)
    : { default: legacyProvider(config) }

  for (const provider of Object.values(providers)) {
    provider.name = provider.name || '未命名接口'
    provider.enabled = provider.enabled !== false
    provider.base_url = provider.base_url || DEFAULT_IMAGE_PROVIDER.base_url
    provider.api_key = provider.api_key || ''
    provider.model = provider.model || DEFAULT_IMAGE_PROVIDER.model
    provider.priority = Number.isFinite(provider.priority) ? Number(provider.priority) : 0
  }

  return {
    ...next,
    accounts,
    default_account: defaultAccount,
    image_providers: providers,
  }
}

export function resolveAccount(config: Config, accountId?: string): ResolvedAccount {
  const id = accountId?.trim() || config.default_account
  const profile = config.accounts[id]
  if (!profile) {
    throw new Error('公众号账号不存在: ' + id + '；可用账号: ' + Object.keys(config.accounts).join(', '))
  }
  if (!profile.enabled) {
    throw new Error('公众号账号已停用: ' + id)
  }
  return { id, profile: clone(profile) }
}

export function providerPool(config: Config): Array<{ id: string; provider: ImageProviderConfig }> {
  return Object.entries(config.image_providers)
    .map(([id, provider]) => ({ id, provider: clone(provider) }))
    .filter((entry) => entry.provider.enabled)
    .sort((left, right) => left.provider.priority - right.provider.priority || left.id.localeCompare(right.id))
}

export function hasRealAccounts(accounts: Record<string, AccountProfile> | undefined): boolean {
  if (!accounts || typeof accounts !== 'object') return false
  const values = Object.values(accounts)
  if (values.length === 0) return false
  if (values.length > 1) return true
  const first = values[0]
  if (!first) return false
  return Boolean(
    first.appid ||
    first.app_secret ||
    (first.name && first.name !== '默认账号' && first.name !== '未命名账号') ||
    first.platform === 'zhihu' ||
    first.platform === 'xiaohongshu' ||
    first.publish_mode === 'browser' ||
    (first.author_name && first.author_name !== '文映学术win00.cn') ||
    (first.brand_name && first.brand_name !== '文映千秋学术网')
  )
}

export function hasRealProviders(providers: Record<string, ImageProviderConfig> | undefined): boolean {
  if (!providers || typeof providers !== 'object') return false
  const values = Object.values(providers)
  if (values.length === 0) return false
  if (values.length > 1) return true
  const first = values[0]
  if (!first) return false
  return Boolean(
    first.api_key ||
    (first.name && first.name !== '默认生图接口' && first.name !== '未命名接口' && first.name !== '生图接口') ||
    (first.base_url && first.base_url !== 'https://api.a6api.com')
  )
}

export function applyNormalizedConfig(target: Config, source: Config, allowDelete = false): Config {
  const normalized = normalizeConfig(source)

  // 永久防清空与防残缺覆盖保护：若 target 已有真实配置的账号/生图接口
  if (hasRealAccounts(target.accounts)) {
    if (!hasRealAccounts(source.accounts)) {
      normalized.accounts = clone(target.accounts)
      normalized.default_account = target.default_account
    } else if (!allowDelete) {
      // 非显式用户删除操作（如重启、settings 初始加载、热重载等）时，
      // 保留 target 中已有但 source 中缺失的实体账号，杜绝残缺数据覆盖导致账号丢失！
      for (const [id, acc] of Object.entries(target.accounts)) {
        if (!normalized.accounts[id]) {
          normalized.accounts[id] = clone(acc)
        }
      }
      if (!normalized.accounts[normalized.default_account] && target.default_account && normalized.accounts[target.default_account]) {
        normalized.default_account = target.default_account
      }
    }
  }

  if (hasRealProviders(target.image_providers)) {
    if (!hasRealProviders(source.image_providers)) {
      normalized.image_providers = clone(target.image_providers)
    } else if (!allowDelete) {
      for (const [id, prov] of Object.entries(target.image_providers)) {
        if (!normalized.image_providers[id]) {
          normalized.image_providers[id] = clone(prov)
        }
      }
    }
  }

  Object.assign(target, normalized)
  return normalized
}

export function articlesPerDay(content: ContentConfig, articleType?: 'news' | 'newspic' | 'both'): number {
  const isNewspic = articleType === 'newspic' || (!articleType && content.article_type === 'newspic')
  return isNewspic ? (content.newspic_articles_per_day || 1) : (content.articles_per_day || 6)
}
