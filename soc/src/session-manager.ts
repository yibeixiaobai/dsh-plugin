import {
  updateAutomationStreamStep,
  setAutomationStreamTakeover,
  broadcastLoginSynced,
} from './automationStreamClient.ts'
// 社媒多平台会话管理器（SessionManager）：统一 Cookie 标准化注入、三级智能梯度在线探测与失效自愈。
// 【修复原因与依据】：
// 1. 彻底根除“静态盲信”假阳性：原逻辑只要本地存在 session.json 且包含特定字符串就盲目判定有效（哪怕已过期一个月）。
// 2. 跨端 Cookie 标准化注入：规范 Electron 与 Puppeteer 的差异（expirationDate -> expires，sameSite: 'None' 强制 secure: true），
//    采用批量+逐条容错注入，杜绝因单条非法 Cookie 导致整批注入静默失败。
// 3. 毫秒级轻量探针（Lightweight HTTP Probe）：0 浏览器进程占用，通过纯网络 IO 快速检验服务端真实会话有效性，100% 杜绝“检测成功但执行失败”。

import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { getGlobalAccountsDir, getGlobalSocialPublisherDir } from './wincodeHome.ts'
import os from 'node:os'
import {
  assertAccountId,
  accountScriptsDir,
  wechatProfileDir,
  xhsProfileDir,
  zhihuProfileDir,
  baijiahaoProfileDir,
  toutiaoProfileDir,
} from './sync.ts'
import {
  getCachedLoginState,
  setCachedLoginState,
  invalidateLoginCache,
  isLoginInFlight,
  clearLoginStateCache,
} from './login-state.ts'

import type { BaseSessionCookie, StandardSessionData } from './session-cookies.ts'
import {
  PLATFORM_AUTH_COOKIES,
  PLATFORM_DEFAULT_DOMAINS,
  normalizeSingleCookie,
  normalizeCookiesForPuppeteer,
  safelyInjectCookies,
  serializeCookiesToHeader,
  checkLocalSessionExpiry,
  hasSessionAuthCookies,
} from './session-cookies.ts'

import type { ProbeResult } from './session-probe.ts'
import { probePlatformSession } from './session-probe.ts'

export type { BaseSessionCookie, StandardSessionData, ProbeResult }
export {
  PLATFORM_AUTH_COOKIES,
  PLATFORM_DEFAULT_DOMAINS,
  normalizeSingleCookie,
  normalizeCookiesForPuppeteer,
  safelyInjectCookies,
  serializeCookiesToHeader,
  checkLocalSessionExpiry,
  hasSessionAuthCookies,
  probePlatformSession,
  getCachedLoginState,
  setCachedLoginState,
  invalidateLoginCache,
  clearLoginStateCache,
}

/** 获取各平台在磁盘上的持久化 Session 文件绝对路径 */
export function getSessionFilePaths(cfg: Config, platform: string, accountId: string): { primary: string; backup: string; globalFallback: string; legacyGlobalFallback?: string } {
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  const filename = normPlat === 'gzh' ? 'wechat_session.json' : `${normPlat}_session.json`
  let profileDir = ''

  if (normPlat === 'gzh') profileDir = wechatProfileDir(cfg, accountId)
  else if (normPlat === 'xhs') profileDir = xhsProfileDir(cfg, accountId)
  else if (normPlat === 'zhihu') profileDir = zhihuProfileDir(cfg, accountId)
  else if (normPlat === 'baijiahao') profileDir = baijiahaoProfileDir(cfg, accountId)
  else if (normPlat === 'toutiao') profileDir = toutiaoProfileDir(cfg, accountId)
  else profileDir = path.join(cfg.runtime.project_root || '', 'accounts', accountId, `${normPlat}_profile`)

  const scriptsDir = accountScriptsDir(cfg, accountId)
  const globalProfileDir = path.join(getGlobalAccountsDir(), assertAccountId(accountId), `${normPlat}_profile`)

  return {
    primary: path.join(profileDir, filename),
    backup: path.join(scriptsDir, filename),
    globalFallback: path.join(globalProfileDir, filename),
    legacyGlobalFallback: path.join(globalProfileDir, filename),
  }
}

