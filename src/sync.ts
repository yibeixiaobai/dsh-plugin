// 配置同步：凭据的单一事实来源是插件设置界面，
// 每次 apply（含热重载）把凭据落到 Python 侧读取的 scripts/wx_config.json。
// 留空的凭据字段不覆盖现有文件值，保证"先沿用现状、后可接管"。
import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'

export function scriptsDir(cfg: Config): string {
  return path.join(cfg.runtime.project_root, 'scripts')
}

export function brandDir(cfg: Config): string {
  return path.join(cfg.runtime.project_root, 'brand_assets')
}

export function gzhDesignScriptsDir(cfg: Config): string {
  return path.join(cfg.runtime.project_root, 'gzh_design', 'scripts')
}

export interface SyncReport {
  wx_config_path: string
  updated: boolean
  appid_source: 'plugin' | 'existing'
  api_key_source: 'plugin' | 'existing'
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
  const appidFromPlugin = cfg.wechat.appid.trim() !== ''
  const keyFromPlugin = cfg.image_api.api_key.trim() !== ''
  const merged = {
    ...existing,
    appid: appidFromPlugin ? cfg.wechat.appid.trim() : existing.appid ?? '',
    app_secret:
      cfg.wechat.app_secret.trim() !== '' ? cfg.wechat.app_secret.trim() : existing.app_secret ?? '',
    image_api_base: cfg.image_api.base_url,
    image_api_key:
      keyFromPlugin ? cfg.image_api.api_key.trim() : existing.image_api_key ?? '',
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(wxPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  return {
    wx_config_path: wxPath,
    updated: true,
    appid_source: appidFromPlugin ? 'plugin' : 'existing',
    api_key_source: keyFromPlugin ? 'plugin' : 'existing',
  }
}

/** 需要联网（微信 API / 生图 API）的工具执行前校验凭据是否可用 */
export function assertWechatCreds(cfg: Config): void {
  const wxPath = path.join(scriptsDir(cfg), 'wx_config.json')
  let ok = false
  try {
    const c = JSON.parse(fs.readFileSync(wxPath, 'utf-8')) as { appid?: string; app_secret?: string }
    ok = Boolean(c.appid && c.app_secret)
  } catch {
    ok = false
  }
  if (!ok) {
    throw new Error(
      '缺少公众号凭据：请在插件设置「① 公众号凭据」填写 appid / app_secret（或确认已存在 scripts/wx_config.json）。',
    )
  }
}

export function assertImageCreds(cfg: Config): void {
  const wxPath = path.join(scriptsDir(cfg), 'wx_config.json')
  let ok = false
  try {
    const c = JSON.parse(fs.readFileSync(wxPath, 'utf-8')) as { image_api_key?: string }
    ok = Boolean(c.image_api_key)
  } catch {
    ok = false
  }
  if (!ok) {
    throw new Error('缺少生图 API Key：请在插件设置「④ AI 配图」填写 api_key（sk- 开头）。')
  }
}
