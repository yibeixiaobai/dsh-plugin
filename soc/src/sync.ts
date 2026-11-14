// 配置同步：凭据的单一事实来源是插件设置界面，
// 每次 apply（含热重载）把凭据落到 Python 侧读取的 scripts/wx_config.json。
// 留空的凭据字段不覆盖现有文件值，保证"先沿用现状、后可接管"。
import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { providerPool, resolveAccount, type ResolvedAccount, hasRealAccounts, hasRealProviders } from './config-runtime.ts'
import { pluginDir, runtimeResourceDir } from './py.ts'

const LEGACY_DEFAULT_WORKSPACE = 'd:/666/gzh/文映千秋学术网'

/** 插件自带的默认任务工作区；用户选择其它 project_root 时才使用外部目录。 */
export function defaultWorkspaceDir(): string {
  return path.resolve(pluginDir(), '..', 'tasks', 'default')
}

export function workspaceDir(cfg: Partial<Config> | undefined): string {
  const configured = String(cfg?.runtime?.project_root ?? '').trim()
  if (!configured || configured.toLowerCase() === 'default' || configured.toLowerCase() === 'plugin-default') {
    return defaultWorkspaceDir()
  }
  const normalized = configured.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
  if (normalized === LEGACY_DEFAULT_WORKSPACE) return defaultWorkspaceDir()
  if (!path.isAbsolute(configured)) throw new Error('任务工作区必须是绝对路径: ' + configured)
  return path.resolve(configured)
}

/** 创建任务数据目录；只补插件默认品牌图，不迁移任何旧工作区文件。 */
export function ensureWorkspace(cfg: Config): string {
  const workspace = workspaceDir(cfg)
  const scripts = path.join(workspace, 'scripts')
  const brands = path.join(workspace, 'brand_assets')
  const tests = path.join(workspace, 'gzh_test_images')
  fs.mkdirSync(scripts, { recursive: true })
  fs.mkdirSync(brands, { recursive: true })
  fs.mkdirSync(tests, { recursive: true })
  for (const id of Object.keys(cfg.accounts)) {
    fs.mkdirSync(accountScriptsDir(cfg, id), { recursive: true })
    fs.mkdirSync(wechatProfileDir(cfg, id), { recursive: true })
    fs.mkdirSync(zhihuProfileDir(cfg, id), { recursive: true })
    fs.mkdirSync(xhsProfileDir(cfg, id), { recursive: true })
    fs.mkdirSync(baijiahaoProfileDir(cfg, id), { recursive: true })
  }
  const defaults = path.join(runtimeResourceDir(), 'default-brand')
  for (const name of ['brand_top.jpg', 'brand_bot.jpg']) {
    const source = path.join(defaults, name)
    const destination = path.join(brands, name)
    if (!fs.existsSync(source)) throw new Error('插件内置资源缺失: ' + source)
    if (!fs.existsSync(destination)) fs.copyFileSync(source, destination)
  }
  return workspace
}

export function scriptsDir(cfg: Config): string {
  return path.join(workspaceDir(cfg), 'scripts')
}

/** 账号 ID 同时用作目录名，必须是安全字符 */
export function assertAccountId(accountId: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(accountId)) throw new Error('非法账号 ID: ' + accountId)
  return accountId
}

/** 按账号隔离的任务产物目录：文章、封面、配图、上传缓存、发布记录都在账号自己的 scripts 下，互不覆盖 */
export function accountScriptsDir(cfg: Config, accountId: string): string {
  return path.join(workspaceDir(cfg), 'accounts', assertAccountId(accountId), 'scripts')
}

/** 知乎账号的浏览器用户数据目录（登录态持久化；扫码一次后长期有效） */
export function zhihuProfileDir(cfg: Config, accountId: string): string {
  return path.join(workspaceDir(cfg), 'accounts', assertAccountId(accountId), 'zhihu_profile')
}

/** 微信公众号账号的浏览器用户数据目录（后台登录态持久化；扫码一次后长期有效） */
export function wechatProfileDir(cfg: Config, accountId: string): string {
  return path.join(workspaceDir(cfg), 'accounts', assertAccountId(accountId), 'wechat_profile')
}

