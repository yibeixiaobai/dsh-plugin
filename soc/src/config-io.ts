import type {
  AccountProfile,
  Config,
  ImageProviderConfig,
  Platform,
} from './config.ts'
import { normalizeConfig } from './config-runtime.ts'

export type ExportScope = 'all' | 'accounts' | 'image_providers' | 'visual_rules' | 'runtime'

export interface ExportMeta {
  version: string
  exported_at: string
  plugin: string
  include_secrets: boolean
  scope: ExportScope
  account_count?: number
  provider_count?: number
}

export interface ExportedConfigPayload {
  $schema?: string
  meta: ExportMeta
  config: Partial<Config>
}

export interface ConfigSummary {
  account_count: number
  gzh_accounts: number
  zhihu_accounts: number
  xhs_accounts: number
  baijiahao_accounts: number
  account_ids: string[]
  provider_count: number
  provider_ids: string[]
  has_typography: boolean
  has_image_api: boolean
  has_runtime: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  data?: Partial<Config>
  summary?: ConfigSummary
}

export interface ExportOptions {
  includeSecrets?: boolean
  scope?: ExportScope
  version?: string
}

function clone<T>(val: T): T {
  if (val === undefined || val === null) return val
  return JSON.parse(JSON.stringify(val)) as T
}

const ACCOUNT_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const PROVIDER_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

/**
 * 导出配置数据（支持脱敏与范围过滤）
 */
export function exportConfigData(
  fullConfig: Config,
  options: ExportOptions = {},
): ExportedConfigPayload {
  const includeSecrets = options.includeSecrets ?? false
  const scope = options.scope ?? 'all'
  const version = options.version ?? '0.2.0'

  const normalized = normalizeConfig(fullConfig)
  const partial: Partial<Config> = {}

  // 1. 处理账号
  if (scope === 'all' || scope === 'accounts') {
    const exportedAccounts: Record<string, AccountProfile> = {}
    for (const [id, acc] of Object.entries(normalized.accounts)) {
      const clonedAcc = clone(acc)
      if (!includeSecrets) {
        clonedAcc.app_secret = ''
      }
      exportedAccounts[id] = clonedAcc
    }
    partial.accounts = exportedAccounts
    partial.default_account = normalized.default_account
  }

  // 2. 处理生图接口池
  if (scope === 'all' || scope === 'image_providers') {
    const exportedProviders: Record<string, ImageProviderConfig> = {}
    for (const [id, p] of Object.entries(normalized.image_providers)) {
      const clonedP = clone(p)
      if (!includeSecrets) {
        clonedP.api_key = ''
      }
      exportedProviders[id] = clonedP
    }
    partial.image_providers = exportedProviders
  }

  // 3. 处理排版与配图视觉规则
  if (scope === 'all' || scope === 'visual_rules') {
    partial.typography = clone(normalized.typography)
    partial.image_api = clone(normalized.image_api)
    if (!includeSecrets && partial.image_api) {
      partial.image_api.api_key = ''
    }
  }

  // 4. 处理运行时设置
  if (scope === 'all' || scope === 'runtime') {
    partial.runtime = clone(normalized.runtime)
  }

  // 5. 兼容字段（仅在全量时导出）
  if (scope === 'all') {
    partial.wechat = clone(normalized.wechat)
    if (!includeSecrets && partial.wechat) {
      partial.wechat.app_secret = ''
    }
    partial.content = clone(normalized.content)
    partial.brand_images = clone(normalized.brand_images)
  }

  const meta: ExportMeta = {
    version,
    exported_at: new Date().toISOString(),
    plugin: 'dsh-social-publisher',
    include_secrets: includeSecrets,
    scope,
    account_count: partial.accounts ? Object.keys(partial.accounts).length : undefined,
    provider_count: partial.image_providers ? Object.keys(partial.image_providers).length : undefined,
  }

  return {
    $schema: 'https://deepseek.com/schemas/dsh-social-publisher-config.json',
    meta,
    config: partial,
  }
}

