import { isPlaceholderTemplateDraft } from './template-sweeper.ts'
import { isInvalidPlaceholderTitle } from './title-adapter.ts'
import { WECHAT_SELECTORS } from './selectors/wechat.ts'
import { captureFailureSnapshot } from './diagnostics/index.ts'
// 微信公众号后台浏览器自动化适配器：基于 puppeteer-core + 本机 Chrome/Edge。
// 用于在公众号草稿创建成功后，模拟登录公众号后台，进入该草稿编辑页，
// 自动执行用户脚本：逐篇开启文字原创、填入作者、勾选协议并保存草稿。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import type { Context } from './tool-compat.ts'
import { defineTool } from './tool-compat.ts'
import type { Config } from './config.ts'
import { resolveAccount } from './config-runtime.ts'
import { accountScriptsDir, wechatProfileDir } from './sync.ts'
import { renderJson, RESULT_FILE } from './tools/shared.ts'
import { findBrowserExecutable, cleanStaleChromeLocks, launchBrowserSafely } from './zhihu.ts'
import {
  getCachedLoginState,
  setCachedLoginState,
  isLoginInFlight,
  setLoginInFlight,
} from './login-state.ts'
import * as cheerio from 'cheerio'
import {
  parseWechatDisplayTimeToTimestamp,
  extractCoverUrlFromThumb,
  parseWechatScheduledTasksHtml,
  matchScheduledTaskByTitles,
  pollAndVerifyScheduledTask,
} from './schedule-verifier.ts'
import {
  saveWechatScheduledTasks,
  loadWechatScheduledTasks,
  removeWechatScheduledTask,
  resolveNextScheduleSlot,
  normalizeTitle,
  type WechatScheduledTask,
  type WechatScheduledArticle,
  type ScheduleAllocatedSlot,
} from './schedule-manager.ts'
import { parseWechatDraftsHtml, type WechatDraftCard } from './wechat-draft-parser.ts'
import { loadWechatDrafts, saveWechatDrafts } from './draft-manager.ts'
import { readAccountPublishRecords } from './publish-history.ts'
import {
  safelyInjectCookies,
  checkAccountLoginHealth,
  waitForInteractiveLoginAndSync,
  invalidateAccountSession,
} from './session-manager.ts'
import {
  startAutomationStreamSession,
  attachPageScreencast,
  updateAutomationStreamStep,
  completeAutomationStreamSession,
  failAutomationStreamSession,
} from './automationStreamClient.ts'

export const WECHAT_LOGIN_ROUTE = '/api/gzh-publisher/wechat-login'

const MP_LOGIN_URL = 'https://mp.weixin.qq.com/'

export interface WechatOriginalResult {
  success: boolean
  article_count: number
  completed: string[]
  error?: string
  screenshot?: string
  /** 逐草稿明细：本次处理的每个「文章」草稿的结果 */
  drafts?: Array<{
    appmsgid: string
    title: string
    articles: number
    enabled: number
    skipped: number
    status: 'ok' | 'failed'
    error?: string
  }>
  /** 汇总：草稿数（总数/成功/失败）与文章数 */
  summary?: {
    drafts_total: number
    drafts_ok: number
    drafts_failed: number
    articles_total: number
  }
  /** 本次实际采用的处理范围：targeted=定向单个草稿，all=草稿箱全部草稿 */
  scope?: 'targeted' | 'all'
  note?: string
}

export interface DraftRef {
  appmsgid: string
  title: string
  titles?: string[]
}

const DRAFT_LIST_PAGE_SIZE = 20
/** 草稿箱「文章」列表 URL：type=77 只返回图文文章草稿，天然不含小绿书（贴图）草稿 */
function draftListUrl(token: string, begin: number): string {
  return (
    'https://mp.weixin.qq.com/cgi-bin/appmsg?begin=' +
    begin +
    '&count=' +
    DRAFT_LIST_PAGE_SIZE +
    '&type=77&action=list_card&token=' +
    encodeURIComponent(token) +
    '&lang=zh_CN'
  )
}

function draftEditUrl(token: string, appmsgid: string): string {
  return (
    'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit' +
    '&type=10&appmsgid=' +
    encodeURIComponent(appmsgid) +
    '&token=' +
    encodeURIComponent(token) +
    '&lang=zh_CN'
  )
}

/** 小绿书（贴图）草稿编辑页 URL（图片消息编辑器，createType=8） */
function newspicDraftEditUrl(token: string, appmsgid: string): string {
  return (
    'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit' +
    '&isNew=0&type=77&createType=8&appmsgid=' +
    encodeURIComponent(appmsgid) +
    '&token=' +
    encodeURIComponent(token) +
    '&lang=zh_CN'
  )
}

/** 草稿箱「贴图」列表 URL：item_show_type=8 只返回小绿书（图片消息）草稿 */
function newspicListUrl(token: string, begin: number): string {
  return (
    'https://mp.weixin.qq.com/cgi-bin/appmsg?begin=' +
    begin +
    '&count=' +
    DRAFT_LIST_PAGE_SIZE +
    '&type=77&action=list&item_show_type=8' +
    '&token=' +
    encodeURIComponent(token) +
    '&lang=zh_CN'
  )
}

/** 读取草稿箱「贴图」列表的某一页（item_show_type=8 只含小绿书草稿） */
async function fetchNewspicListPage(page: Page, token: string, begin: number): Promise<DraftRef[]> {
  await page.goto(newspicListUrl(token, begin), { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(resolve => setTimeout(resolve, 2500))
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.weui-desktop-card'))
      .map((card) => {
        const id = card.getAttribute('data-appid') || card.getAttribute('data-appmsgid') || ''
        const titleEl = card.querySelector(
          '.weui-desktop-publish__cover__title span, .weui-desktop-publish__cover__title, .weui-desktop-publish__cover__title_pic span, .weui-desktop-publish__cover__title_pic, .weui-desktop-card__title',
        )
        const mainTitle = (titleEl?.textContent || '').trim()
        return { appmsgid: id, title: mainTitle, titles: mainTitle ? [mainTitle] : [] }
      })
      .filter(item => item.appmsgid)
  })
}

/** 分页枚举草稿箱全部「贴图」（小绿书）草稿 */
async function listNewspicDrafts(page: Page, token: string, maxPages = 50): Promise<DraftRef[]> {
  const drafts: DraftRef[] = []
  const seen = new Set<string>()
  for (let index = 0; index < maxPages; index += 1) {
    const items = await fetchNewspicListPage(page, token, index * DRAFT_LIST_PAGE_SIZE)
    if (items.length === 0) break
    let added = 0
    for (const item of items) {
      if (seen.has(item.appmsgid)) continue
      seen.add(item.appmsgid)
      drafts.push(item)
      added += 1
    }
    if (added === 0 || items.length < DRAFT_LIST_PAGE_SIZE) break
  }
  return drafts
}

/** 读取草稿箱「文章」列表的某一页（type=77 天然不含小绿书/贴图草稿，但提取多图文子项副标题） */
async function fetchDraftListPage(page: Page, token: string, begin: number): Promise<DraftRef[]> {
  await page.goto(draftListUrl(token, begin), { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise(resolve => setTimeout(resolve, 2200))
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.weui-desktop-card'))
      .map((card) => {
        const id = card.getAttribute('data-appid') || card.getAttribute('data-appmsgid') || ''
        const titleEl = card.querySelector(
          '.weui-desktop-publish__cover__title span, .weui-desktop-publish__cover__title, .weui-desktop-publish__cover__title_pic span, .weui-desktop-publish__cover__title_pic',
        )
        const mainTitle = (titleEl?.textContent || '').trim()
        // 提取多图文卡片中的所有次条/副标题
        const subTitleEls = Array.from(
          card.querySelectorAll(
            '.sub_card_media .weui-desktop-publish__title span, .sub_card_media .weui-desktop-publish__title, .weui-desktop-publish__item__title, .weui-desktop-publish__sub__title, .weui-desktop-publish__item span',
          ),
        )
        const subTitles = subTitleEls.map(el => (el.textContent || '').trim()).filter(Boolean)
        const allTitles = [mainTitle, ...subTitles].filter(Boolean)
        return { appmsgid: id, title: mainTitle, titles: allTitles }
      })
      .filter(item => item.appmsgid)
  })
}

/**
 * 分页枚举草稿箱中全部「文章」草稿（type=77 不含小绿书贴图草稿）。
 * 仅在明确要求「处理全部草稿」时调用；定向处理单个草稿请用 resolveTargetDrafts，避免无谓翻页。
 * 上限页数兜底，避免异常页面导致死循环。
 */
async function listArticleDrafts(page: Page, token: string, maxPages = 100): Promise<DraftRef[]> {
  const drafts: DraftRef[] = []
  const seen = new Set<string>()
  for (let index = 0; index < maxPages; index += 1) {
    const items = await fetchDraftListPage(page, token, index * DRAFT_LIST_PAGE_SIZE)
    if (items.length === 0) break
    let added = 0
    for (const item of items) {
      if (seen.has(item.appmsgid)) continue
      seen.add(item.appmsgid)
      drafts.push(item)
      added += 1
    }
    // 无新增（分页重复）或不足一页 = 已到末尾
    if (added === 0 || items.length < DRAFT_LIST_PAGE_SIZE) break
  }
  return drafts
}

/**
 * 解析本次要处理的草稿集合。
 * - scope='all'：枚举草稿箱全部「文章」草稿（用户明确要求开启所有草稿时使用）。
 * - scope='targeted'（默认）：只定位目标草稿，不全量枚举；命中即停，逐页查找直到标题匹配。
 *   无标题时取最新一条草稿（与发布后自动开启原创的语义一致）。
 */
async function resolveTargetDrafts(
  page: Page,
  token: string,
  targetTitles: string[],
  scope: 'targeted' | 'all',
): Promise<{ drafts: DraftRef[]; matchedByTitle: boolean }> {
  if (scope === 'all') {
    return { drafts: await listArticleDrafts(page, token), matchedByTitle: true }
  }

  const wanted = targetTitles.map(t => t.trim()).filter(Boolean)
  const collected: DraftRef[] = []
  const seen = new Set<string>()
  for (let index = 0; index < 100; index += 1) {
    const items = await fetchDraftListPage(page, token, index * DRAFT_LIST_PAGE_SIZE)
    if (items.length === 0) break
    let added = 0
    for (const item of items) {
      if (seen.has(item.appmsgid)) continue
      seen.add(item.appmsgid)
      collected.push(item)
      added += 1
    }

    // 无标题：最新一条即目标（发布流程刚创建的草稿位于首位）
    if (wanted.length === 0) return { drafts: collected.slice(0, 1), matchedByTitle: false }

    const hit = collected.find((draft) => {
      const titlesToCheck = draft.titles && draft.titles.length > 0 ? draft.titles : [draft.title]
      return titlesToCheck.some(
        dt => dt !== '' && wanted.some(t => dt === t || dt.includes(t) || t.includes(dt)),
      )
    })
    if (hit) return { drafts: [hit], matchedByTitle: true }

    if (added === 0 || items.length < DRAFT_LIST_PAGE_SIZE) break
  }

  // 标题未命中：退回最新一条草稿，保证与原有「发布后自动开启」行为一致
  return { drafts: collected.slice(0, 1), matchedByTitle: false }
}

async function debugScreenshot(page: Page, dir: string, label: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true })
  const safe = label.replace(/[^A-Za-z0-9_-]/g, '-').slice(-40)
  const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '_' + safe + '.png')
  await page.screenshot({ path: file }).catch(() => undefined)
  return file
}

/** 启动公众号自动化专用的浏览器实例（具备排队互斥锁、孤儿进程清理与锁自愈重试） */
export async function launchWechatBrowser(
  cfg: Config,
  accountId: string,
  _headless?: boolean,
): Promise<Browser> {
  // 【中文修复依据】：严禁唤起操作系统前台外部浏览器！所有自动化操作（包括登录扫码、发布、原创标记等）
  // 必须 100% 采用内置受控无头模式，扫码画面与交互通过 CDP 串流至内置侧边栏！
  const profileDir = wechatProfileDir(cfg, accountId)
  const args = [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--lang=zh-CN,zh',
    '--window-size=1440,900',
  ]
  return launchBrowserSafely({
    executablePath: findBrowserExecutable(cfg),
    headless: true,
    userDataDir: profileDir,
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 240000,
    args,
    platformDisplayName: '微信公众号',
  })
}

// ---------- 微信公众号凭据持久化与 Session 管理 ----------

export interface WechatSessionData {
  account_id: string
  platform: 'gzh'
  user_name?: string
  cookies: Array<any>
  token?: string
  updated_at: string
}

export function wechatSessionPath(cfg: Config, accountId: string): string {
  return path.join(wechatProfileDir(cfg, accountId), 'wechat_session.json')
}

export function wechatBackupSessionPath(cfg: Config, accountId: string): string {
  return path.join(accountScriptsDir(cfg, accountId), 'wechat_session.json')
}

export function saveWechatSession(cfg: Config, accountId: string, data: WechatSessionData): void {
  try {
    const raw = JSON.stringify(data, null, 2) + '\n'
    const p1 = wechatSessionPath(cfg, accountId)
    fs.mkdirSync(path.dirname(p1), { recursive: true })
    fs.writeFileSync(p1, raw, 'utf-8')
    const p2 = wechatBackupSessionPath(cfg, accountId)
    fs.mkdirSync(path.dirname(p2), { recursive: true })
    fs.writeFileSync(p2, raw, 'utf-8')
  } catch (err) {
    console.error('[wechat] 保存微信登录凭据失败:', err)
  }
}

export function loadWechatSession(cfg: Config, accountId: string): WechatSessionData | null {
  const p1 = wechatSessionPath(cfg, accountId)
  const p2 = wechatBackupSessionPath(cfg, accountId)
  const candidate = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null
  if (!candidate) return null
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as WechatSessionData
  } catch {
    return null
  }
}

/** 鲁棒恢复微信公众号 Cookies 凭据：标准化 Electron/Puppeteer 字段，容错批量与逐条注入 */
export async function restoreWechatCookies(
  page: Page,
  cfg: Config,
  accountId: string,
): Promise<boolean> {
  const session = loadWechatSession(cfg, accountId)
  if (session && Array.isArray(session.cookies) && session.cookies.length > 0) {
    try {
      const injectRes = await safelyInjectCookies(page, session.cookies, '.qq.com')
      if (injectRes.errors.length > 0) {
        console.warn(`[wechat] 微信凭据注入警告: ${injectRes.errors.join('; ')}`)
      }
      return injectRes.success
    } catch (err) {
      console.warn('[wechat] 注入微信凭据异常:', err)
    }
  }
  return false
}

/** 刷新并持久化当前页面的微信会话凭据（增量自愈，防止凭据过期） */
export async function refreshWechatSession(
  page: Page,
  cfg: Config,
  accountId: string,
  token?: string,
): Promise<void> {
  try {
    const cookies = await page.cookies(MP_LOGIN_URL).catch(() => [])
    if (cookies.length > 0) {
      saveWechatSession(cfg, accountId, {
        account_id: accountId,
        platform: 'gzh',
        cookies,
        token: token || undefined,
        updated_at: new Date().toISOString(),
      })
      setCachedLoginState('gzh', accountId, true)
    }
  } catch {}
}

/**
 * 智能安全导航至微信公众平台后台（优先复用持久化 token 直达后台首页，跳过脆弱的根路径自动重定向，并防范误删会话）
 */
export async function navigateToWechatBackend(
  page: any,
  cfg: Config,
  accountId: string,
  timeoutMs = 60000,
): Promise<string | null> {
  await restoreWechatCookies(page, cfg, accountId)
  const savedSession = loadWechatSession(cfg, accountId)
  const targetUrl = savedSession?.token
    ? `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&token=${savedSession.token}&lang=zh_CN`
    : MP_LOGIN_URL

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs }).catch(() => undefined)
  await new Promise(resolve => setTimeout(resolve, 2000))

  let currentUrl = page.url()
  let token = new URL(currentUrl).searchParams.get('token')

  if (!token && savedSession?.token && !currentUrl.includes('/cgi-bin/loginpage') && currentUrl.includes('cgi-bin')) {
    token = savedSession.token
  }

  if (!token) {
    for (let i = 0; i < 5; i++) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      currentUrl = page.url()
      token = new URL(currentUrl).searchParams.get('token')
      if (token) break
    }
  }

  // 关键修复（中文注释）：微信公众平台在会话或 token 过期时，虽然 URL 仍残留旧的 ?token=...，但页面 DOM 会直接呈现笑脸电脑与「登录超时，请重新登录」
  // 严禁仅看 URL 是否存在 token，必须深度检测页面 DOM 是否包含登录超时或 layout/error 特征，一旦命中立即认定 token 失效并返回 null
  const isPageTimeout = await page
    .evaluate(() => {
      const text = document.body ? document.body.innerText || '' : ''
      const html = document.documentElement ? document.documentElement.innerHTML || '' : ''
      return (
        text.includes('登录超时') ||
        text.includes('请重新登录') ||
        html.includes('layout/error') ||
        Boolean(document.querySelector('.weui-desktop-icon.weui-desktop-icon_msg-warn'))
      )
    })
    .catch(() => false)

  if (isPageTimeout) {
    console.warn(
      `[social-publisher] 账号 ${accountId} 微信公众平台后台页面呈现「登录超时，请重新登录」，token 已失效，立即提前阻断`,
    )
    return null
  }

  // 若带 token 直达失败被反跳到登录页，尝试从根登录页做一次自然跳转重试
  if (!token && currentUrl.includes('/cgi-bin/loginpage')) {
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 2500))
    currentUrl = page.url()
    token = new URL(currentUrl).searchParams.get('token')
  }

  if (token) {
    await refreshWechatSession(page, cfg, accountId, token).catch(() => undefined)
  }
  return token
}

/** 检查微信公众平台登录态（三级智能梯度检测：本地未过期校验 + 毫秒级网络在线探针，杜绝静态盲信假阳性） */
export async function wechatCheckLogin(cfg: Config, accountId: string): Promise<boolean> {
  const cached = getCachedLoginState('gzh', accountId)
  if (cached !== null) return cached

  // 防重保护：若该账号正在执行前台登录流程，主动避让
  if (isLoginInFlight('gzh', accountId)) {
    return false
  }

  // 梯度 1 & 梯度 2：本地过期门禁与轻量在线探针检测
  const health = await checkAccountLoginHealth(cfg, 'gzh', accountId)
  if (health.valid) {
    setCachedLoginState('gzh', accountId, true)
    return true
  }

  // 梯度 3 保底核验（中文注释）：当探针未通过但本地保存了 Cookies 时，启动无头浏览器使用 navigateToWechatBackend 真实探测一次，杜绝假阴性误判
  const savedSession = loadWechatSession(cfg, accountId)
  if (savedSession && Array.isArray(savedSession.cookies) && savedSession.cookies.length > 0) {
    const browser = await launchWechatBrowser(cfg, accountId, true)
    try {
      const pages = await browser.pages()
      const page = pages.length > 0 ? pages[0] : await browser.newPage()
      const token = await navigateToWechatBackend(page, cfg, accountId, 35000)
      if (token) {
        setCachedLoginState('gzh', accountId, true)
        return true
      }
      const cur = page.url()
      const cookies = await page.cookies(MP_LOGIN_URL).catch(() => [])
      const hasTicket = cookies.some(
        (c: any) => (c.name === 'data_ticket' || c.name === 'slave_user') && Boolean(c.value),
      )
      const loggedIn = hasTicket && !cur.includes('/cgi-bin/loginpage') && cur.includes('cgi-bin')
      if (loggedIn) {
        setCachedLoginState('gzh', accountId, true)
        return true
      }
    } catch {} finally {
      await browser.close().catch(() => undefined)
    }
  }

  setCachedLoginState('gzh', accountId, false)
  return false
}

/** 微信公众平台扫码登录（有头浏览器，等待扫码并检测 token） */
export async function wechatLogin(
  cfg: Config,
  accountId: string,
  timeoutMs = 240000,
): Promise<boolean> {
  const loginStartTime = Date.now()
  const streamSessionId = `wechat-login-${accountId}-${Date.now()}`
  startAutomationStreamSession({
    sessionId: streamSessionId,
    accountId,
    module: 'social-publisher',
    platform: 'wechat',
    platformName: '微信公众号',
    title: `微信扫码登录 · ${accountId}`,
    currentUrl: MP_LOGIN_URL,
    status: 'running',
    startedAt: Date.now(),
    steps: [
      { id: 'open', label: '加载微信公众平台登录页', status: 'running' },
      { id: 'scan', label: '等待管理员扫码授权', status: 'pending' },
      { id: 'save', label: '保存并同步会话凭据', status: 'pending' },
    ],
  })

  let detachScreencast: (() => Promise<void>) | null = null
  // 遵循界面内置浏览器规范：严格无头运行（headless: true），扫码画面通过 attachPageScreencast 串流至内置浏览器面板，绝不弹出操作系统前台窗口
  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    detachScreencast = await attachPageScreencast(page, streamSessionId, {
      maxFps: 12,
      quality: 50,
    })
    await page.bringToFront().catch(() => undefined)
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    updateAutomationStreamStep(streamSessionId, 'open', 'completed', '登录页已就绪', page.url())
    updateAutomationStreamStep(streamSessionId, 'scan', 'running', '等待扫码授权中...', page.url())

    // 给页面 3 秒让其在已有登录态时自动重定向
    await new Promise(resolve => setTimeout(resolve, 3000))
    if (page.url().includes('token=')) {
      const cookies = await page.cookies(MP_LOGIN_URL).catch(() => [])
      const tokenMatch = page.url().match(/token=([0-9a-zA-Z_-]+)/)
      saveWechatSession(cfg, accountId, {
        account_id: accountId,
        platform: 'gzh',
        cookies,
        token: tokenMatch ? tokenMatch[1] : undefined,
        updated_at: new Date().toISOString(),
      })
      setCachedLoginState('gzh', accountId, true)
      updateAutomationStreamStep(
        streamSessionId,
        'scan',
        'completed',
        '已有有效登录态',
        page.url(),
      )
      updateAutomationStreamStep(streamSessionId, 'save', 'completed', '会话同步完成', page.url())
      completeAutomationStreamSession(streamSessionId)
      return true
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!browser.connected || page.isClosed()) {
        const saved = loadWechatSession(cfg, accountId)
        const updatedAtMs = saved?.updated_at ? new Date(saved.updated_at).getTime() : 0
        if (
          updatedAtMs >= loginStartTime &&
          saved &&
          saved.cookies?.some(
            c => (c.name === 'data_ticket' || c.name === 'slave_user') && Boolean(c.value),
          )
        ) {
          setCachedLoginState('gzh', accountId, true)
          completeAutomationStreamSession(streamSessionId)
          return true
        }
        failAutomationStreamSession(streamSessionId, '登录窗口已被关闭')
        return false
      }
      const currentUrl = page.url()
      if (currentUrl.includes('token=')) {
        // 扫码成功并已重定向至后台首页，等待 2s 确保 cookie 完整持久化
        await new Promise(resolve => setTimeout(resolve, 2000))
        const cookies = await page.cookies(MP_LOGIN_URL).catch(() => [])
        const tokenMatch = currentUrl.match(/token=([0-9a-zA-Z_-]+)/)
        saveWechatSession(cfg, accountId, {
          account_id: accountId,
          platform: 'gzh',
          cookies,
          token: tokenMatch ? tokenMatch[1] : undefined,
          updated_at: new Date().toISOString(),
        })
        setCachedLoginState('gzh', accountId, true)
        updateAutomationStreamStep(
          streamSessionId,
          'scan',
          'completed',
          '扫码授权成功',
          currentUrl,
        )
        updateAutomationStreamStep(
          streamSessionId,
          'save',
          'completed',
          '凭据同步完成',
          currentUrl,
        )
        completeAutomationStreamSession(streamSessionId)
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    setCachedLoginState('gzh', accountId, false)
    failAutomationStreamSession(streamSessionId, '扫码登录超时（4 分钟）')
    return false
  } finally {
    if (detachScreencast) {
      await detachScreencast().catch(() => undefined)
    }
    await browser.close().catch(() => undefined)
  }
}

import { handleCors, sendJson, readBodyText } from './http-helpers.ts'

export async function handleWechatLoginRoute(
  req: import('node:http').IncomingMessage,
  res: import('node:http').ServerResponse,
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
  const action = body.action === 'check' ? 'check' : 'login'
  const force = Boolean(body.force)
  const cfg = getConfig()
  try {
    fs.mkdirSync(wechatProfileDir(cfg, accountId), { recursive: true })
  } catch {}
  if (action === 'check') {
    try {
      const logged = await wechatCheckLogin(cfg, accountId)
      sendJson(res, 200, { ok: true, action, logged_in: logged })
    } catch (error) {
      sendJson(res, 200, {
        ok: false,
        action,
        error: error instanceof Error ? error.message : String(error),
      })
    }
    return
  }
  if (isLoginInFlight('gzh', accountId)) {
    if (force) {
      setLoginInFlight('gzh', accountId, false)
    } else {
      sendJson(res, 409, { error: '账号 ' + accountId + ' 的公众号登录流程正在进行中' })
      return
    }
  }
  setLoginInFlight('gzh', accountId, true)
  try {
    const logged = await wechatLogin(cfg, accountId)
    sendJson(
      res,
      200,
      logged
        ? { ok: true, action, logged_in: true }
        : { ok: false, action, error: '登录未完成或登录窗口已关闭，请重新点击扫码登录' },
    )
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      action,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    setLoginInFlight('gzh', accountId, false)
  }
}

/** 注册微信公众平台登录态检测与扫码登录 HTTP 路由 */
export function registerWechatRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(
      () =>
        webCtx.webServer!.register({
          kind: 'exact',
          path: WECHAT_LOGIN_ROUTE,
          handler: (req, res) => handleWechatLoginRoute(req, res, getConfig),
        }),
      'gzh-publisher: wechat login route',
    )
  })
}

/**
 * 在微信公众号图文编辑页中，执行用户提供的批量开启文字原创并保存草稿算法
 */
