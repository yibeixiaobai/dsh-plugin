// 按账号隔离的登录状态管理：登录锁（防同账号并发登录）+ 状态缓存（60s TTL，避免频繁启动浏览器）。
// 键格式 `${platform}:${accountId}`，不同平台/不同账号的登录流程互不干扰。

const DEFAULT_TTL_MS = 60_000

const loginInFlight = new Map<string, boolean>()
const loginStateCache = new Map<string, { loggedIn: boolean; checkedAt: number }>()

function cacheKey(platform: string, accountId: string): string {
  // 规范化平台别名（将 xiaohongshu 统一为 xhs，wechat 统一为 gzh），彻底杜绝因别名不一致导致的缓存孤岛与假阳性
  const normPlat = (platform || '').toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  return normPlat + ':' + (accountId || 'default')
}

export function isLoginInFlight(platform: string, accountId: string): boolean {
  return loginInFlight.get(cacheKey(platform, accountId)) === true
}

export function setLoginInFlight(platform: string, accountId: string, value: boolean): void {
  const key = cacheKey(platform, accountId)
  if (value) {
    loginInFlight.set(key, true)
  } else {
    loginInFlight.delete(key)
  }
}

export function getCachedLoginState(platform: string, accountId: string, ttlMs: number = DEFAULT_TTL_MS): boolean | null {
  const entry = loginStateCache.get(cacheKey(platform, accountId))
  if (!entry) return null
  if (Date.now() - entry.checkedAt > ttlMs) {
    loginStateCache.delete(cacheKey(platform, accountId))
    return null
  }
  return entry.loggedIn
}

export function setCachedLoginState(platform: string, accountId: string, loggedIn: boolean): void {
  loginStateCache.set(cacheKey(platform, accountId), { loggedIn, checkedAt: Date.now() })
}

export function invalidateLoginCache(platform: string, accountId: string): void {
  loginStateCache.delete(cacheKey(platform, accountId))
}

export function clearLoginStateCache(): void {
  loginStateCache.clear()
}

/**
 * 通用登录守卫：检查是否正在登录 → 标记 → 执行 → 清除。
 * 返回 null 表示成功执行了 fn；返回 'in_flight' 表示该账号已有登录流程在进行。
 */
export async function withLoginGuard<T>(
  platform: string,
  accountId: string,
  fn: () => Promise<T>,
): Promise<{ result: T } | { error: 'in_flight'; message: string }> {
  if (isLoginInFlight(platform, accountId)) {
    return { error: 'in_flight', message: '该账号的登录流程正在进行中，请等待完成后再试' }
  }
  setLoginInFlight(platform, accountId, true)
  try {
    const result = await fn()
    return { result }
  } finally {
    setLoginInFlight(platform, accountId, false)
  }
}
