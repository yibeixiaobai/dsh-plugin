// 小红书笔记发布适配器：浏览器自动化（puppeteer-core + 本机 Chrome/Edge）。
// 小红书没有官方发布 API，浏览器路线由创作者中心页面自身处理签名与风控，
// 登录态持久化在账号独立 userDataDir（扫码一次长期有效）。
// 发布终点默认只存草稿箱（账号级 publish_immediately 开关可改为直接发布）。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { accountScriptsDir, xhsProfileDir } from './sync.ts'
import { getCachedLoginState, setCachedLoginState, isLoginInFlight, setLoginInFlight } from './login-state.ts'
import { findBrowserExecutable, cleanStaleChromeLocks } from './zhihu.ts'

const CREATOR_URL = 'https://creator.xiaohongshu.com'
// 必须带 source/from 参数：裸 /publish/publish 进入时 SPA 未初始化 tab 状态，
// 点击「上传图文」会被当成导航跳到 ?from=tab_switch（视频页），图文编辑器永不出现。
const PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official&from=menu'
// 「稿件管理」（创作服务平台 → 笔记管理）的权威地址。
// 旧地址 /creator/notemanage 会 302 到这里；实测确认列表数据来自该页自身
// 发起的签名接口请求（见 NOTE_LIST_API），因此必须如实访问该 URL。
const NOTE_MANAGER_URL = 'https://creator.xiaohongshu.com/new/note-manager'
// 笔记列表接口：稿件管理页用它取「已发布」列表。
// 【关键】该接口带 X-S-Common / X-s 反爬签名，签名由页面自身 JS 生成，
// 用 fetch/axios 复刻必然拿到空列表（实测 tab0~tab3 全为 0 条）。
// 因此只能「让页面自己发请求 + 拦截其响应」，不能自己拼请求。
const NOTE_LIST_API = '/api/galaxy/v2/creator/note/user/posted'
const RISK_PATTERNS = ['验证', '滑块', '安全检测', '账号异常', '环境异常']

export const XHS_LOGIN_ROUTE = '/api/gzh-publisher/xhs-login'

/** 单篇笔记的发布结局。三态取代原先的「二态 + pending 占位符」：
 *  - published    已在稿件管理中查到该笔记（拿到了真实 note_id，可回查）
 *  - unconfirmed  点击发布后未在稿件管理中查到（可能仍在同步，或发布未生效）
 *  - failed       明确的失败（如找不到发布按钮、页面风控）
 *  只有 failed 才应中断整批；unconfirmed 必须如实上报，绝不伪装成功。 */
export type XhsNoteStatus = 'published' | 'unconfirmed' | 'failed'

export interface XhsNote {
  note_id: string
  title: string
  url: string
  published?: boolean
  status?: XhsNoteStatus
  /** 人类可读的判定依据，便于排查与汇总展示 */
  confirm_note?: string
  /** 稿件管理中记录的平台发布时间，形如 2026-09-28 16:07 */
  posted_time?: string
}

export interface XhsPublishJob {
  account_id: string
  titles: string[]
  article_files: string[]
  image_files: Record<string, string[]>
  image_counts: number[]
  publish_immediately: boolean
  dry_run: boolean
  min_words: number
  forbidden: string[]
  tags: string[]
  only?: number[]
}

export interface XhsPublishResult {
  dry_run: boolean
  notes: XhsNote[]
}

export interface XhsVerifyNote {
  title: string
  found: boolean
  url?: string
  published?: boolean
  note?: string
  note_id?: string
  status?: XhsNoteStatus
}

/** 稿件管理列表中的一条笔记（字段取自接口实测返回） */
interface XhsManagedNote {
  id: string
  display_title: string
  time: string
  tab_status?: number
  type?: string
}

/**
 * 读取账号在「稿件管理」中的笔记列表（权威数据源）。
 *
 * 【为什么必须这么做】
 * 旧实现只在发布页 URL 里找 note_id（/explore/{id} 或 note_id={id}），但小红书
 * 发布成功后只会跳到 ?published=true，URL 里根本不含 note_id —— 于是「确实发成功」
 * 也被判成「未能确认发布成功」，产生假阴性（实测：2026-09-28 16:07 的笔记已在
 * 稿件管理中可见，工具却报未确认）。
 *
 * 【为什么不能直接请求接口】
 * 该接口带 X-S-Common / X-s 反爬签名，签名由页面 JS 生成。实测用页面内 fetch
 * 复刻请求，tab0~tab3 全部返回 0 条（被判定为未签名而拒绝）。因此这里让页面
 * 自己加载稿件管理页，并用 CDP 拦截它自己发出的签名请求响应，取其 JSON。
 *
 * 返回 null 表示「无法读取」（未登录/风控/接口结构变化），调用方须区分对待：
 * 读不到 ≠ 没发布，不能据此判定失败。
 */
