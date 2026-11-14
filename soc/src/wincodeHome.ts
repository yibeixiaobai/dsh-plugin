import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getDshSocialPublisherDir } from './migration.ts'

export function getDshHome(): string {
  const envHome = process.env.DSH_HOME
  if (envHome && envHome.trim()) {
    const customHome = path.resolve(envHome.trim())
    if (!fs.existsSync(customHome)) {
      try {
        fs.mkdirSync(customHome, { recursive: true })
      } catch {}
    }
    return customHome
  }
  return path.join(os.homedir(), '.dsh')
}

/**
 * 兼容别名：获取全局主数据目录
 */
export function getWinCodeHome(): string {
  const envHome = process.env.WINCODE_HOME || process.env.WINCODE_DATA_BASE_DIR
  if (envHome && envHome.trim()) {
    return path.resolve(envHome.trim())
  }
  return path.join(os.homedir(), '.wincode')
}

/**
 * 获取全局社媒发布模块的任务持久化目录（单点真值 Source of Truth）
 * 路径格式：~/.dsh/social-publisher/
 */
export function getGlobalSocialPublisherDir(): string {
  const custom = process.env.DSH_SOCIAL_PUBLISHER_DIR || process.env.WINCODE_SOCIAL_PUBLISHER_DIR
  if (custom && custom.trim()) {
    return path.resolve(custom.trim())
  }
  return getDshSocialPublisherDir()
}

/**
 * 获取全局社媒发布模块的账号凭据目录
 */
export function getGlobalAccountsDir(): string {
  const dir = path.join(getGlobalSocialPublisherDir(), 'accounts')
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true })
    } catch {}
  }
  return dir
}

/**
 * 获取全局主配置文件候选路径列表（单一权威 Source of Truth：~/.dsh/social-publisher/publisher_config.json）
 */
export function getGlobalPublisherConfigFiles(): string[] {
  const primary = path.join(getGlobalSocialPublisherDir(), 'publisher_config.json')
  const legacy = [
    primary,
    path.join(getWinCodeHome(), 'v2', 'social-publisher', 'publisher_config.json'),
    path.join(getWinCodeHome(), 'v2', 'social-publisher', 'tasks', 'default', 'publisher_config.json'),
    path.join(os.homedir(), '.social-publisher', 'publisher_config.json'),
  ]
  return Array.from(new Set(legacy))
}