/** 小红书账号的浏览器用户数据目录（登录态持久化；扫码一次后长期有效） */
export function xhsProfileDir(cfg: Config, accountId: string): string {
  return path.join(workspaceDir(cfg), 'accounts', assertAccountId(accountId), 'xhs_profile')
}

/** 百家号账号的浏览器用户数据目录（百度账号登录态持久化；扫码/账密一次后长期有效） */
export function baijiahaoProfileDir(cfg: Config, accountId: string): string {
  return path.join(workspaceDir(cfg), 'accounts', assertAccountId(accountId), 'baijiahao_profile')
}

export function brandDir(cfg: Config): string {
  return path.join(workspaceDir(cfg), 'brand_assets')
}

export function gzhDesignScriptsDir(cfg: Config): string {
  void cfg
  return path.join(runtimeResourceDir(), 'gzh_design', 'scripts')
}

export interface SyncReport {
  wx_config_path: string
  updated: boolean
  appid_source: 'plugin' | 'existing'
  api_key_source: 'plugin' | 'existing'
}

/**
 * 从磁盘 wx_config.json 恢复缺失的账号档案（防止重启或热重载时丢失新增账号）
 * 同时处理子目录容灾自愈：若根 wx_config.json 账号少于等于 1，自动扫描各账号子目录中的完整备份
 */
function restoreAccountsFromDisk(
  cfg: Config,
  existing: Record<string, unknown>,
  workspaceDir: string,
): boolean {
  if (!cfg.accounts || typeof cfg.accounts !== 'object') (cfg as any).accounts = {}
  let changed = false

  if (Array.isArray(existing.accounts)) {
    for (const item of existing.accounts as Array<Record<string, any>>) {
      if (item && typeof item.id === 'string' && item.id.trim()) {
        const id = item.id.trim()
        const platform = item.platform === 'zhihu' ? 'zhihu' : item.platform === 'xiaohongshu' ? 'xiaohongshu' : item.platform === 'baijiahao' ? 'baijiahao' : 'gzh'
        if (!cfg.accounts[id]) {
          cfg.accounts[id] = {
            platform,
            name: String(item.name || id),
            enabled: item.enabled !== false,
            publish_mode: platform === 'gzh' ? (item.publish_mode === 'browser' ? 'browser' : 'api') : 'browser',
            appid: platform === 'gzh' ? String(item.appid ?? '') : '',
            app_secret: platform === 'gzh' ? String(item.app_secret ?? '') : '',
            author_name: String(item.author_name ?? cfg.wechat?.author_name ?? '文映学术win00.cn'),
            brand_name: String(item.brand_name ?? cfg.wechat?.brand_name ?? '文映千秋学术网'),
            publish_immediately: Boolean(item.publish_immediately),
            auto_enable_original: platform === 'gzh' && Boolean(item.auto_enable_original),
            content: (item.content && typeof item.content === 'object') ? { ...item.content } : {},
            brand_images: (item.brand_images && typeof item.brand_images === 'object') ? { ...item.brand_images } : {
              header: { enabled: platform === 'gzh' || platform === 'baijiahao', file: 'brand_top.jpg', width: 100, height: 0, fit: 'contain', position: 'center', radius: 0, margin_top: 0, margin_bottom: 0, frame: false },
              footer: { enabled: platform === 'gzh' || platform === 'baijiahao', file: 'brand_bot.jpg', width: 0, height: 0, fit: 'contain', position: 'center', radius: 0, margin_top: 20, margin_bottom: 0, frame: false },
            },
          } as any
          changed = true
        } else {
          const acc = cfg.accounts[id]
          if (acc.platform === 'gzh') {
            if (!acc.app_secret && item.app_secret) {
              acc.app_secret = String(item.app_secret)
              changed = true
            }
            if (!acc.appid && item.appid) {
              acc.appid = String(item.appid)
              changed = true
            }
          }
        }
      }
    }
  }

  return changed
}

