import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { normalizePlatform, DEFAULT_BRAND_IMAGES } from './config.ts'
import { providerPool } from './config-runtime.ts'
import { pluginDir } from './py.ts'
import { getGlobalPublisherConfigFiles } from './wincodeHome.ts'
import {
  workspaceDir,
  publisherConfigPath,
  fallbackPublisherConfigPath,
  scriptsDir,
} from './sync-paths.ts'

/**
 * 从磁盘 wx_config.json 恢复缺失的账号档案（防止重启或热重载时丢失新增账号）
 * 同时处理子目录容灾自愈：若根 wx_config.json 账号少于等于 1，自动扫描各账号子目录中的完整备份
 */
export function restoreAccountsFromDisk(
  cfg: Config,
  existing: Record<string, unknown>,
  _workspaceDir: string,
): boolean {
  if (!cfg.accounts || typeof cfg.accounts !== 'object') (cfg as any).accounts = {}
  let changed = false

  if (Array.isArray(existing.accounts)) {
    for (const item of existing.accounts as Array<Record<string, any>>) {
      if (item && typeof item.id === 'string' && item.id.trim()) {
        const id = item.id.trim()
        const platform = normalizePlatform(item.platform)
        if (!cfg.accounts[id]) {
          cfg.accounts[id] = {
            platform,
            name: String(item.name || id),
            enabled: item.enabled !== false,
            publish_mode:
              platform === 'gzh'
                ? item.publish_mode === 'browser'
                  ? 'browser'
                  : 'api'
                : 'browser',
            appid: platform === 'gzh' ? String(item.appid ?? '') : '',
            app_secret: platform === 'gzh' ? String(item.app_secret ?? '') : '',
            author_name: String(item.author_name ?? cfg.wechat?.author_name ?? '科技前沿观察'),
            brand_name: String(item.brand_name ?? cfg.wechat?.brand_name ?? '前沿科技视界'),
            publish_immediately: Boolean(item.publish_immediately),
            auto_enable_original: platform === 'gzh' && Boolean(item.auto_enable_original),
            content: item.content && typeof item.content === 'object' ? { ...item.content } : {},
            brand_images:
              item.brand_images && typeof item.brand_images === 'object'
                ? { ...item.brand_images }
                : {
                  header: {
                    enabled: platform === 'gzh' || platform === 'baijiahao',
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
                    enabled: platform === 'gzh' || platform === 'baijiahao',
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
export function restoreProvidersFromDisk(cfg: Config, existing: Record<string, unknown>): boolean {
  if (!cfg.image_providers || typeof cfg.image_providers !== 'object')
    (cfg as any).image_providers = {}
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

/** Fill empty new-model fields from the existing disk configs without overriding plugin values. */
export function hydrateConfigFromWx(cfg?: Partial<Config>): { config: Config; changed: boolean } {
  const result = JSON.parse(JSON.stringify(cfg || {})) as Config
  if (!result.accounts || typeof result.accounts !== 'object') (result as any).accounts = {}
  if (!result.image_providers || typeof result.image_providers !== 'object')
    (result as any).image_providers = {}
  if (!result.wechat || typeof result.wechat !== 'object') (result as any).wechat = {}
  if (!result.image_api || typeof result.image_api !== 'object') (result as any).image_api = {}
  if (!result.runtime || typeof result.runtime !== 'object') (result as any).runtime = {}
  let changed = false

  // 1. 优先从 publisher_config.json 恢复全量配置（工作区主配置优先，其次为全局用户目录，最后为内置模板兜底）
  const wsPath = workspaceDir(result)
  const candidateConfigPaths = [
    publisherConfigPath(result),
    path.join(wsPath, '.social-publisher', 'publisher_config.json'),
    ...getGlobalPublisherConfigFiles(),
    fallbackPublisherConfigPath(),
    path.resolve(pluginDir(), 'tasks', 'default', 'publisher_config.json'),
    path.resolve(
      process.cwd(),
      'apps/wincode-cli/packages/social-publisher-plugin/tasks/default/publisher_config.json',
    ),
  ]
  let foundAnyRealAccounts = false
  for (const pubPath of candidateConfigPaths) {
    if (fs.existsSync(pubPath)) {
      try {
        const fullPubData = JSON.parse(fs.readFileSync(pubPath, 'utf-8')) as Partial<Config>
        if (fullPubData && typeof fullPubData === 'object') {
          // 恢复账号
          if (
            fullPubData.accounts &&
            typeof fullPubData.accounts === 'object' &&
            Object.keys(fullPubData.accounts).length > 0
          ) {
            const hasReal = Object.keys(fullPubData.accounts).some(id => id !== 'test_acc')
            for (const [id, acc] of Object.entries(fullPubData.accounts)) {
              if (acc && typeof acc === 'object') {
                if (id === 'test_acc' && (hasReal || foundAnyRealAccounts)) {
                  // 存在真实账号时，忽略孤立的测试残存账号
                  continue
                }
                if (!result.accounts[id]) {
                  result.accounts[id] = JSON.parse(JSON.stringify(acc))
                  changed = true
                  if (id !== 'test_acc') foundAnyRealAccounts = true
                } else {
                  // [中文修复依据]：深度合并账号凭据、品牌头尾图与内容规范，杜绝重启或水合时冲掉用户设置
                  const target = result.accounts[id]
                  if (!target.app_secret && acc.app_secret) {
                    target.app_secret = acc.app_secret
                    changed = true
                  }
                  if (!target.appid && acc.appid) {
                    target.appid = acc.appid
                    changed = true
                  }
                  if (acc.brand_images && typeof acc.brand_images === 'object') {
                    target.brand_images = {
                      header: {
                        ...DEFAULT_BRAND_IMAGES.header,
                        ...(target.brand_images?.header || {}),
                        ...(acc.brand_images?.header || {}),
                      },
                      footer: {
                        ...DEFAULT_BRAND_IMAGES.footer,
                        ...(target.brand_images?.footer || {}),
                        ...(acc.brand_images?.footer || {}),
                      },
                    }
                    changed = true
                  }
                  if (acc.content && typeof acc.content === 'object') {
                    target.content = { ...(target.content || {}), ...acc.content }
                    changed = true
                  }
                }
              }
            }
            if (
              fullPubData.default_account &&
              fullPubData.default_account !== 'test_acc' &&
              result.accounts[fullPubData.default_account]
            ) {
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
          // 恢复运行时环境设置（包括演练模式 dry_run、无头模式 headless、python_path 等；高优先级优先，不被后方模板冲掉）
          if (fullPubData.runtime && typeof fullPubData.runtime === 'object') {
            for (const [k, v] of Object.entries(fullPubData.runtime)) {
              if ((result.runtime as any)[k] === undefined && v !== undefined) {
                (result.runtime as any)[k] = v
                changed = true
              }
            }
          }
          // 恢复排版与配图视觉规则
          if (fullPubData.typography && typeof fullPubData.typography === 'object') {
            result.typography = {
              ...(result.typography || {}),
              ...JSON.parse(JSON.stringify(fullPubData.typography)),
            }
            changed = true
          }
          if (
            (fullPubData as any).image_spec &&
            typeof (fullPubData as any).image_spec === 'object'
          ) {
            (result as any).image_spec = {
              ...((result as any).image_spec || {}),
              ...JSON.parse(JSON.stringify((fullPubData as any).image_spec)),
            }
            changed = true
          }
        }
      } catch {}
    }
  }

  // 账号清洗自愈：如果已成功探测到任何真实账号，彻底移除残留的孤立 test_acc
  if (foundAnyRealAccounts && result.accounts['test_acc']) {
    delete result.accounts['test_acc']
    changed = true
    if (result.default_account === 'test_acc') {
      const realId =
        Object.keys(result.accounts).find(id => result.accounts[id].enabled) ??
        Object.keys(result.accounts)[0]
      if (realId) result.default_account = realId
    }
  }

  // 自愈写回：若合并出真实账号，确保主工作区及默认任务目录下的配置文件同步更新，消除脏数据
  if (foundAnyRealAccounts) {
    try {
      const primaryPath = publisherConfigPath(result)
      const primaryNeedsWrite =
        !fs.existsSync(primaryPath) ||
        (() => {
          try {
            const raw = JSON.parse(fs.readFileSync(primaryPath, 'utf-8'))
            return (
              !raw.accounts || Object.keys(raw.accounts).every((id: string) => id === 'test_acc')
            )
          } catch {
            return true
          }
        })()
      if (primaryNeedsWrite) {
        fs.mkdirSync(path.dirname(primaryPath), { recursive: true })
        fs.writeFileSync(primaryPath, JSON.stringify(result, null, 2), 'utf-8')
      }
    } catch {}
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

  if (!result.wechat.appid && legacyAppid) {
    result.wechat.appid = legacyAppid
    changed = true
  }
  if (!result.wechat.app_secret && legacySecret) {
    result.wechat.app_secret = legacySecret
    changed = true
  }
  if (!result.image_api.base_url && legacyImageBase) {
    result.image_api.base_url = legacyImageBase
    changed = true
  }
  if (!result.image_api.api_key && legacyImageKey) {
    result.image_api.api_key = legacyImageKey
    changed = true
  }

  const defaultAccount = result.accounts[result.default_account]
  if (defaultAccount && defaultAccount.platform === 'gzh') {
    if (!defaultAccount.appid && legacyAppid) {
      defaultAccount.appid = legacyAppid
      changed = true
    }
    if (!defaultAccount.app_secret && legacySecret) {
      defaultAccount.app_secret = legacySecret
      changed = true
    }
  } else if (Object.keys(result.accounts).length > 0) {
    const pickGzh = Object.keys(result.accounts).find(
      k => result.accounts[k]?.enabled && result.accounts[k]?.platform === 'gzh',
    )
    if (pickGzh) {
      const only = result.accounts[pickGzh]
      if (!only.appid && legacyAppid) {
        only.appid = legacyAppid
        changed = true
      }
      if (!only.app_secret && legacySecret) {
        only.app_secret = legacySecret
        changed = true
      }
    }
  }

  const firstProvider = providerPool(result)[0]?.provider
  if (firstProvider) {
    if (!firstProvider.base_url && legacyImageBase) {
      firstProvider.base_url = legacyImageBase
      changed = true
    }
    if (!firstProvider.api_key && legacyImageKey) {
      firstProvider.api_key = legacyImageKey
      changed = true
    }
  }
  // [中文修复依据]：彻底移除全局 brand_images，保证配置中仅账号独立持有
  delete (result as any).brand_images
  return { config: result, changed }
}
