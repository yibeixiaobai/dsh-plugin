import fs from 'node:fs'
import path from 'node:path'
import type { Config } from '../config.ts'
import type { TaskMaterialManifest, TaskSandboxContext } from './taskSandboxTypes.ts'
import {
  activeTasksBaseDir,
  archiveTasksBaseDir,
  taskSandboxRootDir,
} from './taskSandboxPaths.ts'

function makeTreeWritableSync(dir: string): void {
  try {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        makeTreeWritableSync(full)
      } else {
        try { fs.chmodSync(full, 0o666) } catch {}
      }
    }
  } catch {}
}

/**
 * 任务完成后安全归档（将 active/<taskId> 移至 archive/YYYY-MM/<taskId>）
 */
export function archiveTaskSandbox(cfg: Partial<Config> | undefined, taskId: string, workspacePath?: string): string | null {
  const activeRoot = taskSandboxRootDir(cfg, taskId, workspacePath)
  if (!fs.existsSync(activeRoot)) return null

  // 中文注释：在执行移动或跨盘复制删除前，恢复只读文件的写权限，防止 Windows 下 EPERM
  makeTreeWritableSync(activeRoot)

  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  const monthFolder = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`
  const archiveBase = path.join(archiveTasksBaseDir(cfg, workspacePath), monthFolder)
  fs.mkdirSync(archiveBase, { recursive: true })

  const archiveDest = path.join(archiveBase, taskId)
  try {
    fs.renameSync(activeRoot, archiveDest)
    return archiveDest
  } catch {
    // 跨驱动器容灾拷贝后删除
    try {
      fs.cpSync(activeRoot, archiveDest, { recursive: true })
      fs.rmSync(activeRoot, { recursive: true, force: true })
      return archiveDest
    } catch {
      return null
    }
  }
}

/** 获取沙箱中规范的文章物理落盘路径 */
export function getSandboxedArticlePath(
  ctx: TaskSandboxContext,
  index: number,
  format: 'html' | 'markdown' | 'text' = 'html',
): string {
  const ext = format === 'html' ? '.html' : format === 'markdown' ? '.md' : '_xhs.txt'
  return path.join(ctx.targetGroup.articlesDir, `article_v2_${index}${ext}`)
}

/** 获取沙箱中规范的配图物理落盘路径 */
export function getSandboxedImagePath(
  ctx: TaskSandboxContext,
  kind: 'cover' | 'content' | 'pic',
  index: number,
  sub?: number,
  ext = '.png',
): string {
  const targetName =
    kind === 'cover'
      ? `cover_${index}${ext}`
      : kind === 'pic'
        ? `pic_${index}_${sub || 1}${ext}`
        : `content_${index}_${sub || 1}${ext}`
  return path.join(ctx.targetGroup.imagesDir, targetName)
}

/** 任务沙箱概要信息，用于历史查询与追溯 */
export interface TaskSandboxSummary {
  taskId: string
  rootDir: string
  manifest: TaskMaterialManifest
  status: 'active' | 'archive'
  updatedAt: string
}

/**
 * 列出并检索历史或活跃沙箱
 * 【中文修复依据】：规范化沙箱检索通道，供用户与前端界面统一追溯历史产物
 */
export function listTaskSandboxes(
  cfg: Partial<Config> | undefined,
  filter?: { platform?: string; accountId?: string; status?: 'active' | 'archive' | 'all'; workspacePath?: string },
): TaskSandboxSummary[] {
  const statusFilter = filter?.status || 'all'
  const summaries: TaskSandboxSummary[] = []

  const checkAndAddSummary = (taskDir: string, status: 'active' | 'archive') => {
    const manifestFile = path.join(taskDir, 'manifest.json')
    if (!fs.existsSync(manifestFile)) return
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as TaskMaterialManifest
      if (filter?.platform) {
        const hasPlatform = Object.values(manifest.targets).some(t => t.platform === filter.platform)
        if (!hasPlatform) return
      }
      if (filter?.accountId) {
        const hasAccount = Object.values(manifest.targets).some(t => t.accountId === filter.accountId)
        if (!hasAccount) return
      }
      summaries.push({
        taskId: manifest.taskId || path.basename(taskDir),
        rootDir: taskDir,
        manifest,
        status,
        updatedAt: manifest.updatedAt || manifest.createdAt,
      })
    } catch {
      // 忽略损坏的 manifest
    }
  }

  const scanDir = (baseDir: string, status: 'active' | 'archive') => {
    if (!fs.existsSync(baseDir)) return
    const entries = fs.readdirSync(baseDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const fullPath = path.join(baseDir, entry.name)
      // 若当前目录直接包含 manifest.json（活跃任务或单层归档）
      if (fs.existsSync(path.join(fullPath, 'manifest.json'))) {
        checkAndAddSummary(fullPath, status)
      } else if (status === 'archive') {
        // 【中文修复依据】：支持按规范扫描二级月份归档目录 (tasks/archive/YYYY-MM/<taskId>/)
        try {
          const subEntries = fs.readdirSync(fullPath, { withFileTypes: true })
          for (const sub of subEntries) {
            if (sub.isDirectory()) {
              checkAndAddSummary(path.join(fullPath, sub.name), 'archive')
            }
          }
        } catch {}
      }
    }
  }

  if (statusFilter === 'active' || statusFilter === 'all') {
    scanDir(activeTasksBaseDir(cfg, filter?.workspacePath), 'active')
  }
  if (statusFilter === 'archive' || statusFilter === 'all') {
    scanDir(archiveTasksBaseDir(cfg, filter?.workspacePath), 'archive')
  }

  // 按更新时间倒序排序
  return summaries.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

/**
 * 自动清理并归档超过期限的孤儿活跃沙箱
 * 【修复原因与依据】：避免因会话中断或异常退出的未完成任务在 tasks/active/ 中无限堆积，
 * 对超过 maxAgeDays 天未修改或全部目标均已发布成功的沙箱，安全原子迁移至 tasks/archive/ 归档区。
 */
export function cleanupOrphanActiveSandboxes(
  cfg: Partial<Config> | undefined,
  maxAgeDays = 7,
  workspacePath?: string,
): { cleanedCount: number; archivedTaskIds: string[] } {
  const activeBase = activeTasksBaseDir(cfg, workspacePath)
  if (!fs.existsSync(activeBase)) return { cleanedCount: 0, archivedTaskIds: [] }

  const nowMs = Date.now()
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const archivedTaskIds: string[] = []

  try {
    const entries = fs.readdirSync(activeBase, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const taskId = entry.name
      const taskDir = path.join(activeBase, taskId)
      const manifestFile = path.join(taskDir, 'manifest.json')

      let shouldArchive = false
      if (fs.existsSync(manifestFile)) {
        try {
          const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf-8')) as TaskMaterialManifest
          const updateTime = new Date(manifest.updatedAt || manifest.createdAt).getTime()
          const isStale = !Number.isNaN(updateTime) && (nowMs - updateTime > maxAgeMs)
          const isAllPublished = Object.values(manifest.targets || {}).every(
            t => t.publishResult?.status === 'success',
          ) && Object.keys(manifest.targets || {}).length > 0

          if (isStale || isAllPublished) {
            shouldArchive = true
          }
        } catch {
          const stat = fs.statSync(taskDir)
          if (nowMs - stat.mtimeMs > maxAgeMs) {
            shouldArchive = true
          }
        }
      } else {
        const stat = fs.statSync(taskDir)
        if (nowMs - stat.mtimeMs > maxAgeMs) {
          shouldArchive = true
        }
      }

      if (shouldArchive) {
        const res = archiveTaskSandbox(cfg, taskId, workspacePath)
        if (res) archivedTaskIds.push(taskId)
      }
    }
  } catch {}

  return { cleanedCount: archivedTaskIds.length, archivedTaskIds }
}