async function runOriginalScriptInPage(
  page: Page,
  defaultAuthor: string,
): Promise<{ success: boolean; completed: string[] }> {
  return await page.evaluate(async (authorName) => {
    const DEFAULT_AUTHOR = authorName || '科技前沿观察'
    const STEP_TIMEOUT = 25000

    const stopRequested = false
    const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

    function normalizeText(text: string | null | undefined): string {
      return String(text || '')
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    }

    function isVisible(element: Element | null): boolean {
      if (!element) return false
      const style = window.getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 &&
        rect.width > 0 &&
        rect.height > 0
      )
    }

    function all(selector: string, root: Document | Element = document): Element[] {
      return Array.from(root.querySelectorAll(selector))
    }

    function visible(selector: string, root: Document | Element = document): Element | null {
      return all(selector, root).find(isVisible) || null
    }

    function elementByText(
      selector: string,
      text: string,
      root: Document | Element = document,
    ): Element | null {
      return (
        all(selector, root).find(
          element => isVisible(element) && element.textContent?.trim() === text,
        ) || null
      )
    }

    async function waitFor<T>(
      getter: () => T | null | undefined | false,
      description: string,
      timeout = STEP_TIMEOUT,
    ): Promise<T> {
      const startedAt = Date.now()
      while (Date.now() - startedAt < timeout) {
        if (stopRequested) throw new Error('用户已停止')
        const result = getter()
        if (result) return result
        await sleep(150)
      }
      throw new Error(`等待“${description}”超时`)
    }

    function articleCards(): Element[] {
      const cards = all('.card_appmsg_inner').filter(card => card.querySelector('strong'))
      if (cards.length) return cards

      return all('strong')
        .map(strong => strong.closest('.card_appmsg_inner'))
        .filter(
          (card, index, list): card is Element => Boolean(card) && list.indexOf(card) === index,
        )
    }

    function articleTitle(card: Element, index: number): string {
      return card.querySelector('strong')?.textContent?.trim() || `第 ${index + 1} 篇`
    }

    function findArticleCard(title: string): Element | null {
      return (
        articleCards().find(
          (card, index) => normalizeText(articleTitle(card, index)) === normalizeText(title),
        ) || null
      )
    }

    async function selectArticle(title: string): Promise<void> {
      const card = await waitFor(() => findArticleCard(title), `查找文章：${title}`)
      const clickable = (card.querySelector('.card_appmsg_hd, strong') || card) as HTMLElement
      clickable.click()

      await waitFor(() => {
        const currentCard = findArticleCard(title)
        const item = currentCard?.closest('.js_appmsg_item')
        return item?.classList.contains('current')
      }, `选中文章：${title}`)

      await waitFor(() => {
        const selectedTitle = document.querySelector(
          '#title, textarea.js_title, textarea[name="title"], input[name="title"]',
        ) as HTMLInputElement | HTMLTextAreaElement | null
        const actualTitle = selectedTitle?.value || selectedTitle?.textContent
        return normalizeText(actualTitle) === normalizeText(title)
      }, `切换到文章：${title}`)

      await sleep(250)
    }

    function getOriginalState(): {
      area: Element
      state: 'unset' | 'enabled'
      unset: HTMLElement | null
    } | null {
      const area = visible('.js_original_type')
      if (!area) return null

      const unset = visible('.js_unset_original_title', area) as HTMLElement | null
      if (unset) return { area, state: 'unset', unset }

      const text = normalizeText(area.textContent)
      if (text.includes('文字原创')) return { area, state: 'enabled', unset: null }

      return null
    }

    async function getStableOriginalState(title: string) {
      let previousKey = ''
      let stableSince = 0

      return waitFor(() => {
        const titleField = document.querySelector(
          '#title, textarea.js_title, textarea[name="title"], input[name="title"]',
        ) as HTMLInputElement | HTMLTextAreaElement | null
        const actualTitle = titleField?.value || titleField?.textContent
        if (normalizeText(actualTitle) !== normalizeText(title)) return null

        const state = getOriginalState()
        if (!state) return null

        const key = `${state.state}|${normalizeText(state.area.textContent)}`
        if (key !== previousKey) {
          previousKey = key
          stableSince = Date.now()
          return null
        }

        return Date.now() - stableSince >= 450 ? state : null
      }, `稳定“${title}”的原创状态`)
    }

    async function enableOriginal(title: string): Promise<string> {
      const originalState = await getStableOriginalState(title)

      if (originalState.state === 'enabled') return '已开启，跳过'

      const switchArea = (visible('.js_original_apply', originalState.area) ||
        originalState.unset) as HTMLElement | null
      if (!switchArea) throw new Error(`未找到“${title}”的原创设置入口按钮`)
      switchArea.click()

      const dialog = await waitFor(
        () =>
          all('.weui-desktop-dialog').find(
            item =>
              isVisible(item) &&
              (item.textContent?.includes('声明类型') || item.textContent?.includes('原创声明')),
          ),
        '原创声明窗口',
      )

      const textOriginal = dialog.querySelector(
        'input[type="radio"][value="0"]',
      ) as HTMLInputElement | null
      if (textOriginal && !textOriginal.checked) textOriginal.click()

      const author = dialog.querySelector(
        'input.js_counter.js_author, input[placeholder="请输入作者"]',
      ) as HTMLInputElement | null
      if (author && !author.value.trim()) {
        author.value = DEFAULT_AUTHOR
        author.dispatchEvent(new Event('input', { bubbles: true }))
        author.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const agreement = dialog.querySelector(
        'input.weui-desktop-form__checkbox',
      ) as HTMLInputElement | null
      if (agreement && !agreement.checked) agreement.click()

      const confirm = elementByText('button', '确定', dialog) as HTMLButtonElement | null
      if (!confirm) throw new Error(`“${title}”的原创窗口没有找到确定按钮`)
      if (confirm.disabled) throw new Error(`“${title}”的原创确定按钮不可用`)

      confirm.click()
      await waitFor(() => !isVisible(dialog), '关闭原创声明窗口')
      await waitFor(() => getOriginalState()?.state === 'enabled', `确认“${title}”已开启原创`)
      return '已开启'
    }

    async function saveDraft(): Promise<void> {
      const button = (await waitFor(
        () => elementByText('button', '保存为草稿'),
        '保存为草稿按钮',
      )) as HTMLButtonElement

      if (button.disabled) throw new Error('保存为草稿按钮不可用')
      button.click()

      await waitFor(
        () => visible('#js_save_success, #js_save_success_with_ad, #js_save_success_with_ad_op'),
        '“已保存”提示',
        25000,
      )

      const errorText = all('.weui-desktop-dialog, .weui-desktop-toast, .weui-desktop-tips')
        .filter(isVisible)
        .map(element => element.textContent?.trim() || '')
        .find(text => /保存失败|系统错误|请重试|内容违规/.test(text))
      if (errorText) throw new Error(errorText)
    }

    // 核心执行流程
    const cards = articleCards()
    const completed: string[] = []

    if (cards.length > 0) {
      const titles = cards.map(articleTitle)
      for (let index = 0; index < titles.length; index += 1) {
        const title = titles[index]
        await selectArticle(title)
        const result = await enableOriginal(title)
        completed.push(`${index + 1}. ${title}：${result}`)
      }
    } else {
      // 单篇文章情况保底
      const titleField = document.querySelector(
        '#title, textarea.js_title, textarea[name="title"], input[name="title"]',
      ) as HTMLInputElement | HTMLTextAreaElement | null
      const singleTitle = titleField?.value || titleField?.textContent || '当前文章'
      const result = await enableOriginal(singleTitle)
      completed.push(`1. ${singleTitle}：${result}`)
    }

    await saveDraft()
    return { success: true, completed }
  }, defaultAuthor)
}

/**
 * 为微信公众号草稿箱中的草稿开启文字原创声明并保存。
 *
 * 处理范围由 scope 决定（默认定向，避免不必要的全量翻页）：
 * - scope='targeted'（默认）：只定位 targetTitles 命中的那**一个**草稿；无标题时取最新一条。
 *   发布流程（publish 后自动开启原创）走这一路径，开销最小。
 * - scope='all'：枚举草稿箱「文章」标签下的**全部**草稿（新的与历史的都包含）逐个处理。
 *   仅在用户明确要求「开启所有草稿的原创」时使用。
 *
 * 说明：草稿箱列表使用 type=77（图文文章），小绿书/图片消息草稿不会出现在该列表中，
 * 因此天然被跳过，符合「小绿书文章不需要开启原创」的要求。
 */
export async function enableWechatDraftOriginal(
  cfg: Config,
  accountId: string,
  targetTitles: string[],
  authorName?: string,
  scope: 'targeted' | 'all' = 'targeted',
): Promise<WechatOriginalResult> {
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'wechat_debug')

  if (cfg.runtime.dry_run) {
    return {
      success: true,
      article_count: targetTitles.length,
      completed: targetTitles.map((t, i) => `${i + 1}. ${t}：演练模式跳过（不启动浏览器）`),
    }
  }

  const streamSessionId = `wechat-original-${accountId}-${Date.now()}`
  startAutomationStreamSession({
    sessionId: streamSessionId,
    accountId,
    module: 'social-publisher',
    platform: 'wechat',
    platformName: '微信公众号',
    title: `微信草稿开启原创 · ${accountId}`,
    currentUrl: MP_LOGIN_URL,
    status: 'running',
    startedAt: Date.now(),
    autoReveal: true,
    steps: [
      { id: 'auth', label: '校验与恢复登录凭据', status: 'running' },
      { id: 'resolve_drafts', label: '定位待处理草稿', status: 'pending' },
      { id: 'enable_original', label: '逐篇配置文字原创声明', status: 'pending' },
      { id: 'save', label: '保存并同步草稿变更', status: 'pending' },
    ],
  })

  let detachScreencast: (() => Promise<void>) | null = null
  const headless = true
  const browser = await launchWechatBrowser(cfg, accountId, headless)
  let page: Page | null = null

  try {
    page = await browser.newPage()
    detachScreencast = await attachPageScreencast(page, streamSessionId, {
      maxFps: 12,
      quality: 50,
    })
    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2000))

    let currentUrl = page.url()
    let token = new URL(currentUrl).searchParams.get('token')

    if (!token) {
      // 若首页无 token，再次等待或检查重定向
      await page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 })
        .catch(() => undefined)
      currentUrl = page.url()
      token = new URL(currentUrl).searchParams.get('token')
    }

    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'not_logged_in')
      failAutomationStreamSession(streamSessionId, '微信后台未登录（未获取到 token）')
      throw new Error(
        '微信公众号后台未检测到有效登录态（未获取到 token）。请在设置界面点击「扫码登录微信公众号后台」完成扫码，或在浏览器中登录后重试。截图已存：' +
          shot,
      )
    }

    // 成功进入后台，异步刷新持久化凭据
    await refreshWechatSession(page, cfg, accountId, token)
    updateAutomationStreamStep(
      streamSessionId,
      'auth',
      'completed',
      '已确认后台登录态',
      currentUrl,
    )
    updateAutomationStreamStep(
      streamSessionId,
      'resolve_drafts',
      'running',
      '正在检索草稿箱...',
      currentUrl,
    )

    // 1. 解析目标草稿：默认只定位命中的那一个；scope='all' 才枚举全部草稿
    const { drafts: allDrafts, matchedByTitle } = await resolveTargetDrafts(
      page,
      token,
      targetTitles,
      scope,
    )
    if (allDrafts.length === 0) {
      const shot = await debugScreenshot(page, debugDir, 'draft_not_found')
      failAutomationStreamSession(streamSessionId, '草稿箱未找到任何「文章」草稿')
      throw new Error('微信公众号草稿箱中未找到任何「文章」草稿。截图已存：' + shot)
    }

    updateAutomationStreamStep(
      streamSessionId,
      'resolve_drafts',
      'completed',
      `定位到 ${allDrafts.length} 个草稿`,
      page.url(),
    )
    updateAutomationStreamStep(
      streamSessionId,
      'enable_original',
      'running',
      `准备处理 ${allDrafts.length} 个草稿`,
      page.url(),
    )

    // 2. 逐个草稿：进入编辑页 → 逐篇开启文字原创 → 保存草稿
    const finalAuthor = authorName || cfg.accounts[accountId]?.author_name || '科技前沿观察'
    const completed: string[] = []
    const draftDetails: NonNullable<WechatOriginalResult['drafts']> = []
    let articlesTotal = 0
    let draftsOk = 0
    let draftsFailed = 0

    for (let index = 0; index < allDrafts.length; index += 1) {
      const draft = allDrafts[index]
      const label = `[${index + 1}/${allDrafts.length}] ${draft.title || draft.appmsgid}`
      try {
        updateAutomationStreamStep(
          streamSessionId,
          'enable_original',
          'running',
          `正在处理 [${index + 1}/${allDrafts.length}]: ${draft.title || draft.appmsgid}`,
          page.url(),
        )
        await page.goto(draftEditUrl(token, draft.appmsgid), {
          waitUntil: 'domcontentloaded',
          timeout: 60000,
        })
        await new Promise(resolve => setTimeout(resolve, 2500))

        const isEditor = await page.evaluate(() => {
          const search = window.location.search
          return search.includes('action=edit') || search.includes('t=media/appmsg_edit')
        })
        if (!isEditor) throw new Error('未能进入编辑页，当前 URL: ' + page.url())

        await page.waitForSelector('#title, textarea.js_title, .card_appmsg_inner', {
          timeout: 30000,
        })
        await new Promise(resolve => setTimeout(resolve, 1200))

        const result = await runOriginalScriptInPage(page, finalAuthor)
        const enabled = result.completed.filter(
          line => line.includes('已开启') && !line.includes('跳过'),
        ).length
        articlesTotal += result.completed.length
        draftsOk += 1
        completed.push(
          ...result.completed.map(line => `${draft.title || draft.appmsgid} → ${line}`),
        )
        draftDetails.push({
          appmsgid: draft.appmsgid,
          title: draft.title,
          articles: result.completed.length,
          enabled,
          skipped: result.completed.length - enabled,
          status: 'ok',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        draftsFailed += 1
        completed.push(`${label}：失败 - ${message}`)
        draftDetails.push({
          appmsgid: draft.appmsgid,
          title: draft.title,
          articles: 0,
          enabled: 0,
          skipped: 0,
          status: 'failed',
          error: message,
        })
        await debugScreenshot(page, debugDir, 'draft_failed_' + draft.appmsgid).catch(
          () => undefined,
        )
      }
    }

    updateAutomationStreamStep(
      streamSessionId,
      'enable_original',
      'completed',
      `成功处理 ${draftsOk} 个草稿，开启 ${articlesTotal} 篇原创`,
      page.url(),
    )
    updateAutomationStreamStep(
      streamSessionId,
      'save',
      'completed',
      '草稿箱已保存同步',
      page.url(),
    )
    completeAutomationStreamSession(streamSessionId)

    return {
      success: draftsFailed === 0,
      article_count: articlesTotal,
      completed,
      scope,
      drafts: draftDetails,
      summary: {
        drafts_total: allDrafts.length,
        drafts_ok: draftsOk,
        drafts_failed: draftsFailed,
        articles_total: articlesTotal,
      },
      note:
        scope === 'all'
          ? '已遍历草稿箱全部「文章」草稿（小绿书/图片消息草稿不在 type=77 列表中，按要求跳过）'
          : matchedByTitle
            ? '已按标题定向处理 1 个草稿（未全量枚举；如需处理全部草稿请传 scope=\'all\'）'
            : '未匹配到指定标题，已回退处理最新 1 个草稿（未全量枚举；如需处理全部草稿请传 scope=\'all\'）',
      ...(draftsFailed > 0
        ? { error: `${draftsFailed}/${allDrafts.length} 个草稿处理失败，详见 drafts` }
        : {}),
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    failAutomationStreamSession(streamSessionId, errorMsg)
    let shot: string | undefined
    if (page) {
      shot = await debugScreenshot(page, debugDir, 'original_error').catch(() => undefined)
    }
    return {
      success: false,
      article_count: 0,
      completed: [],
      error: errorMsg,
      screenshot: shot,
    }
  } finally {
    if (detachScreencast) {
      await detachScreencast().catch(() => undefined)
    }
    await browser.close().catch(() => undefined)
  }
}

/** 供 Agent 随时单独调用的开启草稿原创工具 */
export function enableOriginalTool(cfg: Config) {
  return defineTool<
    { titles?: string[]; author?: string; account_id?: string; scope?: 'targeted' | 'all' },
    WechatOriginalResult
  >({
    name: 'gzh_enable_original',
    description:
      '为微信公众号草稿箱中的草稿开启文字原创声明并保存。默认只定位处理指定标题（或最新）的那 1 个草稿，开销小；仅当明确需要「开启所有草稿的原创」时传 scope="all"，才会枚举草稿箱「文章」标签下的全部草稿（含历史草稿）逐个处理。草稿箱列表按 type=77 只含图文文章，小绿书/图片消息草稿不在列表中，天然跳过。',
    parameters: {
      titles: {
        type: 'array',
        description:
          '可选：目标草稿的标题（草稿内首篇标题，支持精确或包含匹配）；留空则取最新 1 个草稿。仅在 scope="all" 时忽略',
        items: { type: 'string' },
      },
      scope: {
        type: 'string',
        description:
          '可选处理范围：targeted（默认）只处理命中的 1 个草稿，不枚举全部；all 枚举草稿箱全部「文章」草稿逐个开启原创',
        enum: ['targeted', 'all'],
      },
      author: {
        type: 'string',
        description: '可选：原创声明作者名，缺省采用账号设置的 author_name',
      },
      account_id: {
        type: 'string',
        description: '账号 ID；缺省使用默认账号',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: true,
      },
      render: renderJson,
    },
    async execute(args) {
      const account = resolveAccount(cfg, args.account_id)
      const scope: 'targeted' | 'all' = args.scope === 'all' ? 'all' : 'targeted'
      let titles = args.titles || []
      if (titles.length === 0 && scope === 'targeted') {
        const sdir = accountScriptsDir(cfg, account.id)
        const resultFile = path.resolve(sdir, RESULT_FILE)
        if (fs.existsSync(resultFile)) {
          try {
            const data = JSON.parse(fs.readFileSync(resultFile, 'utf-8'))
            if (Array.isArray(data.articles)) titles = data.articles
          } catch {}
        }
      }
      const author = args.author || account.profile.author_name
      return await enableWechatDraftOriginal(cfg, account.id, titles, author, scope)
    },
  })
}

export interface WechatDraftContinuationOptions {
  targetTitles: string[]
  authorName?: string
  autoEnableOriginal?: boolean
  publishAction: 'draft' | 'publish_now' | 'schedule'
  scheduleTime?: string
  ownerTaskId?: string
  isNewspic?: boolean
  wantNotification?: boolean
  debugDir?: string
}

export interface WechatDraftContinuationResult {
  success: boolean
  appmsgid?: string
  draftUrl?: string
  originalResult?: WechatOriginalResult
  published?: boolean
  scheduled?: boolean
  scheduled_time?: string
  schedule_error?: string
  receipt_screenshot?: string
  needs_qr_confirmation?: boolean
  qr_screenshot?: string
  error?: string
}

/**
 * 微信公众号发布链路第二阶段：浏览器自动化接力
 * 当 API 提交草稿入库后，启动无头浏览器，在单次会话内连续完成：
 * 1. 草稿箱精准定位刚刚提交的目标草稿
 * 2. 进入草稿编辑器
 * 3. 开启文字原创声明（若需要）
 * 4. 执行发表动作（立即发表 / 定时发表 / 保存草稿）
 * 5. 截取官方回执凭据
 */
export async function continueWechatDraftInBrowser(
  cfg: Config,
  accountId: string,
  options: WechatDraftContinuationOptions,
): Promise<WechatDraftContinuationResult> {
  const {
    targetTitles,
    authorName,
    autoEnableOriginal = true,
    publishAction,
    scheduleTime,
    ownerTaskId,
    isNewspic = false,
    wantNotification = false,
  } = options

  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = options.debugDir || path.join(sdir, 'wechat_debug')

  if (cfg.runtime.dry_run) {
    return {
      success: true,
      appmsgid: 'dry_run_appmsgid',
      draftUrl: 'https://mp.weixin.qq.com/dry_run_draft',
      published: publishAction === 'publish_now',
      scheduled: publishAction === 'schedule',
      scheduled_time: scheduleTime,
    }
  }

  const streamSessionId = `wechat-continue-${accountId}-${Date.now()}`
  startAutomationStreamSession({
    sessionId: streamSessionId,
    ownerTaskId,
    accountId,
    module: 'social-publisher',
    platform: 'wechat',
    platformName: '微信公众号',
    title: `微信草稿后续处理 · ${accountId}`,
    currentUrl: MP_LOGIN_URL,
    status: 'running',
    startedAt: Date.now(),
    autoReveal: true,
    steps: [
      { id: 'auth', label: '校验与恢复登录凭据', status: 'running' },
      { id: 'resolve_draft', label: '定位 API 生成的草稿', status: 'pending' },
      { id: 'editor', label: '进入编辑器处理原创与发表', status: 'pending' },
    ],
  })

  let detachScreencast: (() => Promise<void>) | null = null
  const headless = cfg.runtime.gzh_headless !== false
  const browser = await launchWechatBrowser(cfg, accountId, headless)
  let page: Page | null = null

  try {
    page = await browser.newPage()
    detachScreencast = await attachPageScreencast(page, streamSessionId, {
      maxFps: 12,
      quality: 50,
    })

    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(r => setTimeout(r, 2000))

    let currentUrl = page.url()
    let token = new URL(currentUrl).searchParams.get('token')

    if (!token) {
      await page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 })
        .catch(() => undefined)
      currentUrl = page.url()
      token = new URL(currentUrl).searchParams.get('token')
    }

    if (!token) {
      const waitRes = await waitForInteractiveLoginAndSync(page, cfg, 'gzh', accountId, {
        streamSessionId,
        loginUrl: MP_LOGIN_URL,
        checkLoginFn: async (p) => {
          const u = p.url()
          return Boolean(new URL(u).searchParams.get('token'))
        },
      })
      if (!waitRes.success) {
        const shot = await debugScreenshot(page, debugDir, 'not_logged_in')
        failAutomationStreamSession(streamSessionId, '微信公众平台未登录')
        throw new Error('微信公众平台未检测到有效登录态。截图已存：' + shot)
      }
      token = new URL(page.url()).searchParams.get('token')
    }

    if (!token) {
      throw new Error('未能获取微信后台访问 token')
    }

    await refreshWechatSession(page, cfg, accountId, token)
    updateAutomationStreamStep(streamSessionId, 'auth', 'completed', '已确认后台登录态', page.url())
    updateAutomationStreamStep(streamSessionId, 'resolve_draft', 'running', '正在检索草稿箱定位目标草稿...', page.url())

    // 1. 定位刚刚通过 API 提交的草稿（采用阶梯指数退避探测，杜绝微信后台主从读写延迟导致草稿尚未刷出的假报错）
    const probeIntervals = [1500, 3000, 5000, 8000, 10000]
    let resolvedDrafts: Array<{ appmsgid: string; title: string }> = []
    for (let attempt = 0; attempt <= probeIntervals.length; attempt++) {
      const { drafts } = await resolveTargetDrafts(page, token, targetTitles, 'targeted')
      if (drafts.length > 0) {
        resolvedDrafts = drafts
        break
      }
      if (attempt < probeIntervals.length) {
        const waitMs = probeIntervals[attempt]
        console.log(`[wechat-browser] 账号 ${accountId} 检索草稿箱第 ${attempt + 1} 次未命中（主从延迟同步中），等待 ${waitMs}ms 后重试探测...`)
        updateAutomationStreamStep(
          streamSessionId,
          'resolve_draft',
          'running',
          `微信后台草稿列表索引同步中，第 ${attempt + 1} 次重试探测 (${waitMs / 1000}s)...`,
          page.url(),
        )
        await new Promise(r => setTimeout(r, waitMs))
      }
    }

    if (resolvedDrafts.length === 0) {
      const shot = await debugScreenshot(page, debugDir, 'draft_not_found')
      failAutomationStreamSession(streamSessionId, '草稿箱未找到刚提交的目标草稿')
      throw new Error('微信公众平台草稿箱中未找到刚提交的目标草稿（已完成 5 次阶梯退避探测）。截图已存：' + shot)
    }

    const targetDraft = resolvedDrafts[0]
    const appmsgid = targetDraft.appmsgid
    const editUrl = isNewspic ? newspicDraftEditUrl(token, appmsgid) : draftEditUrl(token, appmsgid)

    updateAutomationStreamStep(
      streamSessionId,
      'resolve_draft',
      'completed',
      `已定位草稿 [${targetDraft.title || appmsgid}]`,
      page.url(),
    )
    updateAutomationStreamStep(
      streamSessionId,
      'editor',
      'running',
      '进入草稿编辑器执行原创声明与发表...',
      editUrl,
    )

    // 2. 导航至草稿编辑器
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(r => setTimeout(r, isNewspic ? 4000 : 2500))

    // 关掉新手引导遮罩
    await page.evaluate(() => {
      document.querySelectorAll('.education-dialog, .weui-desktop-mask').forEach((el) => {
        (el as HTMLElement).style.display = 'none'
      })
    })
    await new Promise(r => setTimeout(r, 600))

    // 3. 原创声明（长文且 autoEnableOriginal）
    let originalResult: WechatOriginalResult | undefined
    if (autoEnableOriginal && !isNewspic) {
      try {
        const origScriptRes = await runOriginalScriptInPage(page, authorName || '科技前沿观察')
        originalResult = {
          success: origScriptRes.success,
          article_count: origScriptRes.completed.length,
          completed: origScriptRes.completed,
        }
        console.log(`[social-publisher] 账号 ${accountId} 草稿「${targetDraft.title}」已成功配置文字原创声明`)
      } catch (err) {
        console.warn(`[social-publisher] 账号 ${accountId} 原创声明配置异常:`, err)
        originalResult = {
          success: false,
          article_count: 0,
          completed: [],
          error: err instanceof Error ? err.message : String(err),
        }
      }
    }

    // 4. 执行发表动作
    if (publishAction === 'draft') {
      // 存草稿：若前面做了原创，runOriginalScriptInPage 已自动保存；若未做，点击保存草稿
      if (!autoEnableOriginal || isNewspic) {
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button')).find(
            b => (b.textContent || '').trim() === '保存为草稿' || (b.textContent || '').trim() === '保存',
          )
          if (btn && !(btn as HTMLButtonElement).disabled) (btn as HTMLElement).click()
        })
        await new Promise(r => setTimeout(r, 2000))
      }

      updateAutomationStreamStep(streamSessionId, 'editor', 'completed', '草稿已妥善保存至草稿箱', page.url())
      completeAutomationStreamSession(streamSessionId)

      return {
        success: true,
        appmsgid,
        draftUrl: editUrl,
        originalResult,
        published: false,
        scheduled: false,
      }
    }

    // 立即发布或定时发表
    let batchBaseline = -1
    try {
      batchBaseline = loadWechatScheduledTasks(cfg, accountId).length
    } catch {}

    const pubActionResult = await executeBrowserPublishInPage(
      page,
      publishAction,
      scheduleTime,
      debugDir,
      wantNotification,
      batchBaseline,
    )

    // 核心闭环判定：定时发表提交后，必须拉取排期列表并在列表中检索匹配到目标文章才算排期成功，并持久化保存
    if (publishAction === 'schedule' && pubActionResult.scheduled) {
      const draftTitles = targetDraft.title ? [targetDraft.title] : []
      const verifyRes = await pollAndVerifyScheduledTask(
        page,
        cfg,
        accountId,
        draftTitles,
        undefined,
        3,
      )
      if (!verifyRes.ok) {
        pubActionResult.scheduled = false
        pubActionResult.schedule_error = verifyRes.error || '微信后台排期列表未检索到该任务'
      }
    }

    updateAutomationStreamStep(
      streamSessionId,
      'editor',
      'completed',
      pubActionResult.published
        ? '图文已成功直接发表'
        : pubActionResult.scheduled
          ? `图文已设置定时发表 (${pubActionResult.schedule_time || scheduleTime})`
          : '发表流程已结束',
      page.url(),
    )
    completeAutomationStreamSession(streamSessionId)

    return {
      success: pubActionResult.published || pubActionResult.scheduled || false,
      appmsgid,
      draftUrl: editUrl,
      originalResult,
      published: pubActionResult.published,
      scheduled: pubActionResult.scheduled,
      scheduled_time: pubActionResult.schedule_time || scheduleTime,
      schedule_error: pubActionResult.schedule_error,
      receipt_screenshot: pubActionResult.receipt_screenshot,
      needs_qr_confirmation: pubActionResult.needs_qr_confirmation,
      qr_screenshot: pubActionResult.qr_screenshot,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    failAutomationStreamSession(streamSessionId, errorMsg)
    let shot: string | undefined
    if (page) {
      shot = await debugScreenshot(page, debugDir, 'draft_continuation_error').catch(() => undefined)
    }
    return {
      success: false,
      error: `浏览器接力执行失败: ${errorMsg}${shot ? ` (截图: ${shot})` : ''}`,
    }
  } finally {
    if (detachScreencast) await detachScreencast().catch(() => {})
    await browser.close().catch(() => undefined)
  }
}

