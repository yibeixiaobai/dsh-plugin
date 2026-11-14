import fs from 'node:fs'
import path from 'node:path'
import { getGlobalSocialPublisherDir } from './wincodeHome.ts'

export const MIN_CRITICAL_DISK_BYTES = 200 * 1024 * 1024 // 200 MB 绝对硬拦截线
export const MIN_HEALTHY_DISK_BYTES = 1024 * 1024 * 1024 // 1 GB 预警自愈线

export interface DiskSpaceInfo {
  availableBytes: number
  totalBytes: number
  freeRatio: number
}

/**
 * 获取指定路径所在文件系统的剩余磁盘可用空间
 */
export async function getDiskAvailableSpace(targetPath: string): Promise<DiskSpaceInfo | null> {
  try {
    const checkPath = fs.existsSync(targetPath) ? targetPath : path.dirname(targetPath)
    if (!fs.statfs) {
      return null
    }
    const stats = await fs.promises.statfs(checkPath)
    const availableBytes = Number(stats.bavail) * Number(stats.bsize)
    const totalBytes = Number(stats.blocks) * Number(stats.bsize)
    const freeRatio = totalBytes > 0 ? availableBytes / totalBytes : 1
    return { availableBytes, totalBytes, freeRatio }
  } catch {
    return null
  }
}

/**
 * 递归安全清理指定目录（忽略不存在或占用的文件）
 */
async function safeRemoveDir(dirPath: string): Promise<number> {
  let cleanedBytes = 0
  if (!fs.existsSync(dirPath)) return 0
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)
      try {
        if (entry.isDirectory()) {
          cleanedBytes += await safeRemoveDir(fullPath)
          await fs.promises.rmdir(fullPath).catch(() => undefined)
        } else {
          const s = await fs.promises.stat(fullPath).catch(() => null)
          if (s) {
            cleanedBytes += s.size
            await fs.promises.unlink(fullPath).catch(() => undefined)
          }
        }
      } catch {
        // 忽略单文件清理异常
      }
    }
  } catch {
    // 忽略目录遍历异常
  }
  return cleanedBytes
}

/**
 * 执行轻量级磁盘自愈清理：
 * 清理社媒无头浏览器运行时无用的 Cache / GPUCache / Code Cache 临时网络缓存，
 * 保留 Cookies、LocalStorage 等关键登录凭据，保持免扫码登录态不受影响。
 */
export async function selfHealSocialPublisherCaches(baseDir?: string): Promise<number> {
  const root = baseDir || getGlobalSocialPublisherDir()
  const accountsDir = path.join(root, 'accounts')
  let totalReclaimed = 0

  if (!fs.existsSync(accountsDir)) return 0

  try {
    const accounts = await fs.promises.readdir(accountsDir)
    for (const acc of accounts) {
      const accProfileDir = path.join(accountsDir, acc, 'wechat_profile')
      if (!fs.existsSync(accProfileDir)) continue

      // 仅清理纯缓存目录，绝不触碰 Cookies, Preferences, Local Storage 等
      const cacheTargets = [
        path.join(accProfileDir, 'Default', 'Cache'),
        path.join(accProfileDir, 'Default', 'Code Cache'),
        path.join(accProfileDir, 'Default', 'GPUCache'),
        path.join(accProfileDir, 'Default', 'Service Worker', 'CacheStorage'),
        path.join(accProfileDir, 'Default', 'Service Worker', 'ScriptCache'),
        path.join(accProfileDir, 'ShaderCache'),
        path.join(accProfileDir, 'GrShaderCache'),
      ]

      for (const target of cacheTargets) {
        if (fs.existsSync(target)) {
          totalReclaimed += await safeRemoveDir(target)
        }
      }
    }
  } catch {
    // 静默降级
  }

  return totalReclaimed
}

/**
 * 社媒流水线磁盘健康前置断言守卫
 * 在 AI 批量生图与大物料写盘前调用，杜绝突发底层 ENOSPC 导致任务硬阻断
 */
export async function assertDiskSpaceAvailable(options: {
  targetDir: string
  minBytes?: number
  allowSelfHeal?: boolean
}): Promise<DiskSpaceInfo | null> {
  const minBytes = options.minBytes ?? MIN_CRITICAL_DISK_BYTES
  const allowSelfHeal = options.allowSelfHeal ?? true

  let info = await getDiskAvailableSpace(options.targetDir)
  if (!info) {
    // 无法探知磁盘空间（如平台限制），宽松放行
    return null
  }

  // 1. 如果可用空间低于自愈线，先尝试轻量自愈释放临时缓存
  if (info.availableBytes < MIN_HEALTHY_DISK_BYTES && allowSelfHeal) {
    await selfHealSocialPublisherCaches()
    // 再次复测
    const refreshed = await getDiskAvailableSpace(options.targetDir)
    if (refreshed) {
      info = refreshed
    }
  }

  // 2. 如果依然低于危急拦截线，坚决阻断写盘，保护系统与任务已有物料
  if (info.availableBytes < minBytes) {
    const freeMb = (info.availableBytes / (1024 * 1024)).toFixed(1)
    const requireMb = (minBytes / (1024 * 1024)).toFixed(0)
    throw new Error(
      `❌ 【磁盘空间极度不足拦截】：当前工作区所在磁盘可用空间仅为 ${freeMb} MB，低于安全写入阈值（${requireMb} MB）！` +
        '为防止突发底层 ENOSPC 导致正在生成的长文与物料损坏，系统已提前优雅挂起任务。请先清理磁盘垃圾或释放空间后重试。',
    )
  }

  return info
}