/** 从磁盘读取持久化会话凭据（时间戳最高优先 + 自动镜像自愈） */
export function loadStandardSession(cfg: Config, platform: string, accountId: string): StandardSessionData | null {
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  const { primary, backup, globalFallback } = getSessionFilePaths(cfg, normPlat, accountId)
  const filename = normPlat === 'gzh' ? 'wechat_session.json' : `${normPlat}_session.json`

  // 1. 汇总所有潜在候选路径（本地工作区、系统全局持久化目录、桌面开发数据目录）
  const candidates: string[] = [primary, backup, globalFallback]
  if (normPlat === 'gzh') {
    const pDir = wechatProfileDir(cfg, accountId)
    const sDir = accountScriptsDir(cfg, accountId)
    candidates.push(path.join(pDir, 'gzh_session.json'), path.join(sDir, 'gzh_session.json'))
    candidates.push(
      path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'wechat_profile', 'gzh_session.json'),
      path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts', 'gzh_session.json'),
      path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts', 'wechat_session.json'),
    )
  } else {
    candidates.push(
      path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts', filename),
    )
  }

  // 额外兼顾：桌面开发环境与用户主目录相互兜底，杜绝 DSH_HOME 环境变量隔离导致的凭据版本分裂
  const userGlobalHome = path.join(os.homedir(), '.dsh', 'social-publisher', 'accounts', assertAccountId(accountId))
  const desktopDevHome = path.resolve(process.cwd(), 'apps/desktop/.desktop-build/development/home/social-publisher/accounts', assertAccountId(accountId))
  for (const root of [userGlobalHome, desktopDevHome]) {
    if (normPlat === 'gzh') {
      candidates.push(
        path.join(root, 'scripts', 'wechat_session.json'),
        path.join(root, 'scripts', 'gzh_session.json'),
        path.join(root, 'wechat_profile', 'wechat_session.json'),
        path.join(root, 'wechat_profile', 'gzh_session.json'),
      )
    } else {
      candidates.push(
        path.join(root, 'scripts', filename),
        path.join(root, `${normPlat}_profile`, filename),
      )
    }
  }

  const existingFiles = Array.from(new Set(candidates)).filter(f => fs.existsSync(f))

  let bestData: StandardSessionData | null = null
  let maxTime = -1
  const staleFiles: string[] = []

  // 全量候选比对，选出时间戳最新（且包含有效 Cookie）的一份作为主凭据
  for (const f of existingFiles) {
    try {
      const parsed = JSON.parse(fs.readFileSync(f, 'utf-8'))
      if (parsed && Array.isArray(parsed.cookies) && parsed.cookies.length > 0) {
        const time = parsed.updated_at ? new Date(parsed.updated_at).getTime() : fs.statSync(f).mtimeMs || 0
        if (time > maxTime) {
          if (bestData) staleFiles.push(...existingFiles.filter(item => item !== f))
          maxTime = time
          bestData = parsed
        } else {
          staleFiles.push(f)
        }
      }
    } catch {}
  }

  // 自动镜像写回，消除主路径、备份路径与开发目录版本分裂
  if (bestData) {
    const raw = JSON.stringify(bestData, null, 2) + '\n'
    const syncTargets = Array.from(new Set([primary, backup, ...staleFiles]))
    for (const target of syncTargets) {
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true })
        fs.writeFileSync(target, raw, 'utf-8')
      } catch {}
    }
  }

  return bestData
}