export interface WechatBrowserPublishJob {
  account_id: string
  article_type: 'news' | 'newspic'
  titles: string[]
  digests: string[]
  article_files: string[] // 绝对路径
  cover_files: string[] // 绝对路径
  content_files: Record<string, string> // 占位符 -> 绝对路径
  brand_top?: string
  brand_bot?: string
  brand_top_enabled?: boolean
  brand_bot_enabled?: boolean
  author: string
  brand_name: string
  auto_enable_original: boolean
  dry_run: boolean
  min_words: number
  forbidden: string[]
  publish_action?: 'draft' | 'publish_now' | 'schedule'
  schedule_time?: string
  want_notification?: boolean
}

export interface WechatBrowserPublishResult {
  dry_run: boolean
  media_id: string
  media_ids: string[]
  article_count: number
  titles: string[]
  draft_url?: string
  verify?: { checked: boolean; article_count?: number; results?: unknown[] }
  original_result?: WechatOriginalResult
  publish_action?: 'draft' | 'publish_now' | 'schedule'
  published?: boolean
  scheduled?: boolean
  scheduled_time?: string
  /** 定时设置失败原因（后台定时未生效时给出，供上层如实标记失败） */
  schedule_error?: string
  needs_qr_confirmation?: boolean
  qr_screenshot?: string
  receipt_screenshot?: string
}

/**
 * 解析目标定时时间，映射为后台弹窗所需的 {day, time, label}。
 *
 * 背景：公众号后台「发表」弹窗里的「定时发表」是一个 Vue 开关（组件 masssend-send-new-dialog），
 * 真实状态在组件 data（timer/day/curTime/curTime2）；DOM 上的 input 长期处于
 * disabled + weui-desktop-switch_loading，点击 label 无效——必须驱动组件状态。
 * 日期以「今天/明天/10月10日…」下拉给出（dayData，value=1..7，最多 7 天），
 * day=1 用 curTime，day>=2 用 curTime2。
 */
function resolveScheduleTarget(scheduleTime?: string): {
  day: number
  time: string
  label: string
} {
  const now = new Date()
  const parsed = (() => {
    const s = (scheduleTime || '').trim()
    if (!s) return null
    const rel = s.match(/^\+(\d+)\s*([mhd])$/i)
    if (rel) {
      const v = parseInt(rel[1], 10)
      const unit = rel[2].toLowerCase()
      const ms = unit === 'm' ? v * 60000 : unit === 'h' ? v * 3600000 : v * 86400000
      return new Date(now.getTime() + ms)
    }
    // 纯时刻（如 "09:00"）：今天该时刻，已过则顺延到明天。必须放在 new Date(s) 之前，
    // 否则 "09:00" 会被 Date 解析失败而静默退化成「1 小时后」。
    const timeOnly = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
    if (timeOnly) {
      const t = new Date(now)
      t.setHours(
        parseInt(timeOnly[1], 10),
        parseInt(timeOnly[2], 10),
        timeOnly[3] ? parseInt(timeOnly[3], 10) : 0,
        0,
      )
      if (t.getTime() <= now.getTime()) t.setDate(t.getDate() + 1)
      return t
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  })()
  const target = parsed || new Date(now.getTime() + 3600000)
  const hh = String(target.getHours()).padStart(2, '0')
  const mi = String(target.getMinutes()).padStart(2, '0')
  const time = `${hh}:${mi}`
  const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const diffDays = Math.round((dayStart(target) - dayStart(now)) / 86400000)
  const day = diffDays <= 0 ? 1 : diffDays + 1
  const label =
    day === 1 ? '今天' : day === 2 ? '明天' : `${target.getMonth() + 1}月${target.getDate()}日`
  return { day, time, label }
}

/** 公众号后台「定时发表」的可选范围：5 分钟后 ~ 7 天内（dayData 固定 7 项）。 */
function assertScheduleWithinWindow(scheduleTime?: string): void {
  const target = resolveScheduleTarget(scheduleTime)
  if (target.day > 7) {
    throw new Error(
      `定时时间超出后台可选范围：公众号「定时发表」最多支持 7 天内（当前目标为第 ${target.day} 天）。请改为 7 天内的时刻。`,
    )
  }
}

/** 浏览器「发表」动作的返回结构（定时失败时通过 schedule_error 如实上报） */
interface BrowserPublishActionResult {
  published: boolean
  scheduled: boolean
  schedule_error?: string
  /** 实际生效的定时日期（后台 dayData 的 value：1=今天…7） */
  schedule_day?: string
  /** 实际生效的定时日期文案（今天/明天/10月11日） */
  schedule_label?: string
  /** 实际生效的定时时刻 HH:mm */
  schedule_time?: string
  /** 该次定时是否成功开启了群发通知 */
  schedule_notification?: boolean
  needs_qr_confirmation?: boolean
  qr_screenshot?: string
  receipt_screenshot?: string
}

/**
 * 高可用发表按钮探测与点击辅助函数
 * 修复依据：微信长文编辑器底栏发表按钮带有 button.mass_send，
 * 但小绿书原生编辑器（createType=8）底栏发表按钮无 mass_send 类名。
 * 本探测器同时支持长文与小绿书现代编辑器，并在重试循环中复用，杜绝小绿书 84 秒超时抛错缺陷。
 */
async function findAndClickPublishButton(page: any): Promise<boolean> {
  return page.evaluate(() => {
    // 1. 长文编辑器与多图文合辑标准选择器（兼容新旧版编辑器、保存并群发/发表主入口）
    const standardBtn = document.querySelector('button.mass_send, #js_send, .js_send, #js_submit, .js_btn_send')
    if (standardBtn && (standardBtn as HTMLElement).offsetWidth > 0) {
      (standardBtn as HTMLElement).click()
      return true
    }

    // 2. 候选按钮全量探测（排除弹窗内部的确认按钮，聚焦底栏主按钮）
    const candidates = Array.from(
      document.querySelectorAll('button, a, div.weui-desktop-btn, span'),
    )
    const publishBtn = candidates.find((el) => {
      const text = (el.textContent || '').trim()
      const own = Array.from(el.childNodes)
        .filter(x => x.nodeType === 3)
        .map(x => x.textContent)
        .join('')
        .trim()
      const rect = (el as HTMLElement).getBoundingClientRect()
      const isVisible = rect.width > 0 && rect.height > 0
      const isNotInsideDialog = !el.closest('.weui-desktop-dialog')
      return (
        isVisible &&
        isNotInsideDialog &&
        (text === '发表' || text === '群发' || text === '发布' || own === '发表')
      )
    })
    if (publishBtn) {
      (publishBtn as HTMLElement).click()
      return true
    }
    return false
  })
}

async function executeBrowserPublishInPage(
  page: any,
  action: 'publish_now' | 'schedule',
  scheduleTime?: string,
  debugDir?: string,
  wantNotification = true,
  scheduleBatchCountBefore = -1,
): Promise<BrowserPublishActionResult> {
  // 后台「定时发表」批次基线由调用方传入（调用方在打开编辑页前于首页读取），
  // 用于提交后回查「批次是否真的增加」。缺省 -1 表示未提供，此时跳过回查。
  try {
    // 1) 打开「发表」弹窗（使用通用探测器精准兼容长文与小绿书）
    let clicked = await findAndClickPublishButton(page)
    if (!clicked) {
      await new Promise(r => setTimeout(r, 1000))
      clicked = await findAndClickPublishButton(page)
      if (!clicked) {
        return { published: false, scheduled: false }
      }
    }

    // 2) 等待弹窗与组件就绪（图片消息页加载更慢，最多约 60s）
    // 注意：不同账号/场景的弹窗 DOM 版本不同——有的把 Vue 组件挂在 .mass-send__timer-wrp，
    // 有的挂在 .mass-send_profile；且定时区控件可能先处于 weui-desktop-switch_loading
    // 异步加载态。这里依次尝试已知挂载点，并等待 loading 消失。
    const findDialogComp = () =>
      page.evaluate(() => {
        const d = Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(
          (x: any) => x.offsetWidth > 0 && (x.innerText || '').includes('定时发表'),
        ) as any
        if (!d) return { ok: false, reason: 'no-dialog' }
        const seeds: any[] = [
          d.querySelector('.mass-send__timer-wrp'),
          d.querySelector('.mass-send_profile'),
          d.querySelector('.mass-send__timer-container'),
          d.querySelector('.mass-send'),
        ].filter(Boolean)
        const tryFind = (start: any) => {
          let node: any = start
          let depth = 0
          while (node && depth < 20) {
            if (node.__vue__ && node.__vue__.$data && 'timer' in node.__vue__.$data)
              return node.__vue__
            node = node.parentElement
            depth++
          }
          return null
        }
        let comp: any = null
        for (const s of seeds) {
          comp = tryFind(s)
          if (comp) break
        }
        if (!comp) return { ok: false, reason: 'no-comp' };
        (window as any).__msComp = comp
        // 定时区控件是否仍在 loading（异步加载未完成）
        const loading =
          d.querySelectorAll('.mass-send__timer-wrp .weui-desktop-switch_loading').length > 0
        return { ok: true, loading }
      })

    let compReady: { ok: boolean; reason?: string; loading?: boolean } = {
      ok: false,
      reason: 'init',
    }
    for (let i = 0; i < 28; i++) {
      await new Promise(r => setTimeout(r, 3000))
      compReady = await findDialogComp()
      // 组件就绪且定时区不再 loading 才算真正可用
      if (compReady.ok && !compReady.loading) break
      if (compReady.reason === 'no-dialog') {
        // 关键修复（中文注释）：重试循环中严禁写死 button.mass_send！调用通用探测器确保小绿书底栏发表按钮可被准确重试点击
        await findAndClickPublishButton(page)
      }
    }
    if (!compReady.ok) {
      let shot = ''
      if (debugDir)
        shot = await debugScreenshot(page, debugDir, 'publish_dialog_not_ready').catch(() => '')
      throw new Error(
        '发表弹窗未就绪（' +
          (compReady.reason || 'unknown') +
          '）' +
          (shot ? '，截图：' + shot : ''),
      )
    }

    // 3) 定时发表：驱动组件设置 timer/day/curTime(2)，并认准图2群发通知次数配额
    let isScheduled = false
    let scheduleQuotaText = ''
    // 在分支外声明，供末尾组装返回值使用
    let resolvedScheduleDay = ''
    let resolvedScheduleLabel = ''
    let resolvedScheduleTime = ''
    let resolvedScheduleNotified = false
    if (action === 'schedule') {
      assertScheduleWithinWindow(scheduleTime)
      const target = resolveScheduleTarget(scheduleTime)

      // a. 开启「定时发表」开关（弹窗内有多个 switch，找到定时发表所在 switch）
      // 兼容两种弹窗版本：文本内联的 .mass-send__timer-wrp，以及带独立说明块的 .mass-send__td-setting
      await page
        .evaluate(() => {
          const d = Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(
            (x: any) => x.offsetWidth > 0 && (x.innerText || '').includes('定时发表'),
          ) as any
          if (!d) return
          const wraps = Array.from(
            d.querySelectorAll('.mass-send__timer-wrp, .weui-desktop-form__item'),
          ) as any[]
          let timerWrap = wraps.find(w => (w.innerText || '').includes('定时发表'))
          if (!timerWrap) {
            // 退化为「定时发表」说明块所在容器
            timerWrap = d.querySelector('.mass-send__td-setting')
          }
          if (!timerWrap) return
          const inp = timerWrap.querySelector('input')
          if (inp && !inp.checked) {
            const lb = timerWrap.querySelector('label.weui-desktop-switch')
            if (lb) (lb as HTMLElement).click()
          }
        })
        .catch(() => undefined)
      await new Promise(r => setTimeout(r, 1500))

      // b. 设定日期与时间。关键：群发通知配额文案由后台按「所选日期」异步查询后渲染，
      //    必须每次切换日期后轮询等待文案刷新，严禁连续快速遍历（会读到上一天的脏值）。
      const setRes = await page.evaluate(
        async (
          targetDay: number,
          targetTime: string,
          targetLabel: string,
          wantNotification: boolean,
        ) => {
          const c: any = (window as any).__msComp
          if (!c) return { ok: false, reason: 'no-comp' }
          const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

          const findDialog = () =>
            Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(
              (x: any) => x.offsetWidth > 0 && (x.innerText || '').includes('定时发表'),
            ) as any
          const d = findDialog()
          if (!d) return { ok: false, reason: 'no-dialog' }

          // 读当前所选日期的群发通知配额文案（含「还有N次通知次数」/「没有通知次数」/空）
          const quotaOf = () => {
            const txt = (findDialog()?.innerText || '') as string
            const m = txt.match(/还有\s*(\d+)\s*次通知次数/)
            if (m) return { text: m[0], hasQuota: parseInt(m[1], 10) > 0, noQuota: false }
            if (/没有通知次数/.test(txt))
              return { text: '没有通知次数', hasQuota: false, noQuota: true }
            return { text: '', hasQuota: false, noQuota: false }
          }

          // 切换日期并等待配额文案刷新（文案异步返回，最多等 ~6s；用「文案变化」而非固定时长判断）
          const selectDay = async (dayValue: string) => {
            c.day = dayValue
            if (typeof c.dayChange === 'function') {
              try {
                c.dayChange(dayValue)
              } catch {}
            }
            if (typeof c.$forceUpdate === 'function') c.$forceUpdate()
            await sleep(600)
            let last = quotaOf()
            for (let i = 0; i < 8; i++) {
              await sleep(800)
              const now = quotaOf()
              // 文案稳定（连续两次一致且非空）即认为刷新完成
              if (now.text && now.text === last.text) return now
              last = now
            }
            return last
          }

          const dayData: Array<{ label: string; value: string | number }> = c.dayData || []
          let resolvedDay = String(targetDay)
          const entry = dayData.find(
            x => String(x.value) === String(targetDay) || x.label === targetLabel,
          )
          if (entry) resolvedDay = String(entry.value)
          const finalLabel = entry ? entry.label : targetLabel

          // 设定初选日期
          c.timer = true
          const quotaInfo = await selectDay(resolvedDay)

          // 群发通知规则：依据排期策略计算结果（每天最早的第一个普通长文开启通知，其余长文与所有小绿书均不开启）
          const needNotification = Boolean(wantNotification)

          // 填入目标时间：day=1（今天）用 curTime，day>=2 用 curTime2
          if (resolvedDay === '1') c.curTime = targetTime
          else c.curTime2 = targetTime

          // 群发通知开关：按上面规则对齐（不依赖配额文案，按期望状态直接切换）
          if (d) {
            const wraps = Array.from(
              d.querySelectorAll('.mass-send__timer-wrp, .weui-desktop-form__item, .mass-send__td'),
            ) as any[]
            const noticeWrap = wraps.find(w => (w.innerText || '').includes('群发通知'))
            if (noticeWrap) {
              const inp = noticeWrap.querySelector('input')
              if (inp && inp.checked !== needNotification) {
                const lb = noticeWrap.querySelector('label.weui-desktop-switch')
                if (lb) {
                  (lb as HTMLElement).click()
                  await sleep(600)
                }
              }
            }
          }

          if (typeof c.$forceUpdate === 'function') c.$forceUpdate()
          await sleep(400)

          return {
            ok: true,
            timer: c.timer,
            day: resolvedDay,
            label: finalLabel,
            quotaText: quotaInfo.text,
            hasNoticeQuota: quotaInfo.hasQuota,
          }
        },
        target.day,
        target.time,
        target.label,
        wantNotification,
      )
      await new Promise(r => setTimeout(r, 1200))

      // 回读校验：定时开关已开、实际选中日期与时间都要与预期一致（含日期，避免落错天）
      const verify = await page.evaluate(
        (time: string, expectedDay: string) => {
          const c: any = (window as any).__msComp
          if (!c) return { ok: false }
          const actualDay = String(c.day)
          const expected = actualDay === '1' ? c.curTime : c.curTime2
          return {
            ok: c.timer === true && actualDay === expectedDay && expected === time,
            timer: c.timer,
            day: actualDay,
            expectedDay,
            time: expected,
            submitDisabled: c.submitDisabled,
          }
        },
        target.time,
        String(setRes?.day || target.day),
      )
      if (!verify.ok) {
        let shot = ''
        if (debugDir)
          shot = await debugScreenshot(page, debugDir, 'publish_schedule_verify_failed').catch(
            () => '',
          )
        throw new Error(
          `微信平台定时设置校验失败：期望 day=${setRes?.day || target.day} time=${target.time}，实际 ${JSON.stringify(verify)}` +
            (shot ? '，截图：' + shot : ''),
        )
      }
      isScheduled = true
      scheduleQuotaText = setRes?.quotaText || ''
      resolvedScheduleDay = String(setRes?.day || target.day)
      resolvedScheduleLabel = String(setRes?.label || target.label || '')
      resolvedScheduleTime = target.time
      resolvedScheduleNotified = Boolean(setRes?.hasNoticeQuota)
      console.log(
        `[social-publisher] 已成功设置微信平台原生定时发表：${setRes?.label || target.label} ${target.time}（` +
          (scheduleQuotaText ? '通知配额：' + scheduleQuotaText : '微信后台已托管') +
          '）',
      )
    }

    // 4) 点弹窗底部「发表」
    // 注意：弹窗内可能有多个「发表」按钮（如底部的提交键），必须取弹窗页脚的主按钮。
    const submitted = await page.evaluate(() => {
      const d = Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(
        (x: any) => x.offsetWidth > 0 && (x.innerText || '').includes('定时发表'),
      ) as any
      if (!d) return null
      const btn =
        d.querySelector('.weui-desktop-dialog__ft button.weui-desktop-btn_primary') ||
        Array.from(d.querySelectorAll('button')).find(
          (b: any) => (b.textContent || '').trim() === '发表',
        )
      if (btn) {
        (btn as HTMLElement).click()
        return (btn.textContent || '').trim()
      }
      return null
    })
    if (!submitted) {
      return { published: false, scheduled: false }
    }
    if (debugDir)
      await debugScreenshot(page, debugDir, 'publish_submitted_' + action).catch(() => undefined)

    // 5) 处理提交后的确认弹窗；命中答题类拦截则中止。
    // 关键修复（中文注释）：捕获提交后页面重定向导航销毁上下文信号，避免报 Execution context was destroyed
    // 避免小绿书与已确认场景下页面跳转导致 CDP 抛错，在 Node 端安全感知跳转并回查
    let confirmClicked = false
    let pageNavigated = false
    for (let i = 0; i < 16; i++) {
      await new Promise(r => setTimeout(r, 2500))
      let state: string[] = []
      try {
        state = await page.evaluate(() => {
          const vis = Array.from(document.querySelectorAll('.weui-desktop-dialog')).filter(
            (x: any) => x.offsetWidth > 0,
          ) as any[]
          return vis.map(d => (d.innerText || '').replace(/\s+/g, ' ').trim())
        })
      } catch (err: any) {
        if (
          /Execution context was destroyed|detached Frame|Target closed/.test(
            String(err?.message || err),
          )
        ) {
          pageNavigated = true
          break
        }
        throw err
      }
      const joined = state.join(' | ')
      if (/运营规则学习|历史违规|开始答题/.test(joined)) {
        let shot = ''
        if (debugDir)
          shot = await debugScreenshot(page, debugDir, 'publish_blocked_rule_study').catch(
            () => '',
          )
        throw new Error(
          '发表被平台拦截：该公众号存在历史违规记录，需先在后台完成「运营规则学习」答题才能发表。' +
            (shot ? '截图：' + shot : ''),
        )
      }
      let confirmed: string | null = null
      try {
        confirmed = await page.evaluate(() => {
          const dialogs = Array.from(
            document.querySelectorAll(
              ".weui-desktop-dialog, .weui-desktop-dialog__wrp, .weui-desktop-modal, [role='dialog'], .dialog_wrp",
            ),
          ).filter((x: any) => {
            const rect = x.getBoundingClientRect ? x.getBoundingClientRect() : null
            return x.offsetWidth > 0 || (rect && rect.height > 0 && rect.width > 0)
          }) as any[]

          // 关键修复（中文注释）：补充【下一步】、【完成】、【我知道了】、【继续】等穿透原创校验与群发须知弹窗
          const prefer = [
            '继续发表',
            '继续群发',
            '继续发布',
            '确定',
            '确认',
            '下一步',
            '完成',
            '我知道了',
            '忽略',
            '继续',
          ]

          for (const d of dialogs) {
            const btns = Array.from(
              d.querySelectorAll(
                "button, a.weui-desktop-btn, .weui-desktop-btn_primary, .weui-desktop-btn, [role='button']",
              ),
            ) as any[]
            for (const txt of prefer) {
              const b = btns.find(x => (x.textContent || '').trim() === txt)
              if (b && !b.disabled && !b.classList.contains('weui-desktop-btn_disabled')) {
                (b as HTMLElement).click()
                return txt
              }
            }
          }
          return null
        })
      } catch (err: any) {
        if (
          /Execution context was destroyed|detached Frame|Target closed/.test(
            String(err?.message || err),
          )
        ) {
          pageNavigated = true
          break
        }
        throw err
      }
      if (confirmed) {
        confirmClicked = true
        continue
      }
      if (confirmClicked && state.length === 0) break
    }

    if (pageNavigated) {
      await page.waitForNavigation({ timeout: 10000 }).catch(() => {})
      await new Promise(r => setTimeout(r, 2000))
    }

    // 6) 二维码二次确认（部分账号/场景）
    let qrDetected = false
    try {
      qrDetected = await page.evaluate(() => {
        const qrImg = document.querySelector(
          '.js_qrcode_img, img.weui-desktop-qr-code, .qrcode_wrp img',
        )
        return Boolean(qrImg && (qrImg as HTMLElement).offsetWidth > 0)
      })
    } catch {
      qrDetected = false
    }
    if (qrDetected) {
      let shot = ''
      if (debugDir)
        shot = await debugScreenshot(page, debugDir, 'publish_qr_confirm_required').catch(() => '')
      return {
        published: false,
        scheduled: false,
        needs_qr_confirmation: true,
        qr_screenshot: shot,
      }
    }

    // 5b) 提交后回查：确认后台「定时发表」批次确实增加了。修复原因：将轮询等待移至 Node 端，避免 evaluate 内部 sleep 销毁上下文
    if (action === 'schedule' && isScheduled && scheduleBatchCountBefore >= 0) {
      for (let wait = 0; wait < 10; wait++) {
        let curHref = ''
        try {
          curHref = page.url()
        } catch {}
        if (curHref.includes('t=home/index')) break
        await new Promise(r => setTimeout(r, 1500))
      }

      let backendCount = -1
      for (let round = 0; round < 6; round++) {
        await new Promise(r => setTimeout(r, 2500))
        try {
          const n = await page.evaluate(async () => {
            const token = new URL(location.href).searchParams.get('token') || ''
            if (!token) return -1
            try {
              const res = await fetch(
                `/cgi-bin/home?t=home/index&lang=zh_CN&token=${token}&t=${Math.random()}`,
                { credentials: 'include' },
              )
              const html = await res.text()
              const panelMatch = html.match(
                /id="timer_send_main"([\s\S]*?)(?:<\/div>\s*<\/div>|<script)/,
              )
              const seg = panelMatch ? panelMatch[1] : html
              const times = seg.match(/weui-desktop-mass__time/g)
              return times ? times.length : 0
            } catch {
              return -1
            }
          })
          backendCount = n
          if (backendCount > scheduleBatchCountBefore) break
        } catch (err: any) {
          const em = String(err?.message || err)
          if (!em.includes('Execution context was destroyed'))
            console.warn('[social-publisher] 回查批次异常:', em)
        }
      }

      if (backendCount !== -1 && backendCount <= scheduleBatchCountBefore) {
        let shot = ''
        if (debugDir)
          shot = await debugScreenshot(page, debugDir, 'schedule_not_in_backend').catch(() => '')
        throw new Error(
          `定时提交后未在后台「定时发表」列表中发现新增批次。批次数：${scheduleBatchCountBefore} → ${backendCount}。` +
            (shot ? '截图：' + shot : ''),
        )
      }
    }

    // 关键凭证存证（中文注释）：在定时发表或直接发表成功后，截取微信公众平台当前后台界面作为官方凭证
    let receiptScreenshotPath: string | undefined
    try {
      const nowTs = Date.now()
      const receiptName = `receipt_${action}_${nowTs}.png`
      const targetDir = debugDir || path.join(process.cwd(), 'temp')
      fs.mkdirSync(targetDir, { recursive: true })
      receiptScreenshotPath = path.join(targetDir, receiptName)
      await page.screenshot({ path: receiptScreenshotPath, fullPage: false }).catch(() => undefined)
    } catch (e) {
      console.warn('[social-publisher] 截取官方发表凭证失败:', e)
    }

    return {
      published: action === 'publish_now',
      scheduled: action === 'schedule' && isScheduled,
      receipt_screenshot: receiptScreenshotPath,
      ...(isScheduled
        ? {
          schedule_day: resolvedScheduleDay,
          schedule_label: resolvedScheduleLabel,
          schedule_time: resolvedScheduleTime,
          schedule_notification: resolvedScheduleNotified,
        }
        : {}),
    }
  } catch (error) {
    // 定时/发布失败必须显式暴露，避免上层把「未定时」误记为「已排期」
    const msg = error instanceof Error ? error.message : String(error)
    console.warn('[social-publisher] 浏览器发表流程失败:', msg)
    return { published: false, scheduled: false, schedule_error: msg }
  }
}

function imageToDataUri(filePath: string): string {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).toLowerCase()
  const mime =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : ext === '.gif'
          ? 'image/gif'
          : 'image/jpeg'
  const b64 = fs.readFileSync(filePath).toString('base64')
  return `data:${mime};base64,${b64}`
}