/**
 * 从磁盘 wx_config.json 恢复缺失的生图接口（防止重启或热重载时丢失新增接口）
 */
function restoreProvidersFromDisk(
  cfg: Config,
  existing: Record<string, unknown>,
): boolean {
  if (!cfg.image_providers || typeof cfg.image_providers !== 'object') (cfg as any).image_providers = {}
  let changed = false

  if (Array.isArray(existing.image_api_providers)) {
    for (const item of existing.image_api_providers as Array<Record<string, any>>) {
      if (item && typeof item.id === 'string' && item.id.trim()) {
        const id = item.id.trim()
        if (!cfg.image_providers[id]) {
          cfg.image_providers[id] = {
            enabled: item.enabled !== false,
            name: String(item.name || id),
            base_url: String(item.base_url ?? cfg.image_api.base_url ?? ''),
            api_key: String(item.api_key ?? ''),
            model: String(item.model ?? cfg.image_api.model ?? 'gpt-image-2'),
            priority: Number.isFinite(item.priority) ? Number(item.priority) : 0,
          }
          changed = true
        } else {
          const prov = cfg.image_providers[id]
          if (!prov.api_key && item.api_key) {
            prov.api_key = String(item.api_key)
            changed = true
          }
        }
      }
    }
  }

  return changed
}

/** 工作区全量配置文件路径 */
export function publisherConfigPath(cfg: Config): string {
  return path.join(workspaceDir(cfg), 'publisher_config.json')
}

/** 插件根目录任务文件夹兜底全量配置文件路径 */
export function fallbackPublisherConfigPath(): string {
  return path.join(defaultWorkspaceDir(), 'publisher_config.json')
}