async function fetchManagedNotes(
  page: Page,
  debugDir: string,
): Promise<XhsManagedNote[] | null> {
  // 拦截页面自身发出的签名请求，直接取它的 JSON 响应。
  // 这是唯一能拿到 note_id 的可靠途径：DOM 里没有 <a href>（实测为空），
  // 而自己复刻请求会因缺少 X-s 签名被拒。
  const bodies: Array<Promise<XhsManagedNote[] | null>> = []
  const onResponse = (res: import('puppeteer-core').HTTPResponse): void => {
    try {
      if (!res.url().includes(NOTE_LIST_API)) return
      if ((res.request().method() || 'GET').toUpperCase() !== 'GET') return
      bodies.push(
        res.json().then(
          (json: unknown) => {
            const notes = (json as { data?: { notes?: XhsManagedNote[] } })?.data?.notes
            return Array.isArray(notes) && notes.length > 0 ? notes : null
          },
          () => null,
        ),
      )
    } catch {
      /* 忽略：拦截失败不应影响主流程 */
    }
  }

  try {
    page.on('response', onResponse)
    await page.goto(NOTE_MANAGER_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await assertNoRiskPage(page, debugDir, 'note_manager')

    // 列表异步加载：轮询等待「拦截到的响应」或「已渲染的条目」。
    const deadline = Date.now() + 25000
    while (Date.now() < deadline) {
      const settled = await Promise.all(bodies.map((p) => p.catch(() => null)))
      const hit = settled.find((n): n is XhsManagedNote[] => Array.isArray(n) && n.length > 0)
      if (hit) return hit

      // 兜底：接口结构变化时，至少从已渲染 DOM 取标题+时间（无 note_id）
      const rendered = await readRenderedNotes(page).catch(() => null)
      if (rendered && rendered.length > 0 && Date.now() + 8000 > deadline) return rendered

      await new Promise((resolve) => setTimeout(resolve, 1000))
    }
    const settled = await Promise.all(bodies.map((p) => p.catch(() => null)))
    return settled.find((n): n is XhsManagedNote[] => Array.isArray(n) && n.length > 0) ?? null
  } catch (error) {
    await debugScreenshot(page, debugDir, 'note_manager_failed').catch(() => undefined)
    console.error('[xhs] 读取稿件管理失败:', error)
    return null
  } finally {
    page.off('response', onResponse)
  }
}

/**
 * 从「稿件管理」已渲染的 DOM 中提取笔记条目。
 *
 * 说明：页面的列表数据由它自己的签名请求获得；页面内再 fetch 会被拒，
 * 所以这里只解析已渲染的 DOM，避免复刻签名。
 */
async function readRenderedNotes(page: Page): Promise<XhsManagedNote[] | null> {
  return page.evaluate(() => {
    const out: XhsManagedNote[] = []
    const seen = new Set<string>()
    // 条目时间形如 2026-09-28 16:07；标题是其上方的可读文本。
    const timeRe = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}$/
    const all = Array.from(document.querySelectorAll('div,li,section,article'))
    for (const el of all) {
      const kids = Array.from(el.children)
      for (let i = 0; i < kids.length; i++) {
        const t = (kids[i].textContent || '').trim()
        if (!timeRe.test(t)) continue
        // 标题向上找一个包含较多文本但又不含时间的兄弟节点
        let title = ''
        for (let j = i - 1; j >= 0 && j >= i - 4; j--) {
          const cand = (kids[j].textContent || '').trim()
          if (cand && !timeRe.test(cand) && cand.length <= 80) { title = cand; break }
        }
        if (!title) {
          const parentText = (el.textContent || '').trim()
          const m = parentText.split('\n').map((s) => s.trim()).filter(Boolean)
          const idx = m.findIndex((s) => timeRe.test(s))
          if (idx > 0) title = m[idx - 1]
        }
        if (!title || title.length > 80) continue
        // DOM 中通常不含 note_id（在跳转链接里），先占位，后续用详情页补全
        const key = title + '|' + t
        if (seen.has(key)) continue
        seen.add(key)
        out.push({ id: '', display_title: title, time: t })
      }
    }
    return out.length > 0 ? out : null
  })
}

/** 把 "2026-09-28 16:07" 解析为时间戳（本地时区，与平台展示一致） */
function parsePostedTime(s: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/.exec((s || '').trim())
  if (!m) return NaN
  return new Date(
    Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]),
  ).getTime()
}

/** 标题归一化：统一全角/半角、大小写与零宽字符，避免因排版细节漏配 */
function normalizeTitle(s: string): string {
  return (s || '')
    .replace(/\s+/g, '')
    // 全角字符（U+FF01–U+FF5E）转半角；全角空格 U+3000 单独处理
    .replace(/[\uFF01-\uFF5E]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, '')
    .replace(/[\uFE0F\u200D]/g, '')
    .toLowerCase()
}

/**
 * 在稿件管理列表中为「某篇刚发布的笔记」找到对应条目。
 *
 * 匹配策略（宁可 unconfirmed 也不误判成功）：
 *  1. 标题归一化后完全相同；
 *  2. 若标题命中多条，用发布时间窗口（默认前后 15 分钟）消歧；
 *  3. 标题命中但时间都在窗口外 → 视为历史同名笔记，不算本次成功。
 */
function matchManagedNote(
  notes: XhsManagedNote[],
  title: string,
  publishedAtMs: number,
  windowMs = 15 * 60 * 1000,
): { note: XhsManagedNote; matchedBy: string } | null {
  const want = normalizeTitle(title)
  const same = notes.filter((n) => normalizeTitle(n.display_title) === want)
  if (same.length === 0) return null
  if (same.length === 1) {
    const t = parsePostedTime(same[0].time)
    if (Number.isNaN(t) || Math.abs(t - publishedAtMs) <= windowMs) {
      return { note: same[0], matchedBy: '标题完全一致' }
    }
    return null
  }
  // 多条同名：取时间最接近且落在窗口内的
  const inWindow = same
    .map((n) => ({ n, t: parsePostedTime(n.time) }))
    .filter((x) => !Number.isNaN(x.t) && Math.abs(x.t - publishedAtMs) <= windowMs)
    .sort((a, b) => Math.abs(a.t - publishedAtMs) - Math.abs(b.t - publishedAtMs))
  if (inWindow.length === 0) return null
  return { note: inWindow[0].n, matchedBy: '标题一致+时间窗口(' + inWindow.length + '条同名)' }
}

export interface XhsConfirmItem {
  title: string
  status: XhsNoteStatus
  note_id?: string
  posted_time?: string
  url?: string
  note?: string
}

/**
 * 发布后确认：进「稿件管理」核对这批标题是否真的出现了。
 *
 * 与旧实现的本质区别：旧实现靠发布页 URL 里的 note_id 判定（小红书根本不提供），
 * 因此必然假阴性；这里改为查权威列表，成功即返回真实 note_id。
 *
 * 三态语义见 XhsNoteStatus。读不到列表时返回 unconfirmed（而不是 failed），
 * 因为「读不到」不等于「没发布」。
 */