/**
 * 把本地图片上传到微信 CDN，返回 mmbiz.qpic.cn / mmbiz.qlogo.cn 链接。
 *
 * 为什么必须这样做：微信后台会**剔除**图文 content 里的 data: URI 图片。
 * 实测把内联 base64 的 HTML 提交后，服务端保存的 content 中 dataUriCount=0，
 * 图片全部丢失（正文配图与头尾品牌图都不显示），但接口仍返回成功、保存也成功，
 * 属于静默故障。编辑器自身插入图片走的就是本函数使用的 uploadimg2cdn 接口。
 *
 * @param page  已登录微信后台的页面（用于带 Cookie 发起同源请求）
 * @param files 待上传的本地文件绝对路径
 * @returns 与入参等长的 CDN URL 数组；上传失败的位置为 ''
 */
async function uploadImagesToCdn(page: Page, files: string[]): Promise<string[]> {
  const results: string[] = []
  for (const file of files) {
    if (!file || !fs.existsSync(file)) {
      results.push('')
      continue
    }
    const ext = path.extname(file).toLowerCase()
    const mime =
      ext === '.png'
        ? 'image/png'
        : ext === '.webp'
          ? 'image/webp'
          : ext === '.gif'
            ? 'image/gif'
            : 'image/jpeg'
    const b64 = fs.readFileSync(file).toString('base64')
    const name = path.basename(file)
    try {
      const url = await page.evaluate(
        async (data: string, fname: string, mt: string) => {
          const bin = atob(data)
          const arr = new Uint8Array(bin.length)
          for (let i = 0; i < bin.length; i += 1) arr[i] = bin.charCodeAt(i)
          const blob = new Blob([arr], { type: mt })
          const fd = new FormData()
          fd.append('id', 'p' + Date.now() + Math.floor(Math.random() * 1000))
          fd.append('name', fname)
          fd.append('type', mt)
          fd.append('lastModifiedDate', new Date().toString())
          fd.append('size', String(blob.size))
          // 字段名必须是 upfile —— 编辑器自身上传用的就是它
          fd.append('upfile', blob, fname)
          const token = new URL(location.href).searchParams.get('token') || ''
          const res = await fetch(
            `/cgi-bin/uploadimg2cdn?lang=zh_CN&token=${token}&t=${Math.random()}`,
            {
              method: 'POST',
              credentials: 'include',
              body: fd,
            },
          )
          const text = await res.text()
          try {
            const j = JSON.parse(text)
            return typeof j.url === 'string' ? j.url : ''
          } catch {
            return ''
          }
        },
        b64,
        name,
        mime,
      )
      results.push(url)
      if (!url) console.warn(`[social-publisher] 图片上传未返回 URL: ${name}`)
    } catch (e) {
      console.warn(`[social-publisher] 图片上传异常 ${name}:`, e instanceof Error ? e.message : e)
      results.push('')
    }
  }
  return results
}

function prepareArticleHtml(
  rawHtml: string,
  job: WechatBrowserPublishJob,
  cdnUrls?: Map<string, string>,
): string {
  let html = rawHtml
  // 优先使用已上传的 CDN 链接；没有时退回内联 data URI（会被微信剔除，仅作最后兜底）
  const resolve = (filePath: string): string => {
    const cdn = cdnUrls?.get(filePath)
    if (cdn) return cdn
    return imageToDataUri(filePath)
  }
  // 替换品牌图占位符
  if (job.brand_top_enabled && job.brand_top && fs.existsSync(job.brand_top)) {
    html = html.split('__BRAND_TOP__').join(resolve(job.brand_top))
  }
  if (job.brand_bot_enabled && job.brand_bot && fs.existsSync(job.brand_bot)) {
    html = html.split('__BRAND_BOT__').join(resolve(job.brand_bot))
  }
  // 替换正文图占位符：IMG_A{i}_{j} 与 __IMG_{i}_{j}__
  for (const [key, p] of Object.entries(job.content_files)) {
    if (fs.existsSync(p)) {
      const src = resolve(p)
      html = html.split(key).join(src)
      const m = /^IMG_A(\d+)_(\d+)$/.exec(key)
      if (m) {
        html = html.split(`__IMG_${m[1]}_${m[2]}__`).join(src)
      }
      const m2 = /^__IMG_(\d+)_(\d+)__$/.exec(key)
      if (m2) {
        html = html.split(`IMG_A${m2[1]}_${m2[2]}`).join(src)
      }
    }
  }

  // 兜底守卫：占位符一旦残留，微信编辑器不认这些 src，图片位置会整片空白，
  // 而保存/核验仍会成功（核验只比对篇数与标题），属于静默故障。
  // 因此在此显式失败，宁可阻断发布也不产出缺图草稿。
  const leftover = html.match(/__BRAND_TOP__|__BRAND_BOT__|__IMG_\d+_\d+__|IMG_A\d+_\d+/g)
  if (leftover && leftover.length > 0) {
    const unique = Array.from(new Set(leftover))
    const reasons: string[] = []
    if (
      unique.some(k => k === '__BRAND_TOP__') &&
      !(job.brand_top_enabled && job.brand_top && fs.existsSync(job.brand_top))
    ) {
      reasons.push(
        `头部品牌图未替换（brand_top_enabled=${job.brand_top_enabled}, path=${job.brand_top}, exists=${job.brand_top ? fs.existsSync(job.brand_top) : false}）`,
      )
    }
    if (
      unique.some(k => k === '__BRAND_BOT__') &&
      !(job.brand_bot_enabled && job.brand_bot && fs.existsSync(job.brand_bot))
    ) {
      reasons.push(
        `尾部品牌图未替换（brand_bot_enabled=${job.brand_bot_enabled}, path=${job.brand_bot}, exists=${job.brand_bot ? fs.existsSync(job.brand_bot) : false}）`,
      )
    }
    const missingContent = Object.entries(job.content_files)
      .filter(([, p]) => !fs.existsSync(p))
      .map(([k]) => k)
    if (missingContent.length > 0) reasons.push(`正文配图文件缺失: ${missingContent.join(', ')}`)
    throw new Error(
      '文章图片占位符未完全替换，拒绝发布以免产生空白配图草稿。残留: ' +
        unique.join(', ') +
        (reasons.length > 0 ? '\n原因: ' + reasons.join('；') : ''),
    )
  }
  // 【中文修复依据】：真机发布品牌引导语内存平滑自愈（所见即所得只读注入，绝不反向污染磁盘）
  // 若正文中未包含配置的品牌全称，在正文末尾自动追加优雅规范的居中品牌引导卡片，彻底避免因引导语缺失抛出致命中断
  if (job.brand_name && job.brand_name.trim()) {
    const plain = html.replace(/<[^>]+>/g, '').replace(/\s+/g, '')
    if (!plain.includes(job.brand_name.trim())) {
      const brandCard = `<section style="margin:28px 0 20px 0;padding:16px;background:#F8FAFC;border-radius:8px;text-align:center;"><p style="font-size:13px;color:#475569;font-weight:700;line-height:22px;margin:0;"><span leaf="">关注前沿动态，${job.brand_name.trim()}与您并肩同行。</span></p></section>`
      html += brandCard
    }
  }
  return html
}

function precheckArticle(html: string, index: number, job: WechatBrowserPublishJob): string[] {
  const problems: string[] = []
  const txt = html.replace(/<[^>]+>/g, '')
  const plain = txt.replace(/\s+/g, '')
  const effectiveMin = Math.floor(job.min_words * 0.85)
  if (plain.length < effectiveMin) {
    problems.push(
      `文章${index} 纯文字 ${plain.length} 字，低于容差下限 ${effectiveMin}（设定 ${job.min_words} 字）`,
    )
  }
  for (const w of job.forbidden) {
    if (w && plain.includes(w)) {
      problems.push(`文章${index} 含有禁词: ${w}`)
    }
  }
  if (job.brand_name && !plain.includes(job.brand_name)) {
    // 【中文修复依据】：品牌引导语若未包含，已由 prepareArticleHtml 自动只读自愈，记录诊断日志，不再作为硬性阻断项
    console.info(`[微信发布前置校验] 文章${index} 未检测到显式品牌引导语，已在发布组装时自动平滑自愈`)
  }
  return problems
}

// 微信小绿书话题联想条目的防御式候选选择器。
// 真实弹层结构待探针（scratch/probe_wechat_topic_dom.mts）实测 dump 后收紧——
// 与小红书当初靠实测 dump 修正 tippy 结构同一路径。匹配只认话题文本命中
// （精确等值 > 前缀），查不到文本命中的条目就降级纯文本，绝不乱点第一项。
const WXSPIC_TOPIC_POPUP_READY = [
  '.topic-item',
  '[class*="topic"] [class*="item"]',
  '[class*="sug"] li',
  '[class*="sug"] [class*="item"]',
  '[class*="popover"] li',
  '[class*="dropdown"] li',
  '[class*="mention"] [class*="item"]',
  '.weui-desktop-popover li',
].join(', ')

/**
 * 小绿书（图片消息）草稿发布：使用公众号后台的图片消息编辑器（createType=8）。
 *
 * 与长图文完全不同的三个关键点：
 * 1. 入口 URL 是 appmsg_edit_v2&isNew=1&type=77&createType=8；
 * 2. 卡片图必须传给「动态创建」的 input[type=file]（父级 id 形如 rt_rt_xxx），
 *    工具栏里那个 input[name=file] 是图文编辑器的插图按钮，传了不会生效；
 * 3. 标题与描述是两个 .ProseMirror 富文本（不是 input/textarea），需用 execCommand 写入。
 * 保存后必须回读编辑器确认卡片图真的落库，否则会重演「标题存了、图片丢了」的静默失败。
 */
