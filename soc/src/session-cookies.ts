// 社媒多平台 Cookie 规范化与安全容错注入模块
// 负责处理 Electron 与 Puppeteer 的 Cookie 差异（expirationDate -> expires，sameSite: 'None' -> secure: true）
// 并提供秒级本地凭据过期检测与 CDP 级安全容错注入

import type { Page } from 'puppeteer-core'

export interface BaseSessionCookie {
  name: string
  value: string
  domain?: string
  path?: string
  expires?: number
  expirationDate?: number
  httpOnly?: boolean
  secure?: boolean
  sameSite?: string
  [key: string]: unknown
}

export interface StandardSessionData {
  account_id: string
  platform: string
  user_name?: string
  user_id?: string
  red_id?: string
  token?: string
  cookies: BaseSessionCookie[]
  updated_at: string
  last_verified_at?: string
  is_valid?: boolean
  invalidation_reason?: string
}

/** 5 大平台关键鉴权 Cookie 清单 */
export const PLATFORM_AUTH_COOKIES: Record<string, string[]> = {
  gzh: ['data_ticket', 'slave_user'],
  wechat: ['data_ticket', 'slave_user'],
  zhihu: ['z_c0'],
  xiaohongshu: [
    'web_session',
    'galaxy_creator_session_id',
    'galaxy.creator.beaker.session.id',
    'access-token-creator.xiaohongshu.com',
    'x-user-id-creator.xiaohongshu.com',
  ],
  xhs: [
    'web_session',
    'galaxy_creator_session_id',
    'galaxy.creator.beaker.session.id',
    'access-token-creator.xiaohongshu.com',
    'x-user-id-creator.xiaohongshu.com',
  ],
  baijiahao: ['BDUSS', 'BDUSS_BFESS'],
  toutiao: ['sessionid', 'sid_tt', 'sso_uid_tt'],
}

/** 5 大平台默认顶级域名 */
export const PLATFORM_DEFAULT_DOMAINS: Record<string, string> = {
  gzh: '.qq.com',
  wechat: '.qq.com',
  zhihu: '.zhihu.com',
  xiaohongshu: '.xiaohongshu.com',
  xhs: '.xiaohongshu.com',
  baijiahao: '.baidu.com',
  toutiao: '.toutiao.com',
}

/** 标准化单个 Cookie 为符合 Puppeteer / CDP 协议的完整格式 */
export function normalizeSingleCookie(c: any, defaultDomain: string): any | null {
  if (!c || typeof c.name !== 'string' || typeof c.value !== 'string' || !c.name.trim()) {
    return null
  }

  const name = c.name.trim()
  const value = String(c.value)

  const fallbackDomain = PLATFORM_DEFAULT_DOMAINS[defaultDomain] || defaultDomain
  let domain = typeof c.domain === 'string' && c.domain.trim() ? c.domain.trim() : fallbackDomain
  // 确保 domain 具备基本的合法前缀
  if (!domain.startsWith('.') && !domain.includes('localhost') && domain.split('.').length > 1) {
    domain = '.' + domain
  }

  const cookiePath = typeof c.path === 'string' && c.path.trim() ? c.path.trim() : '/'

  const item: any = {
    name,
    value,
    domain,
    path: cookiePath,
  }

  if (typeof c.httpOnly === 'boolean') item.httpOnly = c.httpOnly
  if (typeof c.secure === 'boolean') item.secure = c.secure

  // 统一秒级整数 expires（若检测到大于 1e11 的时间戳，判定为毫秒级自动换算为秒级）
  const rawExp = c.expires ?? c.expirationDate
  if (typeof rawExp === 'number' && !Number.isNaN(rawExp) && rawExp > 0) {
    item.expires = rawExp > 1e11 ? Math.floor(rawExp / 1000) : Math.floor(rawExp)
  }

  // 严格处理 sameSite 与 secure 协同规范（Chromium CDP 铁律：SameSite='None' 必须 secure=true）
  if (c.sameSite) {
    const s = String(c.sameSite).toLowerCase()
    if (s === 'lax') {
      item.sameSite = 'Lax'
    } else if (s === 'strict') {
      item.sameSite = 'Strict'
    } else if (s === 'none' || s === 'no_restriction') {
      item.sameSite = 'None'
      item.secure = true // CDP 强制约束：若 sameSite 为 None 则 secure 必须为 true
    }
  }

  return item
}

/** 批量标准化 Cookie 数组 */
export function normalizeCookiesForPuppeteer(cookies: any[], defaultDomain: string): any[] {
  if (!Array.isArray(cookies)) return []
  const result: any[] = []
  for (const c of cookies) {
    const norm = normalizeSingleCookie(c, defaultDomain)
    if (norm) result.push(norm)
  }
  return result
}

/**
 * 鲁棒注入 Cookies 至 Puppeteer 页面：
 * 批量注入优先，遇到个别非法 Cookie 报错时自动降级为逐条容错注入，确保核心凭据最大化就绪。
 */