export async function xhsConfirmPublished(
  cfg: Config,
  accountId: string,
  expected: Array<{ title: string; publishedAtMs: number }>,
): Promise<{ logged_in: boolean; items: XhsConfirmItem[] }> {
  const browser = await launchXhsBrowser(cfg, accountId, cfg.runtime.xhs_headless !== false)
  try {
    const page = await browser.newPage()
    const debugDir = path.join(accountScriptsDir(cfg, accountId), 'xhs_debug')
    await restoreXhsCookies(page, cfg, accountId)
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (!(await isLoggedIn(page))) {
      return {
        logged_in: false,
        items: expected.map((e) => ({ title: e.title, status: 'unconfirmed' as XhsNoteStatus, note: '小红书未登录，无法核对稿件管理' })),
      }
    }

    const managed = await fetchManagedNotes(page, debugDir)
    if (!managed) {
      return {
        logged_in: true,
        items: expected.map((e) => ({
          title: e.title,
          status: 'unconfirmed' as XhsNoteStatus,
          note: '稿件管理列表读取失败（未登录/风控/接口变化），无法确认，请人工核对',
        })),
      }
    }

    const items: XhsConfirmItem[] = expected.map((e) => {
      const hit = matchManagedNote(managed, e.title, e.publishedAtMs)
      if (!hit) {
        return {
          title: e.title,
          status: 'unconfirmed' as XhsNoteStatus,
          note: '稿件管理中未找到该标题（列表共 ' + managed.length + ' 条；可能仍在同步，请稍后人工核对）',
        }
      }
      const id = hit.note.id || ''
      return {
        title: e.title,
        status: 'published' as XhsNoteStatus,
        ...(id ? { note_id: id, url: 'https://www.xiaohongshu.com/explore/' + id } : {}),
        posted_time: hit.note.time,
        note: '稿件管理已收录（' + hit.matchedBy + '）' + (id ? '' : '；未取到笔记ID'),
      }
    })
    await debugScreenshot(page, debugDir, 'note_manager_confirmed').catch(() => undefined)
    return { logged_in: true, items }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

async function launchXhsBrowser(cfg: Config, accountId: string, headless: boolean): Promise<Browser> {
  const profileDir = xhsProfileDir(cfg, accountId)
  fs.mkdirSync(profileDir, { recursive: true })
  cleanStaleChromeLocks(profileDir)
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ]
  if (!headless) {
    args.push('--start-maximized')
  } else {
    args.push('--window-size=1440,900')
  }
  try {
    return await puppeteer.launch({
      executablePath: findBrowserExecutable(cfg),
      headless,
      userDataDir: profileDir,
      defaultViewport: headless ? { width: 1440, height: 900 } : null,
      protocolTimeout: 600000,
      args,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/user data directory|ProcessSingleton|SingletonLock/i.test(message)) {
      throw new Error('小红书浏览器目录被占用（可能已有小红书任务在运行）。请等待其结束后重试：' + profileDir)
    }
    throw new Error('启动浏览器失败：' + message)
  }
}

export interface XhsSessionData {
  account_id: string
  platform: 'xiaohongshu'
  user_id?: string
  user_name?: string
  red_id?: string
  cookies: Array<any>
  updated_at: string
}

export function xhsSessionPath(cfg: Config, accountId: string): string {
  return path.join(xhsProfileDir(cfg, accountId), 'xhs_session.json')
}

export function xhsBackupSessionPath(cfg: Config, accountId: string): string {
  return path.join(accountScriptsDir(cfg, accountId), 'xhs_session.json')
}

export function saveXhsSession(cfg: Config, accountId: string, data: XhsSessionData): void {
  try {
    const raw = JSON.stringify(data, null, 2) + '\n'
    const p1 = xhsSessionPath(cfg, accountId)
    fs.mkdirSync(path.dirname(p1), { recursive: true })
    fs.writeFileSync(p1, raw, 'utf-8')
    const p2 = xhsBackupSessionPath(cfg, accountId)
    fs.mkdirSync(path.dirname(p2), { recursive: true })
    fs.writeFileSync(p2, raw, 'utf-8')
  } catch (err) {
    console.error('[xhs] 保存小红书登录凭据失败:', err)
  }
}

export function loadXhsSession(cfg: Config, accountId: string): XhsSessionData | null {
  const p1 = xhsSessionPath(cfg, accountId)
  const p2 = xhsBackupSessionPath(cfg, accountId)
  const candidate = fs.existsSync(p1) ? p1 : (fs.existsSync(p2) ? p2 : null)
  if (!candidate) return null
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as XhsSessionData
  } catch {
    return null
  }
}

export async function restoreXhsCookies(page: Page, cfg: Config, accountId: string): Promise<boolean> {
  const session = loadXhsSession(cfg, accountId)
  if (session && Array.isArray(session.cookies) && session.cookies.length > 0) {
    try {
      await page.setCookie(...session.cookies)
      return true
    } catch {}
  }
  return false
}

export interface XhsLoginStatus {
  logged_in: boolean
  user_id?: string
  user_name?: string
  red_id?: string
}

export async function checkXhsLoginStatus(page: Page): Promise<XhsLoginStatus> {
  const cookies = await page.cookies().catch(() => [])
  const hasSessionCookie = cookies.some((c) =>
    (c.name === 'galaxy_creator_session_id' ||
     c.name === 'access-token-creator.xiaohongshu.com' ||
     c.name === 'customer-sso-sid' ||
     c.name === 'x-user-id-creator.xiaohongshu.com' ||
     c.name === 'galaxy.creator.beaker.session.id' ||
     c.name === 'web_session') &&
    Boolean(c.value && c.value.trim()),
  )

  const url = page.url()
  const isLoginPage = url.includes('/login') || url.includes('/signin')

  const pageState = await page.evaluate(() => {
    try {
      const qrcode = document.querySelector('.qrcode, [class*="qrcode"], [class*="login-box"], [class*="login-container"]')
      const hasQrcode = Boolean(qrcode && (qrcode as HTMLElement).offsetParent !== null)

      const publishBtn = document.querySelector('[class*="publish"], a[href*="publish"]')
      const avatar = document.querySelector('[class*="avatar"], img[src*="avatar"], img[src*="sns-avatar"]')
      const hasCreatorElements = Boolean(publishBtn || avatar)

      let userId = ''
      try {
        const userInfoRaw = localStorage.getItem('USER_INFO')
        if (userInfoRaw) {
          const parsed = JSON.parse(userInfoRaw)
          userId = parsed?.user?.value?.userId || parsed?.userId || ''
        }
      } catch {}
      if (!userId) {
        userId = localStorage.getItem('snsWebPublishCurrentUser') || ''
      }

      let userName = ''
      let redId = ''
      const bodyText = document.body?.innerText || ''
      const redIdMatch = bodyText.match(/小红书(?:号|账号)\s*[:：]\s*([A-Za-z0-9_-]+)/)
      if (redIdMatch) redId = redIdMatch[1]

      const nameEl = document.querySelector('[class*="user-name"], [class*="name-box"], [class*="author-name"], [class*="user-info"]')
      if (nameEl) {
        userName = nameEl.textContent?.trim() || ''
      }
      if (!userName && bodyText.includes('创作服务平台')) {
        const lines = bodyText.split('\n').map((l) => l.trim()).filter(Boolean)
        const idx = lines.indexOf('创作服务平台')
        if (idx !== -1 && lines[idx + 1] && lines[idx + 1] !== '发布笔记') {
          userName = lines[idx + 1]
        }
      }
      if (userName) {
        userName = userName.replace(/退出登录/g, '').trim()
      }

      return {
        hasQrcode,
        hasCreatorElements,
        userId,
        userName,
        redId,
      }
    } catch {
      return { hasQrcode: false, hasCreatorElements: false, userId: '', userName: '', redId: '' }
    }
  }).catch(() => ({ hasQrcode: false, hasCreatorElements: false, userId: '', userName: '', redId: '' }))

  const logged = (hasSessionCookie && (!isLoginPage || !pageState.hasQrcode)) ||
                 (hasSessionCookie && !isLoginPage) ||
                 (Boolean(pageState.userId || pageState.hasCreatorElements) && !pageState.hasQrcode && !isLoginPage)

  return {
    logged_in: logged,
    user_id: pageState.userId || undefined,
    user_name: pageState.userName || undefined,
    red_id: pageState.redId || undefined,
  }
}

async function isLoggedIn(page: Page): Promise<boolean> {
  const status = await checkXhsLoginStatus(page)
  return status.logged_in
}

async function debugScreenshot(page: Page, dir: string, label: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true })
  const safe = label.replace(/[^A-Za-z0-9_-]/g, '-').slice(-40)
  const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '_' + safe + '.png')
  await page.screenshot({ path: file }).catch(() => undefined)
  return file
}

