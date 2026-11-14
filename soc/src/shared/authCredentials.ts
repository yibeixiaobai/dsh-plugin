/**
 * 社媒多平台核心鉴权凭据与登录态真理源规范 (Social Publisher Auth Credentials Specification)
 *
 * 【架构设计与边界依据】：
 * 1. 作为 @wincode/shared 层的唯一真相源，供 UI 前端、桌面端 RPC 路由和服务端/CLI 统一复用。
 * 2. 彻底杜绝前端仅凭粗糙的 !url.includes('login') 否定判定导致瞬间误判并关闭窗口的严重缺陷。
 * 3. 严格校验各平台不可伪造的核心 Auth Cookie 签名（如百家号 BDUSS、知乎 z_c0、头条 sessionid/sid_tt、小红书 web_session）。
 */

/**
 * 现代标准桌面 Chrome User-Agent 常量
 * 供 UI 前端 Electron <webview> 与 Puppeteer 自动化端共享，确保登录端与发文端设备特征 100% 一致
 */
export const DEFAULT_DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'

export interface AuthCredentialCheckResult {
  valid: boolean
  missingKey?: string
  matchedKey?: string
  reason?: string
}

export type AccountLoginHealthState = 'ready' | 'expired' | 'checking' | 'unconfigured'

export interface AccountHealthStatus {
  accountId: string
  platform: string
  valid: boolean
  state: AccountLoginHealthState
  userName?: string
  userId?: string
  error?: string
  lastChecked?: string
}

export interface PlatformLoginMeta {
  displayName: string
  loginUrl: string
  authCookieKeys: string[]
}

/** 规范化社媒平台 Key */
export function normalizeSocialPlatformKey(platform: string): string {
  const p = (platform || '').trim().toLowerCase()
  if (p === 'wechat' || p === 'gzh') return 'gzh'
  if (p === 'xhs' || p === 'xiaohongshu') return 'xiaohongshu'
  if (p === 'zhihu') return 'zhihu'
  if (p === 'baijiahao') return 'baijiahao'
  if (p === 'toutiao') return 'toutiao'
  return p
}

/** 解析 document.cookie 格式字符串为标准 Cookie 对象数组 */
export function parseCookieString(
  rawCookie: string,
  domain = '',
): Array<{ name: string; value: string; domain: string; path: string }> {
  if (!rawCookie) return []
  return rawCookie
    .split(';')
    .map(c => c.trim())
    .filter(Boolean)
    .map((c) => {
      const idx = c.indexOf('=')
      const name = idx > 0 ? c.slice(0, idx).trim() : c.trim()
      const value = idx > 0 ? c.slice(idx + 1).trim() : ''
      return { name, value, domain, path: '/' }
    })
}

/** 各平台直达创作者登录界面的精准 URL */
export function getSocialPlatformLoginUrl(platform: string): string {
  const norm = normalizeSocialPlatformKey(platform)
  if (norm === 'xiaohongshu') return 'https://creator.xiaohongshu.com/login'
  if (norm === 'zhihu') return 'https://www.zhihu.com/signin?next=%2Fwrite'
  if (norm === 'gzh') return 'https://mp.weixin.qq.com/'
  // 中文注释：百家号必须直达创作者中心登录页，避免加载根路径 https://baijiahao.baidu.com/ 导致假阳性瞬间误判
  if (norm === 'baijiahao') return 'https://baijiahao.baidu.com/builder/theme/bjh/login'
  // 中文注释：今日头条号必须直达 auth/page/login，避免根路径未重定向时被误认为后台
  if (norm === 'toutiao') return 'https://mp.toutiao.com/auth/page/login'
  return 'https://mp.weixin.qq.com/'
}

/** 判断当前 URL 是否仍处于登录、扫码或统一 SSO 认证页面 */
export function isSocialPlatformLoginUrl(platform: string, url: string): boolean {
  if (!url) return false
  const norm = normalizeSocialPlatformKey(platform)
  const u = url.toLowerCase()

  if (norm === 'gzh') {
    return (
      u.includes('/cgi-bin/loginpage') ||
      u.endsWith('mp.weixin.qq.com/') ||
      u.endsWith('mp.weixin.qq.com')
    )
  }
  if (norm === 'zhihu') {
    return u.includes('/signin') || u.includes('/signup')
  }
  if (norm === 'baijiahao') {
    return (
      u.includes('passport.baidu.com') ||
      u.includes('wappass.baidu.com') ||
      u.includes('theme/bjh/login') ||
      u.includes('/login') ||
      u.endsWith('baijiahao.baidu.com/') ||
      u.endsWith('baijiahao.baidu.com')
    )
  }
  if (norm === 'toutiao') {
    return (
      u.includes('sso.toutiao.com') ||
      u.includes('/auth/page/login') ||
      u.includes('/login') ||
      u.endsWith('mp.toutiao.com/') ||
      u.endsWith('mp.toutiao.com')
    )
  }
  if (norm === 'xiaohongshu') {
    return u.includes('/login') || u.includes('/signin')
  }

  return false
}

