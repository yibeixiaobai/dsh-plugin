import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { workspaceDir } from './tools/shared.ts'

export interface WechatScheduledArticle {
  title: string
  cover_url?: string
  url?: string
  article_type?: 'news' | 'newspic'
}

/** 微信公众号平台（图3）同步的已排期定时任务模型（完全由微信后台官方托管） */
export interface WechatScheduledTask {
  id: string
  account_id: string
  display_time: string
  scheduled_time: string
  scheduled_timestamp: number
  has_notification: boolean
  article_type?: 'news' | 'newspic'
  articles: WechatScheduledArticle[]
  can_cancel: boolean
  synced_at: string
}

export const WECHAT_SCHEDULED_TASKS_FILE = 'wechat_scheduled_tasks.json'

export function getWechatScheduledTasksFilePath(cfg: Config, accountId?: string): string {
  const ws = workspaceDir(cfg)
  if (accountId && accountId !== 'all') {
    return path.join(ws, 'accounts', accountId, WECHAT_SCHEDULED_TASKS_FILE)
  }
  return path.join(ws, WECHAT_SCHEDULED_TASKS_FILE)
}

/**
 * 加载微信公众号后台首页已排期任务列表
 */
export function loadWechatScheduledTasks(cfg: Config, accountId?: string): WechatScheduledTask[] {
  const tasks: WechatScheduledTask[] = []
  const seenIds = new Set<string>()

  // 1. 尝试读取账号特定文件；accountId='all' 时遍历全部账号，避免只看全局汇总而漏掉新排期
  if (accountId && accountId !== 'all') {
    const accPath = getWechatScheduledTasksFilePath(cfg, accountId)
    if (fs.existsSync(accPath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(accPath, 'utf-8'))
        if (Array.isArray(raw)) {
          for (const item of raw) {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id)
              tasks.push(item)
            }
          }
        }
      } catch {}
    }
  } else if (accountId === 'all') {
    const accountsDir = path.join(workspaceDir(cfg), 'accounts')
    if (fs.existsSync(accountsDir)) {
      let accountIds: string[] = []
      try {
        accountIds = fs
          .readdirSync(accountsDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .map(d => d.name)
      } catch {
        accountIds = []
      }
      for (const accId of accountIds) {
        const accPath = getWechatScheduledTasksFilePath(cfg, accId)
        if (!fs.existsSync(accPath)) continue
        try {
          const raw = JSON.parse(fs.readFileSync(accPath, 'utf-8'))
          if (!Array.isArray(raw)) continue
          for (const item of raw) {
            if (item && item.id && !seenIds.has(item.id)) {
              seenIds.add(item.id)
              tasks.push(item)
            }
          }
        } catch {}
      }
    }
  }

  // 2. 尝试读取全局汇总文件
  const globalPath = getWechatScheduledTasksFilePath(cfg)
  if (fs.existsSync(globalPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalPath, 'utf-8'))
      if (Array.isArray(raw)) {
        for (const item of raw) {
          if (item && item.id && !seenIds.has(item.id)) {
            if (!accountId || accountId === 'all' || item.account_id === accountId) {
              seenIds.add(item.id)
              tasks.push(item)
            }
          }
        }
      }
    } catch {}
  }

  // 按排期时间正序排序
  return tasks.sort((a, b) => a.scheduled_timestamp - b.scheduled_timestamp)
}

/**
 * 辅助：高可靠原子写入文件，防止中途异常损坏持久化 JSON
 */
function atomicWriteJson(filePath: string, data: any): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp.${Date.now()}`
  const content = JSON.stringify(data, null, 2)
  try {
    fs.writeFileSync(tmpPath, content, 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch {
    // Windows 下如果重命名冲突则直接写入
    fs.writeFileSync(filePath, content, 'utf-8')
    if (fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath) } catch {}
    }
  }
}

/**
 * 保存微信公众号后台首页已排期任务列表并原子同步全局汇总文件
 */
export function saveWechatScheduledTasks(
  cfg: Config,
  accountId: string,
  newTasks: WechatScheduledTask[],
): void {
  // 1. 保存至账号特定目录
  const accPath = getWechatScheduledTasksFilePath(cfg, accountId)
  atomicWriteJson(accPath, newTasks)

  // 2. 合并更新至全局汇总目录
  const globalPath = getWechatScheduledTasksFilePath(cfg)
  let existingGlobal: WechatScheduledTask[] = []
  if (fs.existsSync(globalPath)) {
    try {
      existingGlobal = JSON.parse(fs.readFileSync(globalPath, 'utf-8'))
    } catch {
      existingGlobal = []
    }
  }
  // 移除当前账号的历史记录，追加新记录
  const merged = [
    ...existingGlobal.filter(t => t.account_id !== accountId),
    ...newTasks,
  ].sort((a, b) => a.scheduled_timestamp - b.scheduled_timestamp)
  atomicWriteJson(globalPath, merged)
}

/**
 * 从本地排期库中移除已取消的微信定时发表任务（同时原子同步账号特定文件和全局汇总文件）
 */
export function removeWechatScheduledTask(
  cfg: Config,
  accountId: string,
  taskId: string,
): { ok: boolean; removed: boolean; remainingCount: number } {
  const currentTasks = loadWechatScheduledTasks(cfg, accountId)
  const initialCount = currentTasks.length
  const remaining = currentTasks.filter(t => t.id !== taskId)
  const removed = remaining.length < initialCount

  if (removed) {
    saveWechatScheduledTasks(cfg, accountId, remaining)
  }

  // 同时也检查全局汇总文件中是否有遗留匹配
  const globalPath = getWechatScheduledTasksFilePath(cfg)
  if (fs.existsSync(globalPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(globalPath, 'utf-8'))
      if (Array.isArray(raw)) {
        const filteredGlobal = raw.filter(t => !(t.id === taskId && (!accountId || t.account_id === accountId)))
        if (filteredGlobal.length !== raw.length) {
          atomicWriteJson(globalPath, filteredGlobal)
        }
      }
    } catch {}
  }

  return { ok: true, removed, remainingCount: remaining.length }
}
