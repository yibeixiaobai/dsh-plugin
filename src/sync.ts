// 配置同步：凭据的单一事实来源是插件设置界面，
// 每次 apply（含热重载）把凭据落到 Python 侧读取的 scripts/wx_config.json。
// 留空的凭据字段不覆盖现有文件值，保证"先沿用现状、后可接管"。
import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { providerPool, resolveAccount } from './config-runtime.ts'
import { pluginDir, runtimeResourceDir } from './py.ts'

const LEGACY_DEFAULT_WORKSPACE = 'd:/666/gzh/文映千秋学术网'

/** 插件自带的默认任务工作区；用户选择其它 project_root 时才使用外部目录。 */
export function defaultWorkspaceDir(): string {
  return path.resolve(pluginDir(), '..', 'tasks', 'default')
}

export function workspaceDir(cfg: Config): string {
  const configured = String(cfg.runtime.project_root ?? '').trim()
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
    if (cfg.accounts[id].platform === 'zhihu') {
      fs.mkdirSync(zhihuProfileDir(cfg, id), { recursive: true })
    }
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

/** Fill empty new-model fields from the existing Python config without overriding plugin values. */
export function hydrateConfigFromWx(cfg: Config): boolean {
  const wxPath = path.join(scriptsDir(cfg), 'wx_config.json')
  let existing: Record<string, unknown> = {}
  try {
    existing = JSON.parse(fs.readFileSync(wxPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return false
  }
  let changed = false
  const legacyAppid = String(existing.appid ?? '')
  const legacySecret = String(existing.app_secret ?? '')
  const legacyImageBase = String(existing.image_api_base ?? '')
  const legacyImageKey = String(existing.image_api_key ?? '')

  if (!cfg.wechat.appid && legacyAppid) { cfg.wechat.appid = legacyAppid; changed = true }
  if (!cfg.wechat.app_secret && legacySecret) { cfg.wechat.app_secret = legacySecret; changed = true }
  if (!cfg.image_api.base_url && legacyImageBase) { cfg.image_api.base_url = legacyImageBase; changed = true }
  if (!cfg.image_api.api_key && legacyImageKey) { cfg.image_api.api_key = legacyImageKey; changed = true }

  const defaultAccount = cfg.accounts[cfg.default_account]
  if (defaultAccount) {
    if (!defaultAccount.appid && legacyAppid) { defaultAccount.appid = legacyAppid; changed = true }
    if (!defaultAccount.app_secret && legacySecret) { defaultAccount.app_secret = legacySecret; changed = true }
  } else if (Object.keys(cfg.accounts).length === 1) {
    const only = Object.values(cfg.accounts)[0]
    if (!only.appid && legacyAppid) { only.appid = legacyAppid; changed = true }
    if (!only.app_secret && legacySecret) { only.app_secret = legacySecret; changed = true }
  }

  const firstProvider = providerPool(cfg)[0]?.provider
  if (firstProvider) {
    if (!firstProvider.base_url && legacyImageBase) { firstProvider.base_url = legacyImageBase; changed = true }
    if (!firstProvider.api_key && legacyImageKey) { firstProvider.api_key = legacyImageKey; changed = true }
  }
  return changed
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
  const defaultAccount = resolveAccount(cfg)
  const accountRecords = Object.entries(cfg.accounts).map(([id, account]) => {
    const previous = Array.isArray(existing.accounts)
      ? (existing.accounts as Array<Record<string, unknown>>).find((item) => item.id === id)
      : undefined
    return {
      id,
      name: account.name,
      enabled: account.enabled,
      platform: account.platform === 'zhihu' ? 'zhihu' : 'gzh',
      publish_immediately: account.publish_immediately === true,
      appid: account.appid.trim()
        || (id === defaultAccount.id ? String(existing.appid ?? '') : ''),
      app_secret: account.app_secret.trim()
        || String(previous?.app_secret ?? '')
        || (id === defaultAccount.id ? String(existing.app_secret ?? '') : ''),
      author_name: account.author_name,
      brand_name: account.brand_name,
      content: account.content,
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
  const appidFromPlugin = defaultAccount.profile.appid.trim() !== ''
  const keyFromPlugin = Boolean(firstProvider?.api_key)
  const merged = {
    ...existing,
    accounts: accountRecords,
    image_api_providers: providers,
    appid: appidFromPlugin ? defaultAccount.profile.appid.trim() : existing.appid ?? '',
    app_secret:
      defaultAccount.profile.app_secret.trim() !== ''
        ? defaultAccount.profile.app_secret.trim()
        : existing.app_secret ?? '',
    image_api_base: firstProvider?.base_url ?? cfg.image_api.base_url,
    image_api_key: firstProvider?.api_key ?? existing.image_api_key ?? '',
  }
  fs.mkdirSync(dir, { recursive: true })
  const serialized = JSON.stringify(merged, null, 2) + '\n'
  fs.writeFileSync(wxPath, serialized, 'utf-8')
  // 每个账号目录下发同一份 wx_config.json：Python 侧从该账号自己的 --scripts-dir 读取凭据
  for (const id of Object.keys(cfg.accounts)) {
    const accountDir = accountScriptsDir(cfg, id)
    fs.mkdirSync(accountDir, { recursive: true })
    fs.writeFileSync(path.join(accountDir, 'wx_config.json'), serialized, 'utf-8')
  }
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