/** Fill empty new-model fields from the existing disk configs without overriding plugin values. */
export function hydrateConfigFromWx(cfg?: Partial<Config>): { config: Config; changed: boolean } {
  const result = JSON.parse(JSON.stringify(cfg || {})) as Config
  if (!result.accounts || typeof result.accounts !== 'object') (result as any).accounts = {}
  if (!result.image_providers || typeof result.image_providers !== 'object') (result as any).image_providers = {}
  if (!result.wechat || typeof result.wechat !== 'object') (result as any).wechat = {}
  if (!result.image_api || typeof result.image_api !== 'object') (result as any).image_api = {}
  if (!result.runtime || typeof result.runtime !== 'object') (result as any).runtime = {}
  let changed = false

  // 1. 优先从 publisher_config.json 恢复全量配置（工作区根目录与默认目录双重探测）
  const candidateConfigPaths = [
    publisherConfigPath(result),
    fallbackPublisherConfigPath(),
  ]
  for (const pubPath of candidateConfigPaths) {
    if (fs.existsSync(pubPath)) {
      try {
        const fullPubData = JSON.parse(fs.readFileSync(pubPath, 'utf-8')) as Partial<Config>
        if (fullPubData && typeof fullPubData === 'object') {
          // 恢复账号
          if (fullPubData.accounts && typeof fullPubData.accounts === 'object') {
            for (const [id, acc] of Object.entries(fullPubData.accounts)) {
              if (acc && typeof acc === 'object') {
                if (!result.accounts[id]) {
                  result.accounts[id] = JSON.parse(JSON.stringify(acc))
                  changed = true
                } else {
                  // 补齐缺失字段
                  const target = result.accounts[id]
                  if (!target.app_secret && acc.app_secret) { target.app_secret = acc.app_secret; changed = true }
                  if (!target.appid && acc.appid) { target.appid = acc.appid; changed = true }
                }
              }
            }
            if (fullPubData.default_account && result.accounts[fullPubData.default_account]) {
              result.default_account = fullPubData.default_account
            }
          }
          // 恢复生图接口
          if (fullPubData.image_providers && typeof fullPubData.image_providers === 'object') {
            for (const [id, prov] of Object.entries(fullPubData.image_providers)) {
              if (prov && typeof prov === 'object' && !result.image_providers[id]) {
                result.image_providers[id] = JSON.parse(JSON.stringify(prov))
                changed = true
              }
            }
          }
        }
      } catch {}
      break
    }
  }

  // 2. 从 scripts/wx_config.json 及账号子目录容灾自愈恢复
  const wxPath = path.join(scriptsDir(result), 'wx_config.json')
  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(fs.readFileSync(wxPath, 'utf-8')) as Record<string, unknown>
  } catch {
    existing = {}
  }

  const legacyAppid = String(existing.appid ?? '')
  const legacySecret = String(existing.app_secret ?? '')
  const legacyImageBase = String(existing.image_api_base ?? '')
  const legacyImageKey = String(existing.image_api_key ?? '')

  // 容灾自愈 + 账号/接口恢复
  changed = restoreAccountsFromDisk(result, existing, workspaceDir(result)) || changed
  changed = restoreProvidersFromDisk(result, existing) || changed

  if (!result.wechat.appid && legacyAppid) { result.wechat.appid = legacyAppid; changed = true }
  if (!result.wechat.app_secret && legacySecret) { result.wechat.app_secret = legacySecret; changed = true }
  if (!result.image_api.base_url && legacyImageBase) { result.image_api.base_url = legacyImageBase; changed = true }
  if (!result.image_api.api_key && legacyImageKey) { result.image_api.api_key = legacyImageKey; changed = true }

  const defaultAccount = result.accounts[result.default_account]
  if (defaultAccount && defaultAccount.platform === 'gzh') {
    if (!defaultAccount.appid && legacyAppid) { defaultAccount.appid = legacyAppid; changed = true }
    if (!defaultAccount.app_secret && legacySecret) { defaultAccount.app_secret = legacySecret; changed = true }
  } else if (Object.keys(result.accounts).length > 0) {
    const pickGzh = Object.keys(result.accounts).find((k) => result.accounts[k]?.enabled && result.accounts[k]?.platform === 'gzh')
    if (pickGzh) {
      const only = result.accounts[pickGzh]
      if (!only.appid && legacyAppid) { only.appid = legacyAppid; changed = true }
      if (!only.app_secret && legacySecret) { only.app_secret = legacySecret; changed = true }
    }
  }

  const firstProvider = providerPool(result)[0]?.provider
  if (firstProvider) {
    if (!firstProvider.base_url && legacyImageBase) { firstProvider.base_url = legacyImageBase; changed = true }
    if (!firstProvider.api_key && legacyImageKey) { firstProvider.api_key = legacyImageKey; changed = true }
  }
  return { config: result, changed }
}

/**
 * 宽松解析同步用的「主账号」：默认账号被停用（或缺失）时退回第一个启用账号，再退回首账号。
 * syncConfig 需要为所有账号下发凭据，不能因为默认账号停用而整体失败。
 */
function resolveSyncPrimaryAccount(cfg: Config): ResolvedAccount {
  try {
    return resolveAccount(cfg)
  } catch {
    const ids = Object.keys(cfg.accounts)
    const pick = ids.find((id) => cfg.accounts[id].enabled !== false) ?? ids[0]
    if (!pick) throw new Error('配置中没有任何账号，无法同步凭据')
    return { id: pick, profile: JSON.parse(JSON.stringify(cfg.accounts[pick])) as ResolvedAccount['profile'] }
  }
}