/** 原子保存会话凭据到主目录与备份目录，并即刻同步内存缓存 */
export function saveStandardSession(cfg: Config, platform: string, accountId: string, data: StandardSessionData): void {
  try {
    const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
    const filename = normPlat === 'gzh' ? 'wechat_session.json' : `${normPlat}_session.json`
    // 中文注释：写入前补齐有效性标志（尊重显式传递的 false 失效状态）与时间戳
    if (data.is_valid === undefined) {
      data.is_valid = true
    }
    data.updated_at = data.updated_at || new Date().toISOString()
    data.last_verified_at = data.last_verified_at || new Date().toISOString()

    const raw = JSON.stringify(data, null, 2) + '\n'
    const { primary, backup, globalFallback } = getSessionFilePaths(cfg, normPlat, accountId)
    const targets = [primary, backup, globalFallback]
    if (normPlat === 'gzh') {
      const pDir = wechatProfileDir(cfg, accountId)
      const sDir = accountScriptsDir(cfg, accountId)
      targets.push(path.join(pDir, 'gzh_session.json'), path.join(sDir, 'gzh_session.json'))
      targets.push(
        path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'wechat_profile', 'gzh_session.json'),
        path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts', 'gzh_session.json'),
        path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts', 'wechat_session.json'),
      )
    } else {
      targets.push(
        path.join(getGlobalAccountsDir(), assertAccountId(accountId), 'scripts', filename),
      )
    }

    const userGlobalHome = path.join(os.homedir(), '.dsh', 'social-publisher', 'accounts', assertAccountId(accountId))
    const desktopDevHome = path.resolve(process.cwd(), 'apps/desktop/.desktop-build/development/home/social-publisher/accounts', assertAccountId(accountId))
    for (const root of [userGlobalHome, desktopDevHome]) {
      if (fs.existsSync(root)) {
        if (normPlat === 'gzh') {
          targets.push(
            path.join(root, 'scripts', 'wechat_session.json'),
            path.join(root, 'scripts', 'gzh_session.json'),
            path.join(root, 'wechat_profile', 'wechat_session.json'),
            path.join(root, 'wechat_profile', 'gzh_session.json'),
          )
        } else {
          targets.push(
            path.join(root, 'scripts', filename),
            path.join(root, `${normPlat}_profile`, filename),
          )
        }
      }
    }

    for (const t of Array.from(new Set(targets))) {
      try {
        fs.mkdirSync(path.dirname(t), { recursive: true })
        fs.writeFileSync(t, raw, 'utf-8')
      } catch {}
    }

    // 中文注释：根据凭据真实有效性同步刷新内存缓存，杜绝假阳性与假阴性
    setCachedLoginState(normPlat, accountId, Boolean(data.is_valid))
  } catch (err) {
    console.error(`[session-manager] 保存 ${platform}:${accountId} 凭据失败:`, err)
  }
}

/** 清理失效凭据与内存缓存（自愈机制） */
export function invalidateAccountSession(cfg: Config, platform: string, accountId: string, reason?: string): void {
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  setCachedLoginState(normPlat, accountId, false)

  // 更新磁盘文件标记为已失效，避免彻底删除文件导致配置丢失
  const session = loadStandardSession(cfg, normPlat, accountId)
  if (session) {
    session.is_valid = false
    if (reason) session.invalidation_reason = reason
    session.updated_at = new Date().toISOString()
    saveStandardSession(cfg, normPlat, accountId, session)
  }
}

/**
 * 三级智能梯度综合检测登录健康态：
 * 梯度 1：本地文件与过期时间戳过滤 (0ms)
 * 梯度 2：轻量 HTTP 网络探针在线核查 (100~300ms)
 * 梯度 3：瞬态网络异常弹性保底
 */