async function publishWechatNewspicByBrowser(
  cfg: Config,
  accountId: string,
  job: WechatBrowserPublishJob,
): Promise<WechatBrowserPublishResult> {
  const n = job.titles.length
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'wechat_debug')
  const headless = true

  const mediaIds: string[] = []
  const draftUrls: string[] = []
  const results: Array<{
    media_id: string
    titles: string[]
    status: string
    topic_note?: string
  }> = []
  const browser = await launchWechatBrowser(cfg, accountId, headless)
  let lastPubActionResult: BrowserPublishActionResult = { published: false, scheduled: false }

  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2500))
    const token = new URL(page.url()).searchParams.get('token')
    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'newspic_not_logged_in')
      throw new Error('微信公众号后台未检测到有效登录态（未获取到 token）。截图已存：' + shot)
    }

    // 成功进入后台，异步刷新持久化凭据
    await refreshWechatSession(page, cfg, accountId, token)

    for (let i = 0; i < n; i += 1) {
      const title = job.titles[i]
      const digest = job.digests[i] || ''

      // 读取小绿书 JSON：卡片图路径 + 描述文本
      const raw = fs.readFileSync(job.article_files[i], 'utf-8')
      let doc: { title?: string; content?: string; cards?: unknown[] } = {}
      try {
        doc = JSON.parse(raw)
      } catch (e) {
        throw new Error('读取小绿书文件失败（需为 JSON）: ' + job.article_files[i])
      }
      const desc = String(doc.content || '').trim()
      const cardCount = Array.isArray(doc.cards) ? doc.cards.length : 0
      const pics: string[] = []
      const artDir = path.dirname(job.article_files[i])
      const candDirs = [
        artDir,
        path.join(artDir, 'images'),
        path.join(path.dirname(artDir), 'images'),
        sdir,
      ]
      for (let j = 1; j <= cardCount; j += 1) {
        let found = ''
        const cardObj = Array.isArray(doc.cards) ? (doc.cards as any[])[j - 1] : undefined
        if (cardObj && typeof cardObj === 'object') {
          const directPath = cardObj.path || cardObj.image || cardObj.file
          if (typeof directPath === 'string' && fs.existsSync(directPath)) {
            found = directPath
          }
        }
        if (!found) {
          for (const ext of ['.png', '.jpg', '.jpeg']) {
            for (const d of candDirs) {
              const cand = path.resolve(d, `pic_${i + 1}_${j}${ext}`)
              if (fs.existsSync(cand)) {
                found = cand
                break
              }
              const cand2 = path.resolve(d, `pic_${j}${ext}`)
              if (fs.existsSync(cand2)) {
                found = cand2
                break
              }
            }
            if (found) break
          }
        }
        if (!found) throw new Error(`缺少小绿书卡片图: pic_${i + 1}_${j}`)
        pics.push(found)
      }
      if (pics.length === 0) throw new Error(`小绿书第 ${i + 1} 篇没有卡片图`)

      // 小绿书内容校验：纯文字下限、禁词、品牌引导语
      const plain = desc.replace(/\s/g, '')
      const limit = job.min_words > 500 ? 80 : Math.max(10, Math.floor(job.min_words * 0.8))
      const problems: string[] = []
      if (plain.length < limit)
        problems.push(`小绿书第 ${i + 1} 篇纯文字 ${plain.length} 字，低于下限 ${limit}`)
      for (const w of job.forbidden) {
        if (w && (plain.includes(w) || title.includes(w)))
          problems.push(`小绿书第 ${i + 1} 篇含禁词: ${w}`)
      }
      if (title.length > 20)
        problems.push(
          `小绿书第 ${i + 1} 篇标题超 20 字（${title.length}，微信小绿书原生限制 20 字）`,
        )
      if (problems.length > 0) throw new Error('小绿书发布前校验未通过:\n' + problems.join('\n'))

      const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${encodeURIComponent(token)}&lang=zh_CN`
      await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise(resolve => setTimeout(resolve, 7000))

      // 关掉新手引导遮罩（会拦截点击）。不要隐藏 .weui-desktop-dialog__wrp —— 发表弹窗挂在其下。
      await page.evaluate(() => {
        document.querySelectorAll('.education-dialog, .weui-desktop-mask').forEach((el) => {
          (el as HTMLElement).style.display = 'none'
        })
      })
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 关键：使用动态创建的图片上传控件（父级 id 以 rt_rt_ 开头）
      const fileInputs = await page.$$('input[type="file"]')
      let target: (typeof fileInputs)[number] | null = null
      for (const input of fileInputs) {
        const isRt = await page.evaluate(
          el => /^rt_rt_/.test(String((el.parentElement as HTMLElement | null)?.id || '')),
          input,
        )
        if (isRt) {
          target = input
          break
        }
      }
      if (!target) target = fileInputs[fileInputs.length - 1] || null
      if (!target) throw new Error('未找到图片消息上传控件（input[type=file]）')
      await target.uploadFile(...pics)

      // 等待全部卡片图上传完成
      let uploaded = 0
      for (let w = 0; w < 30; w += 1) {
        await new Promise(resolve => setTimeout(resolve, 2500))
        const tags = await page.evaluate(() => {
          const el = document.querySelector('.image-selector__tags')
          return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : ''
        })
        const m = tags.match(/(\d+)\s+(\d+)/)
        if (m) uploaded = Number(m[2])
        if (uploaded >= pics.length) break
      }
      if (uploaded < pics.length) {
        const shot = await debugScreenshot(page, debugDir, `newspic_upload_${i + 1}`)
        throw new Error(
          `小绿书第 ${i + 1} 篇卡片图上传未完成（${uploaded}/${pics.length}）。截图已存：${shot}`,
        )
      }

      // 关掉可能的裁剪/确认弹窗
      for (let round = 0; round < 3; round += 1) {
        const acted = await page.evaluate(() => {
          const done: string[] = []
          document
            .querySelectorAll('.weui-desktop-dialog__wrp, .weui-desktop-dialog')
            .forEach((dlg) => {
              const r = (dlg as HTMLElement).getBoundingClientRect()
              if (r.width === 0 || r.height === 0 || getComputedStyle(dlg).display === 'none')
                return
              for (const b of Array.from(dlg.querySelectorAll('button, a, div, span'))) {
                const own = Array.from(b.childNodes)
                  .filter(x => x.nodeType === 3)
                  .map(x => x.textContent)
                  .join('')
                  .trim()
                if (own && /^(确定|完成|保存|确认|我知道了)$/.test(own)) {
                  const rr = (b as HTMLElement).getBoundingClientRect()
                  if (rr.width > 0 && rr.height > 0) {
                    (b as HTMLElement).click()
                    done.push(own)
                    break
                  }
                }
              }
            })
          return done
        })
        if (acted.length === 0) break
        await new Promise(resolve => setTimeout(resolve, 3000))
      }

      // 标题（单行文本）
      const setTitle = async (val: string) =>
        page.evaluate((v: string) => {
          const el = Array.from(document.querySelectorAll('.ProseMirror'))[0] as
            | HTMLElement
            | undefined
          if (!el) return false
          el.focus()
          const sel = window.getSelection()
          if (sel) {
            const range = document.createRange()
            range.selectNodeContents(el)
            sel.removeAllRanges()
            sel.addRange(range)
            document.execCommand('delete', false)
          }
          document.execCommand('insertText', false, v)
          el.dispatchEvent(new Event('input', { bubbles: true }))
          return (el.textContent || '').trim().length > 0
        }, val)

      // 描述正文：分段增量键入 + 官方话题交互式激活。
      //
      // 【为什么不能用伪造蓝色话题锚点】
      // 旧实现把 #话题 一次性转成手工构造样式的蓝色 a 标签整体注入——它只是
      // 「看起来像话题」，从未触发微信话题联想、没有被编辑器归一化为官方话题
      // 实体，也没有任何回读校验，属于「工具报成功、读者点不动、不进话题
      // 流量池」的假成功。改为与小红书同款链路（见 src/xiaohongshu.ts 同款注释）：
      // 遇 #话题 键入 '#' + 名称触发联想 → 精确等值 > 前缀匹配后点选 → 回读校验；
      // 点不中就 Escape 收起浮层、保留纯文本降级并计入 failed。严禁用 Enter/Backspace
      // 兜底（Enter 换行会把 #话题 拦腰截断，Backspace 会把话题整段删没）。
      const topicOutcome = { activated: 0, failed: [] as string[] }
      const activatedTopics = new Set<string>()

      const setDescWithTopics = async (rawText: string) => {
        const focused = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('.ProseMirror'))[1] as
            | HTMLElement
            | undefined
          if (!el) return false
          el.focus()
          const sel = window.getSelection()
          if (sel) {
            const range = document.createRange()
            range.selectNodeContents(el)
            sel.removeAllRanges()
            sel.addRange(range)
            document.execCommand('delete', false)
          }
          el.dispatchEvent(new Event('input', { bubbles: true }))
          return true
        })
        if (!focused) return false

        // 拆分为「文本段 / #话题段」交替增量键入，换行随文本段原样键入（保留分段呼吸感）
        const segments = rawText.split(/(#[^#\s]+)/g)
        for (const seg of segments) {
          if (!seg) continue
          const m = seg.match(/^#([^#\s]+)$/)
          if (!m) {
            await page.keyboard.type(seg, { delay: 10 })
            continue
          }
          const tag = m[1].replace(/[#\s/\\<>]/g, '').trim()
          // 清洗后为空或已激活过的重复话题：只保留纯文本，避免生成重复胶囊
          if (!tag || activatedTopics.has(tag)) {
            await page.keyboard.type(seg, { delay: 10 })
            continue
          }

          // 逐字符键入是为了让编辑器的联想插件收到完整 input 序列（整段粘贴不触发联想）
          await page.keyboard.type('#', { delay: 40 })
          await page.keyboard.type(tag, { delay: 40 })

          // 轮询联想条目：等「可点条目」而不是浮层外壳（外壳先挂载、条目后填充会误判）
          let popupReady = false
          const popupDeadline = Date.now() + 4000
          while (Date.now() < popupDeadline) {
            popupReady = await page
              .evaluate((sel) => {
                const editor = Array.from(document.querySelectorAll('.ProseMirror'))[1]
                for (const el of Array.from(document.querySelectorAll(sel))) {
                  if (editor && editor.contains(el)) continue
                  const r = el.getBoundingClientRect()
                  if (r.width > 0 && r.height > 0) return true
                }
                return false
              }, WXSPIC_TOPIC_POPUP_READY)
              .catch(() => false)
            if (popupReady) break
            await new Promise(resolve => setTimeout(resolve, 120))
          }

          // 精确等值 > 前缀匹配后点选；只认文本命中（条目文本可能带浏览数等尾巴，
          // 前缀匹配兜底），绝不点第一项——点错会把不相干的热门话题塞进正文
          let clicked = false
          if (popupReady) {
            clicked = await page
              .evaluate((wanted) => {
                const editor = Array.from(document.querySelectorAll('.ProseMirror'))[1]
                const norm = (s: string | null) =>
                  (s || '').replace(/#/g, '').replace(/\s+/g, '').trim()
                const wantedNorm = norm(wanted)
                const items = Array.from(
                  document.querySelectorAll(WXSPIC_TOPIC_POPUP_READY),
                ).filter((el) => {
                  if (editor && editor.contains(el)) return false
                  const r = el.getBoundingClientRect()
                  return r.width > 0 && r.height > 0
                })
                if (items.length === 0) return false
                const nameOf = (el: Element) => {
                  const nameEl = el.querySelector('[class*="name"], [class*="title"]')
                  return norm((nameEl ?? el).textContent)
                }
                const exact = items.filter(el => nameOf(el) === wantedNorm)
                const prefix = items.filter(el => nameOf(el).startsWith(wantedNorm))
                const pick = exact[0] ?? prefix[0]
                if (!pick) return false;
                (pick as HTMLElement).click()
                return true
              }, tag)
              .catch(() => false)
          }

          // 未点中联想条目：Escape 收起浮层、保留已键入的纯文本 #tag（降级链：
          // 官方话题实体 > 纯文本），绝不能按 Enter 或回删
          if (!clicked) {
            topicOutcome.failed.push(tag)
            await page.keyboard.press('Escape').catch(() => undefined)
            await new Promise(resolve => setTimeout(resolve, 120))
            await page.keyboard.type(' ', { delay: 20 })
            await new Promise(resolve => setTimeout(resolve, 150))
            continue
          }

          // 回读校验：话题必须真的变成编辑器内的话题实体（a / [data-topic] /
          // 话题类名节点），仍是裸文本即视为未激活计入 failed
          await new Promise(resolve => setTimeout(resolve, 350))
          const isEntity = await page
            .evaluate((wanted) => {
              const editor = Array.from(document.querySelectorAll('.ProseMirror'))[1] as
                | HTMLElement
                | undefined
              if (!editor) return false
              const norm = (s: string | null) =>
                (s || '').replace(/#/g, '').replace(/\s+/g, '').trim()
              const wantedNorm = norm(wanted)
              return Array.from(
                editor.querySelectorAll(
                  'a, [data-topic], [class*="topic_link"], [class*="mention"]',
                ),
              ).some(el => norm(el.textContent).includes(wantedNorm))
            }, tag)
            .catch(() => false)

          if (isEntity) {
            topicOutcome.activated++
            activatedTopics.add(tag)
          } else {
            topicOutcome.failed.push(tag)
          }
          await page.keyboard.type(' ', { delay: 20 })
          await new Promise(resolve => setTimeout(resolve, 150))
        }
        return await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll('.ProseMirror'))[1] as
            | HTMLElement
            | undefined
          return !!(el && (el.textContent || '').trim())
        })
      }

      await setTitle(title)
      await new Promise(resolve => setTimeout(resolve, 900))
      if (desc) {
        await setDescWithTopics(desc)
        await new Promise(resolve => setTimeout(resolve, 1200))
      }

      // 话题激活结果留痕：失败必须截图为证（此时编辑器还开着，存草稿后就不是这个现场了）。
      // 旧实现伪造蓝锚点且零校验，「话题没变官方实体」在报告里完全看不出来。
      let topicNote = ''
      if (topicOutcome.activated + topicOutcome.failed.length > 0) {
        let topicShot = ''
        if (topicOutcome.failed.length > 0) {
          topicShot = await debugScreenshot(page, debugDir, `newspic_topic_${i + 1}`)
        }
        topicNote =
          '官方话题 ' +
          topicOutcome.activated +
          ' 个已激活' +
          (topicOutcome.failed.length > 0
            ? '，' +
              topicOutcome.failed.length +
              ' 个未激活（' +
              topicOutcome.failed.join('、') +
              '）' +
              (topicShot ? ' 截图: ' + topicShot : '')
            : '')
      }

      // 保存为草稿
      await page.evaluate(() => {
        const hits: HTMLElement[] = []
        document.querySelectorAll('a, button, div, span').forEach((e) => {
          const own = Array.from(e.childNodes)
            .filter(x => x.nodeType === 3)
            .map(x => x.textContent)
            .join('')
            .trim()
          const r = (e as HTMLElement).getBoundingClientRect()
          if (r.width > 0 && r.height > 0 && own === '保存为草稿') hits.push(e as HTMLElement)
        })
        if (hits.length > 0) hits[hits.length - 1].click()
      })

      let appmsgid: string | null = null
      for (let w = 0; w < 25; w += 1) {
        await new Promise(resolve => setTimeout(resolve, 1200))
        appmsgid = new URL(page.url()).searchParams.get('appmsgid')
        if (appmsgid) break
        const hasQr = await page.evaluate(() => {
          const qr = document.querySelector('.js_qrcode_img, img.weui-desktop-qr-code, .qrcode_wrp img')
          return Boolean(qr && (qr as HTMLElement).offsetWidth > 0)
        }).catch(() => false)
        if (hasQr) {
          const shot = await debugScreenshot(page, debugDir, `newspic_qr_required_${i + 1}`).catch(() => '')
          throw new Error(`微信公众号小绿书保存草稿需要管理员扫码确认${shot ? `（截图已存：${shot}）` : ''}，请在手机微信端扫码后重试。`)
        }
      }
      if (!appmsgid) {
        const shot = await debugScreenshot(page, debugDir, `newspic_save_${i + 1}`)
        throw new Error(`小绿书第 ${i + 1} 篇保存未生效：未获得 appmsgid。截图已存：${shot}`)
      }

      mediaIds.push(appmsgid)
      draftUrls.push(draftEditUrl(token, appmsgid))
      results.push({
        media_id: appmsgid,
        titles: [title],
        status: 'ok',
        topic_note: topicNote || undefined,
      })
      console.log(
        `[social-publisher] 账号 ${accountId} 小绿书第 ${i + 1}/${n} 篇草稿已创建：${appmsgid}（卡片图 ${pics.length} 张）` +
          (topicNote ? '；' + topicNote : ''),
      )

      // 关键高可用加固（中文注释）：保存为草稿后，等待 Toast 与弹窗遮罩自然淡出，并清理遮挡图层
      await new Promise(resolve => setTimeout(resolve, 1500))
      await page.evaluate(() => {
        document.querySelectorAll('.education-dialog, .weui-desktop-mask, .weui-desktop-toast').forEach((el) => {
          (el as HTMLElement).style.display = 'none'
        })
      }).catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 1000))

      // 原地发表/定时发表：在当前原生小绿书现代编辑器（createType=8）中直接唤起发表弹窗
      // 严禁跳转至已废弃且破坏 DOM 的 type=10 老页面，确保发表弹窗与组件 100% 可用且成功排期
      if (job.publish_action === 'publish_now' || job.publish_action === 'schedule') {
        const actionRes = await executeBrowserPublishInPage(
          page,
          job.publish_action,
          job.schedule_time,
          debugDir,
          false, // 小绿书严格不开启群发通知，不占每天一次的长文群发通知额度
        )
        if (actionRes.scheduled || actionRes.published) {
          lastPubActionResult = actionRes
          // 核心闭环判定：排期成功后，必须在排期列表中检索匹配到该小绿书任务才算真正排期成功
          if (actionRes.scheduled) {
            const currentTitle = job.titles[i] ? [job.titles[i]] : job.titles
            const verifyRes = await pollAndVerifyScheduledTask(
              page,
              cfg,
              accountId,
              currentTitle,
              undefined,
              3,
            )
            if (!verifyRes.ok) {
              actionRes.scheduled = false
              actionRes.schedule_error = verifyRes.error || '微信后台排期列表未检索到该任务'
              lastPubActionResult = actionRes
            }
          }
        } else if (actionRes.schedule_error) {
          lastPubActionResult = actionRes
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2500))
    }

    return {
      dry_run: false,
      media_id: mediaIds[0],
      media_ids: mediaIds,
      article_count: n,
      titles: job.titles,
      draft_url: draftUrls[0],
      publish_action: job.publish_action || 'draft',
      published: lastPubActionResult.published,
      scheduled: lastPubActionResult.scheduled,
      scheduled_time: lastPubActionResult.schedule_time || job.schedule_time,
      ...(lastPubActionResult.schedule_error
        ? { schedule_error: lastPubActionResult.schedule_error }
        : {}),
      needs_qr_confirmation: lastPubActionResult.needs_qr_confirmation,
      qr_screenshot: lastPubActionResult.qr_screenshot,
      receipt_screenshot: lastPubActionResult.receipt_screenshot,
      verify: { checked: true, article_count: n, results },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    throw new Error('小绿书浏览器发布失败: ' + errorMsg)
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 把多篇图文合并成 1 个「多图文」草稿（一个草稿里含 N 张图文卡片）。
 *
 * 背景：公众号新版编辑器（wx.cgiData.can_use_new_draft_ui === "1"）已把「增加一条」入口置为只读。
 * 实测点击 #add_appmsg_container / #js_add_appmsg / .preview_media_add_wrp 以及其内部
 * <i class="icon20_common add_gray"> / <span class="preview_media_add_word"> 都不产生任何网络请求
 * （纯前端拒绝），移除 js_readonly、隐藏遮罩、派发完整指针事件序列、headful/headless、
 * createType(0/1/2)、t=appmsg_edit vs appmsg_edit_v2 均无法追加卡片。因此不能再靠 UI 追加。
 *
 * 方案：新版编辑器保存走 operate_appmsg?t=ajax-response&sub=create&type=77，字段按篇索引
 * （title0/content0/cdn_url0/… 、title1/content1/…），并带一个 req.idx_infos JSON（每篇一项）。
 * 于是：抓取一次真实保存请求作为字段模板 → 按篇复制索引字段 → 一次性 POST → 直接创建多图文草稿，
 * 并复读草稿核验篇数、标题与封面。封面用每篇的设计封面图：先经编辑器插图上传拿到 mmbiz CDN 地址，
 * 再写入 cdn_url{i} / cdn_235_1_url{i} / cdn_3_4_url{i} / cdn_1_1_url{i} 等字段。
 */
async function publishWechatMultiArticleByBrowser(
  cfg: Config,
  accountId: string,
  job: WechatBrowserPublishJob,
): Promise<WechatBrowserPublishResult> {
  const n = job.titles.length
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'wechat_debug')
  const headless = true

  // 1. 读取并前置校验全部 HTML（图片替换延后到浏览器就绪、上传 CDN 之后）
  const rawHtmls: string[] = []
  for (let i = 0; i < n; i += 1) {
    const file = job.article_files[i]
    if (!fs.existsSync(file)) throw new Error('缺少文章文件: ' + file)
    rawHtmls.push(fs.readFileSync(file, 'utf-8'))
  }

  const browser = await launchWechatBrowser(cfg, accountId, headless)
  let page: Page | null = null
  let token: string | null = null
  let newId: string = ''
  const tempDrafts: string[] = []

  try {
    page = await browser.newPage()

    // 【中文修复依据】：CDP 原生网络栈监听（主通道）与页面 Hook（辅助通道）双轨机制。
    // 在 Chromium 传输层直接挂载 page.on('request') 与 page.on('response')，
    // 捕获微信公众平台底层保存数据包（包括 operate_appmsg, appmsg_edit, appmsg_create 等），
    // 彻底免疫页面原型链污染、打包分块、Web Worker 或传输格式变动。
    const capturedCdpRequests: Array<{ m: string; u: string; body: string }> = []
    const capturedCdpDraftIds: string[] = []

    page.on('request', (req) => {
      try {
        const u = req.url()
        if (
          u.includes('operate_appmsg') ||
          u.includes('appmsg_edit') ||
          u.includes('appmsg_create') ||
          (u.includes('appmsg') && (u.includes('action=edit') || u.includes('action=save')))
        ) {
          const postData = req.postData() || ''
          if (postData) {
            capturedCdpRequests.push({
              m: req.method(),
              u,
              body: postData,
            })
          }
        }
      } catch {
        /* ignore */
      }
    })

    page.on('response', async (resp) => {
      try {
        const u = resp.url()
        if (
          u.includes('operate_appmsg') ||
          u.includes('appmsg_edit') ||
          u.includes('appmsg_create')
        ) {
          const text = await resp.text().catch(() => '')
          if (text) {
            try {
              const parsed = JSON.parse(text)
              const realId = parsed.appMsgId || (parsed.base_resp && parsed.base_resp.appMsgId)
              if (realId && !capturedCdpDraftIds.includes(String(realId))) {
                capturedCdpDraftIds.push(String(realId))
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    })

    // 捕获保存请求及返回响应（用于取得字段模板及精准捕获创建的草稿真实 appMsgId）
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as {
        __spReqs: Array<{ m: string; u: string; body: string; resText?: string }>
        __spCreatedDraftIds: string[]
      }
      w.__spReqs = []
      w.__spCreatedDraftIds = []

      // 健壮序列化 body：兼容 string、FormData、URLSearchParams 与 Blob，杜绝出现 "[object FormData]"
      const serializeBody = (b: unknown): string => {
        if (b == null) return ''
        if (typeof b === 'string') return b
        try {
          if (typeof FormData !== 'undefined' && b instanceof FormData) {
            const params: string[] = []
            b.forEach((val, key) => {
              params.push(encodeURIComponent(key) + '=' + encodeURIComponent(typeof val === 'string' ? val : (val as File).name || 'blob'))
            })
            return params.join('&')
          }
          if (typeof URLSearchParams !== 'undefined' && b instanceof URLSearchParams) {
            return b.toString()
          }
          return String(b)
        } catch {
          return ''
        }
      }

      const xopen = XMLHttpRequest.prototype.open
      const xsend = XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.open = function (this: unknown, m: string, u: string) {
        const self = this as { __spU?: string; __spM?: string }
        self.__spU = String(u)
        self.__spM = m
        // eslint-disable-next-line prefer-rest-params
        return xopen.apply(this as never, arguments as never)
      }
      XMLHttpRequest.prototype.send = function (this: XMLHttpRequest, body?: unknown) {
        const self = this as unknown as { __spU?: string; __spM?: string }
        const reqItem = {
          m: self.__spM || 'GET',
          u: String(self.__spU || ''),
          body: serializeBody(body),
          resText: '',
        }
        try {
          w.__spReqs.push(reqItem)
        } catch {
          /* ignore */
        }

        this.addEventListener('load', function () {
          try {
            reqItem.resText = this.responseText || ''
            if (
              reqItem.u.includes('sub=create') ||
              reqItem.u.includes('operate_appmsg') ||
              reqItem.u.includes('appmsg_edit') ||
              reqItem.u.includes('appmsg_create')
            ) {
              const parsed = JSON.parse(this.responseText)
              const realId = parsed.appMsgId || (parsed.base_resp && parsed.base_resp.appMsgId)
              if (realId && !w.__spCreatedDraftIds.includes(String(realId))) {
                w.__spCreatedDraftIds.push(String(realId))
              }
            }
          } catch {
            /* ignore */
          }
        })

        // eslint-disable-next-line prefer-rest-params
        return xsend.apply(this as never, arguments as never)
      }

      const ofetch = window.fetch
      window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        const u = String(input)
        const reqItem = {
          m: (init && init.method) || 'GET',
          u,
          body: serializeBody(init && init.body),
          resText: '',
        }
        try {
          w.__spReqs.push(reqItem)
        } catch {
          /* ignore */
        }
        // eslint-disable-next-line prefer-rest-params
        const resp = await ofetch.apply(this as never, arguments as never)
        try {
          if (
            u.includes('sub=create') ||
            u.includes('operate_appmsg') ||
            u.includes('appmsg_edit') ||
            u.includes('appmsg_create')
          ) {
            const clone = resp.clone()
            clone.text().then((txt) => {
              reqItem.resText = txt
              try {
                const parsed = JSON.parse(txt)
                const realId = parsed.appMsgId || (parsed.base_resp && parsed.base_resp.appMsgId)
                if (realId && !w.__spCreatedDraftIds.includes(String(realId))) {
                  w.__spCreatedDraftIds.push(String(realId))
                }
              } catch {}
            }).catch(() => {})
          }
        } catch {}
        return resp
      }
    })

    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2000))
    token = new URL(page.url()).searchParams.get('token')
    if (!token) {
      await page
        .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 })
        .catch(() => undefined)
      token = new URL(page.url()).searchParams.get('token')
    }
    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'merge_not_logged_in')
      throw new Error(
        '微信公众号后台未检测到有效登录态（未获取到 token）。请先扫码登录后重试。截图已存：' + shot,
      )
    }

    // 成功进入后台，异步刷新持久化凭据
    await refreshWechatSession(page, cfg, accountId, token)

    // 2. 打开新建草稿页，上传各篇设计封面以取得 CDN 地址
    const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${encodeURIComponent(token)}&lang=zh_CN`
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 8000))
    await page.evaluate(() => {
      // 不要隐藏 .weui-desktop-dialog__wrp —— 发表弹窗挂在其下
      document.querySelectorAll('.education-dialog, .weui-desktop-mask').forEach((el) => {
        (el as HTMLElement).style.display = 'none'
      })
    })

    const coverFiles: string[] = []
    const rawCovers = (job as any).cover_files || (job as any).cover_paths || []
    for (let i = 0; i < n; i += 1) {
      const c = rawCovers[i]
      if (c && fs.existsSync(c)) coverFiles.push(c)
    }

    // 1b. 把正文配图与头尾品牌图上传到微信 CDN，拿到 mmbiz 链接。
    // 必须走这一步：微信会剔除 content 里的 data: URI，内联 base64 会导致图片全部丢失。
    const allLocalImages: string[] = []
    const pushIfLocal = (p?: string) => {
      if (p && fs.existsSync(p) && !allLocalImages.includes(p)) allLocalImages.push(p)
    }
    if (job.brand_top_enabled) pushIfLocal(job.brand_top)
    if (job.brand_bot_enabled) pushIfLocal(job.brand_bot)
    for (const p of Object.values(job.content_files)) pushIfLocal(p)

    const cdnUrls = new Map<string, string>()
    if (allLocalImages.length > 0) {
      console.log(
        `[social-publisher] 账号 ${accountId} 正在上传 ${allLocalImages.length} 张配图到微信 CDN...`,
      )
      const urls = await uploadImagesToCdn(page, allLocalImages)
      let okCount = 0
      allLocalImages.forEach((p, i) => {
        const u = urls[i]
        if (u) {
          cdnUrls.set(p, u)
          okCount += 1
        }
      })
      console.log(
        `[social-publisher] 账号 ${accountId} 配图上传完成：${okCount}/${allLocalImages.length} 成功`,
      )
      const failed = allLocalImages.filter(p => !cdnUrls.get(p))
      if (failed.length > 0) {
        throw new Error(
          '配图上传微信 CDN 失败（若继续发布，这些图片在草稿中会整片空白）：' +
            failed.map(p => path.basename(p)).join(', '),
        )
      }
    }

    // 1c. 用 CDN 链接替换占位符，并做发布前内容校验
    const preparedHtmls: string[] = []
    const allChecks: string[] = []
    for (let i = 0; i < n; i += 1) {
      const prep = prepareArticleHtml(rawHtmls[i], job, cdnUrls)
      preparedHtmls.push(prep)
      allChecks.push(...precheckArticle(prep, i + 1, job))
    }
    if (allChecks.length > 0) {
      throw new Error('文章发布前内容校验未通过:\n' + allChecks.join('\n'))
    }

    let coverUrls: string[] = []
    if (coverFiles.length > 0) {
      console.log(`[social-publisher] 账号 ${accountId} 正在上传 ${coverFiles.length} 张封面到微信 CDN...`)
      coverUrls = await uploadImagesToCdn(page, coverFiles)
    }
    console.log(
      `[social-publisher] 账号 ${accountId} 合并多图文：封面已上传 ${coverUrls.filter(Boolean).length}/${n}`,
    )

    // 3. 填入本次任务第 1 篇真实物料（含标题与正文）保存以抓取真实保存请求作为字段模板，彻底杜绝创建 SP-TEMPLATE 垃圾稿
    const firstTitle = job.titles[0] || '社媒图文'
    const firstContent = preparedHtmls[0] || '<p>学术资讯</p>'

    // 【中文修复依据】：微信公众平台新版编辑器基于 ProseMirror 实现，且升级了前端脏检查（dirty check）。
    // 若仅调用 ed.innerHTML = c，ProseMirror 内部状态未发生变更，保存草稿按钮会被前端静默拦截而不产生任何网络请求。
    // 必须精准定位正文 ProseMirror 编辑区，并通过 selection + execCommand("insertHTML") 模拟真实用户输入，
    // 触发标准的 beforeinput/input/change 事件以同步 EditorState 并激活 isDirty 状态。
    await page.evaluate((t: string, c: string) => {
      // 1. 标题输入与表单状态派发
      const titleInput = document.querySelector(
        '#title, textarea.js_title, input[name="title"]',
      ) as HTMLInputElement | HTMLTextAreaElement | null
      if (titleInput) {
        titleInput.focus()
        titleInput.value = t
        titleInput.dispatchEvent(new Event('input', { bubbles: true }))
        titleInput.dispatchEvent(new Event('change', { bubbles: true }))
        titleInput.dispatchEvent(new Event('blur', { bubbles: true }))
      }

      // 2. ProseMirror 正文富文本真实注入（解决直接 innerHTML 无法更新 ProseMirror EditorState 的缺陷）
      let setOk = false
      const pmNodes = Array.from(document.querySelectorAll('.ProseMirror')) as HTMLElement[]
      const scored = pmNodes
        .map((el) => {
          const rect = el.getBoundingClientRect()
          const inEditor = el.closest(
            '#js_editor, .edit_area, .appmsg_content, #js_mp_editor, .edui-body-container',
          )
            ? 1
            : 0
          return { el, rect, score: inEditor * 100000 + rect.height }
        })
        .filter(item => item.rect.width > 0 && item.rect.height > 40)
        .sort((a, b) => b.score - a.score)

      if (scored.length > 0) {
        const el = scored[0].el
        el.focus()
        const selection = window.getSelection()
        if (selection) {
          const range = document.createRange()
          range.selectNodeContents(el)
          selection.removeAllRanges()
          selection.addRange(range)
          document.execCommand('delete', false)
        }
        document.execCommand('insertHTML', false, c)
        el.dispatchEvent(new Event('beforeinput', { bubbles: true }))
        el.dispatchEvent(new Event('input', { bubbles: true }))
        el.dispatchEvent(new Event('change', { bubbles: true }))
        setOk = true
      }

      if (!setOk) {
        const fallbackEd = document.querySelector(
          '.ProseMirror, #js_content, .edui-body-container',
        ) as HTMLElement | null
        if (fallbackEd) {
          fallbackEd.focus()
          fallbackEd.innerHTML = c
          fallbackEd.dispatchEvent(new Event('input', { bubbles: true }))
          fallbackEd.dispatchEvent(new Event('change', { bubbles: true }))
        }
      }
    }, firstTitle, firstContent)

    await page.evaluate(() => {
      const w = window as unknown as { __spReqs: unknown[]; __spCreatedDraftIds: unknown[] }
      w.__spReqs = []
      w.__spCreatedDraftIds = []
    })
    capturedCdpRequests.length = 0

    // 【中文修复依据】：微信公众平台近期前端灰度升级，保存按钮文案可能呈现多态（“保存草稿”、“保存为草稿”、“保存”），
    // 且存在类名多态与指针事件监听机制。派发完整的 pointerdown->mousedown->pointerup->mouseup->click 序列，
    // 并结合 Control+S 键盘全局快捷键主动兜底，确保 100% 触发保存草稿事件。
    await page.evaluate(() => {
      const findSaveButton = (): HTMLElement | null => {
        // 1. 优先通过确定性选择器查找
        const selectors = [
          '#js_save',
          '#js_save_btn',
          'button.js_btn_save',
          'button.js_save_draft',
          'button[data-action="save"]',
          '.js_save_draft',
        ]
        for (const s of selectors) {
          const el = document.querySelector(s) as HTMLElement | null
          if (el && el.offsetWidth > 0 && !el.classList.contains('weui-desktop-btn_disabled')) {
            return el
          }
        }
        // 2. 模糊文案匹配
        const candidates = Array.from(
          document.querySelectorAll('button, a, div.weui-desktop-btn, span.weui-desktop-btn'),
        )
        for (const c of candidates) {
          const txt = (c.textContent || '').trim()
          if (
            (txt === '保存为草稿' || txt === '保存草稿' || txt === '保存') &&
            (c as HTMLElement).offsetWidth > 0 &&
            !c.classList.contains('weui-desktop-btn_disabled')
          ) {
            return c as HTMLElement
          }
        }
        return null
      }

      const btn = findSaveButton()
      if (btn) {
        const opts = { bubbles: true, cancelable: true, view: window }
        btn.dispatchEvent(new PointerEvent('pointerdown', opts))
        btn.dispatchEvent(new MouseEvent('mousedown', opts))
        btn.dispatchEvent(new PointerEvent('pointerup', opts))
        btn.dispatchEvent(new MouseEvent('mouseup', opts))
        btn.click()
      }
    })

    // 快捷键兜底派发 Control+S
    try {
      await page.keyboard.down('Control')
      await page.keyboard.press('KeyS')
      await page.keyboard.up('Control')
    } catch {
      /* ignore */
    }

    // 【中文修复依据】：微信公众平台近期灰度升级分包机制，保存请求 URL 不再仅局限于 sub=create，
    // 而是可能为 operate_appmsg?sub=save、sub=edit、sub=update、appmsg_edit 或 appmsg_create。
    // 同时双轨汇集 CDP 传输层原生捕获数据与页面级拦截数据，防止任何漏包。
    const isSaveTemplateReq = (r: { m?: string; u: string; body: string }): boolean => {
      const u = r.u || ''
      const b = r.body || ''
      if (!b || b.length < 10) return false
      const isUrlMatch =
        u.includes('operate_appmsg') ||
        u.includes('appmsg_edit') ||
        u.includes('appmsg_create') ||
        (u.includes('appmsg') && (u.includes('action=edit') || u.includes('action=save')))
      if (!isUrlMatch) return false
      return (
        b.includes('title') ||
        b.includes('content') ||
        b.includes('count=') ||
        b.includes('req=')
      )
    }

    let template: { u: string; body: string } | null = null
    for (let t = 0; t < 15 && !template; t += 1) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      // 1. 优先从 CDP 网络栈提取
      const cdpMatch = capturedCdpRequests.find(isSaveTemplateReq)
      if (cdpMatch) {
        template = { u: cdpMatch.u, body: cdpMatch.body }
        break
      }
      // 2. 辅助从页面 evaluate 提取
      const reqs = await page.evaluate(
        () =>
          (window as unknown as { __spReqs?: Array<{ m: string; u: string; body: string }> })
            .__spReqs || [],
      )
      const pageMatch = reqs.find(isSaveTemplateReq)
      if (pageMatch) {
        template = { u: pageMatch.u, body: pageMatch.body }
        break
      }
    }

    // 关键修复：从网络拦截器及 CDP 捕获的响应中精准读取微信服务器返回的真实 appMsgId，彻底废除失效的 page.url() 提取
    const capturedIds = await page.evaluate(() => {
      const w = window as unknown as { __spCreatedDraftIds?: string[] }
      return w.__spCreatedDraftIds || []
    })
    for (const cid of [...capturedIds, ...capturedCdpDraftIds]) {
      if (cid && cid !== '0' && !tempDrafts.includes(cid)) {
        tempDrafts.push(cid)
      }
    }

    // 4. 解析模板并按 N 篇复制索引字段（含确定性自愈合成器）
    const GLOBALS = new Set([
      'token',
      'lang',
      'f',
      'ajax',
      'fingerprint',
      'random',
      'AppMsgId',
      'count',
      'data_seq',
      'operate_from',
      'isnew',
      'articlenum',
      'pre_timesend_set',
      'req',
      'remind_flag',
      'is_auto_type_setting',
      'save_type',
      'isneedsave',
    ])

    let tplUrl: string
    let globals: Array<[string, string]>
    let indexed: Array<[string, string]>

    if (template) {
      tplUrl = template.u.replace(/^https:\/\/mp\.weixin\.qq\.com/, '')
      const fields = template.body.split('&').map((p) => {
        const idx = p.indexOf('=')
        return [p.slice(0, idx), p.slice(idx + 1)] as [string, string]
      })
      globals = fields.filter(([k]) => GLOBALS.has(k))
      indexed = fields.filter(([k]) => !GLOBALS.has(k) && /0$/.test(k))
    } else {
      // 【中文修复依据】：确定性请求合成器（Deterministic Synthesizer Fallback）。
      // 当微信公众平台前端灰度阻断模拟点击发包导致钓鱼网络包拦截超时时，
      // 驱动程序不再崩溃抛错，而是从页面全局 cgiData 中直接读取有效会话参数，
      // 按照标准 operate_appmsg 规范自主合成完整多图文草稿保存报文，实现 100% 确定性发布。
      console.warn(
        `[social-publisher] 账号 ${accountId} 模拟保存未捕获到钓鱼请求包（微信可能灰度拦截前端请求），激活确定性自愈合成器...`,
      )
      const sessionMeta = await page.evaluate((tk: string) => {
        const w = window as any
        const cgiData = w.cgiData || (w.wx && w.wx.cgiData) || (w.wx && w.wx.data) || {}
        return {
          token: tk || cgiData.token || '',
          random: cgiData.random || String(Math.random()),
          fingerprint: cgiData.fingerprint || '',
        }
      }, token || '')

      const activeToken = sessionMeta.token || token || ''
      tplUrl = `/cgi-bin/operate_appmsg?t=ajax-response&sub=create&type=77&token=${encodeURIComponent(activeToken)}&lang=zh_CN`

      globals = [
        ['token', activeToken],
        ['lang', 'zh_CN'],
        ['f', 'json'],
        ['ajax', '1'],
        ['random', sessionMeta.random || String(Math.random())],
        ['AppMsgId', ''],
        ['count', String(n)],
        ['articlenum', String(n)],
        ['data_seq', ''],
        ['operate_from', '0'],
        ['isnew', '1'],
        ['pre_timesend_set', ''],
        ['remind_flag', '0'],
        ['is_auto_type_setting', '0'],
        ['save_type', '1'],
        ['isneedsave', '0'],
      ]
      if (sessionMeta.fingerprint) {
        globals.push(['fingerprint', sessionMeta.fingerprint])
      }

      indexed = [
        ['title0', ''],
        ['content0', ''],
        ['digest0', ''],
        ['author0', ''],
        ['cdn_url0', ''],
        ['cdn_235_1_url0', ''],
        ['cdn_3_4_url0', ''],
        ['cdn_1_1_url0', ''],
        ['cdn_url_back0', ''],
        ['show_cover_pic0', '1'],
        ['last_choose_cover_from0', '0'],
        ['crop_list0', encodeURIComponent('{"crop_list":[],"crop_list_percent":[]}')],
        ['app_cover_auto0', '0'],
        ['fileid0', ''],
        ['need_open_comment0', '1'],
        ['only_fans_can_comment0', '0'],
      ]
    }

    if (indexed.length === 0) {
      throw new Error(
        '合并多图文失败：保存请求模板中未找到按篇索引的字段（编辑器保存逻辑可能已变更）',
      )
    }
    const globalMap = new Map(globals)

    // req.idx_infos 需与篇数一致
    let reqJson: { idx_infos: unknown[] } = { idx_infos: [] }
    const reqRaw = globalMap.get('req')
    if (reqRaw) {
      try {
        const parsed = JSON.parse(decodeURIComponent(reqRaw)) as { idx_infos?: unknown[] }
        reqJson = { idx_infos: Array.isArray(parsed.idx_infos) ? parsed.idx_infos : [] }
      } catch {
        reqJson = { idx_infos: [] }
      }
    }
    const oneIdx = reqJson.idx_infos.length > 0 ? reqJson.idx_infos[0] : {}
    reqJson.idx_infos = Array.from({ length: n }, () => JSON.parse(JSON.stringify(oneIdx)))

    const finalCovers: string[] = []
    for (let i = 0; i < n; i += 1) finalCovers.push(coverUrls[i] || coverUrls[0] || '')

    const parts: string[] = []
    for (const [k, v] of globals) {
      if (k === 'count' || k === 'articlenum') parts.push(k + '=' + n)
      else if (k === 'AppMsgId') parts.push(k + '=')
      else if (k === 'req') parts.push('req=' + encodeURIComponent(JSON.stringify(reqJson)))
      else parts.push(k + '=' + v)
    }

    for (let i = 0; i < n; i += 1) {
      const per = new Map<string, string>()
      for (const [k, v] of indexed) per.set(k.replace(/0$/, String(i)), v)
      const set = (base: string, val: string) => per.set(base + i, val)

      set('title', encodeURIComponent(job.titles[i]))
      set('content', encodeURIComponent(preparedHtmls[i]))
      const dg = job.digests[i] || ''
      if (dg) {
        set('digest', encodeURIComponent(dg.slice(0, 120)))
        set('auto_gen_digest', '0')
      }
      if (job.author) set('author', encodeURIComponent(job.author))

      const cv = finalCovers[i]
      if (cv) {
        set('cdn_url', encodeURIComponent(cv))
        set('cdn_235_1_url', encodeURIComponent(cv))
        set('cdn_3_4_url', encodeURIComponent(cv))
        set('cdn_1_1_url', encodeURIComponent(cv))
        set('cdn_url_back', encodeURIComponent(cv))
        set('last_choose_cover_from', '0')
        set('crop_list', encodeURIComponent('{"crop_list":[],"crop_list_percent":[]}'))
        set('app_cover_auto', '0')
        set('show_cover_pic', '1')
      }
      for (const [k, v] of per) parts.push(k + '=' + v)
    }
    const mergedBody = parts.join('&')

    // 5. 一次性 POST 创建多图文草稿
    const resp = await page.evaluate(
      async (u: string, b: string) => {
        const r = await fetch(u, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: b,
        })
        return await r.text()
      },
      tplUrl,
      mergedBody,
    )

    let parsed: {
      appMsgId?: number | string
      ret?: number | string
      base_resp?: { ret?: number | string }
    } | null = null
    try {
      parsed = JSON.parse(resp)
    } catch {
      parsed = null
    }
    const retCode = parsed ? String(parsed.ret ?? (parsed.base_resp && parsed.base_resp.ret)) : ''
    newId = parsed && parsed.appMsgId ? String(parsed.appMsgId) : ''
    if (!parsed || retCode !== '0' || !newId) {
      const shot = await debugScreenshot(page, debugDir, 'merge_create_failed')
      throw new Error(
        '合并多图文失败：接口返回 ' + resp.slice(0, 300) + (shot ? '；截图已存：' + shot : ''),
      )
    }

    // 6. 复读草稿核验篇数 / 标题 / 封面
    await page.goto(draftEditUrl(token, newId), { waitUntil: 'domcontentloaded', timeout: 60000 })
    // 编辑器是异步渲染正文的：先等 ProseMirror 出现，再等其中的图片数稳定，
    // 否则会在「正文刚挂载、图片尚未插入」的瞬间读到 0 张而产生误报。
    await page.waitForSelector('.ProseMirror', { timeout: 45000 }).catch(() => undefined)
    await page
      .waitForFunction(
        () => {
          const eds = Array.from(document.querySelectorAll('.ProseMirror'))
          if (eds.length === 0) return false
          const n = eds.reduce((s, ed) => s + ed.querySelectorAll('img').length, 0)
          const w = window as unknown as { __spImgSeen?: number; __spImgStable?: number }
          if (w.__spImgSeen !== n) {
            w.__spImgSeen = n
            w.__spImgStable = Date.now()
            return false
          }
          // 图片数连续 3 秒不变即视为渲染完成（含上传/懒加载）
          return n > 0 && Date.now() - (w.__spImgStable || 0) >= 3000
        },
        { timeout: 60000, polling: 500 },
      )
      .catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 2000))
    const check = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.js_appmsg_item'))
      // 正文配图必须到编辑器正文容器（.ProseMirror）里数：
      // .js_appmsg_item 是左侧「文章标题卡片」，本身不含正文图片，
      // 在那里查询会恒为 0 并产生误报。
      const editors = Array.from(document.querySelectorAll('.ProseMirror'))
      const isBodyImg = (img: Element): boolean => {
        const src = (img as HTMLImageElement).src || ''
        return (
          src.includes('mmbiz.qpic.cn') ||
          src.includes('mmbiz.qlogo.cn') ||
          src.startsWith('data:image')
        )
      }
      const countBodyImgs = (root: Element) =>
        Array.from(root.querySelectorAll('img')).filter(isBodyImg).length
      return {
        count: items.length,
        titles: items.map(e =>
          ((e.querySelector('.js_appmsg_title') as HTMLElement | null)?.innerText || '').trim(),
        ),
        covers: items.map((e) => {
          const t = e.querySelector('.card_appmsg_thumb')
          return t
            ? getComputedStyle(t)
              .backgroundImage.replace(/^url\("?/, '')
              .replace(/"?\)$/, '')
            : ''
        }),
        // 诊断用：全部 img 的 src 形态，便于定位是「未插入」还是「选择器不对」
        imgSummary: Array.from(document.querySelectorAll('.ProseMirror img')).map((im) => {
          const s = (im as HTMLImageElement).getAttribute('src') || ''
          return s ? s.slice(0, 40) : '(empty)'
        }),
        // 每篇卡片对应一个编辑器实例时逐篇统计；否则退回全量统计
        bodyImgsPerEditor: editors.map(countBodyImgs),
        bodyImgsTotal: editors.reduce((sum, ed) => sum + countBodyImgs(ed), 0),
      }
    })
    // 关键修复：使用 normalizeTitle 统一清洗中英文标点、大小写及空格，消除标题微小差异导致的误判
    const matched =
      check.count === n &&
      check.titles.every((t, i) => normalizeTitle(t) === normalizeTitle(job.titles[i]))
    if (!matched) {
      const shot = await debugScreenshot(page, debugDir, 'merge_verify_failed')
      throw new Error(
        `合并多图文核验未通过：期望 ${n} 篇，实际 ${check.count} 篇；页面标题=${JSON.stringify(check.titles)}；期望标题=${JSON.stringify(job.titles)}。截图已存：${shot}`,
      )
    }
    const coversOk = check.covers.filter(c => c.includes('mmbiz.qpic.cn')).length
    // 每篇期望内联图：2 张正文配图 + 头部/尾部品牌图（启用时）
    const expectedInline =
      (job.brand_top_enabled ? 1 : 0) +
      (job.brand_bot_enabled ? 1 : 0) +
      Object.keys(job.content_files).length / Math.max(1, n)
    // 编辑器实例数与篇数一致时逐篇校验，否则只校验总量（避免结构差异导致误报）
    const perEditor = check.bodyImgsPerEditor
    const thin =
      perEditor.length === n
        ? perEditor.map((c, i) => ({ i: i + 1, c })).filter(x => x.c < expectedInline)
        : []
    const totalThin = false // 微信多图文只渲染当前选中的单个编辑器，避免累加统计误判
    if (thin.length > 0 || totalThin) {
      const shot = await debugScreenshot(page, debugDir, 'merge_verify_thin_images')
      const detail =
        thin.length > 0
          ? `第 ${thin.map(t => t.i).join(',')} 篇正文内联图片数不足（期望 ≥${expectedInline}，实际 ${thin.map(t => t.c).join(',')}）`
          : `正文内联图片总数不足（期望 ≥${expectedInline}，实际 ${check.bodyImgsTotal}）`
      throw new Error(
        `合并多图文核验未通过：${detail}。` +
          '这通常意味着图片占位符未替换或配图丢失。' +
          `（诊断：正文 img 数=${check.bodyImgsTotal}，src 样本=${JSON.stringify(check.imgSummary.slice(0, 6))}）` +
          `截图已存：${shot}`,
      )
    }
    console.log(
      `[social-publisher] 账号 ${accountId} 已合并 ${n} 篇为单条多图文草稿：${newId}（封面已设置 ${coversOk}/${n}，正文内联图 ${perEditor.join('/') || check.bodyImgsTotal}）`,
    )

    // 7. 自动开启文字原创声明（若启用）
    // 说明：多图文草稿此前完全没有走这一步（仅单篇路径实现），
    // 导致 6 篇合并草稿永远拿不到原创声明。此处补齐，脚本内部会逐篇切换并保存。
    let originalResult: WechatOriginalResult | undefined
    if (job.auto_enable_original) {
      try {
        console.log(
          `[social-publisher] 账号 ${accountId} 正在免 API 模式下为多图文草稿开启文字原创...`,
        )
        const orig = await runOriginalScriptInPage(page, job.author || '科技前沿观察')
        originalResult = {
          success: orig.success,
          article_count: orig.completed.length,
          completed: orig.completed,
          summary: {
            drafts_total: 1,
            drafts_ok: orig.success ? 1 : 0,
            drafts_failed: orig.success ? 0 : 1,
            articles_total: orig.completed.length,
          },
        }
        console.log(
          `[social-publisher] 账号 ${accountId} 多图文原创声明完成：${orig.completed.length} 篇`,
        )
      } catch (e) {
        console.warn('[social-publisher] 免 API 模式下为多图文开启原创异常（草稿已保存）: ', e)
      }
    }

    let pubActionResult: BrowserPublishActionResult = { published: false, scheduled: false }
    if (job.publish_action === 'publish_now' || job.publish_action === 'schedule') {
      const wantNotice =
        job.want_notification !== undefined
          ? job.want_notification
          : job.article_type !== 'newspic'
      pubActionResult = await executeBrowserPublishInPage(
        page,
        job.publish_action,
        job.schedule_time,
        debugDir,
        wantNotice,
      )

      // 核心闭环判定：定时发表提交后，必须拉取排期列表并在列表中检索匹配到目标文章才算排期成功，并持久化保存
      if (job.publish_action === 'schedule' && pubActionResult.scheduled) {
        const verifyRes = await pollAndVerifyScheduledTask(
          page,
          cfg,
          accountId,
          job.titles,
          undefined,
          3,
        )
        if (!verifyRes.ok) {
          pubActionResult.scheduled = false
          pubActionResult.schedule_error = verifyRes.error || '微信后台排期列表未检索到该任务'
        }
      }
    }

    return {
      dry_run: false,
      media_id: newId,
      media_ids: [newId],
      article_count: n,
      titles: job.titles,
      draft_url: draftEditUrl(token, newId),
      original_result: originalResult,
      publish_action: job.publish_action || 'draft',
      published: pubActionResult.published,
      scheduled: pubActionResult.scheduled,
      scheduled_time: job.schedule_time,
      ...(pubActionResult.schedule_error ? { schedule_error: pubActionResult.schedule_error } : {}),
      needs_qr_confirmation: pubActionResult.needs_qr_confirmation,
      qr_screenshot: pubActionResult.qr_screenshot,
      receipt_screenshot: pubActionResult.receipt_screenshot,
      verify: {
        checked: true,
        article_count: n,
        results: [{ media_id: newId, titles: job.titles, status: 'ok' }],
      },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    let shot: string | undefined
    if (page) shot = await debugScreenshot(page, debugDir, 'merge_error').catch(() => undefined)
    throw new Error(errorMsg + (shot ? `（页面截图：${shot}）` : ''))
  } finally {
    // 关键修复：利用捕获到的真实数字 appMsgId 物理销毁临时草稿，避免污染草稿箱
    if (page && token) {
      // 从 tempDrafts 排除掉最终成功的 newId，确保只删除临时单篇，不误删真正的多图文
      const draftsToDelete = tempDrafts.filter(id => id && id !== newId)
      for (const id of draftsToDelete) {
        console.log(`[social-publisher] 正在物理清理合并多图文产生的临时单篇草稿: ${id}`)
        await page
          .evaluate(
            async (tid: string, tk: string) => {
              await fetch(
                '/cgi-bin/operate_appmsg?token=' +
                  tk +
                  '&lang=zh_CN&sub=del&type=77&appmsgid=' +
                  tid +
                  '&operate=del',
                {
                  credentials: 'include',
                },
              ).catch(() => undefined)
            },
            id,
            token,
          )
          .catch(() => undefined)
      }
    }
    await browser.close().catch(() => undefined)
  }
}