export function syncConfig(cfg: Config): SyncReport {
  const dir = scriptsDir(cfg)
  const wxPath = path.join(dir, 'wx_config.json')
  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(fs.readFileSync(wxPath, 'utf-8')) as Record<string, unknown>
  } catch {
    existing = {}
  }
  if (!cfg.accounts || typeof cfg.accounts !== 'object') (cfg as any).accounts = {}
  if (!cfg.image_providers || typeof cfg.image_providers !== 'object') (cfg as any).image_providers = {}

  // 永久防丢失保护：仅当 cfg 账号为空或仅有初始未配置的默认账号，且磁盘已有账号时才从磁盘合入，绝不被宿主空字典抹除，亦不影响合法删除/覆盖
  if (!hasRealAccounts(cfg.accounts) && Array.isArray(existing.accounts) && existing.accounts.length > 0) {
    restoreAccountsFromDisk(cfg, existing, workspaceDir(cfg))
  }

  if (!hasRealProviders(cfg.image_providers) && Array.isArray(existing.image_api_providers) && existing.image_api_providers.length > 0) {
    restoreProvidersFromDisk(cfg, existing)
  }

  const defaultAccount = resolveSyncPrimaryAccount(cfg)
  const accountRecords = Object.entries(cfg.accounts).map(([id, account]) => {
    const previous = Array.isArray(existing.accounts)
      ? (existing.accounts as Array<Record<string, unknown>>).find((item) => item.id === id)
      : undefined
    const isGzh = account.platform === 'gzh'
    return {
      id,
      name: account.name,
      enabled: account.enabled,
      platform: account.platform === 'zhihu' ? 'zhihu' : account.platform === 'xiaohongshu' ? 'xiaohongshu' : account.platform === 'baijiahao' ? 'baijiahao' : 'gzh',
      publish_mode: isGzh ? (account.publish_mode === 'browser' ? 'browser' : 'api') : 'browser',
      publish_immediately: account.publish_immediately === true,
      appid: isGzh ? (account.appid.trim() || (id === defaultAccount.id && defaultAccount.profile.platform === 'gzh' ? String(existing.appid ?? '') : '')) : '',
      app_secret: isGzh ? (account.app_secret.trim() || String(previous?.app_secret ?? '') || (id === defaultAccount.id && defaultAccount.profile.platform === 'gzh' ? String(existing.app_secret ?? '') : '')) : '',
      author_name: account.author_name,
      brand_name: account.brand_name,
      content: account.content,
      // 账号级发布增强配置必须持久化，否则每次 apply/热重载都会丢失，
      // 导致品牌图被静默禁用、草稿自动开启原创失效。
      auto_enable_original: isGzh && account.auto_enable_original === true,
      brand_images: account.brand_images,
    }
  })
  const providers = providerPool(cfg).map(({ id, provider }) => {
    const previous = Array.isArray(existing.image_api_providers)
      ? (existing.image_api_providers as Array<Record<string, unknown>>).find((item) => item.id === id)
      : undefined
    const fallbackKey = id === 'default' ? String(existing.image_api_key ?? '') : ''
    return {
      id,
      name: provider.name,
      enabled: provider.enabled,
      base_url: provider.base_url,
      api_key: provider.api_key.trim() || String(previous?.api_key ?? fallbackKey),
      model: provider.model,
      priority: provider.priority,
    }
  })
  const firstProvider = providers[0]
  const defaultIsGzh = defaultAccount.profile.platform === 'gzh'
  const appidFromPlugin = defaultIsGzh && defaultAccount.profile.appid.trim() !== ''
  const keyFromPlugin = Boolean(firstProvider?.api_key)
  const merged = {
    ...existing,
    accounts: accountRecords,
    image_api_providers: providers,
    appid: appidFromPlugin ? defaultAccount.profile.appid.trim() : (defaultIsGzh ? existing.appid ?? '' : ''),
    app_secret:
      defaultIsGzh && defaultAccount.profile.app_secret.trim() !== ''
        ? defaultAccount.profile.app_secret.trim()
        : (defaultIsGzh ? existing.app_secret ?? '' : ''),
    image_api_base: firstProvider?.base_url ?? cfg.image_api.base_url,
    image_api_key: firstProvider?.api_key ?? existing.image_api_key ?? '',
  }
  fs.mkdirSync(dir, { recursive: true })
  const serialized = JSON.stringify(merged, null, 2) + '\n'
  fs.writeFileSync(wxPath, serialized, 'utf-8')

  // 双重落盘全量配置 publisher_config.json（保证跨重启与多账号配置绝不丢失）
  try {
    const fullSerialized = JSON.stringify(cfg, null, 2) + '\n'
    const targetPubPaths = [
      publisherConfigPath(cfg),
      fallbackPublisherConfigPath(),
    ]
    for (const p of targetPubPaths) {
      try {
        fs.mkdirSync(path.dirname(p), { recursive: true })
        fs.writeFileSync(p, fullSerialized, 'utf-8')
      } catch {}
    }
  } catch {}

  // 每个账号目录下发属于该账号自身的 wx_config.json：Python 侧从该账号自己的 --scripts-dir 读取凭据
  for (const [id, account] of Object.entries(cfg.accounts)) {
    const accountDir = accountScriptsDir(cfg, id)
    fs.mkdirSync(accountDir, { recursive: true })
    const accountSpecific = {
      ...merged,
      platform: account.platform,
      publish_mode: account.publish_mode,
      appid: account.platform === 'gzh' ? account.appid : '',
      app_secret: account.platform === 'gzh' ? account.app_secret : '',
      author_name: account.author_name,
      brand_name: account.brand_name,
      current_account_id: id,
    }
    fs.writeFileSync(path.join(accountDir, 'wx_config.json'), JSON.stringify(accountSpecific, null, 2) + '\n', 'utf-8')
  }
  // 清理已删除账号的子目录镜像：陈旧全量快照是「已删除/测试账号复活」的根源
  // （容灾自愈会扫描 accounts/*/scripts/wx_config.json，删号后残留的快照会让账号重启后重新出现）。
  // 仅删除镜像文件本身，保留该目录下其余历史产物。
  try {
    const accountsRoot = path.join(workspaceDir(cfg), 'accounts')
    if (fs.existsSync(accountsRoot)) {
      for (const sub of fs.readdirSync(accountsRoot)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(sub) || cfg.accounts[sub]) continue
        const staleMirror = path.join(accountsRoot, sub, 'scripts', 'wx_config.json')
        if (fs.existsSync(staleMirror)) fs.rmSync(staleMirror, { force: true })
      }
    }
  } catch {}
  return {
    wx_config_path: wxPath,
    updated: true,
    appid_source: appidFromPlugin ? 'plugin' : 'existing',
    api_key_source: keyFromPlugin ? 'plugin' : 'existing',
  }
}