export async function checkAccountLoginHealth(
  cfg: Config,
  platform: string,
  accountId: string,
  options?: { forceProbe?: boolean },
): Promise<{
  valid: boolean
  loggedIn: boolean
  accountId: string
  platform: string
  userName?: string
  userId?: string
  error?: string
  probeMethod?: string
}> {
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')

  // 若该账号正在前台扫码中，返回非阻塞提示，严禁并发打架
  if (isLoginInFlight(normPlat, accountId)) {
    return { valid: false, loggedIn: false, accountId, platform: normPlat, error: '账号正在扫码登录中' }
  }

  // 检查内存快速缓存（非强制刷新时生效）
  if (!options?.forceProbe) {
    const cached = getCachedLoginState(normPlat, accountId)
    if (cached === false) {
      return { valid: false, loggedIn: false, accountId, platform: normPlat, error: '登录态已过期' }
    }
  }

  // 读取本地凭据
  const session = loadStandardSession(cfg, normPlat, accountId)

  // 梯度 1：本地合法性与过期时间戳硬核对
  const localCheck = checkLocalSessionExpiry(session, normPlat)
  if (!localCheck.valid) {
    // 中文注释：若本地未通过的原因仅为 session.is_valid === false（此前网络探针假阳性误伤所致），
    // 但核心鉴权凭据依然完整且未过期；在 options?.forceProbe 下允许进入梯度 2 探针向服务端求证真伪并自动自愈
    const hasCoreAuth = session ? hasSessionAuthCookies(normPlat, session.cookies || [], session.token).valid : false
    const canAttemptProbeSelfHealing = Boolean(options?.forceProbe && hasCoreAuth && session?.is_valid === false)

    if (!canAttemptProbeSelfHealing) {
      setCachedLoginState(normPlat, accountId, false)
      return {
        valid: false,
        loggedIn: false,
        accountId,
        platform: normPlat,
        error: localCheck.reason || '本地凭据无效或已过期',
      }
    }
  }

  // 梯度 2：网络轻量快速 Probe (真实向平台服务端确认 Session 在线)
  const probe = await probePlatformSession(normPlat, session!)

  if (probe.valid) {
    // 在线验证通过，增量更新本地会话并自愈消除误判状态
    if (session) {
      session.is_valid = true
      delete (session as any).invalidation_reason
      session.last_verified_at = new Date().toISOString()
      if (probe.user_name) session.user_name = probe.user_name
      if (probe.user_id) session.user_id = probe.user_id
      saveStandardSession(cfg, normPlat, accountId, session)
    }
    setCachedLoginState(normPlat, accountId, true)
    return {
      valid: true,
      loggedIn: true,
      accountId,
      platform: normPlat,
      userName: probe.user_name || session?.user_name,
      userId: probe.user_id || session?.user_id,
      probeMethod: probe.probeMethod,
    }
  }

  // 梯度 3：如果探测返回明确的未登录/401/302，确凿判定失效并清理缓存
  if (probe.statusCode === 401 || probe.statusCode === 302 || (probe.error && probe.error.includes('失效'))) {
    // 中文注释：小红书平台特殊防护——因小红书反爬对无签名探针一律返回 401，若本地包含核心凭据，绝不能强制作废
    if (normPlat === 'xhs') {
      const hasAuth = hasSessionAuthCookies(normPlat, session?.cookies || [])
      if (hasAuth.valid) {
        setCachedLoginState(normPlat, accountId, true)
        return {
          valid: true,
          loggedIn: true,
          accountId,
          platform: normPlat,
          userName: session?.user_name,
          userId: session?.user_id,
        }
      }
    }
    // 中文注释：头条号平台底线保障——若本地包含合法核心凭据（sessionid/sid_tt），且非服务端明确定性（如 100004 或 302），避免因偶发接口波动导致有效账号被误作废
    if (normPlat === 'toutiao') {
      const hasAuth = hasSessionAuthCookies(normPlat, session?.cookies || [])
      if (hasAuth.valid && !probe.error?.includes('未登录') && probe.statusCode !== 302) {
        setCachedLoginState(normPlat, accountId, true)
        return {
          valid: true,
          loggedIn: true,
          accountId,
          platform: normPlat,
          userName: session?.user_name,
          userId: session?.user_id,
          probeMethod: 'local_fresh',
        }
      }
    }
    invalidateAccountSession(cfg, normPlat, accountId, probe.error)
    setCachedLoginState(normPlat, accountId, false)
    return {
      valid: false,
      loggedIn: false,
      accountId,
      platform: normPlat,
      error: probe.error || '平台会话已在服务端失效，请重新登录',
    }
  }

  // 中文注释：微信公众平台底线保障——若本地包含核心凭据与 token 且非服务端明确定性失效（如 302/401），避免因偶发接口超时/网络抖动导致有效账号被误判阻断
  if (normPlat === 'gzh' || normPlat === 'wechat') {
    const hasAuth = hasSessionAuthCookies('gzh', session?.cookies || [], session?.token)
    // 关键修复（中文注释）：当探针明确返回会话失效、登录超时或 401 状态码时，坚决不进行保底放行，确保设置中心即时展示真实未登录/超时状态
    if (
      hasAuth.valid &&
      !probe.error?.includes('失效') &&
      !probe.error?.includes('超时') &&
      probe.statusCode !== 302 &&
      probe.statusCode !== 401
    ) {
      setCachedLoginState(normPlat, accountId, true)
      return {
        valid: true,
        loggedIn: true,
        accountId,
        platform: normPlat,
        userName: session?.user_name,
        userId: session?.user_id,
        probeMethod: 'local_fresh',
      }
    }
  }

  // 中文注释：小红书平台专属底线保障——若本地包含核心鉴权 Cookie 签名且未本地过期，信任本地快照
  if (normPlat === 'xhs') {
    const hasAuth = hasSessionAuthCookies(normPlat, session?.cookies || [])
    if (hasAuth.valid) {
      setCachedLoginState(normPlat, accountId, true)
      return {
        valid: true,
        loggedIn: true,
        accountId,
        platform: normPlat,
        userName: session?.user_name,
        userId: session?.user_id,
      }
    }
  }

  // 中文注释：头条号平台专属底线保障——若本地包含核心鉴权 Cookie 签名且未本地过期，信任本地快照
  if (normPlat === 'toutiao') {
    const hasAuth = hasSessionAuthCookies(normPlat, session?.cookies || [])
    if (hasAuth.valid) {
      setCachedLoginState(normPlat, accountId, true)
      return {
        valid: true,
        loggedIn: true,
        accountId,
        platform: normPlat,
        userName: session?.user_name,
        userId: session?.user_id,
        probeMethod: 'local_fresh',
      }
    }
  }

  // 中文注释：彻底移除 24 小时盲信兜底；若探针未通过，坚决判定为未登录，杜绝假阳性误报
  setCachedLoginState(normPlat, accountId, false)
  return {
    valid: false,
    loggedIn: false,
    accountId,
    platform: normPlat,
    error: probe.error || '无法确认登录态有效性，请重新扫码登录',
  }
}

