import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import type { ProfileLockHandle } from './types.ts'

const LOCK_STALE_TIMEOUT_MS = 600_000
const SLOT_WAIT_TIMEOUT_MS = 180_000

/**
 * 动态根据系统可用内存与总内存计算最大并发无头浏览器数量
 */
export function computeAdaptiveMaxBrowsers(configuredMax?: number): number {
  if (configuredMax && configuredMax > 0) {
    return configuredMax
  }
  try {
    const freeGB = os.freemem() / (1024 * 1024 * 1024)
    const totalGB = os.totalmem() / (1024 * 1024 * 1024)

    if (totalGB < 8 || freeGB < 1.5) {
      return 1
    }
    if (totalGB >= 32 && freeGB >= 6.0) {
      return 4
    }
    if (totalGB >= 16 && freeGB >= 3.0) {
      return 3
    }
    return 2
  } catch {
    return 2
  }
}

export const GLOBAL_MAX_ACTIVE_BROWSERS = 2

let activeGlobalBrowsers = 0
const globalWaitQueue: Array<() => void> = []

const activeBrowsersByPlatform = new Map<string, number>()
const platformWaitQueues = new Map<string, Array<() => void>>()

function normalizePlatformKey(platform?: string): string {
  if (!platform) return 'default'
  const p = platform.toLowerCase()
  if (p.includes('wechat') || p.includes('gzh') || p.includes('微信')) return 'gzh'
  if (p.includes('xhs') || p.includes('xiaohongshu') || p.includes('小红书')) return 'xhs'
  if (p.includes('zhihu') || p.includes('知乎')) return 'zhihu'
  if (p.includes('baijiahao') || p.includes('百家号')) return 'baijiahao'
  if (p.includes('toutiao') || p.includes('今日头条') || p.includes('头条')) return 'toutiao'
  return p
}

function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (err: any) {
    return err?.code === 'EPERM'
  }
}

function waitWithWatchdog(enqueue: (resolver: () => void) => () => void, label: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const done = () => {
      if (!settled) {
        settled = true
        if (timer) clearTimeout(timer)
        resolve()
      }
    }

    const remove = enqueue(done)

    timer = setTimeout(() => {
      if (!settled) {
        settled = true
        remove()
        reject(new Error(`[browser-concurrency] ${label} 排队等待执行令牌超时 (${SLOT_WAIT_TIMEOUT_MS / 1000}s)，任务已安全熔断，杜绝无序并发！`))
      }
    }, SLOT_WAIT_TIMEOUT_MS)
  })
}

export interface AcquireBrowserSlotOptions {
  platformDisplayName?: string
  cooldownMs?: number
  maxConcurrent?: number
}

/**
 * 申请平台与全局浏览器执行令牌（受控限流池）
 */
export async function acquireBrowserSlot(optionsOrPlatform?: string | AcquireBrowserSlotOptions): Promise<() => void> {
  const options: AcquireBrowserSlotOptions = typeof optionsOrPlatform === 'string'
    ? { platformDisplayName: optionsOrPlatform }
    : (optionsOrPlatform || {})
  const platformKey = normalizePlatformKey(options.platformDisplayName)
  const cooldownMs = Math.max(0, options.cooldownMs ?? 0)

  const maxBrowsers = computeAdaptiveMaxBrowsers(options.maxConcurrent)
  while (activeGlobalBrowsers >= maxBrowsers) {
    await waitWithWatchdog((resolve) => {
      globalWaitQueue.push(resolve)
      return () => {
        const idx = globalWaitQueue.indexOf(resolve)
        if (idx >= 0) globalWaitQueue.splice(idx, 1)
      }
    }, `全局浏览器槽位 (active: ${activeGlobalBrowsers}, adaptiveMax: ${maxBrowsers})`)
  }
  activeGlobalBrowsers++

  try {
    while ((activeBrowsersByPlatform.get(platformKey) || 0) >= 1) {
      await waitWithWatchdog((resolve) => {
        let queue = platformWaitQueues.get(platformKey)
        if (!queue) {
          queue = []
          platformWaitQueues.set(platformKey, queue)
        }
        queue.push(resolve)
        return () => {
          const q = platformWaitQueues.get(platformKey)
          if (q) {
            const idx = q.indexOf(resolve)
            if (idx >= 0) q.splice(idx, 1)
          }
        }
      }, `平台 ${platformKey} 互斥槽位`)
    }
    activeBrowsersByPlatform.set(platformKey, (activeBrowsersByPlatform.get(platformKey) || 0) + 1)
  } catch (err) {
    activeGlobalBrowsers = Math.max(0, activeGlobalBrowsers - 1)
    if (globalWaitQueue.length > 0) {
      const nextGlobalResolver = globalWaitQueue.shift()
      if (nextGlobalResolver) nextGlobalResolver()
    }
    throw err
  }

  let released = false
  return () => {
    if (released) return
    released = true

    const doReleasePlatform = () => {
      const nextCount = Math.max(0, (activeBrowsersByPlatform.get(platformKey) || 1) - 1)
      if (nextCount === 0) {
        activeBrowsersByPlatform.delete(platformKey)
      } else {
        activeBrowsersByPlatform.set(platformKey, nextCount)
      }
      const platQueue = platformWaitQueues.get(platformKey)
      if (platQueue && platQueue.length > 0) {
        const nextResolver = platQueue.shift()
        if (nextResolver) nextResolver()
      }
    }

    if (cooldownMs > 0) {
      setTimeout(doReleasePlatform, cooldownMs)
    } else {
      doReleasePlatform()
    }

    activeGlobalBrowsers = Math.max(0, activeGlobalBrowsers - 1)
    if (globalWaitQueue.length > 0) {
      const nextGlobalResolver = globalWaitQueue.shift()
      if (nextGlobalResolver) nextGlobalResolver()
    }
  }
}

