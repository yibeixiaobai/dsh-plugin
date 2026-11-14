import http from 'node:http'
import type { Config } from './config.ts'
import { handleCors, sendJson, readBodyText } from './http-helpers.ts'
import { adapterRegistry } from './adapters/index.ts'
import { setCachedLoginState } from './login-state.ts'
import { loadStandardSession, checkAccountLoginHealth } from './session-manager.ts'
import { hasSessionAuthCookies } from './session-cookies.ts'
import { saveXhsSession, xhsLogin } from './xiaohongshu.ts'
import { saveZhihuSession, zhihuLogin } from './zhihu.ts'
import { saveBaijiahaoSession, baijiahaoLogin } from './baijiahao.ts'
import { saveToutiaoSession, toutiaoLogin } from './toutiao.ts'
import { saveWechatSession, wechatLogin } from './wechat-browser.ts'

/** 基于适配器的统一平台登录与状态检测路由处理 */
export async function handlePlatformLoginRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  platform: string,
  getConfig: () => Config,
): Promise<void> {
  if (handleCors(req, res)) return
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: '不支持的请求方法' })
    return
  }
  let body: { account_id?: string; action?: string; force?: boolean } = {}
  try {
    const text = await readBodyText(req)
    body = JSON.parse(text || '{}')
  } catch {
    sendJson(res, 400, { error: '请求体不是合法 JSON' })
    return
  }
  const accountId = String(body.account_id ?? '').trim()
  const action =
    body.action === 'check' ? 'check' : body.action === 'save_session' ? 'save_session' : 'login'
  const force = Boolean(body.force)
  const cfg = getConfig()

  if (!adapterRegistry.has(platform)) {
    sendJson(res, 404, { ok: false, error: `不支持的平台: ${platform}` })
    return
  }

  const adapter = adapterRegistry.get(platform)

  if (action === 'check') {
    try {
      const checkRes = await adapter.checkLogin(cfg, accountId)
      sendJson(res, 200, {
        ok: checkRes.loggedIn,
        action,
        logged_in: checkRes.loggedIn,
        error: checkRes.error,
        ...(checkRes.data && typeof checkRes.data === 'object' ? checkRes.data : {}),
      })
    } catch (err) {
      sendJson(res, 200, {
        ok: false,
        action,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  // 支持通过内置浏览器或外部凭据保存登录会话（Cookies、Token、UserInfo）
  if (action === 'save_session') {
    try {
      const cookies = Array.isArray((body as any).cookies) ? (body as any).cookies : []
      const userName = (body as any).user_name
      const userId = (body as any).user_id
      let token = (body as any).token

      // 中文注释：微信公众号后台操作强依赖 token，若前台未传则尝试从已有 session 文件中继承
      if (adapter.capabilities.id === 'gzh' && !token) {
        const existing = loadStandardSession(cfg, 'gzh', accountId)
        if (existing?.token) {
          token = existing.token
        }
      }

      // 凭据真实有效性防空校验：禁止保存空凭据或假阳性凭据导致写入无效 Session 并误关窗口
      const credCheck = hasSessionAuthCookies(adapter.capabilities.id, cookies, token)
      if (!credCheck.valid) {
        sendJson(res, 400, {
          ok: false,
          action,
          error: credCheck.reason || '保存的凭据无效：未检测到平台核心鉴权凭据',
        })
        return
      }

      if (adapter.capabilities.id === 'gzh' && !token) {
        sendJson(res, 400, {
          ok: false,
          action,
          error: '微信公众号保存失败：缺少关键 token 参数，请等待页面加载完成或在登录页重新扫码',
        })
        return
      }

      // 补充符合新 SessionData 规范的健康度契约字段（is_valid / last_verified_at）
      const sessionData = {
        account_id: accountId,
        platform: adapter.capabilities.id,
        user_name: userName,
        user_id: userId,
        cookies,
        token,
        is_valid: true,
        last_verified_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      if (adapter.capabilities.id === 'xiaohongshu') {
        saveXhsSession(cfg, accountId, sessionData as any)
      } else if (adapter.capabilities.id === 'zhihu') {
        saveZhihuSession(cfg, accountId, sessionData as any)
      } else if (adapter.capabilities.id === 'gzh') {
        saveWechatSession(cfg, accountId, sessionData as any)
      } else if (adapter.capabilities.id === 'baijiahao') {
        saveBaijiahaoSession(cfg, accountId, sessionData as any)
      } else if (adapter.capabilities.id === 'toutiao') {
        saveToutiaoSession(cfg, accountId, sessionData as any)
      }
      setCachedLoginState(adapter.capabilities.id, accountId, true)
      sendJson(res, 200, {
        ok: true,
        action,
        logged_in: true,
        message: '登录凭据已成功持久化保存',
      })
    } catch (err) {
      sendJson(res, 500, {
        ok: false,
        action,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  if (action === 'login') {
    try {
      let logged = false
      let loginData: Record<string, any> = {}
      const pid = adapter.capabilities.id
      if (pid === 'gzh') {
        logged = await wechatLogin(cfg, accountId)
      } else if (pid === 'zhihu') {
        logged = await zhihuLogin(cfg, accountId)
      } else if (pid === 'xiaohongshu') {
        const resData = await xhsLogin(cfg, accountId)
        logged = Boolean(resData.logged_in)
        loginData = resData
      } else if (pid === 'baijiahao') {
        logged = await baijiahaoLogin(cfg, accountId)
      } else if (pid === 'toutiao') {
        logged = await toutiaoLogin(cfg, accountId)
      }
      sendJson(res, 200, {
        ok: logged,
        action,
        logged_in: logged,
        ...loginData,
        message: logged ? '登录成功并已持久化凭据' : '登录未完成或登录窗口已关闭',
      })
    } catch (err) {
      sendJson(res, 200, {
        ok: false,
        action,
        error: err instanceof Error ? err.message : String(err),
      })
    }
    return
  }

  sendJson(res, 200, {
    ok: true,
    action,
    embedded: true,
    message: '请在客户端内置浏览器窗口中完成扫码登录',
  })
}

/**
 * 批量检测各账号登录健康态路由
 * 接收：{ accounts: Array<{ platform: string, account_id: string }> }
 * 响应：{ ok: true, data: { results: { [aid]: { logged_in: boolean, user_name?: string, error?: string } } } }
 */
export async function handleBatchCheckLoginRoute(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  getConfig: () => Config,
): Promise<void> {
  if (handleCors(req, res)) return
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: '不支持的请求方法' })
    return
  }
  let body: { accounts?: Array<{ platform: string; account_id: string }> } = {}
  try {
    const text = await readBodyText(req)
    body = JSON.parse(text || '{}')
  } catch {
    sendJson(res, 400, { error: '请求体不是合法 JSON' })
    return
  }
  const accounts = Array.isArray(body.accounts) ? body.accounts : []
  const cfg = getConfig()
  const results: Record<string, { logged_in: boolean; user_name?: string; error?: string }> = {}

  await Promise.all(
    accounts.map(async (item) => {
      const aid = String(item.account_id || '').trim()
      const rawPlat = String(item.platform || 'gzh').trim()
      const normPlat = rawPlat === 'xiaohongshu' ? 'xhs' : rawPlat === 'wechat' ? 'gzh' : rawPlat
      if (!aid) return

      try {
        const adapter = adapterRegistry.has(normPlat)
          ? adapterRegistry.get(normPlat)
          : adapterRegistry.has(rawPlat)
            ? adapterRegistry.get(rawPlat)
            : null
        if (adapter) {
          const checkRes = await adapter.checkLogin(cfg, aid)
          results[aid] = {
            logged_in: Boolean(checkRes.loggedIn),
            user_name: (checkRes.data as any)?.user_name,
            error: checkRes.error,
          }
        } else {
          const health = await checkAccountLoginHealth(cfg, normPlat, aid)
          results[aid] = {
            logged_in: Boolean(health.valid),
            user_name: health.userName,
            error: health.error,
          }
        }
      } catch (err: any) {
        results[aid] = {
          logged_in: false,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  sendJson(res, 200, {
    ok: true,
    data: { results },
  })
}