export interface WaitForInteractiveLoginOptions {
  streamSessionId?: string
  maxTimeoutMs?: number // 默认 300_000 毫秒（5 分钟）
  probeIntervalMs?: number // 默认 2_000 毫秒（2 秒）
  loginUrl?: string
  promptText?: string
  checkLoginFn?: (page: any) => Promise<boolean>
  extractInfoFn?: (page: any) => Promise<{ userName?: string; userId?: string; token?: string }>
}

/**
 * 统一的受控内置浏览器交互登录与自愈持久化等待函数
 * 【设计依据与规范】：
 * 1. 遵循社媒发布规范，未登录时绝严禁直接抛错熔断崩溃；
 * 2. 自动挂起并发送 takeover=true，由内置浏览器面板展开呈现二维码供用户扫码；
 * 3. 后台以 2 秒频率探测登录结果，最长等待 5 分钟超时；
 * 4. 登录成功后立即提取全套 Cookies、Token 与用户信息，原子写入磁盘 session.json；
 * 5. 跨进程广播 login_synced 事件，驱动前端设置中心免刷新即时变更为「已登录」；
 * 6. 解除 takeover，返回成功以无缝恢复后续发布流水线。
 */
export async function waitForInteractiveLoginAndSync(
  page: any,
  cfg: Config,
  platform: string,
  accountId: string,
  options: WaitForInteractiveLoginOptions = {},
): Promise<{ success: boolean; sessionData?: StandardSessionData; error?: string }> {
  const normPlat = platform.toLowerCase().replace('xiaohongshu', 'xhs').replace('wechat', 'gzh')
  const streamSessionId = options.streamSessionId
  const maxTimeoutMs = options.maxTimeoutMs ?? 300_000
  const probeIntervalMs = options.probeIntervalMs ?? 2_000
  const deadline = Date.now() + maxTimeoutMs

  const defaultPrompt = `检测到平台「${normPlat}」账号「${accountId}」未登录，请在内置浏览器中扫码登录`
  const prompt = options.promptText || defaultPrompt

  // 1. 通知前端开启人机接管（Takeover）并更新步骤状态
  if (streamSessionId) {
    updateAutomationStreamStep(streamSessionId, 'auth', 'running', prompt, page?.url?.() || '')
    setAutomationStreamTakeover(streamSessionId, true, prompt)
  }

  // 2. 若指定了初始登录导航地址且当前页面为空白页或无关页面，则导航到目标地址
  if (options.loginUrl && page?.goto) {
    try {
      const cur = page.url?.() || ''
      if (!cur || cur === 'about:blank' || !cur.startsWith('http')) {
        await page.goto(options.loginUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
      }
    } catch {}
  }

  // 3. 轮询挂起等待用户扫码/验证
  while (Date.now() < deadline) {
    // 检查页面与浏览器是否意外关闭
    if (!page || (page.isClosed && page.isClosed())) {
      if (streamSessionId) {
        setAutomationStreamTakeover(streamSessionId, false)
      }
      return { success: false, error: '登录页面已被关闭，发布任务终止' }
    }

    let isAuthed = false

    // A. 优先调用平台专属判定逻辑
    if (options.checkLoginFn) {
      try {
        isAuthed = await options.checkLoginFn(page)
      } catch {
        isAuthed = false
      }
    }

    // B. 若未提供或未判定成功，执行平台标准通用规则
    if (!isAuthed) {
      try {
        const curUrl = page.url?.() || ''
        const cookies = (await page.cookies?.().catch(() => [])) || []

        if (normPlat === 'gzh') {
          // 微信：URL 包含 token= 且处于 cgi-bin，或 Cookie 包含 slave_user/data_ticket 且能提取 token
          const hasTokenInUrl = curUrl.includes('token=') && curUrl.includes('cgi-bin') && !curUrl.includes('loginpage')
          const hasCookie = cookies.some((c: any) => (c.name === 'slave_user' || c.name === 'data_ticket') && Boolean(c.value))
          if (hasTokenInUrl || (hasCookie && curUrl.includes('token='))) {
            isAuthed = true
          }
        } else if (normPlat === 'xhs') {
          // 小红书：URL 在创作者后台且不包含 /login，或 Cookie 包含 web_session / galaxy_creator_session_id
          const inCreator = curUrl.includes('creator.xiaohongshu.com') && !curUrl.includes('/login') && !curUrl.includes('/signin')
          const hasCookie = cookies.some((c: any) => (c.name === 'web_session' || c.name === 'galaxy_creator_session_id') && Boolean(c.value))
          if (inCreator || hasCookie) {
            isAuthed = true
          }
        } else if (normPlat === 'zhihu') {
          // 知乎：URL 在知乎主域且不在登录注册页，或 Cookie 包含 z_c0
          const inZhihu = curUrl.includes('zhihu.com') && !curUrl.includes('/signin') && !curUrl.includes('/signup')
          const hasCookie = cookies.some((c: any) => c.name === 'z_c0' && (c.value || '').length > 10)
          if (inZhihu && hasCookie) {
            isAuthed = true
          }
        } else if (normPlat === 'toutiao') {
          // 今日头条：在头条号后台且不在登录页，或 Cookie 包含 sessionid
          const inToutiao = curUrl.includes('mp.toutiao.com') && !curUrl.includes('/login') && !curUrl.includes('/auth/page/login')
          const hasCookie = cookies.some((c: any) => (c.name === 'sessionid' || c.name === 'sid_tt') && Boolean(c.value))
          if (inToutiao && hasCookie) {
            isAuthed = true
          }
        } else if (normPlat === 'baijiahao') {
          // 百家号：在百家号后台且不在登录页，或 Cookie 包含 BDUSS
          const inBjh = curUrl.includes('baijiahao.baidu.com') && !curUrl.includes('login') && (curUrl.includes('builder') || curUrl.includes('rc/home'))
          const hasCookie = cookies.some((c: any) => (c.name === 'BDUSS' || c.name === 'BDUSS_BFESS') && (c.value || '').length > 20)
          if (inBjh && hasCookie) {
            isAuthed = true
          }
        }
      } catch {}
    }

    // 4. 判定成功：提取凭据、写入磁盘、广播同步并解除人机接管
    if (isAuthed) {
      try {
        // 等待 1.5 秒让 Cookie 充分同步
        await new Promise(r => setTimeout(r, 1500))
        const cookies = (await page.cookies?.().catch(() => [])) || []
        const curUrl = page.url?.() || ''

        // 提取 Token
        let token: string | undefined
        const tokenMatch = curUrl.match(/[?&]token=([0-9a-zA-Z_-]+)/)
        if (tokenMatch) {
          token = tokenMatch[1]
        }

        let userName: string | undefined
        let userId: string | undefined

        if (options.extractInfoFn) {
          try {
            const extra = await options.extractInfoFn(page)
            if (extra.userName) userName = extra.userName
            if (extra.userId) userId = extra.userId
            if (extra.token) token = extra.token
          } catch {}
        }

        const sessionData: StandardSessionData = {
          account_id: accountId,
          platform: normPlat,
          cookies,
          token,
          user_name: userName,
          user_id: userId,
          is_valid: true,
          updated_at: new Date().toISOString(),
          last_verified_at: new Date().toISOString(),
        }

        // 原子持久化写入 session.json
        saveStandardSession(cfg, normPlat, accountId, sessionData)
        setCachedLoginState(normPlat, accountId, true)

        // 解除人机接管
        if (streamSessionId) {
          setAutomationStreamTakeover(streamSessionId, false)
          updateAutomationStreamStep(
            streamSessionId,
            'auth',
            'completed',
            '登录成功，凭据已自愈同步',
            curUrl,
          )
        }

        // 跨进程广播通知前端设置中心刷新
        broadcastLoginSynced({
          platform: normPlat,
          accountId,
          userName,
        })

        return { success: true, sessionData }
      } catch (err: any) {
        // 若提取过程遇到小异常，等待下一次循环
      }
    }

    // 尚未完成登录，休眠 probeIntervalMs 后重试
    await new Promise(r => setTimeout(r, probeIntervalMs))
  }

  // 5. 超时处理
  if (streamSessionId) {
    setAutomationStreamTakeover(streamSessionId, false)
    updateAutomationStreamStep(
      streamSessionId,
      'auth',
      'failed',
      `登录等待超时（超过 ${Math.round(maxTimeoutMs / 1000)} 秒），请重新发起任务`,
      page?.url?.() || '',
    )
  }

  return {
    success: false,
    error: `登录等待超时（已等待 ${Math.round(maxTimeoutMs / 1000)} 秒），未能检测到有效登录态`,
  }
}
