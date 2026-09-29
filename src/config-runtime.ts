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
    // 老配置无 platform 字段：一律视为公众号，知乎/小红书/百家号需在设置中显式切换
    profile.platform = profile.platform === 'zhihu' ? 'zhihu' : profile.platform === 'xiaohongshu' ? 'xiaohongshu' : profile.platform === 'baijiahao' ? 'baijiahao' : 'gzh'
    profile.publish_mode = profile.publish_mode === 'browser' ? 'browser' : (profile.platform === 'xiaohongshu' || profile.platform === 'zhihu' || profile.platform === 'baijiahao' ? 'browser' : 'api')
    profile.appid = profile.appid || ''
    profile.app_secret = profile.app_secret || ''
    profile.author_name = profile.author_name || config.wechat?.author_name || '文映学术win00.cn'
    profile.brand_name = profile.brand_name || config.wechat?.brand_name || '文映千秋学术网'
    profile.publish_immediately = profile.publish_immediately === true
    profile.auto_enable_original = profile.platform === 'gzh' && (profile.auto_enable_original === true || (profile.auto_enable_original === undefined && config.wechat?.auto_enable_original === true))
    if (profile.platform === 'xiaohongshu') {
      profile.publish_mode = 'browser'
      profile.auto_enable_original = false
      profile.content = {
        ...clone(DEFAULT_CONTENT),
        ...(config.content ?? {}),
        ...(profile.content ?? {}),
        articles_per_day: Number.isFinite(profile.content?.articles_per_day) ? Number(profile.content.articles_per_day) : 1,
        headline_cover_ratio: profile.content?.headline_cover_ratio || '3:4',
        secondary_cover_ratio: profile.content?.secondary_cover_ratio || '3:4',
        xhs_images_per_note: Number.isFinite(profile.content?.xhs_images_per_note) ? Number(profile.content.xhs_images_per_note) : 4,
        xhs_min_words: Number.isFinite(profile.content?.xhs_min_words) ? Number(profile.content.xhs_min_words) : 200,
        xhs_tags: Array.isArray(profile.content?.xhs_tags)
          ? profile.content.xhs_tags
          : (typeof profile.content?.xhs_tags === 'string' && profile.content.xhs_tags
            ? (profile.content.xhs_tags as string).split(/[\r\n,]+/).map((s: string) => s.trim()).filter(Boolean)
            : []),
        image_lang_zh_only: profile.content?.image_lang_zh_only ?? config.image_api?.image_lang_zh_only ?? DEFAULT_CONTENT.image_lang_zh_only ?? true,
        enable_hot_tracking: profile.content?.enable_hot_tracking ?? config.content?.enable_hot_tracking ?? true,
        preferred_topic_angles: profile.content?.preferred_topic_angles ?? config.content?.preferred_topic_angles ?? ['policy', 'trap', 'guide', 'myth', 'tools'],
      }
    } else {
      profile.content = {
        ...clone(DEFAULT_CONTENT),
        ...(config.content ?? {}),
        ...(profile.content ?? {}),
        headline_theme: profile.content?.headline_theme ?? config.typography?.headline_theme ?? DEFAULT_CONTENT.headline_theme ?? 'wenying',
        secondary_theme: profile.content?.secondary_theme ?? config.typography?.secondary_theme ?? DEFAULT_CONTENT.secondary_theme ?? 'rotate',
        font_size: profile.content?.font_size ?? config.typography?.font_size ?? DEFAULT_CONTENT.font_size ?? '13px',
        line_height: profile.content?.line_height ?? config.typography?.line_height ?? DEFAULT_CONTENT.line_height ?? '20px',
        paragraph_margin: profile.content?.paragraph_margin ?? config.typography?.paragraph_margin ?? DEFAULT_CONTENT.paragraph_margin ?? '25px',
        text_indent: profile.content?.text_indent ?? config.typography?.text_indent ?? DEFAULT_CONTENT.text_indent ?? '2em',
        headline_cover_ratio: profile.content?.headline_cover_ratio ?? config.image_api?.headline_cover_ratio ?? DEFAULT_CONTENT.headline_cover_ratio ?? (profile.platform === 'zhihu' ? '16:9' : '2.35:1'),
        secondary_cover_ratio: profile.content?.secondary_cover_ratio ?? config.image_api?.secondary_cover_ratio ?? DEFAULT_CONTENT.secondary_cover_ratio ?? (profile.platform === 'zhihu' ? '16:9' : '1:1'),
        content_images_per_article: Number.isFinite(profile.content?.content_images_per_article)
          ? Number(profile.content!.content_images_per_article)
          : (Number.isFinite(config.image_api?.content_images_per_article) ? Number(config.image_api.content_images_per_article) : 2),
        image_lang_zh_only: profile.content?.image_lang_zh_only ?? config.image_api?.image_lang_zh_only ?? DEFAULT_CONTENT.image_lang_zh_only ?? true,
        enable_hot_tracking: profile.content?.enable_hot_tracking ?? config.content?.enable_hot_tracking ?? true,
        preferred_topic_angles: profile.content?.preferred_topic_angles ?? config.content?.preferred_topic_angles ?? ['policy', 'trap', 'guide', 'myth', 'tools'],
      }
    }
    profile.brand_images = {
      header: normalizeBrandImage(profile.brand_images?.header, DEFAULT_BRAND_IMAGES.header),
      footer: normalizeBrandImage(profile.brand_images?.footer, DEFAULT_BRAND_IMAGES.footer),
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