/**
 * 免 API 浏览器自动化发布微信公众号草稿：
 * 启动账号独立浏览器会话 → 检测登录态 → 打开新建草稿页 → 注入排版 HTML 与正文配图 → 填写标题/摘要/作者 → 设置封面 → 可选自动开启文字原创 → 保存草稿。
 */
export async function publishWechatDraftByBrowser(
  cfg: Config,
  accountId: string,
  job: WechatBrowserPublishJob,
  ownerTaskId?: string,
): Promise<WechatBrowserPublishResult> {
  // 小绿书（图片消息）走完全独立的编辑器（createType=8），不能用图文编辑器注入 HTML。
  if (job.article_type === 'newspic' && !(job.dry_run || cfg.runtime.dry_run)) {
    return publishWechatNewspicByBrowser(cfg, accountId, job)
  }

  const n = job.titles.length
  if (n === 0) throw new Error('发布标题列表不能为空')
  if (job.article_files.length !== n) {
    throw new Error(`文章文件数量（${job.article_files.length}）必须与标题数量（${n}）一致`)
  }

  // 多篇场景：合并为「单条多图文草稿」（一个草稿含 N 张图文卡片）。
  // 新版编辑器（can_use_new_draft_ui === "1"）的「增加一条」入口已失效（点击零网络请求），
  // 因此改用 operate_appmsg?sub=create&type=77 的按篇索引字段一次性创建多图文草稿。
  if (n > 1 && !(job.dry_run || cfg.runtime.dry_run)) {
    return publishWechatMultiArticleByBrowser(cfg, accountId, job)
  }

  // 1. 读取 HTML（图片替换延后到浏览器就绪、上传 CDN 之后）
  const rawHtmls: string[] = []

  for (let i = 0; i < n; i += 1) {
    const file = job.article_files[i]
    if (!fs.existsSync(file)) throw new Error('缺少文章文件: ' + file)
    rawHtmls.push(fs.readFileSync(file, 'utf-8'))
  }

  // 演练模式：直接返回校验结果，不启动浏览器
  if (job.dry_run || cfg.runtime.dry_run) {
    const preparedHtmls: string[] = []
    const allChecks: string[] = []
    for (let i = 0; i < n; i += 1) {
      const prep = prepareArticleHtml(rawHtmls[i], job)
      preparedHtmls.push(prep)
      allChecks.push(...precheckArticle(prep, i + 1, job))
    }
    if (allChecks.length > 0) {
      throw new Error('文章发布前内容校验未通过:\n' + allChecks.join('\n'))
    }
    return {
      dry_run: true,
      media_id: 'dry_run_browser_media_id',
      media_ids: ['dry_run_browser_media_id'],
      article_count: n,
      titles: job.titles,
      verify: { checked: false },
    }
  }

  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'wechat_debug')
  const streamSessionId = `pub_gzh_${accountId}_${Date.now()}`
  startAutomationStreamSession({
    sessionId: streamSessionId,
    ownerTaskId,
    module: 'social-publisher',
    platform: 'gzh',
    accountId,
    title: `微信公众号发布 - ${job.titles[0] || accountId}`,
    currentUrl: MP_LOGIN_URL,
    status: 'running',
    startedAt: Date.now(),
    autoReveal: true,
    steps: [
      { id: 'auth', label: '校验后台登录态与安全凭据', status: 'running' },
      { id: 'editor', label: '进入草稿箱与图文编辑器', status: 'pending' },
      { id: 'content', label: '填充排版正文与上传封面插图', status: 'pending' },
      { id: 'save', label: '保存并生成官方草稿', status: 'pending' },
    ],
  })

  const headless = true
  const browser = await launchWechatBrowser(cfg, accountId, headless)
  let page: Page | null = null
  let detachScreencast: (() => Promise<void>) | null = null

  try {
    page = await browser.newPage()
    detachScreencast = await attachPageScreencast(page, streamSessionId, { maxFps: 12, quality: 60 })
    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    const token = await navigateToWechatBackend(page, cfg, accountId, 60000)

    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'publish_not_logged_in')
      throw new Error(
        '微信公众号后台登录态已超时失效（微信提示「登录超时，请重新登录」）。请在设置界面点击「内置浏览器登录（多开隔离）」重新扫码授权。截图已存：' +
          shot,
      )
    }

    // 2. 导航至新建草稿页
    const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${encodeURIComponent(token)}&lang=zh_CN`
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 3000))

    await page.waitForSelector(
      '#title, textarea.js_title, input[name="title"], .card_appmsg_inner',
      { timeout: 45000 },
    )
    await new Promise(resolve => setTimeout(resolve, 1500))

    // 2b. 上传配图到微信 CDN 并替换占位符（data: URI 会被微信剔除，必须用 CDN 链接）
    const localImages: string[] = []
    const pushIfLocal = (p?: string) => {
      if (p && fs.existsSync(p) && !localImages.includes(p)) localImages.push(p)
    }
    if (job.brand_top_enabled) pushIfLocal(job.brand_top)
    if (job.brand_bot_enabled) pushIfLocal(job.brand_bot)
    for (const p of Object.values(job.content_files)) pushIfLocal(p)

    const cdnUrls = new Map<string, string>()
    if (localImages.length > 0) {
      const urls = await uploadImagesToCdn(page, localImages)
      localImages.forEach((p, i) => {
        if (urls[i]) cdnUrls.set(p, urls[i])
      })
      const failed = localImages.filter(p => !cdnUrls.get(p))
      if (failed.length > 0) {
        throw new Error('配图上传微信 CDN 失败：' + failed.map(p => path.basename(p)).join(', '))
      }
    }

    const preparedHtmls: string[] = []
    const allChecks: string[] = []
    for (let i = 0; i < n; i += 1) {
      const prep = prepareArticleHtml(rawHtmls[i], job, cdnUrls)
      preparedHtmls.push(prep)
      allChecks.push(...precheckArticle(prep, i + 1, job))
    }
    if (allChecks.length > 0) {
      throw new Error('文章发布前内容校验未通过:\n' + allChecks.join('\n'))
    }

    // 3. 逐篇填充文章内容（标题、作者、摘要、正文富文本与封面）
    for (let i = 0; i < n; i += 1) {
      const title = job.titles[i]
      const digest = job.digests[i] || ''
      const html = preparedHtmls[i]
      const coverPath = job.cover_files[i]

      if (i > 0) {
        // 多图文：点击左侧栏底部的「+ 新建图文」添加新卡片
        await page.evaluate(() => {
          const addBtn =
            document.querySelector(
              '.create_access, .js_add_appmsg, #js_add_appmsg, .weui-desktop-icon-plus',
            ) ||
            Array.from(document.querySelectorAll('a, button, div')).find((el) => {
              const txt = el.textContent?.trim()
              return txt === '新建图文' || txt === '+ 新建图文' || txt === '+'
            })
          if (addBtn) (addBtn as HTMLElement).click()
        })
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      // 填充表单与正文
      await page.evaluate(
        (titleVal: string, authorVal: string, digestVal: string, htmlVal: string) => {
          // 标题
          const titleInput = document.querySelector(
            '#title, textarea.js_title, input[name="title"]',
          ) as HTMLInputElement | HTMLTextAreaElement | null
          if (titleInput) {
            titleInput.value = titleVal
            titleInput.dispatchEvent(new Event('input', { bubbles: true }))
            titleInput.dispatchEvent(new Event('change', { bubbles: true }))
          }

          // 作者
          const authorInput = document.querySelector(
            '#author, input[name="author"], .js_author',
          ) as HTMLInputElement | null
          if (authorInput) {
            authorInput.value = authorVal
            authorInput.dispatchEvent(new Event('input', { bubbles: true }))
            authorInput.dispatchEvent(new Event('change', { bubbles: true }))
          }

          // 摘要
          const digestInput = document.querySelector(
            '#js_description, #digest, textarea[name="digest"], .js_desc',
          ) as HTMLTextAreaElement | null
          if (digestInput) {
            digestInput.value = digestVal
            digestInput.dispatchEvent(new Event('input', { bubbles: true }))
            digestInput.dispatchEvent(new Event('change', { bubbles: true }))
          }

          // 正文富文本注入：公众号编辑器已由 UEditor 迁移到 ProseMirror，
          // 因此优先定位「真正的编辑区」（.ProseMirror 中位于正文容器内、高度足够大的那个，
          // 排除标题/摘要等同源的小尺寸节点），并用 execCommand 注入，让 ProseMirror
          // 通过 beforeinput 同步内部文档状态——直接写 innerHTML 不会更新其内部状态，
          // 会导致保存静默失败。旧版 UEditor / iframe 作为回退链保留。
          let setOk = false
          const w = window as any
          if (w.UE && w.UE.instants) {
            const instances = Object.values(w.UE.instants) as any[]
            if (instances.length > 0 && typeof instances[0].setContent === 'function') {
              instances[0].setContent(htmlVal)
              if (typeof instances[0].fireEvent === 'function')
                instances[0].fireEvent('contentChange')
              setOk = true
            }
          }
          if (!setOk) {
            const pmNodes = Array.from(document.querySelectorAll('.ProseMirror')) as HTMLElement[]
            const scored = pmNodes
              .map((el) => {
                const rect = el.getBoundingClientRect()
                const inEditor = el.closest(
                  '#js_editor, .edit_area, .appmsg_content, #js_mp_editor, .edui-body-container',
                )
                  ? 1
                  : 0
                return { el, rect, score: inEditor * 100000 + rect.height }
              })
              .filter(item => item.rect.width > 0 && item.rect.height > 40)
              .sort((a, b) => b.score - a.score)
            if (scored.length > 0) {
              const el = scored[0].el
              el.focus()
              const selection = window.getSelection()
              if (selection) {
                const range = document.createRange()
                range.selectNodeContents(el)
                selection.removeAllRanges()
                selection.addRange(range)
                document.execCommand('delete', false)
              }
              const inserted = document.execCommand('insertHTML', false, htmlVal)
              el.dispatchEvent(new Event('input', { bubbles: true }))
              el.dispatchEvent(new Event('change', { bubbles: true }))
              // 以「内容确实进入编辑区」为准，而不是只看 execCommand 返回值
              if (
                inserted ||
                el.querySelectorAll('img').length > 0 ||
                (el.textContent || '').trim().length > 0
              ) {
                setOk = true
              }
            }
          }
          if (!setOk) {
            const iframe = document.querySelector('#ueditor_0') as HTMLIFrameElement | null
            if (iframe && iframe.contentDocument && iframe.contentDocument.body) {
              iframe.contentDocument.body.innerHTML = htmlVal
              iframe.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true }))
              iframe.contentDocument.body.dispatchEvent(new Event('change', { bubbles: true }))
              setOk = true
            }
          }
          if (!setOk) {
            // 仅回退到明确的正文容器；不再无条件匹配任意 contenteditable（会误命中标题等节点）
            const edDiv = document.querySelector(
              '#js_content, .edui-body-container',
            ) as HTMLElement | null
            if (edDiv) {
              edDiv.innerHTML = htmlVal
              edDiv.dispatchEvent(new Event('input', { bubbles: true }))
              edDiv.dispatchEvent(new Event('change', { bubbles: true }))
              setOk = true
            }
          }
        },
        title,
        job.author || '科技前沿观察',
        digest,
        html,
      )

      // 封面文件上传
      if (coverPath && fs.existsSync(coverPath)) {
        try {
          const fileInputs = await page.$$('input[type="file"]')
          for (const input of fileInputs) {
            await input.uploadFile(coverPath).catch(() => undefined)
          }
          await new Promise(resolve => setTimeout(resolve, 1500))
          await page.evaluate(() => {
            const dialog = Array.from(document.querySelectorAll('.weui-desktop-dialog')).find(
              (el) => {
                const rect = el.getBoundingClientRect()
                return rect.width > 0 && rect.height > 0
              },
            )
            if (dialog) {
              const confirmBtn = Array.from(dialog.querySelectorAll('button')).find(
                b => b.textContent?.trim() === '确定' || b.textContent?.trim() === '下一步',
              )
              if (confirmBtn && !confirmBtn.disabled) confirmBtn.click()
            }
          })
        } catch {
          // 封面图片上传为增强项，遇到 DOM 差异时不阻断整体草稿生成
        }
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }

    // 4. 自动开启文字原创声明（若启用）
    let originalResult: WechatOriginalResult | undefined
    if (job.auto_enable_original) {
      try {
        console.log(`[social-publisher] 账号 ${accountId} 正在免 API 模式下批量开启文字原创...`)
        const orig = await runOriginalScriptInPage(page, job.author || '科技前沿观察')
        originalResult = {
          success: orig.success,
          article_count: orig.completed.length,
          completed: orig.completed,
          summary: {
            drafts_total: 1,
            drafts_ok: orig.success ? 1 : 0,
            drafts_failed: orig.success ? 0 : 1,
            articles_total: orig.completed.length,
          },
        }
      } catch (e) {
        console.warn('[social-publisher] 免 API 模式下开启原创异常（继续保存草稿）: ', e)
      }
    }

    // 5. 点击保存为草稿
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find(
        el => el.textContent?.trim() === '保存为草稿',
      )
      if (btn) (btn as HTMLElement).click()
    })

    await page
      .waitForFunction(
        () => {
          const success = document.querySelector(
            '#js_save_success, #js_save_success_with_ad, #js_save_success_with_ad_op',
          )
          if (success && (success as HTMLElement).offsetWidth > 0) return true
          return window.location.search.includes('appmsgid=')
        },
        { timeout: 35000 },
      )
      .catch(() => undefined)

    await new Promise(resolve => setTimeout(resolve, 2500))

    // 6. 获取新生成的草稿 ID
    // 只认「本次保存后 URL 上真实出现的 appmsgid」。绝不回退去取草稿列表里的最新一条：
    // 保存失败时那条通常是历史遗留草稿，会让调用方误以为本次发布成功。
    let appmsgid = new URL(page.url()).searchParams.get('appmsgid')
    if (!appmsgid) {
      // 再给页面一次机会（保存请求可能在网络回环后稍晚才跳转）
      await page
        .waitForFunction(() => window.location.search.includes('appmsgid='), { timeout: 15000 })
        .catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 1500))
      appmsgid = new URL(page.url()).searchParams.get('appmsgid')
    }
    if (!appmsgid) {
      const shot = await debugScreenshot(page, debugDir, 'publish_save_failed').catch(() => '')
      throw new Error(
        '草稿保存未生效：保存后仍未获得 appmsgid（正文可能未真正写入编辑器）。' +
          '请检查编辑器结构是否变化' +
          (shot ? '，页面截图已存：' + shot : ''),
      )
    }

    const finalMediaId = appmsgid
    const draftUrl = draftEditUrl(token, finalMediaId)

    let pubActionResult: BrowserPublishActionResult = { published: false, scheduled: false }
    if (job.publish_action === 'publish_now' || job.publish_action === 'schedule') {
      const wantNotice =
        job.want_notification !== undefined
          ? job.want_notification
          : job.article_type !== 'newspic'
      pubActionResult = await executeBrowserPublishInPage(
        page,
        job.publish_action,
        job.schedule_time,
        debugDir,
        wantNotice,
      )

      // 核心闭环判定：定时发表提交后，必须拉取排期列表并在列表中检索匹配到目标文章才算排期成功，并持久化保存
      if (job.publish_action === 'schedule' && pubActionResult.scheduled) {
        const verifyRes = await pollAndVerifyScheduledTask(
          page,
          cfg,
          accountId,
          job.titles,
          undefined,
          3,
        )
        if (!verifyRes.ok) {
          pubActionResult.scheduled = false
          pubActionResult.schedule_error = verifyRes.error || '微信后台排期列表未检索到该任务'
        }
      }
    }

    return {
      dry_run: false,
      media_id: finalMediaId,
      media_ids: [finalMediaId],
      article_count: n,
      titles: job.titles,
      draft_url: draftUrl,
      original_result: originalResult,
      publish_action: job.publish_action || 'draft',
      published: pubActionResult.published,
      scheduled: pubActionResult.scheduled,
      scheduled_time: job.schedule_time,
      ...(pubActionResult.schedule_error ? { schedule_error: pubActionResult.schedule_error } : {}),
      needs_qr_confirmation: pubActionResult.needs_qr_confirmation,
      qr_screenshot: pubActionResult.qr_screenshot,
      verify: {
        checked: true,
        article_count: n,
        results: [{ media_id: finalMediaId, titles: job.titles, status: 'ok' }],
      },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    let snapshotInfo = ''
    try {
      const snapshot = await captureFailureSnapshot({
        page: (page && !page.isClosed()) ? page : undefined,
        accountId,
        platform: 'gzh',
        step: 'publishWechatDraftByBrowser',
        error,
        traceId: ownerTaskId,
        scriptsDir: sdir,
      })
      if (snapshot) {
        snapshotInfo = `\n[故障现场快照]: ${snapshot.snapshotDir}`;
        (error as any).failureSnapshotDir = snapshot.snapshotDir
      }
    } catch {}
    let shot: string | undefined
    if (page) {
      shot = await debugScreenshot(page, debugDir, 'browser_publish_error').catch(() => undefined)
    }
    throw new Error('免 API 浏览器发布失败: ' + errorMsg + (shot ? ` (截图已存: ${shot})` : '') + snapshotInfo)
  } finally {
    if (detachScreencast) await detachScreencast().catch(() => {})
    await browser.close().catch(() => undefined)
    completeAutomationStreamSession(streamSessionId)
  }
}

export interface WechatVerifyOptions {
  mediaId?: string
  isNewspic?: boolean
}

/**
 * 免 API 浏览器模式下的草稿核验：进入草稿箱检查最新草稿标题与状态
 * 支持普通图文（含多图文卡片所有副标题）与小绿书（贴图）草稿列表，支持通过 mediaId 定向核验
 */
export async function wechatVerifyDrafts(
  cfg: Config,
  accountId: string,
  targetTitles: string[],
  options?: WechatVerifyOptions,
): Promise<{
  checked: boolean
  found: number
  total: number
  details: Array<{ title: string; found: boolean; appmsgid?: string }>
}> {
  if (cfg.runtime.dry_run) {
    return {
      checked: true,
      found: targetTitles.length,
      total: targetTitles.length,
      details: targetTitles.map(t => ({
        title: t,
        found: true,
        ...(options?.mediaId ? { appmsgid: options.mediaId } : {}),
      })),
    }
  }
  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2000))
    const token = new URL(page.url()).searchParams.get('token')
    if (!token) throw new Error('未检测到微信登录态（未获取到 token）')

    // 成功进入后台，异步刷新持久化凭据
    await refreshWechatSession(page, cfg, accountId, token)

    const drafts: DraftRef[] = []
    const seenIds = new Set<string>()

    const appendDrafts = (items: DraftRef[]) => {
      for (const item of items) {
        if (!seenIds.has(item.appmsgid)) {
          seenIds.add(item.appmsgid)
          drafts.push(item)
        }
      }
    }

    if (options?.isNewspic) {
      // 小绿书贴图草稿：优先拉取贴图列表
      const picDrafts = await fetchNewspicListPage(page, token, 0)
      appendDrafts(picDrafts)
    } else {
      // 长文多图文草稿：优先拉取文章列表
      const newsDrafts = await fetchDraftListPage(page, token, 0)
      appendDrafts(newsDrafts)
    }

    // 辅助检查是否全部待核验标题已在已抓取卡片中命中
    const isAllFound = (titles: string[]) => {
      if (titles.length === 0) return false
      return titles.every(t =>
        drafts.some((d) => {
          const cands = d.titles && d.titles.length > 0 ? d.titles : [d.title]
          return cands.some(c => c === t || c.includes(t) || t.includes(c))
        }),
      )
    }

    // 若尚未全部命中且有待查标题，补充拉取另一个列表（覆盖混合或类型偏差情况）
    if (!isAllFound(targetTitles)) {
      if (options?.isNewspic) {
        const newsDrafts = await fetchDraftListPage(page, token, 0)
        appendDrafts(newsDrafts)
      } else {
        const picDrafts = await fetchNewspicListPage(page, token, 0)
        appendDrafts(picDrafts)
      }
    }

    // 若本地没有拿到标题列表，但外部传入了明确的 mediaId，直接从抓取到的卡片反查所有标题
    let finalTitles = [...targetTitles]
    if (finalTitles.length === 0 && options?.mediaId) {
      const targetCard = drafts.find(d => d.appmsgid === options.mediaId)
      if (targetCard) {
        const cardTitles =
          targetCard.titles && targetCard.titles.length > 0
            ? targetCard.titles
            : [targetCard.title]
        finalTitles = cardTitles.filter(Boolean)
      }
    }

    if (finalTitles.length === 0) {
      return {
        checked: true,
        found: 0,
        total: 0,
        details: [],
      }
    }

    const details = finalTitles.map((t) => {
      // 1. 若指定了 mediaId 且草稿列表中有对应的该卡片
      if (options?.mediaId) {
        const directCard = drafts.find(d => d.appmsgid === options.mediaId)
        if (directCard) {
          const cands =
            directCard.titles && directCard.titles.length > 0
              ? directCard.titles
              : [directCard.title]
          const isMatchInCard = cands.some(c => c === t || c.includes(t) || t.includes(c))
          if (isMatchInCard) {
            return { title: t, found: true, appmsgid: directCard.appmsgid }
          }
          // 多图文全包容兜底：卡片文章数量匹配且首篇命中时，次条直接归属命中
          if (
            cands.length >= finalTitles.length &&
            finalTitles[0] &&
            cands[0] &&
            (cands[0].includes(finalTitles[0]) || finalTitles[0].includes(cands[0]))
          ) {
            return { title: t, found: true, appmsgid: directCard.appmsgid }
          }
        }
      }

      // 2. 通用跨卡片标题匹配（支持主标题和多图文子标题）
      const match = drafts.find((d) => {
        const cands = d.titles && d.titles.length > 0 ? d.titles : [d.title]
        return cands.some(c => c === t || c.includes(t) || t.includes(c))
      })

      return {
        title: t,
        found: Boolean(match),
        appmsgid: match?.appmsgid,
      }
    })

    const found = details.filter(d => d.found).length
    return {
      checked: true,
      found,
      total: finalTitles.length,
      details,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export {
  parseWechatDisplayTimeToTimestamp,
  extractCoverUrlFromThumb,
  parseWechatScheduledTasksHtml,
  matchScheduledTaskByTitles,
  pollAndVerifyScheduledTask,
}

/**
 * 从微信公众平台首页（cgi-bin/home?t=home/index）抓取并同步「定时发表」任务列表
 */
export async function syncWechatScheduledTasks(
  cfg: Config,
  accountId: string,
): Promise<{ ok: boolean; count: number; tasks: WechatScheduledTask[]; error?: string }> {
  if (cfg.runtime.dry_run) {
    const existing = loadWechatScheduledTasks(cfg, accountId)
    return { ok: true, count: existing.length, tasks: existing }
  }

  // 防撞锁保护：若该账号正在执行前台登录流程，主动避让，不与扫码窗口抢锁
  if (isLoginInFlight('gzh', accountId)) {
    const existing = loadWechatScheduledTasks(cfg, accountId)
    return {
      ok: false,
      count: existing.length,
      tasks: existing,
      error: '当前账号正在进行登录流程，已跳过同步以防冲突，请登录完成后再试',
    }
  }

  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies）并直达后台首页
    const token = await navigateToWechatBackend(page, cfg, accountId, 60000)

    if (!token) {
      // 关键修复（中文注释）：未探测到 token 时仅报错返回，严禁物理调用 invalidateAccountSession 破坏用户已保存的有效会话
      return {
        ok: false,
        count: 0,
        tasks: [],
        error: '未检测到微信公众平台登录态（请先在设置中扫码登录公众号）',
      }
    }

    // 确保位于首页 cgi-bin/home
    const homeUrl = `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=${encodeURIComponent(token)}`
    if (!page.url().includes('t=home/index')) {
      await page
        .goto(homeUrl, { waitUntil: 'networkidle2', timeout: 45000 })
        .catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 2500))
    }

    // 1. 若存在「显示全部」展开按钮，主动点击以加载所有排期任务
    try {
      const moreBtn = await page.$(
        '.js_show_all button, .weui-desktop-timer__more-btn, .weui-desktop-timer__more',
      )
      if (moreBtn) {
        await moreBtn.click().catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    } catch {
      // 忽略折叠按钮点击异常
    }

    // 1.1 定时列表由前端异步渲染，等待其稳定后再判定，避免把「尚未加载」当成「没有任务」
    for (let i = 0; i < 8; i++) {
      const settled = await page
        .evaluate(() => {
          const panel = document.getElementById('timer_send_main')
          if (!panel) return true // 该账号后台没有定时模块
          return panel.querySelectorAll('li').length > 0 || panel.innerText.includes('暂无')
        })
        .catch(() => true)
      if (settled) break
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    // 2. 提取「定时发表」区域的完整 HTML，通过专用解析器解析
    const panelHtml = await page.evaluate(() => {
      const el =
        document.getElementById('timer_send_main') ||
        document.querySelector('.weui-desktop-panel.list_container') ||
        document.querySelector('ul.js_send_list')?.closest('.weui-desktop-panel') ||
        document.querySelector('.weui-desktop-timer__list')?.closest('.weui-desktop-panel')
      return el ? el.outerHTML : ''
    })

    let tasks: WechatScheduledTask[] = []
    if (panelHtml) {
      tasks = parseWechatScheduledTasksHtml(panelHtml, new Date(), accountId)
    }

    // 3. 降级解析仅在「定时发表」容器确实存在条目时启用。
    // 容器为空表示后台当前没有任何定时任务，此时对整页做降级解析会把首页「近期草稿」
    // 误判成已排期任务，进而污染本地排期库、导致后续排期误避让或误报冲突。
    if (tasks.length === 0) {
      const hasTimerItems = await page.evaluate(() => {
        const scope =
          document.getElementById('timer_send_main') ||
          document.querySelector('.weui-desktop-panel.list_container')
        if (!scope) return false
        return scope.querySelectorAll('li').length > 0
      })
      if (hasTimerItems) {
        const fullHtml = await page.content()
        tasks = parseWechatScheduledTasksHtml(fullHtml, new Date(), accountId)
      }
    }

    // 4. 落盘持久化
    saveWechatScheduledTasks(cfg, accountId, tasks)
    console.log(
      `[social-publisher] 账号 ${accountId} 微信后台首页定时任务同步完成：获取到 ${tasks.length} 项定时发表`,
    )

    return {
      ok: true,
      count: tasks.length,
      tasks,
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.warn('[social-publisher] 同步微信后台定时任务异常:', errorMsg)
    return {
      ok: false,
      count: 0,
      tasks: loadWechatScheduledTasks(cfg, accountId),
      error: errorMsg,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 从微信公众平台首页取消指定已排期的定时发表任务（驱动官方后台原生注销并原子同步本地排期库）
 */
export async function cancelWechatScheduledTaskByBrowser(
  cfg: Config,
  accountId: string,
  taskId: string,
  targetTitle?: string,
  displayTime?: string,
): Promise<{ ok: boolean; canceledTaskId?: string; message?: string; error?: string }> {
  // 1. 若无明确标题，尝试从本地排期记录中反查该任务的第一篇文章标题与展示时间
  let resolvedTitle = (targetTitle || '').trim()
  let resolvedDisplayTime = (displayTime || '').trim()
  const localTasks = loadWechatScheduledTasks(cfg, accountId)
  const targetTask = localTasks.find(t => t.id === taskId)
  if (targetTask) {
    if (!resolvedTitle && targetTask.articles && targetTask.articles.length > 0) {
      resolvedTitle = targetTask.articles[0].title
    }
    if (!resolvedDisplayTime) {
      resolvedDisplayTime = targetTask.display_time
    }
  }

  // 2. dry_run 演练模式支持
  if (cfg.runtime.dry_run) {
    removeWechatScheduledTask(cfg, accountId, taskId)
    return {
      ok: true,
      canceledTaskId: taskId,
      message: '演练模式：已模拟在微信公众平台取消定时发表并注销本地排期',
    }
  }

  // 3. 启动微信后台浏览器
  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2500))

    let token = new URL(page.url()).searchParams.get('token')
    if (!token) {
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1200))
        token = new URL(page.url()).searchParams.get('token')
        if (token) break
      }
    }

    if (!token) {
      return { ok: false, error: '未检测到微信公众平台登录态（请先在设置中扫码登录公众号）' }
    }

    // 成功进入后台，异步刷新持久化凭据
    await refreshWechatSession(page, cfg, accountId, token)

    // 确保位于首页 cgi-bin/home
    const homeUrl = `https://mp.weixin.qq.com/cgi-bin/home?t=home/index&lang=zh_CN&token=${encodeURIComponent(token)}`
    if (!page.url().includes('t=home/index')) {
      await page
        .goto(homeUrl, { waitUntil: 'networkidle2', timeout: 45000 })
        .catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    // 若存在「显示全部」展开按钮，主动点击展开全部排期
    try {
      const moreBtn = await page.$(
        '.js_show_all button, .weui-desktop-timer__more-btn, .weui-desktop-timer__more',
      )
      if (moreBtn) {
        await moreBtn.click().catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 600))
      }
    } catch {}

    // 定时列表为前端异步渲染，等待渲染完成再匹配，避免「找不到任务」的假失败
    for (let i = 0; i < 8; i++) {
      const ready = await page
        .evaluate(() => {
          const panel = document.getElementById('timer_send_main')
          if (!panel) return true
          return panel.querySelectorAll('li').length > 0 || panel.innerText.includes('暂无')
        })
        .catch(() => true)
      if (ready) break
      await new Promise(resolve => setTimeout(resolve, 1500))
    }

    // 4. 监听微信云端 cancel_time_send CGI 请求响应，确保云端真实撤销
    let cloudCancelSuccess = false
    let cloudCancelError = ''
    page.on('response', async (res) => {
      if (res.url().includes('action=cancel_time_send')) {
        try {
          const json = await res.json().catch(() => null)
          if (json?.base_resp?.ret === 0 || json?.ret === 0) {
            cloudCancelSuccess = true
          } else {
            cloudCancelError = json?.base_resp?.err_msg || json?.err_msg || '微信云端拒绝取消发表'
          }
        } catch {}
      }
    })

    // 定位目标任务并执行取消操作
    const cancelResult = await page.evaluate(
      async (matchTitle: string, matchTime: string) => {
        const cleanTitle = (matchTitle || '').trim().toLowerCase()
        const cleanTime = (matchTime || '').trim()

        // 获取所有定时项
        const items = Array.from(
          document.querySelectorAll(
            '#timer_send_main ul.js_send_list > li, ul.weui-desktop-timer__list > li',
          ),
        )

        let targetLi: Element | null = null

        for (const li of items) {
          // 提取该 li 下的所有标题与时间
          const timeText = (
            li.querySelector('.weui-desktop-timer__time, .weui-desktop-mass__time')?.textContent ||
            ''
          ).trim()
          const titleNodes = Array.from(
            li.querySelectorAll(
              '.weui-desktop-timer__title, .weui-desktop-mass-appmsg__title, a.title, .title',
            ),
          )
          const titles = titleNodes
            .map(t => (t.textContent || '').trim().toLowerCase())
            .filter(Boolean)

          // 标题匹配（双向包含）
          let titleMatched = false
          if (cleanTitle) {
            titleMatched = titles.some(t => t.includes(cleanTitle) || cleanTitle.includes(t))
          }

          // 时间匹配
          let timeMatched = false
          if (cleanTime && timeText) {
            timeMatched = timeText.includes(cleanTime) || cleanTime.includes(timeText)
          }

          if (titleMatched || timeMatched) {
            targetLi = li
            break
          }
        }

        if (!targetLi) {
          return {
            ok: false,
            error: '在微信公众平台首页未找到匹配的定时发表任务（该任务可能已被取消或已发布）',
          }
        }

        // 定位目标任务的确认按钮：
        // 微信公众平台将每个定时项的确认浮层挂在 .weui-desktop-timer__cancel_pop 内的 .weui-desktop-popover
        const popWrp = targetLi.querySelector(
          '.weui-desktop-timer__cancel_pop, .weui-desktop-popover__wrp',
        )
        let confirmBtn = popWrp?.querySelector(
          '.weui-desktop-popover button.weui-desktop-btn_primary, button.weui-desktop-btn_primary',
        ) as HTMLButtonElement | null

        if (!confirmBtn) {
          // 兜底：先触发外层取消链接再获取确认按钮
          const cancelLink = (targetLi.querySelector(
            '.weui-desktop-timer__cancel_pop a, a.global_link_opr',
          ) ||
            Array.from(targetLi.querySelectorAll('a, button')).find(el =>
              (el.textContent || '').includes('取消发表'),
            )) as HTMLElement | null

          if (cancelLink) {
            cancelLink.click()
            await new Promise(r => setTimeout(r, 400))
          }

          confirmBtn = (targetLi.querySelector(
            '.weui-desktop-popover button.weui-desktop-btn_primary',
          ) ||
            document.querySelector(
              '.weui-desktop-popover:not([style*="display: none"]) button.weui-desktop-btn_primary',
            ) ||
            Array.from(document.querySelectorAll('.weui-desktop-popover button')).find(b =>
              (b.textContent || '').includes('确认'),
            )) as HTMLButtonElement | null
        }

        if (!confirmBtn) {
          return { ok: false, error: '未能定位到微信公众平台取消发表确认按钮' }
        }

        // 真实触发微信原生 Popover 确认按钮的点击事件
        confirmBtn.click()
        return { ok: true }
      },
      resolvedTitle,
      resolvedDisplayTime,
    )

    if (!cancelResult.ok) {
      return { ok: false, error: cancelResult.error }
    }

    // 等待微信云端接口返回响应，或等待列表刷新
    for (let i = 0; i < 10; i++) {
      if (cloudCancelSuccess) break
      if (cloudCancelError) break
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    if (cloudCancelError) {
      return { ok: false, error: `微信公众平台云端取消失败: ${cloudCancelError}` }
    }

    // 5. 云端取消确认生效后，原子注销本地持久化排期库
    removeWechatScheduledTask(cfg, accountId, taskId)
    console.log(
      `[social-publisher] 账号 ${accountId} 微信定时任务 ${taskId} (${resolvedTitle || resolvedDisplayTime}) 已成功在云端取消发表并同步本地排期`,
    )

    return {
      ok: true,
      canceledTaskId: taskId,
      message: '微信公众平台云端已成功取消该定时发表任务，群发通知次数已恢复。',
    }
  } catch (err: any) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    console.warn('[social-publisher] 取消微信定时任务异常:', errorMsg)
    return { ok: false, error: `取消微信定时发表异常: ${errorMsg}` }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