export async function safelyInjectCookies(
  page: Page,
  cookies: any[],
  defaultDomain: string,
): Promise<{ success: boolean; injectedCount: number; errors: string[] }> {
  const normalized = normalizeCookiesForPuppeteer(cookies, defaultDomain)
  if (normalized.length === 0) {
    return { success: false, injectedCount: 0, errors: ['无可注入的有效 Cookie'] }
  }

  const errors: string[] = []

  // 1. 尝试全量批量注入
  try {
    await page.setCookie(...normalized)
    return { success: true, injectedCount: normalized.length, errors: [] }
  } catch (batchErr) {
    errors.push(
      `批量注入失败，平滑降级为逐条注入: ${batchErr instanceof Error ? batchErr.message : String(batchErr)}`,
    )
  }

  // 2. 逐条容错注入
  let injectedCount = 0
  for (const c of normalized) {
    try {
      await page.setCookie(c)
      injectedCount++
    } catch (singleErr) {
      errors.push(
        `Cookie [${c.name}] 注入失败: ${singleErr instanceof Error ? singleErr.message : String(singleErr)}`,
      )
    }
  }

  return {
    success: injectedCount > 0,
    injectedCount,
    errors,
  }
}

/** 将 Cookies 数组序列化为 HTTP Request Header 的 Cookie 格式 */
export function serializeCookiesToHeader(cookies: any[]): string {
  if (!Array.isArray(cookies)) return ''
  return cookies
    .filter(c => c && typeof c.name === 'string' && typeof c.value === 'string')
    .map(c => `${c.name.trim()}=${c.value.trim()}`)
    .join('; ')
}

/** 梯度 1：本地凭据完整性与过期时间快速校验（0ms，不产生网络开销） */
export function checkLocalSessionExpiry(
  session: StandardSessionData | null,
  platform: string,
): { valid: boolean; reason?: string; earliestExpiryMs?: number } {
  if (!session || !Array.isArray(session.cookies) || session.cookies.length === 0) {
    return { valid: false, reason: '未找到本地凭据文件或凭据列表为空' }
  }

  // 若会话已被明确标记为失效，直接返回失效状态
  if (session.is_valid === false) {
    return { valid: false, reason: session.invalidation_reason || '本地凭据已被标记为失效状态' }
  }

  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  const authNames = PLATFORM_AUTH_COOKIES[normPlat] || []

  // 检查是否包含至少一个核心鉴权 Cookie
  const matchedAuthCookies = session.cookies.filter(
    c => authNames.includes(c.name) && Boolean(c.value && c.value.trim()),
  )
  if (matchedAuthCookies.length === 0) {
    return { valid: false, reason: `缺少平台核心鉴权 Cookie (${authNames.join(', ')})` }
  }

  // 检查关键凭据中是否有已明确过期的项
  const nowSec = Math.floor(Date.now() / 1000)
  for (const c of matchedAuthCookies) {
    const rawExp = c.expires ?? c.expirationDate
    const exp = typeof rawExp === 'number' && rawExp > 1e11 ? Math.floor(rawExp / 1000) : rawExp
    if (typeof exp === 'number' && exp > 0 && exp < nowSec) {
      return {
        valid: false,
        reason: `核心凭据 [${c.name}] 已于 ${new Date(exp * 1000).toLocaleString()} 本地过期`,
        earliestExpiryMs: exp * 1000,
      }
    }
  }

  return { valid: true }
}

/** 严格校验 Cookie 列表是否包含目标平台的核心鉴权凭据 */
export function hasSessionAuthCookies(
  platform: string,
  cookies: any[],
  token?: string,
): { valid: boolean; reason?: string } {
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  if (normPlat === 'gzh') {
    const cleanToken = (token || '').trim()
    const hasTicket =
      Array.isArray(cookies) &&
      cookies.some(c =>
        Boolean(
          c &&
          c.name &&
          (c.name === 'data_ticket' || c.name === 'slave_user') &&
          c.value &&
          String(c.value).trim(),
        ),
      )
    if (!cleanToken && !hasTicket) {
      return { valid: false, reason: '微信公众平台缺少必要的 token 与鉴权 ticket Cookie' }
    }
    return { valid: true }
  }

  const authNames = PLATFORM_AUTH_COOKIES[normPlat] || []
  if (!Array.isArray(cookies) || cookies.length === 0) {
    return { valid: false, reason: '凭据列表为空，未提供任何 Cookie' }
  }
  const minLength = normPlat === 'baijiahao' ? 20 : normPlat === 'zhihu' ? 10 : 5
  const hasAuth = cookies.some(c =>
    Boolean(
      c &&
      c.name &&
      authNames.includes(c.name) &&
      c.value &&
      String(c.value).trim().length >= minLength,
    ),
  )
  if (!hasAuth) {
    return { valid: false, reason: `缺少平台核心鉴权 Cookie (${authNames.join(', ')})` }
  }
  return { valid: true }
}
