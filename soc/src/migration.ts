/**
 * 社媒发布历史数据自动平滑迁移引擎 (Social Publisher Legacy Data Migrator)
 * 职责：首次启动时自动检测并无缝导入原有 ~/.social-publisher、~/.wincode 或 %LOCALAPPDATA%
 * 中的账号、Cookie、草稿及历史发布记录，迁移至 DSH 官方主目录 ~/.dsh/social-publisher。
 */

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface MigrationSummary {
  migrated: boolean
  from?: string
  to: string
  filesCopied: string[]
  accountsCount: number
}

export function getDshSocialPublisherDir(): string {
  const dshHome = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
  const targetDir = path.join(dshHome, 'social-publisher')
  if (!fs.existsSync(targetDir)) {
    try {
      fs.mkdirSync(targetDir, { recursive: true })
    } catch {}
  }
  return targetDir
}

function copyDirectoryRecursive(src: string, dest: string): void {
  if (!fs.existsSync(src)) return
  fs.mkdirSync(dest, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDirectoryRecursive(srcPath, destPath)
    } else {
      if (!fs.existsSync(destPath)) {
        try {
          fs.copyFileSync(srcPath, destPath)
        } catch {}
      }
    }
  }
}

export function autoMigrateLegacyData(logger?: { info?: (...args: any[]) => void; warn?: (...args: any[]) => void }): MigrationSummary {
  const targetDir = getDshSocialPublisherDir()
  const targetConfigFile = path.join(targetDir, 'publisher_config.json')

  // 如果目标目录已经拥有完整配置文件，说明已经迁移或已有配置，跳过自动搬运
  if (fs.existsSync(targetConfigFile)) {
    return {
      migrated: false,
      to: targetDir,
      filesCopied: [],
      accountsCount: 0,
    }
  }

  const userHome = os.homedir()
  const localAppData = process.env.LOCALAPPDATA || path.join(userHome, 'AppData', 'Local')

  const legacyCandidates = [
    path.join(userHome, '.social-publisher'),
    path.join(localAppData, 'dsh-social-publisher'),
    path.join(userHome, '.wincode', 'v2', 'social-publisher', 'tasks', 'default'),
    path.join(userHome, '.wincode', 'v2', 'social-publisher'),
    path.join(userHome, '.wincode', 'social-publisher'),
  ]

  for (const candidate of legacyCandidates) {
    if (!fs.existsSync(candidate)) continue
    const candidateConfig = path.join(candidate, 'publisher_config.json')
    const candidateWxConfig = path.join(candidate, 'wx_config.json')
    const candidateAccounts = path.join(candidate, 'accounts')

    if (fs.existsSync(candidateConfig) || fs.existsSync(candidateAccounts)) {
      logger?.info?.(`[social-publisher] 检测到旧版社媒数据源: ${candidate}，正在自动平滑迁移至: ${targetDir}`)
      const copied: string[] = []

      if (fs.existsSync(candidateConfig)) {
        try {
          fs.copyFileSync(candidateConfig, targetConfigFile)
          copied.push('publisher_config.json')
        } catch (err) {
          logger?.warn?.('[social-publisher] 复制 publisher_config.json 失败:', err)
        }
      }

      if (fs.existsSync(candidateWxConfig)) {
        const targetWx = path.join(targetDir, 'wx_config.json')
        try {
          fs.copyFileSync(candidateWxConfig, targetWx)
          copied.push('wx_config.json')
        } catch {}
      }

      let accountsCount = 0
      if (fs.existsSync(candidateAccounts)) {
        const targetAccounts = path.join(targetDir, 'accounts')
        copyDirectoryRecursive(candidateAccounts, targetAccounts)
        copied.push('accounts/')
        try {
          accountsCount = fs.readdirSync(targetAccounts).length
        } catch {}
      }

      // 迁移草稿箱与发布历史
      const candidateDrafts = path.join(candidate, 'drafts')
      if (fs.existsSync(candidateDrafts)) {
        copyDirectoryRecursive(candidateDrafts, path.join(targetDir, 'drafts'))
        copied.push('drafts/')
      }

      const candidateHistory = path.join(candidate, 'publish_history.json')
      if (fs.existsSync(candidateHistory)) {
        try {
          fs.copyFileSync(candidateHistory, path.join(targetDir, 'publish_history.json'))
          copied.push('publish_history.json')
        } catch {}
      }

      logger?.info?.(`[social-publisher] 自动迁移完成: 成功同步 ${copied.length} 项资产 (${copied.join(', ')}), 共包含 ${accountsCount} 个账号`)

      return {
        migrated: true,
        from: candidate,
        to: targetDir,
        filesCopied: copied,
        accountsCount,
      }
    }
  }

  return {
    migrated: false,
    to: targetDir,
    filesCopied: [],
    accountsCount: 0,
  }
}