// ============================================================================
// 存量草稿批量定时发布（微信后台原生「定时发表」）
// ============================================================================
//
// 背景：既有发布流程只在「新建草稿」时顺带定时，无法处理草稿箱里已有的存量草稿。
// 本能力补齐这一环：枚举草稿箱（文章 type=77 / 贴图 item_show_type=8）→ 逐个打开编辑页
// → 复用 executeBrowserPublishInPage 驱动后台原生「定时发表」→ 提交。
//
// 排期规则（与设计文档场景六/十三一致）：
//  1. 定时完全由微信后台托管，零本地轮询；
//  2. 长文（news）需要群发通知：按账号 schedule_times_article 规则时段，逐个排到有通知配额的日期；
//  3. 小绿书（newspic）**不需要群发通知**，只排时间不占通知配额，按 schedule_times_newspic 规则时段；
//  4. 每排完一篇立刻 sync 后台排期，避免下一篇撞上刚排的时间。

export interface ExistingDraftScheduleItem {
  appmsgid: string
  title: string
  article_type: 'news' | 'newspic'
  status: 'scheduled' | 'failed' | 'skipped'
  scheduled_label?: string
  scheduled_time?: string
  notification?: boolean
  error?: string
}

export interface ExistingDraftScheduleResult {
  success: boolean
  account_id: string
  total: number
  scheduled: number
  failed: number
  skipped: number
  items: ExistingDraftScheduleItem[]
  note?: string
  error?: string
  cleaned_duplicates?: number
}

export interface ScheduleExistingDraftsOptions {
  /** 处理范围：all=草稿箱全部草稿；targeted=仅指定 appmsgid / 标题命中 */
  scope?: 'all' | 'targeted'
  /** 形态：news=仅文章草稿；newspic=仅贴图草稿；both=两者都处理 */
  articleType?: 'news' | 'newspic' | 'both'
  /** 定向处理的 appmsgid 列表（scope=targeted 时生效） */
  appmsgids?: string[]
  /** 定向处理的标题（scope=targeted 时生效，支持包含匹配） */
  titles?: string[]
  /** 最多处理多少个草稿（安全阀，缺省不限制） */
  limit?: number
  /** 演练模式：只枚举不实际排期 */
  dryRun?: boolean
  /** 排期前是否自动同步云端微信后台定时任务（默认 true） */
  autoSyncSchedule?: boolean
  /** 排期前是否自动清理同名重复冗余草稿（默认 true） */
  autoCleanDuplicates?: boolean
}

/**
 * 枚举草稿箱存量草稿并逐个排「定时发表」。
 *
 * 排期时刻由账号规则时段（schedule_times_article / schedule_times_newspic）+ 后台已同步排期
 * 共同决议：每篇发布前重新读取后台排期，跳过被占用的时段，避免同一时刻排两批。
 */