/**
 * 校验并提取导入配置
 */
export function validateImportConfig(rawInput: unknown): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  let rawObj: unknown = rawInput

  // 支持入参为 JSON 字符串
  if (typeof rawInput === 'string') {
    const trimmed = rawInput.trim()
    if (!trimmed) {
      return { valid: false, errors: ['导入内容不能为空'], warnings: [] }
    }
    try {
      rawObj = JSON.parse(trimmed)
    } catch (e) {
      return { valid: false, errors: ['JSON 语法解析错误：' + (e instanceof Error ? e.message : String(e))], warnings: [] }
    }
  }

  if (!rawObj || typeof rawObj !== 'object' || Array.isArray(rawObj)) {
    return { valid: false, errors: ['导入的数据必须是有效的 JSON 对象'], warnings: [] }
  }

  const recordObj = rawObj as Record<string, unknown>

  // 兼容带有 meta 包装的格式或直接顶层为 Config 的格式
  let candidateConfig: Record<string, unknown>
  if (recordObj.meta && recordObj.config && typeof recordObj.config === 'object') {
    candidateConfig = recordObj.config as Record<string, unknown>
  } else {
    candidateConfig = recordObj
  }

  const resultData: Partial<Config> = {}

  // 校验账号
  if ('accounts' in candidateConfig) {
    const accounts = candidateConfig.accounts
    if (typeof accounts !== 'object' || accounts === null || Array.isArray(accounts)) {
      errors.push('accounts 字段必须是一个对象字典')
    } else {
      const validAccounts: Record<string, AccountProfile> = {}
      for (const [id, acc] of Object.entries(accounts)) {
        if (!ACCOUNT_ID_REGEX.test(id)) {
          errors.push(`账号 ID「${id}」格式不符合规范（仅支持字母、数字、下划线及连字符）`)
          continue
        }
        if (!acc || typeof acc !== 'object' || Array.isArray(acc)) {
          errors.push(`账号「${id}」的配置数据不完整或类型错误`)
          continue
        }
        const accObj = acc as Record<string, unknown>
        const platform: Platform = accObj.platform === 'zhihu' ? 'zhihu' : accObj.platform === 'xiaohongshu' ? 'xiaohongshu' : accObj.platform === 'baijiahao' ? 'baijiahao' : 'gzh'
        const name = String(accObj.name || id).trim()
        const enabled = accObj.enabled !== false

        if (platform === 'gzh') {
          const appid = String(accObj.appid ?? '').trim()
          if (appid && !appid.startsWith('wx')) {
            warnings.push(`公众号账号「${name}」的 AppID「${appid}」非 wx 开头，请确认是否正确`)
          }
        }

        validAccounts[id] = {
          platform,
          name,
          enabled,
          publish_mode: accObj.publish_mode === 'browser' ? 'browser' : (platform === 'xiaohongshu' || platform === 'zhihu' || platform === 'baijiahao' ? 'browser' : 'api'),
          appid: String(accObj.appid ?? '').trim(),
          app_secret: String(accObj.app_secret ?? '').trim(),
          author_name: String(accObj.author_name ?? '文映学术win00.cn').trim(),
          brand_name: String(accObj.brand_name ?? '文映千秋学术网').trim(),
          publish_immediately: accObj.publish_immediately === true,
          auto_enable_original: platform === 'gzh' ? accObj.auto_enable_original === true : false,
          content: (accObj.content && typeof accObj.content === 'object' ? accObj.content : {}) as any,
          brand_images: (accObj.brand_images && typeof accObj.brand_images === 'object' ? accObj.brand_images : {
            header: { enabled: platform === 'gzh' || platform === 'baijiahao', file: 'brand_top.jpg', width: 100, height: 0, fit: 'contain', position: 'center', radius: 0, margin_top: 0, margin_bottom: 0, frame: false },
            footer: { enabled: platform === 'gzh' || platform === 'baijiahao', file: 'brand_bot.jpg', width: 0, height: 0, fit: 'contain', position: 'center', radius: 0, margin_top: 20, margin_bottom: 0, frame: false },
          }) as any,
        }
      }
      resultData.accounts = validAccounts
    }
  }

  // 校验默认账号
  if ('default_account' in candidateConfig && typeof candidateConfig.default_account === 'string') {
    resultData.default_account = candidateConfig.default_account.trim()
  }

  // 校验生图接口池
  if ('image_providers' in candidateConfig) {
    const providers = candidateConfig.image_providers
    if (typeof providers !== 'object' || providers === null || Array.isArray(providers)) {
      errors.push('image_providers 字段必须是一个对象字典')
    } else {
      const validProviders: Record<string, ImageProviderConfig> = {}
      for (const [id, prov] of Object.entries(providers)) {
        if (!PROVIDER_ID_REGEX.test(id)) {
          errors.push(`生图接口 ID「${id}」格式不符合规范`)
          continue
        }
        if (!prov || typeof prov !== 'object' || Array.isArray(prov)) {
          errors.push(`生图接口「${id}」的配置数据不完整`)
          continue
        }
        const provObj = prov as Record<string, unknown>
        const name = String(provObj.name || id).trim()
        const baseUrl = String(provObj.base_url || 'https://api.a6api.com').trim()
        const model = String(provObj.model || 'gpt-image-2').trim()
        const priority = typeof provObj.priority === 'number' ? provObj.priority : 0
        validProviders[id] = {
          name,
          enabled: provObj.enabled !== false,
          base_url: baseUrl,
          api_key: String(provObj.api_key ?? '').trim(),
          model,
          priority,
        }
      }
      resultData.image_providers = validProviders
    }
  }

  // 校验排版
  if ('typography' in candidateConfig && typeof candidateConfig.typography === 'object' && candidateConfig.typography !== null) {
    resultData.typography = candidateConfig.typography as any
  }

  // 校验 AI 配图
  if ('image_api' in candidateConfig && typeof candidateConfig.image_api === 'object' && candidateConfig.image_api !== null) {
    resultData.image_api = candidateConfig.image_api as any
  }

  // 校验运行设置
  if ('runtime' in candidateConfig && typeof candidateConfig.runtime === 'object' && candidateConfig.runtime !== null) {
    resultData.runtime = candidateConfig.runtime as any
  }

  // 校验旧版/兼容字段
  if ('wechat' in candidateConfig && typeof candidateConfig.wechat === 'object' && candidateConfig.wechat !== null) {
    resultData.wechat = candidateConfig.wechat as any
  }
  if ('content' in candidateConfig && typeof candidateConfig.content === 'object' && candidateConfig.content !== null) {
    resultData.content = candidateConfig.content as any
  }
  if ('brand_images' in candidateConfig && typeof candidateConfig.brand_images === 'object' && candidateConfig.brand_images !== null) {
    resultData.brand_images = candidateConfig.brand_images as any
  }

  const hasAnyField = Object.keys(resultData).length > 0
  if (!hasAnyField && errors.length === 0) {
    errors.push('未在导入数据中发现有效的插件配置项（如 accounts、image_providers、typography 等）')
  }

  const accountKeys = Object.keys(resultData.accounts ?? {})
  const providerKeys = Object.keys(resultData.image_providers ?? {})

  let gzhCount = 0
  let zhihuCount = 0
  let xhsCount = 0
  let baijiahaoCount = 0
  for (const acc of Object.values(resultData.accounts ?? {})) {
    if (acc.platform === 'zhihu') zhihuCount++
    else if (acc.platform === 'xiaohongshu') xhsCount++
    else if (acc.platform === 'baijiahao') baijiahaoCount++
    else gzhCount++
  }

  const summary: ConfigSummary = {
    account_count: accountKeys.length,
    gzh_accounts: gzhCount,
    zhihu_accounts: zhihuCount,
    xhs_accounts: xhsCount,
    baijiahao_accounts: baijiahaoCount,
    account_ids: accountKeys,
    provider_count: providerKeys.length,
    provider_ids: providerKeys,
    has_typography: Boolean(resultData.typography),
    has_image_api: Boolean(resultData.image_api),
    has_runtime: Boolean(resultData.runtime),
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    data: errors.length === 0 ? resultData : undefined,
    summary,
  }
}