/** 判断当前 URL 是否已进入合法的创作者后台成功页面 */
export function isSocialPlatformSuccessUrl(platform: string, url: string): boolean {
  if (!url) return false
  const norm = normalizeSocialPlatformKey(platform)
  const u = url.toLowerCase()

  // 若仍处于登录页，绝对不得判定为成功
  if (isSocialPlatformLoginUrl(platform, url)) {
    return false
  }

  if (norm === 'gzh') {
    return u.includes('mp.weixin.qq.com') && u.includes('cgi-bin') && u.includes('token=')
  }
  if (norm === 'zhihu') {
    return (
      u.includes('zhihu.com') &&
      (u.includes('/write') ||
        u.includes('zhuanlan.zhihu.com') ||
        u.includes('/creator') ||
        u.includes('/hot') ||
        u.includes('/people/'))
    )
  }
  if (norm === 'baijiahao') {
    return (
      u.includes('baijiahao.baidu.com') &&
      (u.includes('/builder') || u.includes('/rc/home') || u.includes('/author'))
    )
  }
  if (norm === 'toutiao') {
    return (
      u.includes('mp.toutiao.com') &&
      (u.includes('profile_v4') ||
        u.includes('pgc/author') ||
        u.includes('dashboard') ||
        u.includes('/content/'))
    )
  }
  if (norm === 'xiaohongshu') {
    return u.includes('creator.xiaohongshu.com') && !u.includes('/login') && !u.includes('/signin')
  }

  return false
}

/**
 * 严格校验会话中是否包含目标平台的核心鉴权 Cookie 与关键 Token
 * 杜绝空数组、普通统计追踪 Cookie 触发的假阳性保存
 */
export function hasSocialPlatformAuthCredentials(
  platform: string,
  cookies: Array<{ name?: string; value?: string; [key: string]: any }>,
  token?: string,
): AuthCredentialCheckResult {
  const norm = normalizeSocialPlatformKey(platform)
  const cookieList = Array.isArray(cookies) ? cookies : []

  const getCookieVal = (name: string): string => {
    const item = cookieList.find(c => c && c.name && c.name.toLowerCase() === name.toLowerCase())
    return item && typeof item.value === 'string' ? item.value.trim() : ''
  }

  if (norm === 'gzh') {
    // 微信公众号后台：必须具备 token 参数（页面后续所有 API 依赖该 token），且必须包含 ticket 相关 cookie
    const cleanToken = (token || '').trim()
    const hasTicket = Boolean(getCookieVal('slave_user') || getCookieVal('data_ticket'))
    if (!cleanToken && !hasTicket) {
      return {
        valid: false,
        missingKey: 'token & (slave_user | data_ticket)',
        reason: '微信公众号缺少必要的后台 token 与鉴权 ticket Cookie',
      }
    }
    return {
      valid: true,
      matchedKey: cleanToken ? 'token' : 'ticket_cookie',
    }
  }

  if (norm === 'zhihu') {
    // 知乎：必须包含 z_c0 且其有效长度大于 10
    const zc0 = getCookieVal('z_c0')
    if (!zc0 || zc0.length <= 10) {
      return {
        valid: false,
        missingKey: 'z_c0',
        reason: '知乎会话中缺少核心鉴权 Cookie (z_c0)',
      }
    }
    return { valid: true, matchedKey: 'z_c0' }
  }

  if (norm === 'baijiahao') {
    // 百家号：必须包含百度 Passport 强凭据 BDUSS 或 BDUSS_BFESS，要求长度大于 20
    const bduss = getCookieVal('BDUSS') || getCookieVal('BDUSS_BFESS')
    if (!bduss || bduss.length <= 20) {
      return {
        valid: false,
        missingKey: 'BDUSS',
        reason: '百家号会话中缺少百度核心鉴权凭据 (BDUSS)',
      }
    }
    return { valid: true, matchedKey: 'BDUSS' }
  }

  if (norm === 'toutiao') {
    // 今日头条：必须包含 sessionid、sid_tt 或 sso_uid_tt 之一，且长度有效
    const sid = getCookieVal('sessionid') || getCookieVal('sid_tt') || getCookieVal('sso_uid_tt')
    if (!sid || sid.length <= 5) {
      return {
        valid: false,
        missingKey: 'sessionid / sid_tt',
        reason: '今日头条号缺少创作者会话凭据 (sessionid / sid_tt)',
      }
    }
    return { valid: true, matchedKey: 'sessionid' }
  }

  if (norm === 'xiaohongshu') {
    // 中文注释：小红书核心鉴权凭据必须是登录后下发的真实会话 Cookie（web_session、galaxy_creator_session_id 等）
    // 严禁将访客打开登录页即会下发的临时 customer-sso-sid 单独视作已登录
    const webSession = getCookieVal('web_session')
    const galaxySession =
      getCookieVal('galaxy_creator_session_id') ||
      getCookieVal('galaxy.creator.beaker.session.id') ||
      getCookieVal('access-token-creator.xiaohongshu.com') ||
      getCookieVal('x-user-id-creator.xiaohongshu.com')
    const matched = webSession && webSession.length > 8 ? 'web_session' : galaxySession && galaxySession.length > 8 ? 'galaxy_session' : ''
    if (!matched) {
      return {
        valid: false,
        missingKey: 'web_session / galaxy_creator_session_id',
        reason: '小红书会话中缺少核心创作者鉴权凭据 (web_session)，严禁使用访客临时标识保存',
      }
    }
    return { valid: true, matchedKey: matched }
  }

  // 默认兜底：若有 Cookie 列表且非空
  if (cookieList.length === 0) {
    return {
      valid: false,
      reason: `未识别平台 [${platform}] 凭据为空`,
    }
  }

  return { valid: true }
}