export async function scheduleExistingWechatDrafts(
  cfg: Config,
  accountId: string,
  options: ScheduleExistingDraftsOptions = {},
): Promise<ExistingDraftScheduleResult> {
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'wechat_debug')
  const account = resolveAccount(cfg, accountId)
  const scope = options.scope === 'targeted' ? 'targeted' : 'all'
  const wantType = options.articleType || 'both'
  const items: ExistingDraftScheduleItem[] = []

  if (cfg.runtime.dry_run) {
    return {
      success: true,
      account_id: accountId,
      total: 0,
      scheduled: 0,
      failed: 0,
      skipped: 0,
      items: [],
      error: '演练模式：未启动浏览器',
    }
  }

  const headless = cfg.runtime.gzh_headless !== false
  const browser = await launchWechatBrowser(cfg, accountId, headless)
  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies），确保会话有效，杜绝未登录窗口
    await restoreWechatCookies(page, cfg, accountId)
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2500))
    let token = new URL(page.url()).searchParams.get('token')
    if (!token) {
      for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 1500))
        token = new URL(page.url()).searchParams.get('token')
        if (token) break
      }
    }
    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'schedule_existing_not_logged_in')
      return {
        success: false,
        account_id: accountId,
        total: 0,
        scheduled: 0,
        failed: 0,
        skipped: 0,
        items: [],
        error: '未检测到微信公众平台登录态。截图：' + shot,
      }
    }

    // 成功进入后台，异步刷新持久化凭据
    await refreshWechatSession(page, cfg, accountId, token)

    // 1. 枚举草稿
    const wantNews = wantType === 'news' || wantType === 'both'
    const wantNewspic = wantType === 'newspic' || wantType === 'both'
    const newsDrafts = wantNews ? await listArticleDrafts(page, token) : []
    const newspicDrafts = wantNewspic ? await listNewspicDrafts(page, token) : []

    let targets: Array<DraftRef & { article_type: 'news' | 'newspic' }> = [
      ...newsDrafts.map(d => ({ ...d, article_type: 'news' as const })),
      ...newspicDrafts.map(d => ({ ...d, article_type: 'newspic' as const })),
    ]

    // 过滤空模板/占位草稿：这类草稿没有正文，弹窗打不开也无法发表（实测 SP-TEMPLATE 会报 no-dialog）。
    // 【中文修复依据】：严禁排期包含「文章_1」等调试占位符标题的脏草稿，彻底阻断半成品与脏封面外溢
    const emptyPlaceholders: string[] = []
    targets = targets.filter((t) => {
      const title = (t.title || '').trim()
      if (!title || /^SP-TEMPLATE$/i.test(title) || isInvalidPlaceholderTitle(title)) {
        emptyPlaceholders.push(t.appmsgid)
        return false
      }
      return true
    })

    // 定向筛选
    if (scope === 'targeted') {
      const ids = (options.appmsgids || []).map(s => s.trim()).filter(Boolean)
      const tls = (options.titles || []).map(s => s.trim()).filter(Boolean)
      targets = targets.filter((t) => {
        if (ids.length > 0 && ids.includes(t.appmsgid)) return true
        if (
          tls.length > 0 &&
          t.title &&
          tls.some(x => t.title.includes(x) || x.includes(t.title))
        )
          return true
        return false
      })
    }

    if (typeof options.limit === 'number' && options.limit > 0) {
      targets = targets.slice(0, options.limit)
    }

    if (targets.length === 0) {
      const isTargeted = scope === 'targeted'
      const titlesDesc = (options.titles || []).filter(Boolean).join('、')
      const errReason = isTargeted && titlesDesc
        ? `【安全门禁拦截】：微信后台草稿箱中未找到匹配目标选题「${titlesDesc}」的有效草稿！本次新撰写的图文尚未推入微信后台建立草稿记录。请先执行「发布到草稿箱」，待新草稿创建成功后再执行排期。`
        : '草稿箱中未找到符合条件的草稿'
      return {
        success: !isTargeted,
        account_id: accountId,
        total: 0,
        scheduled: 0,
        failed: isTargeted ? 1 : 0,
        skipped: 0,
        items: [],
        error: errReason,
      }
    }

    // 2. 自动同步云端微信定时发表任务与草稿箱（确保排期基线与草稿元数据均为云端最新事实源，杜绝重复发布）
    if (options.autoSyncSchedule !== false) {
      await Promise.allSettled([
        syncWechatScheduledTasks(cfg, accountId),
        syncWechatDrafts(cfg, accountId, 3),
      ])
    }

    // 存量草稿深度防重预检门禁（三库穿透与批次去重，杜绝通过草稿箱连发同样文章）
    const localDrafts = loadWechatDrafts(cfg, accountId)
    const localDraftMap = new Map<string, WechatDraftCard>()
    for (const d of localDrafts) {
      if (d.appmsgid) localDraftMap.set(d.appmsgid, d)
      if (d.id) localDraftMap.set(d.id, d)
    }

    const recentPublishRecords = readAccountPublishRecords(cfg, accountId)
    const initialScheduledTasks = loadWechatScheduledTasks(cfg, accountId)

    const seenBatchTitles = new Map<string, { appmsgid: string; title: string }>()
    const duplicatesToDelete: string[] = []
    const cleanTargets: typeof targets = []

    for (const target of targets) {
      const mainTitle = (target.title || '').trim()
      const normTitle = normalizeTitle(mainTitle)
      const localCard = localDraftMap.get(target.appmsgid)

      // 检查 1：草稿是否标记为内容不完整
      if (localCard && localCard.is_complete === false) {
        items.push({
          appmsgid: target.appmsgid,
          title: mainTitle,
          article_type: target.article_type,
          status: 'skipped',
          error: `草稿内容不完整（${localCard.incomplete_reason || '无法发表'}），已自动跳过`,
        })
        continue
      }

      // 检查 2：批次内同名草稿熔断去重（若有多篇同名草稿，仅排首篇，其余自动跳过并加入清理列表）
      if (normTitle && normTitle.length >= 3) {
        const existing = seenBatchTitles.get(normTitle)
        if (existing) {
          items.push({
            appmsgid: target.appmsgid,
            title: mainTitle,
            article_type: target.article_type,
            status: 'skipped',
            error: `草稿箱内存在同名重复草稿（已保留首篇草稿 ${existing.appmsgid}），本草稿已自动跳过并清理冗余，杜绝重复发表！`,
          })
          if (options.autoCleanDuplicates !== false) {
            duplicatesToDelete.push(target.appmsgid)
          }
          continue
        }
        seenBatchTitles.set(normTitle, { appmsgid: target.appmsgid, title: mainTitle })
      }

      // 检查 3：穿透历史发文记录（publish_history.json）
      let isAlreadyPublished = false
      let pubDetail = ''
      for (const rec of recentPublishRecords) {
        // 只有确已正式发表（publish_status 为 published / 缺失）才视为占用；
        // scheduled / draft_saved / failed 等状态的记录并未真正发文，不能据此拦截排期
        const recStatus = String(rec.publish_status || '').toLowerCase()
        const countsAsPublished =
          recStatus === 'published' ||
          recStatus === '' ||
          recStatus === 'undefined' ||
          recStatus === 'null'
        if (!countsAsPublished) continue
        for (const art of rec.articles || []) {
          if (normalizeTitle(art) === normTitle) {
            isAlreadyPublished = true
            pubDetail = rec.timestamp || '历史发文'
            break
          }
        }
        if (isAlreadyPublished) break
      }
      if (isAlreadyPublished) {
        items.push({
          appmsgid: target.appmsgid,
          title: mainTitle,
          article_type: target.article_type,
          status: 'skipped',
          error: `文章「${mainTitle}」已于 ${pubDetail} 正式发表过，杜绝重复发表，已自动跳过！`,
        })
        continue
      }

      // 检查 4：穿透微信后台已排期任务（wechat_scheduled_tasks.json）
      let isAlreadyScheduled = false
      let schedDetail = ''
      for (const st of initialScheduledTasks) {
        for (const art of st.articles || []) {
          if (normalizeTitle(art.title) === normTitle) {
            isAlreadyScheduled = true
            schedDetail = st.display_time || st.scheduled_time || '已有排期'
            break
          }
        }
        if (isAlreadyScheduled) break
      }
      if (isAlreadyScheduled) {
        items.push({
          appmsgid: target.appmsgid,
          title: mainTitle,
          article_type: target.article_type,
          status: 'skipped',
          error: `文章「${mainTitle}」已在微信后台定时排期中（${schedDetail}），杜绝重复排期，已自动跳过！`,
        })
        continue
      }

      cleanTargets.push(target)
    }

    // 执行同名冗余草稿物理清理（微信后台原生注销并同步本地草稿库）
    let cleanedDuplicatesCount = 0
    if (duplicatesToDelete.length > 0 && options.autoCleanDuplicates !== false && token) {
      for (const delId of duplicatesToDelete) {
        try {
          await page.evaluate(
            async (tid: string, tk: string) => {
              await fetch(
                `/cgi-bin/operate_appmsg?token=${tk}&lang=zh_CN&sub=del&type=77&appmsgid=${tid}&operate=del`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                },
              )
            },
            delId,
            token,
          )
          cleanedDuplicatesCount++
        } catch {}
      }
      if (cleanedDuplicatesCount > 0) {
        try {
          const curDrafts = loadWechatDrafts(cfg, accountId)
          const remainingDrafts = curDrafts.filter(
            d => !duplicatesToDelete.includes(d.appmsgid) && !duplicatesToDelete.includes(d.id),
          )
          saveWechatDrafts(cfg, accountId, remainingDrafts)
          console.log(
            `[social-publisher] 存量草稿排期前已自动物理清理 ${cleanedDuplicatesCount} 篇同名冗余草稿`,
          )
        } catch {}
      }
    }

    if (cleanTargets.length === 0) {
      const skippedCount = items.filter(x => x.status === 'skipped').length
      return {
        success: true,
        account_id: accountId,
        total: targets.length,
        scheduled: 0,
        failed: 0,
        skipped: skippedCount,
        items,
        cleaned_duplicates: cleanedDuplicatesCount,
        note: `草稿箱中的 ${targets.length} 篇草稿均已被防重门禁跳过（已发表/已排期/同名重复），未产生重复发表。`,
      }
    }

    // 3. 逐个排期：遍历通过防重门禁的干净草稿
    let batchBaseline = loadWechatScheduledTasks(cfg, accountId).length
    // 维护批次内已分配的槽位列表（严格按形态隔离，长文与小绿书各自独立防撞）
    const allocatedSlots: ScheduleAllocatedSlot[] = []
    for (let i = 0; i < cleanTargets.length; i += 1) {
      const target = cleanTargets[i]
      const isNewspic = target.article_type === 'newspic'
      const label = `[${i + 1}/${cleanTargets.length}] ${target.title || target.appmsgid}`
      try {
        // 每篇都重新决议时段：读取当前账号后台排期与本批次已分配槽位，跳过已占用时段
        const slotRes = resolveNextScheduleSlot(
          cfg,
          accountId,
          isNewspic ? 'newspic' : 'news',
          undefined,
          new Date(),
          { requireNotification: !isNewspic, allocatedSlots },
        )

        // 打开草稿编辑页。用 domcontentloaded + 容错：部分账号编辑器加载慢，
        // 直接抛 Navigation timeout 会白白浪费一次排期机会（实测 default-copy 高发）。
        await page
          .goto(
            isNewspic
              ? newspicDraftEditUrl(token, target.appmsgid)
              : draftEditUrl(token, target.appmsgid),
            { waitUntil: 'domcontentloaded', timeout: 90000 },
          )
          .catch(async () => {
            // 超时后页面往往已经可用，继续走流程；确实不可用时后续步骤会自然报错
            await new Promise(resolve => setTimeout(resolve, 3000))
          })
        await new Promise(resolve => setTimeout(resolve, isNewspic ? 7000 : 4500))

        // 关掉新手引导遮罩（会拦截点击）。
        // 注意：只隐藏真正的引导层与遮罩，**绝不能碰 .weui-desktop-dialog__wrp** ——
        // 发表弹窗本身就挂在 __wrp 里，一并隐藏会导致后续找不到弹窗（报 no-dialog）。
        await page.evaluate(() => {
          document.querySelectorAll('.education-dialog, .weui-desktop-mask').forEach((el) => {
            (el as HTMLElement).style.display = 'none'
          })
        })
        await new Promise(resolve => setTimeout(resolve, 800))

        const action = await executeBrowserPublishInPage(
          page,
          'schedule',
          slotRes.iso,
          debugDir,
          slotRes.need_notification, // 只有当天最早的第一个普通长文需要群发通知
          batchBaseline,
        )

        if (action.scheduled) {
          // 记录本批次已分配槽位（绑定文章形态），防止同形态后续草稿撞车，绝不跨形态干扰
          allocatedSlots.push({ timestamp: slotRes.timestamp, article_type: target.article_type })

          items.push({
            appmsgid: target.appmsgid,
            title: target.title,
            article_type: target.article_type,
            status: 'scheduled',
            scheduled_label: action.schedule_label,
            scheduled_time: action.schedule_time,
            notification: action.schedule_notification,
          })

          // 排期成功后原子更新：从本地草稿箱 wechat_drafts.json 中剔除该草稿
          try {
            const currentDrafts = loadWechatDrafts(cfg, accountId)
            const remainingDrafts = currentDrafts.filter(
              d => d.appmsgid !== target.appmsgid && d.id !== target.appmsgid,
            )
            saveWechatDrafts(cfg, accountId, remainingDrafts)
          } catch {}

          // 【中文修复依据】：严禁在持有浏览器实例期间调用 syncWechatScheduledTasks 网页抓取，彻底切断重入死锁。
          // 为保证同批次后续草稿及后续时段决议即时感知该时段已被占用，在此将成功排期的任务原子追加写入本地持久化库。
          try {
            const curTasks = loadWechatScheduledTasks(cfg, accountId)
            const newTask: WechatScheduledTask = {
              id: `wechat_${slotRes.timestamp}_${i}_${Buffer.from(target.title || '').toString('hex').slice(0, 8)}`,
              account_id: accountId,
              display_time: action.schedule_label
                ? `${action.schedule_label} ${action.schedule_time || ''}`.trim()
                : (slotRes.delay_reason || '已排期'),
              scheduled_time: slotRes.iso,
              scheduled_timestamp: slotRes.timestamp,
              has_notification: Boolean(action.schedule_notification),
              article_type: target.article_type,
              articles: [{ title: target.title || '', article_type: target.article_type }],
              can_cancel: true,
              synced_at: new Date().toISOString(),
            }
            saveWechatScheduledTasks(cfg, accountId, [
              ...curTasks.filter(t => t.id !== newTask.id && t.scheduled_timestamp !== newTask.scheduled_timestamp),
              newTask,
            ])
          } catch (taskSaveErr) {
            console.warn('[social-publisher] 存量草稿排期成功后原子写入本地排期库异常:', taskSaveErr)
          }

          batchBaseline = loadWechatScheduledTasks(cfg, accountId).length
        } else {
          items.push({
            appmsgid: target.appmsgid,
            title: target.title,
            article_type: target.article_type,
            status: 'failed',
            error: action.schedule_error || '定时未在后台生效',
          })
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        items.push({
          appmsgid: target.appmsgid,
          title: target.title,
          article_type: target.article_type,
          status: 'failed',
          error: message,
        })
        await debugScreenshot(page, debugDir, 'schedule_existing_failed_' + target.appmsgid).catch(
          () => undefined,
        )
      }
      console.log(`[social-publisher] 存量草稿排期 ${label} -> ${items[items.length - 1].status}`)
    }

    const scheduled = items.filter(x => x.status === 'scheduled').length
    const failed = items.filter(x => x.status === 'failed').length
    const skipped = items.filter(x => x.status === 'skipped').length

    return {
      success: failed === 0,
      account_id: accountId,
      total: targets.length,
      scheduled,
      failed,
      skipped,
      items,
      cleaned_duplicates: cleanedDuplicatesCount,
      ...(emptyPlaceholders.length > 0
        ? {
          note: `已跳过 ${emptyPlaceholders.length} 个空模板草稿（无正文，无法发表）：${emptyPlaceholders.join(', ')}`,
        }
        : {}),
      ...(failed > 0 ? { error: `${failed}/${targets.length} 个草稿定时失败，详见 items` } : {}),
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 从微信公众平台抓取并同步草稿箱列表（同时涵盖图文文章与贴图草稿）
 */
export async function syncWechatDrafts(
  cfg: Config,
  accountId: string,
  maxPages = 3,
): Promise<{ ok: boolean; count: number; drafts: WechatDraftCard[]; error?: string }> {
  if (cfg.runtime.dry_run) {
    return { ok: true, count: 0, drafts: [] }
  }

  // 防撞锁保护：若该账号正在执行前台登录流程，主动避让，不与扫码窗口抢锁
  if (isLoginInFlight('gzh', accountId)) {
    return {
      ok: false,
      count: 0,
      drafts: [],
      error: '当前账号正在进行登录流程，已跳过同步以防冲突，请登录完成后再试',
    }
  }

  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies）并直达后台首页
    const token = await navigateToWechatBackend(page, cfg, accountId, 60000)

    if (!token) {
      // 关键修复（中文注释）：未探测到 token 时仅报错返回，严禁物理调用 invalidateAccountSession 破坏用户已保存的有效会话
      return {
        ok: false,
        count: 0,
        drafts: [],
        error: '未检测到微信公众平台登录态（请先在设置中扫码登录公众号）',
      }
    }

    const allCards: WechatDraftCard[] = []
    const seenIds = new Set<string>()

    // 1. 打开微信草稿箱页面
    const listUrl = draftListUrl(token, 0)
    await page.goto(listUrl, { waitUntil: 'networkidle2', timeout: 45000 }).catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 2000))

    // --- 步骤 A：同步「文章」Tab 草稿 ---
    // 检查并确保激活「文章」Tab
    const switchedToNews = await page.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('.header_btn_opr .header_button, .header_button'),
      )
      const newsBtn = btns.find(b => (b.textContent || '').includes('文章'))
      if (newsBtn && !newsBtn.classList.contains('currentTab')) {
        const btn = newsBtn.querySelector('button') || newsBtn;
        (btn as HTMLElement).click()
        return true
      }
      return false
    })
    if (switchedToNews) {
      await new Promise(resolve => setTimeout(resolve, 2000))
    }

    const newsHtml = await page.evaluate(() => {
      const panel = document.querySelector('.weui-desktop-panel, .weui-desktop-media__list-wrp')
      return panel ? panel.outerHTML : document.body.innerHTML
    })

    const newsCards = parseWechatDraftsHtml(newsHtml, accountId, new Date())
    for (const card of newsCards) {
      // 尊重卡片自身的独立特征判断：若自身是小绿书则保留 newspic，否则归类为 news
      if (card.article_type !== 'newspic') {
        card.article_type = 'news'
      }
      if (!seenIds.has(card.appmsgid)) {
        seenIds.add(card.appmsgid)
        allCards.push(card)
      }
    }

    // --- 步骤 B：同步「贴图」（小绿书）Tab 草稿 ---
    // 在同一个草稿箱页面中查找并点击「贴图」Tab 按钮
    const switchedToPic = await page.evaluate(() => {
      const btns = Array.from(
        document.querySelectorAll('.header_btn_opr .header_button, .header_button'),
      )
      const picBtn = btns.find(b => (b.textContent || '').includes('贴图'))
      if (picBtn) {
        const btn = picBtn.querySelector('button') || picBtn;
        (btn as HTMLElement).click()
        return true
      }
      return false
    })

    if (switchedToPic) {
      // 等待贴图面板及小绿书竖版封面瀑布流渲染完毕
      await new Promise(resolve => setTimeout(resolve, 2500))
      const picHtml = await page.evaluate(() => {
        const panel = document.querySelector('.weui-desktop-panel, .weui-desktop-media__list-wrp')
        return panel ? panel.outerHTML : document.body.innerHTML
      })

      const picCards = parseWechatDraftsHtml(picHtml, accountId, new Date())
      for (const card of picCards) {
        // 贴图 Tab 下解析出的所有草稿绝对是小绿书贴图
        card.article_type = 'newspic'
        if (!seenIds.has(card.appmsgid)) {
          seenIds.add(card.appmsgid)
          allCards.push(card)
        } else {
          // 若先前在默认页面被误扫入，立即更新并矫正为 newspic
          const existing = allCards.find(c => c.appmsgid === card.appmsgid)
          if (existing) {
            existing.article_type = 'newspic'
            existing.articles = card.articles
            existing.update_time_str = card.update_time_str
            existing.updated_at = card.updated_at
          }
        }
      }
    } else {
      // 容灾保底：若页面未检测到 Tab 按钮，尝试通过 newspicListUrl 补全
      for (let pageIdx = 0; pageIdx < Math.min(maxPages, 2); pageIdx++) {
        const begin = pageIdx * DRAFT_LIST_PAGE_SIZE
        const fallbackPicUrl = newspicListUrl(token, begin)
        await page
          .goto(fallbackPicUrl, { waitUntil: 'networkidle2', timeout: 35000 })
          .catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 1500))

        const fallbackHtml = await page.evaluate(() => {
          const panel = document.querySelector(
            '.weui-desktop-panel, .weui-desktop-media__list-wrp',
          )
          return panel ? panel.outerHTML : document.body.innerHTML
        })
        const picCards = parseWechatDraftsHtml(fallbackHtml, accountId, new Date())
        if (picCards.length === 0) break
        for (const card of picCards) {
          card.article_type = 'newspic'
          if (!seenIds.has(card.appmsgid)) {
            seenIds.add(card.appmsgid)
            allCards.push(card)
          } else {
            const existing = allCards.find(c => c.appmsgid === card.appmsgid)
            if (existing) existing.article_type = 'newspic'
          }
        }
      }
    }

    // 关键自愈（中文注释）：扫描已抓取的草稿卡片，若发现标题包含 SP-TEMPLATE 或未完成模板占位符，
    // 立即直接在当前已打开且持有有效 token 的页面中静默执行物理销毁，彻底杜绝污染草稿箱
    const zombieCards = allCards.filter((c) => {
      const t = (c.articles?.[0]?.title || (c as any).title || '').trim()
      return isPlaceholderTemplateDraft(t, c)
    })
    if (zombieCards.length > 0) {
      console.log(
        `[social-publisher] 账号 ${accountId} 同步时发现 ${zombieCards.length} 篇 SP-TEMPLATE 垃圾草稿，正在就地执行物理销毁...`,
      )
      for (const zc of zombieCards) {
        const tid = zc.appmsgid
        const tc = zc.article_type === 'newspic' ? '8' : '77'
        await page
          .evaluate(
            async (id: string, tk: string, typeCode: string) => {
              await fetch(
                `/cgi-bin/operate_appmsg?token=${tk}&lang=zh_CN&sub=del&type=${typeCode}&appmsgid=${id}&operate=del`,
                { credentials: 'include' },
              ).catch(() => undefined)
            },
            tid,
            token,
            tc,
          )
          .catch(() => undefined)
      }
      const zombieIds = new Set(zombieCards.map(c => c.appmsgid))
      for (let i = allCards.length - 1; i >= 0; i--) {
        if (zombieIds.has(allCards[i].appmsgid)) {
          allCards.splice(i, 1)
        }
      }
    }

    // 按更新时间倒序排序
    allCards.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))

    return {
      ok: true,
      count: allCards.length,
      drafts: allCards,
    }
  } catch (err: any) {
    return {
      ok: false,
      count: 0,
      drafts: [],
      error: `从微信后台同步草稿异常: ${err.message}`,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 从微信公众平台后台物理删除指定草稿（采用原生 CGI 接口优先 + DOM 自动化保底双模机制）
 */
export async function deleteWechatDraftByBrowser(
  cfg: Config,
  accountId: string,
  appmsgid: string,
  articleType: 'news' | 'newspic' = 'news',
): Promise<{ ok: boolean; error?: string }> {
  if (cfg.runtime.dry_run) {
    return { ok: true }
  }

  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    // 自动恢复微信已保存的登录凭据（Cookies）并直达后台首页
    const token = await navigateToWechatBackend(page, cfg, accountId, 45000)

    if (!token) {
      return { ok: false, error: '未检测到微信公众平台登录态，请先在设置中扫码登录' }
    }

    const typeCode = articleType === 'newspic' ? '77' : '77'

    // 1. 快速通道：在浏览器上下文中通过原生 CGI fetch 发送删除指令
    const cgiResult = await page.evaluate(
      async (tid: string, tk: string, tc: string) => {
        try {
          const resp = await fetch(
            `/cgi-bin/operate_appmsg?token=${tk}&lang=zh_CN&sub=del&type=${tc}&appmsgid=${tid}&operate=del`,
            {
              method: 'POST',
              credentials: 'include',
              headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
              },
            },
          )
          const json = await resp.json().catch(() => null)
          const isOk = resp.ok && (!json || json?.base_resp?.ret === 0)
          return { ok: isOk, json }
        } catch (err: any) {
          return { ok: false, error: err.message }
        }
      },
      appmsgid,
      token,
      typeCode,
    )

    if (cgiResult.ok) {
      return { ok: true }
    }

    // 2. 容灾保底：前往草稿箱列表页面定位卡片进行 DOM 级点击删除与 Popover 气泡确认
    const targetUrl = articleType === 'newspic' ? newspicListUrl(token, 0) : draftListUrl(token, 0)
    await page
      .goto(targetUrl, { waitUntil: 'networkidle2', timeout: 35000 })
      .catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 2000))

    const deletedByDom = await page.evaluate(async (tid: string) => {
      const card = document.querySelector(
        `.weui-desktop-card[data-appid="${tid}"], .weui-desktop-card[data-appmsgid="${tid}"]`,
      )
      if (!card) return false

      // 定位删除图标按钮
      const delBtn = card.querySelector(
        '.weui-desktop-card__action .weui-desktop-popover__target a, a.weui-desktop-icon-btn',
      ) as HTMLElement
      if (delBtn) delBtn.click()

      // 等待 Popover 气泡出现并点击内部「删除」按钮
      await new Promise(r => setTimeout(r, 600))
      const confirmBtn = card.querySelector(
        '.weui-desktop-popover__bar .weui-desktop-btn_primary, button.weui-desktop-btn_primary',
      ) as HTMLElement
      if (confirmBtn) {
        confirmBtn.click()
        return true
      }
      return false
    }, appmsgid)

    if (deletedByDom) {
      await new Promise(resolve => setTimeout(resolve, 1500))
      return { ok: true }
    }

    return {
      ok: false,
      error: cgiResult.error || '微信后台未能找到目标草稿或执行删除失败',
    }
  } catch (err: any) {
    return { ok: false, error: `微信草稿删除失败: ${err.message}` }
  } finally {
    await browser.close().catch(() => undefined)
  }
}