/** 需要联网（微信 API / 生图 API）的工具执行前校验凭据是否可用；知乎账号不走微信凭据 */
export function assertWechatCreds(cfg: Config, accountId?: string): void {
  const account = resolveAccount(cfg, accountId)
  if (account.profile.platform !== 'gzh') return
  if (account.profile.publish_mode === 'browser') return
  if (account.profile.appid.trim() && account.profile.app_secret.trim()) return
  const wxPath = path.join(scriptsDir(cfg), 'wx_config.json')
  let ok = false
  try {
    const c = JSON.parse(fs.readFileSync(wxPath, 'utf-8')) as {
      accounts?: Array<{ id?: string; appid?: string; app_secret?: string }>
    }
    const stored = c.accounts?.find((item) => item.id === account.id)
    ok = Boolean(stored?.appid && stored?.app_secret)
  } catch {
    ok = false
  }
  if (!ok) {
    throw new Error(
      '缺少公众号凭据：请在设置「公众号账号」为 ' + account.id + ' 填写 appid / app_secret。',
    )
  }
}

export function assertImageCreds(cfg: Config): void {
  if (providerPool(cfg).some(({ provider }) => provider.api_key.trim() !== '')) return
  throw new Error('缺少生图 API Key：请在设置「生图接口」至少启用一个填写了 api_key 的接口。')
}

export function configuredAccountIds(cfg: Config): string[] {
  return Object.keys(cfg.accounts)
}

export function accountBrandFile(cfg: Config, accountId: string | undefined, slot: 'header' | 'footer'): string {
  return resolveAccount(cfg, accountId).profile.brand_images[slot].file
}

export function defaultAccountBrandFile(cfg: Config, slot: 'header' | 'footer'): string {
  return resolveAccount(cfg).profile.brand_images[slot].file
}

export function configuredProviderIds(cfg: Config): string[] {
  return providerPool(cfg).map(({ id }) => id)
}
