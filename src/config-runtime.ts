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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

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
    appid: config.wechat.appid,
    app_secret: config.wechat.app_secret,
    author_name: config.wechat.author_name,
    brand_name: config.wechat.brand_name,
    publish_immediately: false,
    content: clone(config.content ?? DEFAULT_CONTENT),
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
    // 老配置无 platform 字段：一律视为公众号，知乎需在设置中显式切换
    profile.platform = profile.platform === 'zhihu' ? 'zhihu' : 'gzh'
    profile.appid = profile.appid || ''
    profile.app_secret = profile.app_secret || ''
    profile.author_name = profile.author_name || config.wechat.author_name
    profile.brand_name = profile.brand_name || config.wechat.brand_name
    profile.publish_immediately = profile.publish_immediately === true
    profile.content = { ...clone(DEFAULT_CONTENT), ...(profile.content ?? {}) }
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

export function applyNormalizedConfig(target: Config, source: Config): Config {
  const normalized = normalizeConfig(source)
  Object.assign(target, normalized)
  return normalized
}

export function articlesPerDay(content: ContentConfig, articleType?: 'news' | 'newspic' | 'both'): number {
  const isNewspic = articleType === 'newspic' || (!articleType && content.article_type === 'newspic')
  return isNewspic ? (content.newspic_articles_per_day || 1) : (content.articles_per_day || 6)
}