/** 同进程内针对各个 profile 目录的异步内存互斥锁 */
const dirMutexMap = new Map<string, Promise<void>>()

/**
 * 申请 profile 目录的进程内内存互斥锁
 */
export async function acquireProfileDirMutex(userDataDir: string): Promise<() => void> {
  const normalized = path.resolve(userDataDir)
  while (dirMutexMap.has(normalized)) {
    try {
      await dirMutexMap.get(normalized)
    } catch {}
  }

  let releaseMutex: () => void = () => {}
  const mutexPromise = new Promise<void>((resolve) => {
    releaseMutex = resolve
  })
  dirMutexMap.set(normalized, mutexPromise)

  let released = false
  return () => {
    if (released) return
    released = true
    if (dirMutexMap.get(normalized) === mutexPromise) {
      dirMutexMap.delete(normalized)
    }
    releaseMutex()
  }
}

/**
 * 跨进程物理目录排他锁（原子获取）
 */
export async function acquireProfileLock(userDataDir: string, maxWaitMs = 120_000): Promise<ProfileLockHandle> {
  fs.mkdirSync(userDataDir, { recursive: true })
  // 兼容检测旧版 .wincode_profile.lock 与新版 .dsh_browser.lock
  const lockNames = ['.dsh_browser.lock', '.wincode_profile.lock']
  const lockPath = path.join(userDataDir, '.dsh_browser.lock')
  const startTime = Date.now()

  while (Date.now() - startTime < maxWaitMs) {
    try {
      // 检查历史陈旧锁
      for (const name of lockNames) {
        const p = path.join(userDataDir, name)
        if (fs.existsSync(p)) {
          try {
            const content = fs.readFileSync(p, 'utf-8')
            const parsed = JSON.parse(content)
            const isStaleTime = Date.now() - (parsed.time || 0) > LOCK_STALE_TIMEOUT_MS
            const isDeadPid = parsed.pid && !isPidAlive(parsed.pid)
            if (isStaleTime || isDeadPid) {
              console.warn(`[browser-concurrency] 检测到陈旧或孤儿锁文件，自动清理自愈: ${p}`)
              try { fs.unlinkSync(p) } catch {}
            }
          } catch {
            // 解析失败时跳过
          }
        }
      }

      const lockData = JSON.stringify({
        pid: process.pid,
        time: Date.now(),
        createdAt: new Date().toISOString(),
      })
      fs.writeFileSync(lockPath, lockData, { flag: 'wx' })

      return {
        lockPath,
        pid: process.pid,
        released: false,
      }
    } catch (err: any) {
      if (err?.code === 'EEXIST') {
        await new Promise(r => setTimeout(r, 300))
      } else {
        throw err
      }
    }
  }

  throw new Error(`获取浏览器目录排他锁超时（可能有后台任务正在占用该账号）：${userDataDir}`)
}

/**
 * 释放跨进程物理目录排他锁
 */
export function releaseProfileLock(handle: ProfileLockHandle): void {
  if (!handle || handle.released) return
  handle.released = true
  try {
    if (fs.existsSync(handle.lockPath)) {
      const content = fs.readFileSync(handle.lockPath, 'utf-8')
      const parsed = JSON.parse(content)
      if (parsed.pid === handle.pid) {
        fs.unlinkSync(handle.lockPath)
      }
    }
  } catch {}
}

export function resetConcurrencyPoolForTests(): void {
  activeGlobalBrowsers = 0
  globalWaitQueue.length = 0
  activeBrowsersByPlatform.clear()
  platformWaitQueues.clear()
  dirMutexMap.clear()
}