async function assertNoRiskPage(page: Page, debugDir: string, label: string): Promise<void> {
  const content = await page.content().catch(() => '')
  const hit = RISK_PATTERNS.find((p) => content.includes(p))
  if (hit) {
    const shot = await debugScreenshot(page, debugDir, label + '_risk')
    throw new Error('小红书出现风控/验证页面（' + hit + '），已停止。截图: ' + shot + '。请人工在浏览器完成验证后重试。')
  }
}

async function uploadImages(page: Page, filePaths: string[], debugDir: string): Promise<void> {
  // 小红书图文上传区含【两个】input[type=file]：
  //   ① multiple + accept=.jpg,.jpeg,.png,.webp → 多图上传（图片列表）
  //   ② 无 multiple，accept 同上                 → 单图（替换/封面）
  // 旧代码用 DOM.querySelector('input[type="file"]') 取【第一个】匹配，且派发事件时
  // 用 document.querySelector('input[type="file"]') 又取一次——两者在 SPA 重建节点后
  // 可能指向不同 input，文件被投进错误的框，表现为「配图主题不对」；重复派发 change
  // 则表现为「同一张图传了两次」。因此这里显式锁定「带 multiple 的图片 input」。
  await page.waitForSelector('input[type="file"]', { timeout: 20000 })

  /** 已进入图片列表的预览图数量 */
  const countUploaded = () =>
    page.evaluate(() => document.querySelectorAll('img.preview, .img-list img.preview').length).catch(() => -1)

  /** 读取图片状态计数器 "N/18"，作为第二重校验 */
  const readStatusCount = () =>
    page
      .evaluate(() => {
        const m = (document.querySelector('.img-list .status')?.textContent || '').trim().match(/^(\d+)\s*\/\s*(\d+)$/)
        return m ? Number(m[1]) : -1
      })
      .catch(() => -1)

  const client = await page.createCDPSession()

  /**
   * 定位图片上传 input 的 CDP nodeId。
   *
   * 关键事实（实测）：小红书图片上传框是
   *   <input class="upload-input" type="file" multiple accept=".jpg,.jpeg,.png,.webp">
   * accept 是【扩展名列表】，并不含 "image" 字样，所以 [accept*="image"] 永远匹配不到。
   * 该页面上「多图上传（图片列表）」与「单图（替换/封面）」是两个不同 input，
   * 必须锁定带 multiple 的那个，否则文件会被投进错误的框（表现为配图主题不对/重复）。
   *
   * 坑：DOM.querySelectorAll 返回的 nodeId 在 SPA 重渲染后失效，故每轮都用
   * DOM.querySelector 重新取一份新鲜 nodeId。
   */
  const locateImageInput = async (): Promise<number> => {
    const { root } = await client.send('DOM.getDocument', { depth: -1 })
    const candidates = [
      'input[type="file"][multiple]', // 多图上传（首选）
      'input.upload-input',
      'input[type="file"]',
    ]
    for (const selector of candidates) {
      const { nodeId } = await client.send('DOM.querySelector', { nodeId: root.nodeId, selector })
      if (nodeId) return nodeId
    }
    return 0
  }

  let injected = false
  const startCount = Math.max(0, await countUploaded())
  try {
    for (let idx = 0; idx < filePaths.length; idx++) {
      const nodeId = await locateImageInput()
      if (!nodeId) break
      // 只用 CDP 注入即可：小红书 SPA 自身会响应 DOM.setFileInputFiles（实测注入 3 张
      // 精确得到 3 张）。旧代码额外 dispatch 了 input/change 事件，导致上一张被 SPA
      // 二次处理 →「同一张配图上传了两次」（实测 4 张变 5 张）。因此这里绝不派发事件。
      await client.send('DOM.setFileInputFiles', { files: [filePaths[idx]], nodeId })
      // 逐张确认入库，避免「上传两张只进一张」被静默放过
      const want = startCount + idx + 1
      const dl = Date.now() + 30000
      while (Date.now() < dl) {
        const c = await countUploaded()
        const s = await readStatusCount()
        if (c >= want || (s >= 0 && s >= want)) break
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
      injected = true
    }
  } catch {
    injected = false
  } finally {
    await client.detach().catch(() => undefined)
  }

  if (!injected) {
    // 回退：单文件逐个 uploadFile（单文件不受 multiple 限制）
    for (const p of filePaths) {
      const handle = await page.evaluateHandle(() => {
        const inputs = Array.from(document.querySelectorAll('input[type="file"]'))
        return inputs.find((el) => el.hasAttribute('multiple')) || inputs[0] || null
      })
      const el = handle.asElement()
      if (!el) throw new Error('未找到小红书图片上传入口')
      await (el as any).uploadFile(p)
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }

  // 严格校验：本次必须恰好新增 filePaths.length 张，多一张（重复）或少一张（漏传）
  // 都判失败，绝不带着错误的图片数继续发布。
  const expected = startCount + filePaths.length
  const deadline = Date.now() + 120000
  let actual = await countUploaded()
  let statusCount = await readStatusCount()
  while (Date.now() < deadline && (actual < expected || (statusCount >= 0 && statusCount < expected))) {
    await new Promise((resolve) => setTimeout(resolve, 1000))
    actual = await countUploaded()
    statusCount = await readStatusCount()
  }
  // 页面自身的 "N/18" 计数器最权威，其次数预览节点
  const finalCount = statusCount >= 0 ? statusCount : actual
  if (finalCount !== expected) {
    const shot = await debugScreenshot(page, debugDir, 'upload_count_mismatch')
    throw new Error(
      '小红书配图数量不符：期望 ' + expected + ' 张（原有 ' + startCount + ' + 本次 ' + filePaths.length +
        '），实际 ' + finalCount + ' 张（预览节点 ' + actual + '，状态计数器 ' + statusCount + '）。截图: ' + shot,
    )
  }
}

const XHS_DIVERSION_WORDS = [
  '微信', '微信号', '加微', '加v', '加V', 'vx', 'VX', 'v信', '企鹅号', '扣扣',
  '手机号', '联系电话', '电话咨询', '拨打电话', '电子邮箱',
  '淘宝', '天猫', '京东', '拼多多', '咸鱼', '闲鱼', '公众号', '知乎', '抖音', '快手',
  '私信领', '私信我', '私聊', '私发', '后台回复', '看主页简介', '主页联系', '二维码', '扫码',
]

const XHS_URL_RE = /(https?:\/\/\S+|www\.\S+|[a-zA-Z0-9-]+\.(?:cn|com|net|org|top|xyz|vip)\b)/i

const XHS_PROHIBITED_WORDS = [
  '代写', '代发', '代办', '包过', '保过', '100%包过', '稳过', '枪手', '买卖论文', '论文代写',
]

const XHS_EXTREME_WORDS = [
  '全网第一', '全国第一', '国家级顶级', '顶级绝密', '极品', '史上最全', '秒杀一切', '100%搞定',
]

function precheckContent(job: XhsPublishJob, index: number, text: string): string[] {
  const problems: string[] = []
  const title = job.titles[index - 1] || ''

  // 1. 标题长度硬性约束（小红书强制 <= 20 字）
  if (title.length > 20) {
    problems.push('第' + index + '篇标题「' + title + '」共 ' + title.length + ' 字，超过小红书平台 20 字硬性上限')
  }

  // 2. 正文长度硬性约束（小红书强制 <= 1000 字）
  if (text.length > 1000) {
    problems.push('第' + index + '篇正文共 ' + text.length + ' 字，超过小红书平台 1000 字上限（含话题标签）')
  }

  const plain = text.replace(/\s+/g, '')
  const effectiveMin = Math.floor(job.min_words * 0.85)
  if (plain.length < effectiveMin) {
    problems.push('第' + index + '篇纯文字 ' + plain.length + ' 字，低于容差下限 ' + effectiveMin + '（设定 ' + job.min_words + '）')
  }

  const combined = title + ' ' + text

  // 3. 小红书社区规范 3.2 导流红线拦截
  const urlMatch = combined.match(XHS_URL_RE)
  if (urlMatch) {
    problems.push('第' + index + '篇违反《小红书社区规范3.2-禁止外链》：包含外部网址或域名「' + urlMatch[0] + '」')
  }
  for (const d of XHS_DIVERSION_WORDS) {
    if (combined.includes(d)) {
      problems.push('第' + index + '篇违反《小红书社区规范3.2-禁止导流》：包含敏感导流词「' + d + '」')
    }
  }

  // 4. 小红书社区规范 2.3 & 3.1 违规交易与学术代办拦截
  for (const p of XHS_PROHIBITED_WORDS) {
    if (combined.includes(p)) {
      problems.push('第' + index + '篇违反《小红书社区规范3.1-违规交易》：包含学术代办/保过承诺词「' + p + '」')
    }
  }

  // 5. 小红书社区规范 4.1.3 & 4.1.4 广告极限词拦截
  for (const e of XHS_EXTREME_WORDS) {
    if (combined.includes(e)) {
      problems.push('第' + index + '篇违反《小红书社区规范4.1-虚假夸大》：包含极限夸大词「' + e + '」')
    }
  }

  // 6. 占位符残留检测
  if (/IMG_A\d+_\d+/.test(text)) {
    problems.push('第' + index + '篇正文残留图片占位符 IMG_A*：小红书正文必须为纯文本')
  }

  // 7. 用户自定义禁词
  for (const w of job.forbidden) {
    if (plain.includes(w)) problems.push('第' + index + '篇含禁词: ' + w)
  }
  return problems
}

async function publishOneNote(
  cfg: Config,
  page: Page,
  debugDir: string,
  job: XhsPublishJob,
  index: number,
): Promise<XhsNote> {
  const title = job.titles[index - 1]
  const text = fs.readFileSync(job.article_files[index - 1], 'utf-8')
  // image_files 由 publish.ts 以 'IMG_A{i}_1' 为键存放整篇的图片数组（见 publishXiaohongshu），
  // 因此这里必须取 'IMG_A{i}_1'；旧代码取 'IMG_A{i}' 永远为空 → 图片被静默跳过，
  // 编辑器不渲染标题框，最终报「等待标题选择器超时」。
  const imagePaths: string[] = []
  const bundle = job.image_files['IMG_A' + index + '_1'] ?? job.image_files['IMG_A' + index] ?? []
  for (const entry of bundle) {
    if (typeof entry !== 'string') continue
    if (!fs.existsSync(entry)) throw new Error('缺少第' + index + '篇图片 ' + entry)
    imagePaths.push(entry)
  }

  await page.goto(PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // 页面需完成 hydration 后再切 tab，否则点击会被当成导航跳转
  await page.waitForSelector('div.creator-tab', { timeout: 20000 }).catch(() => undefined)
  await new Promise((resolve) => setTimeout(resolve, 3000))
  await assertNoRiskPage(page, debugDir, 'note' + index + '_entry')

  // 切换到「上传图文」：必须点击 div.creator-tab 容器。
  // 注意两条历史坑：
  //  1) 用 [class*="tab"] + includes('图文') 会命中把全部 tab 文本拼在一起的外层容器，点击无效；
  //  2) 页面 hydration 未完成时点击内部 span/div 会被当成导航链接，跳到 ?from=tab_switch
  //     （视频页），此时上传图片会失败且标题框永不出现。
  // 因此：先等 creator-tab 渲染完成，再点容器本身，并校验最终 URL。
  await page.waitForSelector('div.creator-tab', { timeout: 20000 }).catch(() => undefined)

  const clickImageTab = async (): Promise<boolean> =>
    page.evaluate(() => {
      // 优先精确匹配 div.creator-tab 容器
      const tabs = Array.from(document.querySelectorAll('div.creator-tab'))
      const target = tabs.find((el) => (el.textContent ?? '').trim() === '上传图文')
      if (target) {
        ;(target as HTMLElement).click()
        return true
      }
      // 兜底：任意标签中文本恰为「上传图文」的最深层元素
      const all = Array.from(document.querySelectorAll('div, span, li, a, button'))
      const exact = all.filter((el) => (el.textContent ?? '').trim() === '上传图文')
      const deepest = exact.filter(
        (el) => !Array.from(el.children).some((c) => (c.textContent ?? '').trim() === '上传图文'),
      )
      const el = deepest[0] ?? exact[0]
      if (el) {
        ;(el as HTMLElement).click()
        return true
      }
      return false
    })

  let imageTab = await clickImageTab()
  if (!imageTab) {
    await debugScreenshot(page, debugDir, 'note' + index + '_no_tab')
  }

  // 等待路由切到图文编辑器（URL 出现 target=image）；若被带偏到 tab_switch 则重试
  const waitForImageRoute = async (): Promise<boolean> => {
    const deadline = Date.now() + 15000
    while (Date.now() < deadline) {
      const u = page.url()
      if (u.includes('target=image')) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
  }

  let onImageRoute = await waitForImageRoute()
  if (!onImageRoute) {
    // 被当作导航链接跳走（?from=tab_switch）时重试一次
    for (let attempt = 0; attempt < 2 && !onImageRoute; attempt++) {
      await page.goto(PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise((resolve) => setTimeout(resolve, 3500))
      await page.waitForSelector('div.creator-tab', { timeout: 15000 }).catch(() => undefined)
      imageTab = (await clickImageTab()) || imageTab
      onImageRoute = await waitForImageRoute()
    }
  }
  if (!onImageRoute) {
    await debugScreenshot(page, debugDir, 'note' + index + '_tab_switch_failed')
    throw new Error('小红书未能切到「上传图文」编辑器（当前 URL: ' + page.url() + '）')
  }
  // URL 变为 target=image 后 SPA 仍需时间挂载上传组件；必须等到图片上传框
  // （accept 含 image 的 input[type=file]）真正出现，否则 CDP 查不到 nodeId，
  // 上传会被静默跳过，标题框永不出现。
  const uploadReady = Date.now() + 30000
  while (Date.now() < uploadReady) {
    const ok = await page.evaluate(() =>
      // accept 为 ".jpg,.jpeg,.png,.webp"，不含 "image"；按 multiple 判断图片上传框
      Array.from(document.querySelectorAll('input[type="file"]')).some((el) => el.hasAttribute('multiple')),
    )
    if (ok) break
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  await new Promise((resolve) => setTimeout(resolve, 1500))

  if (imagePaths.length > 0) {
    await uploadImages(page, imagePaths, debugDir)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const TITLE_SELECTOR = '[placeholder*="标题"], [class*="title"] input, [class*="title"] textarea'
  let titleInput = await page.waitForSelector(TITLE_SELECTOR, { timeout: 30000 })
  if (!titleInput) {
    // 兜底：部分版本的标题框只有 class="d-text"，无 placeholder 关键字
    titleInput = await page.waitForSelector('input.d-text', { timeout: 10000 })
  }
  if (!titleInput) throw new Error('未找到小红书标题输入框')
  await titleInput.click()
  await page.keyboard.type(title, { delay: 20 })

  const contentEditor = await page.waitForSelector('[contenteditable="true"], [class*="content"] textarea, [placeholder*="正文"]', { timeout: 30000 })
  if (!contentEditor) throw new Error('未找到小红书正文编辑区')
  await contentEditor.click()
  // 正文必须剥离 IMG_A{i}_{j} 图片占位符：小红书是图文笔记，图片通过上传区单独提交，
  // 正文里若残留占位符会以纯文本形式显示给读者（旧代码直接 type(text)，导致
  // 已发布笔记的正文里带着 "IMG_A1_1" 这类字样）。
  const cleanBody = text
    .replace(/^[ \t]*IMG_A\d+_\d+[ \t]*$/gm, '') // 独占一行的占位符整行删除
    .replace(/IMG_A\d+_\d+/g, '') // 行内残留的占位符就地删除
    .replace(/\n{3,}/g, '\n\n') // 收敛删行后产生的多余空行
    .trim()
  // 避免话题标签重复拼接：若正文中已包含话题标签，不再重复追加 job.tags
  const hasTags = /#[^#\s]+(\s|$)/.test(cleanBody)
  const fullText = (job.tags.length > 0 && !hasTags)
    ? cleanBody.trimEnd() + '\n\n' + job.tags.map((t) => '#' + t + ' ').join('').trim()
    : cleanBody
  await page.keyboard.type(fullText, { delay: 10 })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await assertNoRiskPage(page, debugDir, 'note' + index + '_content')

  // 发布与存草稿是互斥动作：publish_immediately=true 时必须点「发布」，
  // 若先点「保存草稿」会跳离编辑器，导致随后找不到「发布」按钮（旧代码因此
  // 只存了草稿却把 published 置为 true，属于假成功）。
  if (job.publish_immediately) {
    const clicked = await page.evaluate(() => {
      // 小红书图片编辑器的发布按钮是自定义组件 <xhs-publish-btn>，它的内部按钮
      // 渲染在 closed shadow root 里，任何 DOM 选择器（<button>、按文本、坐标）
      // 都点不到；元素上的事件监听也不是标准 click。
      // 该组件实例直接暴露 _onPublish() / _onSave() 方法，调用 _onPublish()
      // 即触发 POST /web_api/sns/v2/note 并跳转到 ?published=true。
      const bar = document.querySelector('xhs-publish-btn') as
        | (HTMLElement & { _onPublish?: () => void })
        | null
      if (!bar) return 'no_button'
      if (typeof bar._onPublish === 'function') {
        bar._onPublish()
        return 'clicked'
      }
      // 兜底：组件未暴露方法时，点它内部含「发布」文本的节点
      for (const el of Array.from(bar.querySelectorAll('*'))) {
        const own = Array.from(el.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent)
          .join('')
          .trim()
        if (own === '发布' || own === '发布笔记') {
          ;(el as HTMLElement).click()
          return 'clicked'
        }
      }
      return 'no_button'
    })

    if (clicked === 'no_button') {
      const shot = await debugScreenshot(page, debugDir, 'note' + index + '_no_publish_button')
      throw new Error('小红书未找到「发布」按钮，已中止（避免误报发布成功）。截图: ' + shot)
    }

    // 「发布」后可能弹出二次确认
    await new Promise((resolve) => setTimeout(resolve, 2500))
    await page
      .evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, div[role="button"]'))
        const confirmBtn = buttons.find((el) => {
          const label = (el.textContent ?? '').trim()
          return (label === '确认' || label === '确认发布' || label === '确定') &&
            (el as HTMLElement).offsetParent !== null
        })
        if (confirmBtn) (confirmBtn as HTMLElement).click()
      })
      .catch(() => undefined)

    // 【判定策略】点击发布后只做「弱等待」，真正的判定交给稿件管理核对。
    //
    // 历史两次翻车：
    //  1) 早期用 /发布成功|已发布|审核中/.test(innerText) 判定 —— 侧边栏静态文案
    //     本来就含这些词，恒为真，产生 pending_N「假成功」；
    //  2) 改严后要求发布页 URL 里出现 note_id —— 但小红书只跳 ?published=true，
    //     URL 永远不含 note_id，于是「真成功」被判成「未能确认」= 假阴性。
    // 正确做法：这里只记录「已点击发布」的意图与时间，成败由
    // xhsConfirmPublished() 进稿件管理核对后裁决，绝不在此处伪装成功或武断失败。
    const publishedAtMs = Date.now()
    let sawPublishedFlag = false
    let sawSuccessText = false
    {
      const deadline = Date.now() + 20000
      while (Date.now() < deadline) {
        const u = page.url()
        if (/[?&]published=true/.test(u)) sawPublishedFlag = true
        const txt = await page
          .evaluate(() => /发布成功/.test(document.body?.innerText || ''))
          .catch(() => false)
        if (txt) sawSuccessText = true
        if (sawPublishedFlag || sawSuccessText) break
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }
    await assertNoRiskPage(page, debugDir, 'note' + index + '_publish')

    // 这里只返回「待确认」，由 runXhsPublish 在关闭浏览器前统一进稿件管理核对。
    // 不再抛错、不再落 pending_N 占位符，也不谎报成功。
    await debugScreenshot(page, debugDir, 'note' + index + '_submitted').catch(() => undefined)
    return {
      note_id: '',
      title,
      url: '',
      published: false,
      status: 'unconfirmed' as XhsNoteStatus,
      posted_time: '',
      confirm_note:
        '已点击发布（published=true: ' + (sawPublishedFlag ? '是' : '否') +
        '，成功文案: ' + (sawSuccessText ? '是' : '否') + '），待进稿件管理核对',
      // 供上层核对用的发布时间戳（内部字段，不进入对外结果）
      ...({ _publishedAtMs: publishedAtMs } as object),
    } as XhsNote
  }

  const saveBtn = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button'))
    const saveBtn = buttons.find((el) => {
      const label = (el.textContent ?? '').trim()
      return label === '保存草稿' || label === '保存'
    })
    if (saveBtn) {
      (saveBtn as HTMLElement).click()
      return 'saved'
    }
    return null
  })

  await new Promise((resolve) => setTimeout(resolve, 3000))
  await assertNoRiskPage(page, debugDir, 'note' + index + '_save')

  const noteId = await page.evaluate(() => {
    const url = window.location.href
    const match = url.match(/\/explore\/([a-f0-9]+)/i) || url.match(/note_id=([a-f0-9]+)/i)
    return match?.[1] ?? ''
  })

  // 存草稿分支：草稿不会出现在稿件管理的「已发布」列表里，因此不谎报 published。
  // 旧实现用 'pending_' + index 兜底 note_id，正是「假成功」的来源之一，现已移除。
  const note: XhsNote = {
    note_id: noteId || '',
    title,
    url: noteId ? 'https://www.xiaohongshu.com/explore/' + noteId : '',
    published: false,
    status: 'unconfirmed' as XhsNoteStatus,
    confirm_note: noteId
      ? '已存草稿并取得笔记ID'
      : '已点「保存草稿」；草稿不在稿件管理「已发布」列表中，如需核验请在草稿箱查看',
  }

  await debugScreenshot(page, debugDir, 'note' + index + '_done')
  return note
}

export async function runXhsPublish(cfg: Config, accountId: string, job: XhsPublishJob): Promise<XhsPublishResult> {
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'xhs_debug')
  const n = job.titles.length
  const plan = (job.only?.length ? job.only : Array.from({ length: n }, (_, k) => k + 1))
    .filter((i) => i >= 1 && i <= n && Number.isInteger(i))
  if (plan.length === 0) throw new Error('only 字段没有有效的篇号')

  for (const i of plan) {
    if (!fs.existsSync(job.article_files[i - 1])) {
      throw new Error('缺少第' + i + '篇笔记文件（请先运行 gzh_build_article）: ' + job.article_files[i - 1])
    }
    const problems = precheckContent(job, i, fs.readFileSync(job.article_files[i - 1], 'utf-8'))
    if (problems.length > 0) throw new Error('发布前校验未通过：\n' + problems.join('\n'))
  }
  if (job.dry_run) return { dry_run: true, notes: [] }

  const browser = await launchXhsBrowser(cfg, accountId, cfg.runtime.xhs_headless !== false)
  try {
    const page = await browser.newPage()
    await restoreXhsCookies(page, cfg, accountId)
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (!(await isLoggedIn(page))) {
      await debugScreenshot(page, debugDir, 'not_login')
      throw new Error('小红书未登录：请在设置中该账号卡片点击「扫码登录小红书」后重试')
    }
    await assertNoRiskPage(page, debugDir, 'entry')

    const notes: XhsNote[] = []
    for (const i of plan) {
      if (notes.length > 0) {
        // 拟人化发布间隔（3~5秒），严格遵守小红书社区规范 4.4.3（禁止高频机器作弊批量发布）
        const pacingMs = 3000 + Math.floor(Math.random() * 2000)
        await new Promise((resolve) => setTimeout(resolve, pacingMs))
      }
      notes.push(await publishOneNote(cfg, page, debugDir, job, i))
    }

    // 【核心改造】发布后统一进「稿件管理」核对，把 unconfirmed 提升为 published。
    // 复用同一个 page（已登录、已过风控），核对完再关浏览器。
    // 核对失败不影响已确认的失败项，也不把「读不到」误判成失败。
    const pending = notes.filter((nt) => nt.status === 'unconfirmed')
    if (pending.length > 0) {
      try {
        const managed = await fetchManagedNotes(page, debugDir)
        if (managed) {
          for (const nt of notes) {
            if (nt.status !== 'unconfirmed') continue
            const at = Number((nt as unknown as { _publishedAtMs?: number })._publishedAtMs) || Date.now()
            const hit = matchManagedNote(managed, nt.title, at)
            if (hit) {
              const id = hit.note.id || ''
              nt.status = 'published'
              nt.published = true
              nt.note_id = id
              nt.url = id ? 'https://www.xiaohongshu.com/explore/' + id : ''
              nt.posted_time = hit.note.time
              nt.confirm_note = '稿件管理已收录（' + hit.matchedBy + '，发布 ' + hit.note.time + '）' +
                (id ? '' : '；未取到笔记ID')
            } else {
              nt.confirm_note =
                (nt.confirm_note ? nt.confirm_note + '；' : '') +
                '稿件管理中未找到该标题（列表 ' + managed.length + ' 条），请稍后人工核对'
            }
          }
        } else {
          for (const nt of pending) {
            nt.confirm_note =
              (nt.confirm_note ? nt.confirm_note + '；' : '') +
              '稿件管理列表读取失败，无法确认（读不到≠未发布），请人工核对'
          }
        }
      } catch (error) {
        // 核对环节自身异常绝不能污染发布结果
        console.error('[xhs] 稿件管理核对异常:', error)
      }
    }

    // 清理仅供核对使用的内部时间戳字段，避免泄漏到落盘结果
    for (const nt of notes) delete (nt as unknown as { _publishedAtMs?: number })._publishedAtMs

    return { dry_run: false, notes }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function xhsCheckLogin(
  cfg: Config,
  accountId: string,
): Promise<{ logged_in: boolean; user_id?: string; user_name?: string; red_id?: string }> {
  const cached = getCachedLoginState('xiaohongshu', accountId)
  const savedSession = loadXhsSession(cfg, accountId)
  if (cached === true && savedSession) {
    return {
      logged_in: true,
      user_id: savedSession.user_id,
      user_name: savedSession.user_name,
      red_id: savedSession.red_id,
    }
  }

  const browser = await launchXhsBrowser(cfg, accountId, true)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    await restoreXhsCookies(page, cfg, accountId)
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const status = await checkXhsLoginStatus(page)
    if (status.logged_in) {
      const cookies = await page.cookies().catch(() => [])
      saveXhsSession(cfg, accountId, {
        account_id: accountId,
        platform: 'xiaohongshu',
        user_id: status.user_id || savedSession?.user_id,
        user_name: status.user_name || savedSession?.user_name,
        red_id: status.red_id || savedSession?.red_id,
        cookies: cookies.length > 0 ? cookies : (savedSession?.cookies || []),
        updated_at: new Date().toISOString(),
      })
      setCachedLoginState('xiaohongshu', accountId, true)
    } else {
      setCachedLoginState('xiaohongshu', accountId, false)
    }
    return status
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function xhsLogin(
  cfg: Config,
  accountId: string,
  timeoutMs = 240000,
): Promise<{ logged_in: boolean; user_id?: string; user_name?: string; red_id?: string; error?: string }> {
  const browser = await launchXhsBrowser(cfg, accountId, false)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    await page.bringToFront().catch(() => undefined)

    // 尝试先恢复已有备份凭据
    await restoreXhsCookies(page, cfg, accountId)

    await page.goto(CREATOR_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
    
    // 给页面 3 秒让其在已有登录态时自动重定向
    await new Promise((resolve) => setTimeout(resolve, 3000))
    let status = await checkXhsLoginStatus(page)
    if (status.logged_in) {
      const cookies = await page.cookies().catch(() => [])
      saveXhsSession(cfg, accountId, {
        account_id: accountId,
        platform: 'xiaohongshu',
        user_id: status.user_id,
        user_name: status.user_name,
        red_id: status.red_id,
        cookies,
        updated_at: new Date().toISOString(),
      })
      setCachedLoginState('xiaohongshu', accountId, true)
      // 留 1.5s 给浏览器写入 SQLite 并自动关闭浏览器
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await browser.close().catch(() => undefined)
      return status
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!browser.connected || page.isClosed()) {
        // 窗口被关闭时，查验是否有已存凭据
        const saved = loadXhsSession(cfg, accountId)
        if (saved && saved.cookies?.length > 0) {
          setCachedLoginState('xiaohongshu', accountId, true)
          return { logged_in: true, user_id: saved.user_id, user_name: saved.user_name, red_id: saved.red_id }
        }
        return { logged_in: false, error: '登录窗口已被关闭' }
      }

      status = await checkXhsLoginStatus(page)
      if (status.logged_in) {
        // 扫码成功！等待 2.5s 让鉴权 Cookie 和 LocalStorage 充分沉淀
        await new Promise((resolve) => setTimeout(resolve, 2500))
        status = await checkXhsLoginStatus(page)
        const cookies = await page.cookies().catch(() => [])
        saveXhsSession(cfg, accountId, {
          account_id: accountId,
          platform: 'xiaohongshu',
          user_id: status.user_id,
          user_name: status.user_name,
          red_id: status.red_id,
          cookies,
          updated_at: new Date().toISOString(),
        })
        setCachedLoginState('xiaohongshu', accountId, true)
        // 留 2s 确保 Chrome 自身 SQLite 写入 profile，然后自动关闭浏览器窗口！
        await new Promise((resolve) => setTimeout(resolve, 2000))
        await browser.close().catch(() => undefined)
        return status
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    setCachedLoginState('xiaohongshu', accountId, false)
    await browser.close().catch(() => undefined)
    return { logged_in: false, error: '登录超时（4 分钟内未完成扫码登录）' }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function xhsVerifyNotes(
  cfg: Config,
  accountId: string,
  expected: Array<{ title: string; note_id?: string }>,
): Promise<{ logged_in: boolean; note_count: number; notes: XhsVerifyNote[] }> {
  const browser = await launchXhsBrowser(cfg, accountId, cfg.runtime.xhs_headless !== false)
  try {
    const page = await browser.newPage()
    const debugDir = path.join(accountScriptsDir(cfg, accountId), 'xhs_debug')
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined)
    if (!(await isLoggedIn(page))) {
      return { logged_in: false, note_count: 0, notes: expected.map((item) => ({ title: item.title, found: false })) }
    }
    const notes: XhsVerifyNote[] = []
    for (const item of expected) {
      if (!item.note_id) {
        notes.push({ title: item.title, found: false, note: '发布记录缺少 note_id，无法远程核验' })
        continue
      }
      const url = 'https://www.xiaohongshu.com/explore/' + item.note_id
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await new Promise((resolve) => setTimeout(resolve, 1500))
        await assertNoRiskPage(page, debugDir, 'verify_' + item.note_id)
        const exists = await page.evaluate(() => {
          return !document.body?.innerText?.includes('笔记不存在') && !document.body?.innerText?.includes('页面不存在')
        })
        notes.push({
          title: item.title,
          found: exists,
          url,
          published: exists,
          note: exists ? '笔记可访问' : '笔记不可访问（可能已删除或为草稿态）',
        })
      } catch (error) {
        notes.push({
          title: item.title,
          found: false,
          url,
          published: false,
          note: '访问笔记页面失败（' + (error instanceof Error ? error.message : String(error)).slice(0, 120) + '）',
        })
      }
    }
    return {
      logged_in: true,
      note_count: notes.filter((a) => a.found).length,
      notes,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

import { handleCors, sendJson, readBodyText } from './http-helpers.ts'

export async function handleXhsLoginRoute(
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
    fs.mkdirSync(xhsProfileDir(cfg, accountId), { recursive: true })
  } catch {}
  if (action === 'check') {
    try {
      const status = await xhsCheckLogin(cfg, accountId)
      sendJson(res, 200, {
        ok: true,
        action,
        logged_in: status.logged_in,
        user_id: status.user_id,
        user_name: status.user_name,
        red_id: status.red_id,
      })
    } catch (error) {
      sendJson(res, 200, { ok: false, action, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }
  if (isLoginInFlight('xiaohongshu', accountId)) {
    if (force) {
      setLoginInFlight('xiaohongshu', accountId, false)
    } else {
      sendJson(res, 409, { error: '账号 ' + accountId + ' 的小红书登录流程正在进行中' })
      return
    }
  }
  setLoginInFlight('xiaohongshu', accountId, true)
  try {
    const resData = await xhsLogin(cfg, accountId)
    sendJson(res, 200, resData.logged_in
      ? {
          ok: true,
          action,
          logged_in: true,
          user_id: resData.user_id,
          user_name: resData.user_name,
          red_id: resData.red_id,
        }
      : { ok: false, action, error: resData.error || '登录未完成或登录窗口已关闭，请重新点击扫码登录' })
  } catch (error) {
    sendJson(res, 200, { ok: false, action, error: error instanceof Error ? error.message : String(error) })
  } finally {
    setLoginInFlight('xiaohongshu', accountId, false)
  }
}

export function registerXhsRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: XHS_LOGIN_ROUTE,
      handler: (req, res) => handleXhsLoginRoute(req, res, getConfig),
    }), 'gzh-publisher: xhs login route')
  })
}

function resolveAccountSafe(cfg: Config, accountId: string) {
  const profile = cfg.accounts[accountId]
  if (!profile) throw new Error('账号不存在: ' + accountId)
  return { id: accountId, profile }
}