export type MergeMode = 'merge' | 'overwrite'

/**
 * 将导入的配置合并入当前配置中
 *
 * @param current 当前配置
 * @param imported 经过校验的待导入配置
 * @param mode 'merge'（增量合并，推荐）或 'overwrite'（全量覆盖）
 */
export function mergeConfigData(
  current: Config,
  imported: Partial<Config>,
  mode: MergeMode = 'merge',
): Config {
  const next = clone(current)

  if (mode === 'overwrite') {
    if (imported.accounts && Object.keys(imported.accounts).length > 0) {
      next.accounts = clone(imported.accounts)
      next.default_account = imported.default_account && next.accounts[imported.default_account]
        ? imported.default_account
        : Object.keys(next.accounts)[0] || 'default'
    }
    if (imported.image_providers && Object.keys(imported.image_providers).length > 0) {
      next.image_providers = clone(imported.image_providers)
    }
    if (imported.typography) next.typography = clone(imported.typography)
    if (imported.image_api) next.image_api = clone(imported.image_api)
    if (imported.runtime) next.runtime = clone(imported.runtime)
    if (imported.wechat) next.wechat = clone(imported.wechat)
    if (imported.content) next.content = clone(imported.content)
    if (imported.brand_images) next.brand_images = clone(imported.brand_images)
    return normalizeConfig(next)
  }

  // mode === 'merge' (增量合并模式)
  if (imported.accounts) {
    next.accounts = next.accounts || {}
    for (const [id, acc] of Object.entries(imported.accounts)) {
      const existing = next.accounts[id]
      if (existing) {
        // 合并已有账号：若导入的密钥为空且本地已有密钥，保留本地真实密钥！
        const preservedSecret = (acc.app_secret ?? '').trim() ? acc.app_secret : existing.app_secret
        next.accounts[id] = {
          ...existing,
          ...clone(acc),
          app_secret: preservedSecret,
          content: {
            ...(existing.content || {}),
            ...(acc.content || {}),
          },
          brand_images: {
            header: {
              ...(existing.brand_images?.header || {}),
              ...(acc.brand_images?.header || {}),
            },
            footer: {
              ...(existing.brand_images?.footer || {}),
              ...(acc.brand_images?.footer || {}),
            },
          },
        }
      } else {
        // 全新账号直接追加
        next.accounts[id] = clone(acc)
      }
    }

    if (imported.default_account && next.accounts[imported.default_account]) {
      next.default_account = imported.default_account
    }
  }

  if (imported.image_providers) {
    next.image_providers = next.image_providers || {}
    for (const [id, prov] of Object.entries(imported.image_providers)) {
      const existing = next.image_providers[id]
      if (existing) {
        // 合并已有接口：若导入的 API Key 为空且本地已有，保留本地 API Key
        const preservedKey = (prov.api_key ?? '').trim() ? prov.api_key : existing.api_key
        next.image_providers[id] = {
          ...existing,
          ...clone(prov),
          api_key: preservedKey,
        }
      } else {
        next.image_providers[id] = clone(prov)
      }
    }
  }

  if (imported.typography) {
    next.typography = { ...next.typography, ...clone(imported.typography) }
  }

  if (imported.image_api) {
    const preservedKey = imported.image_api.api_key?.trim() ? imported.image_api.api_key : next.image_api?.api_key
    next.image_api = {
      ...next.image_api,
      ...clone(imported.image_api),
      api_key: preservedKey || '',
    }
  }

  if (imported.runtime) {
    next.runtime = { ...next.runtime, ...clone(imported.runtime) }
  }

  return normalizeConfig(next)
}
