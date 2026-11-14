// 社媒多平台毫秒级轻量探针模块（Lightweight HTTP Probe）
// 携带持久化 Cookie 请求各平台最轻量官方接口（超时 ≤ 4s），不拉起 Chrome 浏览器进程，真实探测服务端会话有效性

import type { StandardSessionData } from './session-cookies.ts'
import { serializeCookiesToHeader, hasSessionAuthCookies } from './session-cookies.ts'

export interface ProbeResult {
  valid: boolean
  alive?: boolean
  user_name?: string
  user_id?: string
  error?: string
  reason?: string
  statusCode?: number
  probeMethod?: 'network' | 'local_fresh'
}

/**
 * 梯度 2：毫秒级网络真实在线探针（Lightweight HTTP Probe）
 * 携带持久化 Cookie 请求平台最轻量官方接口（超时 ≤ 4s），不拉起 Chrome 浏览器，真实探测服务端会话有效性。
 */
export async function probePlatformSession(
  platform: string,
  sessionOrCookies: StandardSessionData | any[],
): Promise<ProbeResult> {
  const sessionObj = Array.isArray(sessionOrCookies) ? null : sessionOrCookies
  const cookies = Array.isArray(sessionOrCookies) ? sessionOrCookies : (sessionOrCookies?.cookies || [])
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  const cookieHeader = serializeCookiesToHeader(cookies)
  const commonHeaders = {
    Cookie: cookieHeader,
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  }

  const makeResult = (res: {
    valid: boolean
    error?: string
    statusCode?: number
    user_name?: string
    user_id?: string
    probeMethod?: 'network' | 'local_fresh'
  }): ProbeResult => ({
    valid: res.valid,
    alive: res.valid,
    error: res.error,
    reason: res.error,
    statusCode: res.statusCode,
    user_name: res.user_name,
    user_id: res.user_id,
    probeMethod: res.probeMethod,
  })

  try {
    if (normPlat === 'zhihu') {
      // 知乎鉴权探针接口：GET https://www.zhihu.com/api/v4/me
      const res = await fetch('https://www.zhihu.com/api/v4/me', {
        headers: commonHeaders,
        signal: AbortSignal.timeout(4000),
      })
      if (res.status === 200) {
        const json = (await res.json().catch(() => ({}))) as any
        if (json?.id || json?.name) {
          return makeResult({ valid: true, user_name: json.name, user_id: json.id, probeMethod: 'network' })
        }
      }
      if (res.status === 401 || res.status === 403) {
        return makeResult({ valid: false, error: '知乎服务端会话已过期 (401 Unauthorized)', statusCode: res.status })
      }
    } else if (normPlat === 'gzh') {
      // 中文注释：微信公众平台后台操作强制依赖 token 参数，缺少 token 坚决判定未登录
      const token = (sessionObj?.token || '').trim()
      if (!token) {
        return makeResult({ valid: false, error: '微信公众平台凭据缺少 token 参数，处于未登录态', statusCode: 401 })
      }
      const targetUrl = `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&token=${token}&lang=zh_CN`

      const res = await fetch(targetUrl, {
        headers: commonHeaders,
        redirect: 'manual', // 拦截重定向，未登录会 302 跳到 /cgi-bin/loginpage
        signal: AbortSignal.timeout(8000), // 微信公众平台页面渲染较重，放宽至 8s 网络容错窗口
      })

      const location = res.headers.get('location') || ''
      if (res.status === 302 && location.includes('/cgi-bin/loginpage')) {
        return makeResult({ valid: false, error: '微信公众平台服务端已失效，被重定向至登录页', statusCode: 302 })
      }
      if (res.status === 200) {
        const text = await res.text().catch(() => '')
        // 中文注释：精准甄别微信服务端真实返回状态，杜绝任何假阳性误杀：
        // 1. 显式超时/错误甄别：微信服务端在会话或 token 过期时返回 HTTP 200，并渲染绿色电脑笑脸与“登录超时，请重新登录”（引用 layout/error.css 样式表）
        //    必须严格匹配显式错误文案或错误样式表，严禁包含正常主页中亦存在的 "loginpage" 外链或 "window.wx_loaderror" 容灾脚本
        const isExplicitTimeoutOrError =
          text.includes('登录超时') ||
          text.includes('请重新登录') ||
          text.includes('layout/error') ||
          text.includes('document.getElementById(\'info\').innerHTML="登录超时')

        if (isExplicitTimeoutOrError) {
          return makeResult({
            valid: false,
            error: '微信公众平台会话已登录超时，请在设置中重新扫码登录',
            statusCode: 401,
          })
        }

        // 2. 正向核心后台结构核验：真实主页必须包含微信后台专属布局容器或主功能路由
        const isRealHome =
          text.includes('weui-desktop-layout') ||
          text.includes('weui-desktop-head') ||
          text.includes('cgi-bin/appmsg') ||
          text.includes('timer_send_main') ||
          text.includes('mass_send')

        if (isRealHome) {
          return makeResult({
            valid: true,
            user_name: sessionObj?.user_name,
            user_id: sessionObj?.user_id,
            probeMethod: 'network',
          })
        }

        return makeResult({
          valid: false,
          error: '微信公众平台返回页面未包含有效后台结构，判定为未登录态',
          statusCode: 401,
        })
      }
    } else if (normPlat === 'xhs') {
      // 中文注释：小红书新版创作者服务平台（/new/home）鉴权探针
      // 探针通过轻量请求创作者后台首页，若携带 Cookie 未被 302 重定向到 /login 且返回 200，确凿判定在线
      const res = await fetch('https://creator.xiaohongshu.com/new/home', {
        headers: commonHeaders,
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      })
      if (res.status === 401 || res.status === 403) {
        return makeResult({ valid: false, error: `小红书会话失效 (${res.status} Unauthorized)`, statusCode: res.status })
      }
      const location = res.headers?.get?.('location') || ''
      if (res.status === 302 && (location.includes('/login') || location.includes('/signin'))) {
        return makeResult({ valid: false, error: '小红书会话失效，被重定向至登录页', statusCode: 302 })
      }
      if (res.status === 200) {
        return makeResult({
          valid: true,
          user_name: sessionObj?.user_name,
          user_id: sessionObj?.user_id,
          probeMethod: 'network',
        })
      }
    } else if (normPlat === 'baijiahao') {
      // 百家号作者信息探针
      const res = await fetch('https://baijiahao.baidu.com/builder/author/register/getuserinfo', {
        headers: commonHeaders,
        signal: AbortSignal.timeout(4000),
      })
      const data = (await res.json().catch(() => ({}))) as any
      if (res.status === 200 && data?.errno === 0) {
        return makeResult({
          valid: true,
          user_name: data?.data?.name || sessionObj?.user_name,
          user_id: data?.data?.app_id || sessionObj?.user_id,
          probeMethod: 'network',
        })
      }
      if (data?.errno !== 0 || res.status === 401) {
        return makeResult({ valid: false, error: `百家号会话失效 (${data?.errmsg || '未登录'})`, statusCode: res.status })
      }
    } else if (normPlat === 'toutiao') {
      // 今日头条最新创作者中心用户资料探针接口
      // 官方接口：https://mp.toutiao.com/mp/agw/creator_center/user_info
      // 登录有效返回 HTTP 200 且 { code: 0, data: { name, user_id, ... } }
      // 会话失效返回 { code: 100004, message: "..." } 或 302/401
      const res = await fetch('https://mp.toutiao.com/mp/agw/creator_center/user_info', {
        headers: {
          ...commonHeaders,
          Referer: 'https://mp.toutiao.com/',
        },
        redirect: 'manual',
        signal: AbortSignal.timeout(4000),
      })
      const location = res.headers?.get?.('location') || ''
      if (
        res.status === 302 &&
        (location.includes('sso.toutiao.com') || location.includes('/auth/') || location.includes('/login'))
      ) {
        return makeResult({ valid: false, error: '头条号会话失效，被重定向至登录页', statusCode: 302 })
      }
      if (res.status === 401 || res.status === 403) {
        return makeResult({ valid: false, error: `头条号服务端会话已失效 (${res.status} Unauthorized)`, statusCode: res.status })
      }
      if (res.status === 200) {
        const json = (await res.json().catch(() => ({}))) as any
        if (json?.code === 0) {
          const userName = json?.name || json?.data?.name || sessionObj?.user_name
          const userId = json?.user_id_str || (json?.user_id ? String(json.user_id) : json?.data?.user_id ? String(json.data.user_id) : sessionObj?.user_id)
          return makeResult({
            valid: true,
            user_name: userName,
            user_id: userId,
            probeMethod: 'network',
          })
        }
        if (json?.code === 100004) {
          return makeResult({ valid: false, error: `头条号服务端会话已失效 (${json.message || '未登录'})`, statusCode: 401 })
        }
      }

      // 中文注释：若头条服务端返回 502/504 等偶发网关异常（非 401/100004 明确定性失效），若本地包含核心鉴权 Cookie，降级信任本地快照放行
      const hasAuth = hasSessionAuthCookies(normPlat, cookies)
      if (hasAuth.valid) {
        return makeResult({
          valid: true,
          user_name: sessionObj?.user_name,
          user_id: sessionObj?.user_id,
          probeMethod: 'local_fresh',
        })
      }
    }

    // 中文注释：若未通过任一平台的正向鉴权核验，坚决判定为未通过，彻底杜绝假阳性误报
    return makeResult({
      valid: false,
      error: `会话鉴权未通过或平台响应异常 (${normPlat})`,
    })
  } catch (err) {
    // 中文注释：微信公众平台轻量探针若遇到网络瞬态抖动/超时/网关异常，若本地拥有合法未过期的核心凭据与 token，启动降级兜底放行
    if (normPlat === 'gzh' || normPlat === 'wechat') {
      const hasAuth = hasSessionAuthCookies('gzh', cookies, sessionObj?.token)
      if (hasAuth.valid) {
        return makeResult({
          valid: true,
          user_name: sessionObj?.user_name,
          user_id: sessionObj?.user_id,
          probeMethod: 'local_fresh',
        })
      }
    }
    // 中文注释：头条号轻量探针若遇到网络瞬态抖动/超时/网关 502，若本地拥有合法未过期的核心 Cookie，启动降级兜底放行
    if (normPlat === 'toutiao') {
      const hasAuth = hasSessionAuthCookies(normPlat, cookies)
      if (hasAuth.valid) {
        return makeResult({
          valid: true,
          user_name: sessionObj?.user_name,
          user_id: sessionObj?.user_id,
          probeMethod: 'local_fresh',
        })
      }
    }
    // 网络探测异常（如断网或超时），返回错误信息交由上层处理
    return makeResult({
      valid: false,
      error: `轻量探针网络请求异常: ${err instanceof Error ? err.message : String(err)}`,
    })
  }
}
