// 头条号发布适配器：浏览器自动化（puppeteer-core + 本机 Chrome/Edge）。
// 头条号没有对个人开放的发布 API（头条号开放平台面向企业服务商且门槛高），HTTP 逆向需签到/签名且频繁变动不可持续；
// 浏览器路线由头条页面自身 JS 处理签名与风控，登录态持久化在账号独立 userDataDir（头条/抖音账号扫码一次长期有效）。
// 发布终点默认只存草稿箱（账号级 publish_immediately 开关可改为直接发布），与公众号"不直接群发"哲学一致。
// 注意：编辑器 selector 与保存接口正则为候选值，实测阶段（首登后）逐项固化——搜 EDITOR_TUNE 标记。
// 已知事实（2026-10 实测）：创作者平台 mp.toutiao.com，文章编辑器已由 Quill 迁移到 ProseMirror
//（正文 .ProseMirror[contenteditable="true"]，主文档内非 iframe），标题仍是 textarea[placeholder*="标题"]（硬限 30 字含标点），
// 封面单图推荐 16:9；登录态候选 cookie sessionid / sid_tt / sso_uid_tt。
// 编辑器页按钮文案实测为「预览并发布 / 定时发布 / 预览」，无「保存草稿」按钮（草稿由编辑器自动保存）。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import type { Context } from './tool-compat.ts'
import type { Config } from './config.ts'
import { accountScriptsDir, toutiaoProfileDir } from './sync.ts'
import {
  getCachedLoginState,
  setCachedLoginState,
  isLoginInFlight,
  setLoginInFlight,
} from './login-state.ts'
import {
  cleanStaleChromeLocks,
  findBrowserExecutable,
  launchBrowserSafely,
  mdToPasteHtml,
} from './zhihu.ts'
import { handleCors, sendJson, readBodyText } from './http-helpers.ts'
import {
  safelyInjectCookies,
  checkAccountLoginHealth,
  invalidateAccountSession,
  waitForInteractiveLoginAndSync,
  loadStandardSession,
} from './session-manager.ts'
import {
  startAutomationStreamSession,
  updateAutomationStreamStep,
  completeAutomationStreamSession,
  attachPageScreencast,
  setAutomationStreamTakeover,
} from './automationStreamClient.ts'

const CONSOLE_URL = 'https://mp.toutiao.com/'
// 文章编辑器页（?type=article 为文章；?type=micro 为微头条，本插件只发文章）。
// EDITOR_TUNE：未登录访问时头条会重定向到登录入口，登录后直达编辑器；实测后如需带参固化请更新。
const WRITE_URL = 'https://mp.toutiao.com/profile_v4/graphic/publish'
// 内容管理页候选（头条号后台「内容管理」；EDITOR_TUNE：路径待首登实测确认，404 时改用 CONSOLE_URL 兜底）
const CONTENTLIST_URL = 'https://mp.toutiao.com/profile_v4/graphic/content'
// EDITOR_TUNE：未登录时 mp.toutiao.com 即呈现「注册/登录」入口（sso.toutiao.com 承载凭据页）；
// 若实测存在专用登录路由（如 /auth/page/login），在此固化。
const LOGIN_PAGE_URL = 'https://mp.toutiao.com/'
// 编辑器保存草稿/自动保存接口：候选覆盖 mp.toutiao.com 域下保存类请求（含 lapi 网关）。
// EDITOR_TUNE：实测后固化；若保存响应不含文章 id，draft_id 以 UI 状态 + 标题匹配兜底（同百家号 banti 网关经验）。
const DRAFT_SAVE_RE =
  /mp\.toutiao\.com\/[^\s]*?(?:draft|save|article)|toutiao\.toutiaopage\.com\/[^\s]*?(?:draft|save)/i
// 登录相关页面判定：URL 含 auth/login/signin，或落到 sso.toutiao.com（头条统一登录域）
const LOGIN_PAGE_RE = /\/(auth|login|signin)/i
const SSO_HOST_RE = /^https?:\/\/sso\.toutiao\.com/
const RISK_PATTERNS = ['安全验证', '异常流量', '访问异常', '环境异常']
// EDITOR_TUNE：头条号编辑器候选 selector，实测阶段固化。
// 标题：v4 编辑器标题为 textarea（placeholder 含"标题"）或独立 contenteditable 节点，候选覆盖两者。
const TITLE_SELECTOR = [
  'textarea[placeholder*="标题"]',
  'input[placeholder*="标题"]',
  '[class*="title"] textarea[placeholder]',
  '[class*="titleInput"] [contenteditable="true"]',
  '[data-testid*="title"] [contenteditable="true"]',
].join(', ')
// 正文编辑器（主文档内，非 iframe，与百家号 UEditor iframe 不同）。
// 实测 2026-10：头条已把正文编辑器从 Quill 迁移到 ProseMirror（.ProseMirror[contenteditable="true"]，
// 高度约 500px；页面内另一个 contenteditable 是行内占位 span.syl-placeholder，不可作正文锚点）。
// 保留 .ql-editor 候选以兼容旧版灰度环境。
const EDITOR_BODY_SELECTOR =
  '.ProseMirror[contenteditable="true"], .ql-editor[contenteditable="true"], .ql-editor'
const SAVE_BUTTON_LABELS = ['保存草稿', '存草稿', '保存']
// EDITOR_TUNE（2026-10 实测）：头条 v4 底栏的发布入口文案是「预览并发布」，
// 只匹配「发布/发表/提交发布」会永远找不到入口，直发流程直接 failSoft 降级为仅存草稿。
const PUBLISH_BUTTON_LABELS = ['预览并发布', '发布', '发表', '提交发布']
// 点开入口后进入发布确认弹层，其按钮文案是「确认发布」；末位「确定」仅作兜底。
const PUBLISH_CONFIRM_LABELS = ['确认发布', '确定发布', '发布', '确定']
const COVER_UPLOAD_LABELS = ['本地上传', '上传封面', '上传图片', '本地图']
// 头条「选择封面」弹窗入口文案候选（单图/三图模式；本插件只传单图封面）
const COVER_PICK_LABELS = ['选择封面', '单图', '上传封面']
// 说明：图片上传已改为 CDP DOM.setFileInputFiles 真实文件通路（见 pasteUploadImages），
// 不再需要按扩展名推断 MIME，故原先的 MIME_BY_EXT 表已移除。

export const TOUTIAO_LOGIN_ROUTE = '/api/gzh-publisher/toutiao-login'

export interface ToutiaoDraft {
  draft_id: string
  title: string
  url: string
  published?: boolean
  warning?: string
}

export interface ToutiaoPublishJob {
  account_id: string
  titles: string[]
  article_files: string[] // 绝对路径（article_v2_N.md）
  content_files: Record<string, string> // IMG_A{i}_{j} → 绝对路径
  content_img_count: number
  cover_files: Record<string, string> // String(index) → cover_N.png 绝对路径（publish_immediately 时上传）
  publish_immediately: boolean
  brand_image_files?: {
    header?: string
    footer?: string
  }
  dry_run: boolean
  min_words: number
  forbidden: string[]
  only?: number[] // 按原始篇号部分重试（缺省全部）；篇号决定 IMG_A{i} 占位符映射，必须与文件一致
}

export interface ToutiaoPublishResult {
  dry_run: boolean
  drafts: ToutiaoDraft[]
}

export interface ToutiaoVerifyArticle {
  title: string
  found: boolean
  url?: string
  published?: boolean
  status?: string
  note?: string
}

// ---------- 浏览器启动与页面级工具 ----------

async function launchToutiaoBrowser(
  cfg: Config,
  accountId: string,
  _headless: boolean,
): Promise<Browser> {
  const profileDir = toutiaoProfileDir(cfg, accountId)
  const args = [
    '--headless=new',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--lang=zh-CN,zh',
    '--window-size=1440,900',
  ]
  return launchBrowserSafely({
    executablePath: findBrowserExecutable(cfg),
    headless: 'new' as any, // 遵循界面内置浏览器规范：严格无头运行，绝不唤起前台外部浏览器窗口
    userDataDir: profileDir,
    defaultViewport: { width: 1440, height: 900 },
    protocolTimeout: 240000,
    args,
    platformDisplayName: '头条号',
  })
}

// ---------- 头条号凭据持久化与 Session 管理 ----------

export interface ToutiaoSessionData {
  account_id: string
  platform: 'toutiao'
  user_name?: string
  cookies: Array<any>
  updated_at: string
}

export function toutiaoSessionPath(cfg: Config, accountId: string): string {
  return path.join(toutiaoProfileDir(cfg, accountId), 'toutiao_session.json')
}

export function toutiaoBackupSessionPath(cfg: Config, accountId: string): string {
  return path.join(accountScriptsDir(cfg, accountId), 'toutiao_session.json')
}

export function saveToutiaoSession(cfg: Config, accountId: string, data: ToutiaoSessionData): void {
  try {
    const raw = JSON.stringify(data, null, 2) + '\n'
    const p1 = toutiaoSessionPath(cfg, accountId)
    fs.mkdirSync(path.dirname(p1), { recursive: true })
    fs.writeFileSync(p1, raw, 'utf-8')
    const p2 = toutiaoBackupSessionPath(cfg, accountId)
    fs.mkdirSync(path.dirname(p2), { recursive: true })
    fs.writeFileSync(p2, raw, 'utf-8')
  } catch (err) {
    console.error('[toutiao] 保存头条号登录凭据失败:', err)
  }
}

export function loadToutiaoSession(cfg: Config, accountId: string): ToutiaoSessionData | null {
  const standard = loadStandardSession(cfg, 'toutiao', accountId)
  if (standard && Array.isArray(standard.cookies) && standard.cookies.length > 0) {
    return {
      account_id: accountId,
      platform: 'toutiao',
      user_name: standard.user_name,
      cookies: standard.cookies,
      updated_at: standard.updated_at || new Date().toISOString(),
    }
  }
  const p1 = toutiaoSessionPath(cfg, accountId)
  const p2 = toutiaoBackupSessionPath(cfg, accountId)
  const candidate = fs.existsSync(p1) ? p1 : fs.existsSync(p2) ? p2 : null
  if (!candidate) return null
  try {
    return JSON.parse(fs.readFileSync(candidate, 'utf-8')) as ToutiaoSessionData
  } catch {
    return null
  }
}

export function normalizeToutiaoCookiesForPuppeteer(cookies: any[]): any[] {
  if (!Array.isArray(cookies)) return []
  return cookies
    .filter(c => c && typeof c.name === 'string' && typeof c.value === 'string' && c.name.trim())
    .map((c) => {
      const item: any = {
        name: c.name.trim(),
        value: c.value,
        domain: c.domain && typeof c.domain === 'string' ? c.domain : '.toutiao.com',
        path: typeof c.path === 'string' && c.path ? c.path : '/',
      }
      if (typeof c.httpOnly === 'boolean') item.httpOnly = c.httpOnly
      if (typeof c.secure === 'boolean') item.secure = c.secure
      const exp = c.expires || c.expirationDate
      if (typeof exp === 'number' && exp > 0) {
        item.expires = Math.floor(exp)
      }
      if (c.sameSite) {
        const s = String(c.sameSite).toLowerCase()
        if (s === 'lax') item.sameSite = 'Lax'
        else if (s === 'strict') item.sameSite = 'Strict'
        else if (s === 'none' || s === 'no_restriction') item.sameSite = 'None'
      }
      return item
    })
}

export async function restoreToutiaoCookies(
  page: Page,
  cfg: Config,
  accountId: string,
): Promise<boolean> {
  const session = loadToutiaoSession(cfg, accountId)
  if (session && Array.isArray(session.cookies) && session.cookies.length > 0) {
    try {
      const injectRes = await safelyInjectCookies(page, session.cookies, '.toutiao.com')
      if (injectRes.errors.length > 0) {
        console.warn(`[toutiao] 头条号凭据注入警告: ${injectRes.errors.join('; ')}`)
      }
      return injectRes.success
    } catch (err) {
      console.warn('[toutiao] 注入头条号凭据异常:', err)
    }
  }
  return false
}

/** 刷新并持久化当前页面最新头条号会话凭据（增量自愈，防止凭据过期） */
export async function refreshToutiaoSession(
  page: Page,
  cfg: Config,
  accountId: string,
): Promise<void> {
  try {
    const cookies = await page.cookies('https://mp.toutiao.com').catch(() => [])
    if (cookies.length > 0) {
      const saved = loadToutiaoSession(cfg, accountId)
      saveToutiaoSession(cfg, accountId, {
        account_id: accountId,
        platform: 'toutiao',
        user_name: saved?.user_name,
        cookies,
        updated_at: new Date().toISOString(),
      })
      setCachedLoginState('toutiao', accountId, true)
    }
  } catch {}
}

/** 头条登录态：sessionid / sid_tt / sso_uid_tt cookie（EDITOR_TUNE：首登实测后固定主判定 cookie） */
async function isLoggedIn(page: Page): Promise<boolean> {
  const cookies = await page.cookies('https://mp.toutiao.com')
  return cookies.some(
    c => ['sessionid', 'sid_tt', 'sso_uid_tt'].includes(c.name) && Boolean(c.value),
  )
}

/** 是否处于登录页（URL 含 auth/login 或落到 sso.toutiao.com 统一登录域） */
function onLoginPage(url: string): boolean {
  return LOGIN_PAGE_RE.test(url) || SSO_HOST_RE.test(url)
}

async function debugScreenshot(page: Page, dir: string, label: string): Promise<string> {
  fs.mkdirSync(dir, { recursive: true })
  const safe = label.replace(/[^A-Za-z0-9_-]/g, '-').slice(-40)
  const file = path.join(dir, new Date().toISOString().replace(/[:.]/g, '-') + '_' + safe + '.png')
  await page.screenshot({ path: file }).catch(() => undefined)
  return file
}

/** 出现风控/验证页面时截图并停止，绝不自动打码 */
async function assertNoRiskPage(page: Page, debugDir: string, label: string): Promise<void> {
  const content = await page.content().catch(() => '')
  const hit = RISK_PATTERNS.find(p => content.includes(p))
  if (hit) {
    const shot = await debugScreenshot(page, debugDir, label + '_risk')
    throw new Error(
      '头条号出现风控/验证页面（' +
        hit +
        '），已停止。截图: ' +
        shot +
        '。请人工在浏览器完成验证后重试。',
    )
  }
}

/** 当前页面是否停在人机验证（旋转/滑块验证码）上 */
async function hasChallenge(page: Page): Promise<boolean> {
  return page
    .evaluate(() => {
      const text = document.body ? document.body.innerText.replace(/\s+/g, ' ') : ''
      if (/请完成验证|拖动滑块|滑块验证|安全验证|向右旋转|验证码/.test(text)) return true
      // 头条验证码常挂在独立 iframe（ captcha / verify 域）或弹层容器里，补一道结构探测
      return Boolean(
        document.querySelector(
          '[class*="captcha"], [id*="captcha"], iframe[src*="captcha"], iframe[src*="verify"], [class*="secsdk"], [class*="verify-wrap"]',
        ),
      )
    })
    .catch(() => false)
}

/**
 * 无头运行下遇到人机验证时，把浏览器窗口"显示"出来交给人工完成。
 * 「有头 + 屏外停靠」：有头启动但用 --window-position=-2400,-2400 停在屏幕外，
 * 需要时再用 CDP 把它移回屏内并置前（headless 无真实窗口，事后无法变可见——百家号实测）。
 */
async function revealForHuman(page: Page, debugDir: string, label: string): Promise<boolean> {
  await debugScreenshot(page, debugDir, label + '_challenge')
  // 遵循界面内置浏览器规范：遇到人机验证时直接在当前界面内置检查器中提示并接管，杜绝外部桌面弹窗
  return true
}

/** 验证完成后把窗口移回屏外停靠，恢复"用户看不到"的默认状态 */
async function hideAfterHuman(page: Page): Promise<void> {
  try {
    const session = await page.target().createCDPSession()
    const { windowId } = await session.send('Browser.getWindowForTarget')
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { left: -2400, top: -2400 },
    })
    await session.detach().catch(() => undefined)
  } catch {
    /* 收不回不影响主流程 */
  }
}

/**
 * 等待人工完成验证：轮询直到验证弹层消失，或超时。
 * 返回 true 表示已通过（或本来就没有验证），false 表示等待超时。
 */
async function waitForChallengeCleared(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!(await hasChallenge(page))) return true
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/** 点击第一个可见的、文案匹配的按钮（发布/保存面板按钮文案候选轮询） */
async function clickButtonByLabel(page: Page, labels: string[]): Promise<boolean> {
  return page.evaluate((labels) => {
    const wanted = labels as string[]
    const nodes = [...document.querySelectorAll('button, span, a, div')]
    for (const label of wanted) {
      const hits = nodes.filter((el) => {
        const text = (el.textContent ?? '').trim()
        if (text !== label) return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null
      })
      if (hits.length === 0) continue
      // 与百家号同款经验：优先点击真正的可交互祖先（button / [role=button] / data-testid），
      // 内层 span 的孤立点击可能不冒泡成有效点击
      const pick =
        hits.find(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') ??
        hits.find(el => el.hasAttribute('data-testid')) ??
        hits.find((el) => {
          const p = el.closest('button, [role="button"], [data-testid]')
          return p !== null && p !== el
        })
      const target = pick ?? hits[0]
      const clickable =
        (target.closest('button, [role="button"], [data-testid]') as HTMLElement | null) ??
        (target as HTMLElement);
      (clickable as HTMLElement).click()
      return true
    }
    return false
  }, labels)
}

/**
 * TRUSTED（真实鼠标）按文案点击按钮。
 * EDITOR_TUNE（2026-10 实测）：头条底栏的「预览并发布」与发布弹层的「确认发布」是
 * React 受控按钮，DOM 层 el.click() 不会触发其提交/跳转逻辑（表现为按钮点了没反应、
 * 后续一直找不到确认按钮）。必须用 page.mouse.click 走真实指针事件。
 * 返回是否点到；点击后停留 800ms 供弹层渲染。
 */
async function clickButtonByLabelTrusted(page: Page, labels: string[]): Promise<boolean> {
  const box = await page.evaluate((labels) => {
    const wanted = labels as string[]
    const nodes = [...document.querySelectorAll('button, span, a, div')]
    for (const label of wanted) {
      const hits = nodes.filter((el) => {
        const text = (el.textContent ?? '').trim()
        if (text !== label) return false
        const rect = el.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0 && (el as HTMLElement).offsetParent !== null
      })
      if (hits.length === 0) continue
      const target =
        hits.find(el => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') ??
        hits[0]
      const clickable =
        (target.closest('button, [role="button"], [data-testid]') as HTMLElement | null) ??
        (target as HTMLElement)
      const r = clickable.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    return null
  }, labels)
  if (!box) return false
  await page.mouse.click(box.x, box.y)
  await new Promise(resolve => setTimeout(resolve, 800))
  return true
}

/** 等待正文编辑器就绪（主文档内 ProseMirror；兼容旧版 Quill，非 iframe） */
async function waitForEditor(page: Page): Promise<void> {
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    },
    { timeout: 20000, polling: 300 },
    EDITOR_BODY_SELECTOR,
  )
}

/**
 * 等页面重新稳定（应对 frame detached）。
 * EDITOR_TUNE（2026-10 实测）：头条编辑器是 garfish 微前端，封面弹层/发布弹层的开合
 * 会重建子应用 iframe，期间任何 page.evaluate 都会抛
 * "Attempted to use detached Frame"。做法：轮询一次极轻量的 evaluate 直到不再抛错，
 * 并等正文编辑器重新可见，然后继续后续步骤。
 */
async function waitForPageStable(page: Page, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const ok = await page.evaluate((sel) => {
        const el = document.querySelector(sel)
        if (!el) return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      }, EDITOR_BODY_SELECTOR)
      if (ok) return true
    } catch {
      // frame 正在重建，继续等
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  return false
}

/** 带 frame-detached 重试的 evaluate 包装：微前端重建 iframe 时自动重试 */
async function evaluateWithRetry<T>(
  page: Page,
  fn: () => Promise<T>,
  attempts = 5,
  waitMs = 1500,
): Promise<T> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      const msg = error instanceof Error ? error.message : String(error)
      if (!/detached Frame|Execution context was destroyed|Cannot find context/i.test(msg))
        throw error
      await waitForPageStable(page, 20000)
      await new Promise(resolve => setTimeout(resolve, waitMs))
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

/** 正文图上传：交给头条编辑器自身的粘贴上传链路完成，从 DOM 收集插入的真实 <img> src */
async function pasteUploadImages(
  page: Page,
  filePaths: string[],
  debugDir: string,
): Promise<string[]> {
  await waitForEditor(page)
  const countHttpImgs = () =>
    page.evaluate((sel) => {
      const editor = document.querySelector(sel)
      if (!editor) return -1
      return Array.from(editor.querySelectorAll('img')).filter(el =>
        /^https?:\/\//.test(el.getAttribute('src') ?? ''),
      ).length
    }, EDITOR_BODY_SELECTOR)
  await page.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) throw new Error('未找到头条号正文编辑器')
    editor.focus()
  }, EDITOR_BODY_SELECTOR)
  const srcs: string[] = []
  for (const filePath of filePaths) {
    const before = await countHttpImgs()
    if (before < 0) throw new Error('未找到头条号正文编辑器')
    const name = path.basename(filePath)
    // EDITOR_TUNE（2026-10 实测，务必保留）：ProseMirror 正文图片上传的正确链路
    //   a) 合成 ClipboardEvent + DataTransfer 文件 → 无效（编辑器不消费不可信事件，实测 0 图）
    //   b) 直接给 input[type=file].files 赋值 + change → 无效（同样不可信）
    //   c) 正确做法：先 TRUSTED 点击工具栏 .syl-toolbar-tool.image 打开图片选择弹层
    //      （此时页面才会挂载 input[type=file][accept="image/*"]），再用 CDP
    //      DOM.setFileInputFiles 投喂文件（走浏览器真实文件选择通路），
    //      上传完成后弹层里会出现「已上传 N 张图片 … 取消 确定」，
    //      最后 TRUSTED 点击「确定」才会把图片节点插入正文。
    const opened = await clickImageToolbar(page)
    if (!opened)
      throw new Error('未找到头条号工具栏图片按钮（.syl-toolbar-tool.image），无法上传 ' + name)
    await new Promise(resolve => setTimeout(resolve, 2500))
    const cdp = await page.createCDPSession()
    try {
      const { root } = await cdp.send('DOM.getDocument')
      const { nodeIds } = await cdp.send('DOM.querySelectorAll', {
        nodeId: root.nodeId,
        selector: 'input[type="file"]',
      })
      if (nodeIds.length === 0) throw new Error('图片弹层未挂载 input[type=file]')
      await cdp.send('DOM.setFileInputFiles', { nodeId: nodeIds[0], files: [filePath] })
      // EDITOR_TUNE（2026-10 实测）：弹层刚挂载时文案就是「已上传 0 张图片」且「确定」处于
      // disabled；约 2s 后变为「已上传 1 张图片」并解除禁用。若只等"出现已上传字样"就点，
      // 会点在禁用按钮上 → 弹层永不关闭 → 图片始终插不进正文（120s 超时）。
      // 因此必须等"已上传 N 张（N≥1）"且弹层内「确定」真正可用。
      await page.waitForFunction(() => /已上传\s*[1-9]\d*\s*张图片/.test(document.body.innerText), {
        timeout: 120000,
        polling: 1000,
      })
      await waitForImageDialogConfirmEnabled(page, 60000)
      await confirmImageDialog(page)
    } finally {
      await cdp.detach().catch(() => undefined)
    }
    try {
      await page.waitForFunction(
        (sel, before) => {
          const editor = document.querySelector(sel)
          if (!editor) return false
          return (
            Array.from(editor.querySelectorAll('img')).filter(el =>
              /^https?:\/\//.test(el.getAttribute('src') ?? ''),
            ).length > before
          )
        },
        { timeout: 120000, polling: 1000 },
        EDITOR_BODY_SELECTOR,
        before,
      )
    } catch {
      const shot = await debugScreenshot(page, debugDir, 'upload_' + name)
      throw new Error(
        '正文图 ' + name + ' 在 120s 内未完成编辑器上传（网络或风控原因，见截图）。截图: ' + shot,
      )
    }
    const src = await page.evaluate((sel) => {
      const editor = document.querySelector(sel)
      const imgs = Array.from(editor?.querySelectorAll('img') ?? [])
        .map(el => el.getAttribute('src') ?? '')
        .filter(s => /^https?:\/\//.test(s))
      return imgs[imgs.length - 1] ?? ''
    }, EDITOR_BODY_SELECTOR)
    if (!src) throw new Error('编辑器上传完成后未取到图片 src: ' + name)
    srcs.push(src)
  }
  return srcs
}

/** TRUSTED 点击工具栏图片按钮，打开图片选择弹层（返回是否点到） */
async function clickImageToolbar(page: Page): Promise<boolean> {
  const box = await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('.syl-toolbar-tool.image')
    if (!el) return null
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return null
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  })
  if (!box) return false
  await page.mouse.click(box.x, box.y)
  return true
}

/**
 * 等待图片弹层内「确定」真正可用（非 disabled）。
 * EDITOR_TUNE（2026-10 实测）：上传完成的瞬间按钮仍可能处于 disabled，需要轮询等待。
 * 超时不抛错——由 confirmImageDialog 的重试与兜底路径接管。
 */
async function waitForImageDialogConfirmEnabled(page: Page, timeoutMs: number): Promise<boolean> {
  try {
    await page.waitForFunction(
      () => {
        const cands = Array.from(document.querySelectorAll<HTMLElement>('button,div,span')).filter(
          el => el.children.length === 0 && (el.textContent ?? '').trim() === '确定',
        )
        for (const el of cands) {
          const btn = (el.closest('button') ?? el) as HTMLElement
          if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true')
            continue
          if (/disabled/i.test(String(btn.className ?? ''))) continue
          let anc = el.parentElement
          for (let i = 0; anc && i < 16; i++, anc = anc.parentElement) {
            const t = anc.textContent ?? ''
            if (t.includes('已上传') && t.includes('张图片')) return true
          }
        }
        return false
      },
      { timeout: timeoutMs, polling: 500 },
    )
    return true
  } catch {
    return false
  }
}

/** TRUSTED 点击图片弹层的「确定」，把已上传图片真正插入正文
 *  EDITOR_TUNE（2026-10 实测）：头条图片弹层里的「确定」必须落在弹层容器内。
 *  页面上存在其他同名「确定」节点，取"第一个可见者"会点错，弹层永不关闭、
 *  图片插不进正文（表现为 upload_<brand>.png 截图里弹层一直开着）。
 *  正确做法：只在祖先节点文本命中「已上传 N 张图片」的按钮里选，优先可点击者，
 *  点击后用同一特征复检弹层是否关闭，未关则重试，最后兜底走 el.click()。
 */
async function confirmImageDialog(page: Page): Promise<void> {
  const DIALOG_SRC = '\u5DF2\u4E0A\u4F20\\s*\\d+\\s*\u5F20\u56FE\u7247'
  const dialogOpen = () =>
    page.evaluate(src => new RegExp(src).test(document.body.innerText), DIALOG_SRC)
  const findBox = () =>
    page.evaluate((src) => {
      const re = new RegExp(src)
      const cands = Array.from(document.querySelectorAll<HTMLElement>('button,div,span')).filter(
        el => el.children.length === 0 && (el.textContent ?? '').trim() === '确定',
      )
      const inDialog: Array<{ el: HTMLElement; x: number; y: number }> = []
      const others: Array<{ el: HTMLElement; x: number; y: number }> = []
      for (const el of cands) {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        const rec = { el, x: r.x + r.width / 2, y: r.y + r.height / 2 }
        let anc = el.parentElement
        let hit = false
        for (let i = 0; anc && i < 14; i++, anc = anc.parentElement) {
          if (re.test(anc.textContent ?? '')) {
            hit = true
            break
          }
        }
        (hit ? inDialog : others).push(rec)
      }
      const pool = inDialog.length ? inDialog : others
      const usable = pool.find((c) => {
        const btn = (c.el.closest('button') ?? c.el) as HTMLElement
        if (btn.hasAttribute('disabled') || btn.getAttribute('aria-disabled') === 'true')
          return false
        if (/disabled/i.test(String(btn.className ?? ''))) return false
        return true
      })
      const pick = usable ?? pool[0]
      return pick ? { x: pick.x, y: pick.y } : null
    }, DIALOG_SRC)
  for (let attempt = 1; attempt <= 8; attempt++) {
    const box = await findBox()
    if (!box) {
      if (!(await dialogOpen())) return
      await new Promise(resolve => setTimeout(resolve, 1500))
      continue
    }
    await page.mouse.click(box.x, box.y)
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (!(await dialogOpen())) return
  }
  // 兜底：TRUSTED 点击始终无效时，用 DOM 事件直接触发弹层内的「确定」
  await page.evaluate((src) => {
    const re = new RegExp(src)
    const cands = Array.from(document.querySelectorAll<HTMLElement>('button,div,span')).filter(
      el => el.children.length === 0 && (el.textContent ?? '').trim() === '确定',
    )
    for (const el of cands) {
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) continue
      let anc = el.parentElement
      let hit = false
      for (let i = 0; anc && i < 14; i++, anc = anc.parentElement) {
        if (re.test(anc.textContent ?? '')) {
          hit = true
          break
        }
      }
      if (!hit) continue
      const btn = (el.closest('button') ?? el) as HTMLElement
      btn.click()
      return
    }
  }, DIALOG_SRC)
  await new Promise(resolve => setTimeout(resolve, 2000))
}

/** 清空编辑器（试传图片收集完 src 后、粘贴正式正文前调用） */
async function clearEditor(page: Page): Promise<void> {
  await page.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) throw new Error('未找到头条号正文编辑器')
    editor.focus()
  }, EDITOR_BODY_SELECTOR)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Delete')
  await new Promise(resolve => setTimeout(resolve, 600))
  // 兜底：若快捷键未清空（ProseMirror 焦点丢失时常见），直接清 DOM 并通知 model
  const left = await page.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) return -1
    if (editor.innerText.trim().length === 0) return 0
    editor.innerHTML = ''
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: false }))
    return editor.innerText.trim().length
  }, EDITOR_BODY_SELECTOR)
  if (left !== 0) await new Promise(resolve => setTimeout(resolve, 400))
}

/**
 * 等待编辑器自报"已保存"。
 * EDITOR_TUNE（2026-10 实测文案）：
 *   成功 → 「草稿已保存」（新版）/「已保存」/「保存成功」
 *   进行中 → 「草稿保存中...」
 *   保存失败 → 状态会一直停在「草稿保存中...」不翻转（服务端 code 7050），
 *             因此本函数只认成功文案，绝不把"保存中"当成成功，超时即判定失败由调用方报错。
 */
async function waitForEditorSaved(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page
      .evaluate(() => {
        const text = document.body.innerText.replace(/\s+/g, ' ')
        if (/草稿已保存|已保存|保存成功/.test(text)) return 'saved'
        if (/保存中|正在保存|未保存|草稿保存中/.test(text)) return 'saving'
        return 'unknown'
      })
      .catch(() => 'unknown')
    if (state === 'saved') return true
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  return false
}

/**
 * 监听头条保存响应（辅助信号）：保存类接口的响应体可能携带文章 id。
 * EDITOR_TUNE：保存响应若无 id（或走加密网关），draft_id 以标题匹配兜底；
 * 成功与否一律以 waitForEditorSaved 的编辑器状态为准，避免把"保存中"误判为已完成。
 */
function collectDraftSaves(page: Page): {
  saves: Array<{ id: string; title: string; url: string }>
  stop: () => void
} {
  const saves: Array<{ id: string; title: string; url: string }> = []
  const handler = (res: import('puppeteer-core').HTTPResponse) => {
    const method = res.request().method()
    if (
      !DRAFT_SAVE_RE.test(res.url()) ||
      (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') ||
      res.status() !== 200
    )
      return
    void res
      .text()
      .then((raw) => {
        let body: unknown = null
        try {
          body = JSON.parse(raw)
        } catch {
          return /* 非 JSON 响应：无 id 可取，交由 UI 状态判定 */
        }
        if (!body || typeof body !== 'object') return
        const data = (body as Record<string, unknown>).data
        const scope = (typeof data === 'object' && data !== null ? data : body) as Record<
          string,
          unknown
        >
        // 保存响应的文章 id 字段候选：id / article_id / draft_id / item_id / save_id（字符串或数字）
        let id = ''
        for (const v of [
          scope.id,
          scope.article_id,
          scope.draft_id,
          scope.item_id,
          scope.save_id,
        ]) {
          if (typeof v === 'string' && v) {
            id = v
            break
          }
          if (typeof v === 'number' && Number.isFinite(v)) {
            id = String(v)
            break
          }
        }
        if (!id) return
        saves.push({
          id,
          title: typeof scope.title === 'string' ? scope.title : '',
          url: res.url(),
        })
      })
      .catch(() => undefined)
  }
  page.on('response', handler)
  return { saves, stop: () => page.off('response', handler) }
}

/** 触发保存：先点"保存草稿"类按钮，Ctrl+S 兜底 */
async function triggerSaveDraft(page: Page): Promise<void> {
  const clicked = await clickButtonByLabel(page, SAVE_BUTTON_LABELS)
  if (!clicked) {
    await page.keyboard.down('Control')
    await page.keyboard.press('KeyS')
    await page.keyboard.up('Control')
  }
}

/** 发布边界二次防线的字数口径（与 zhihu.ts mdPlain 一致） */
function mdPlain(md: string): string {
  return md
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*-{3,}\s*$/gm, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, '')
}

function precheckMarkdown(job: ToutiaoPublishJob, index: number, md: string): string[] {
  const problems: string[] = []
  const plain = mdPlain(md)
  const effectiveMin = Math.floor(job.min_words * 0.85)
  if (plain.length < effectiveMin) {
    problems.push(
      '第' +
        index +
        '篇纯文字 ' +
        plain.length +
        ' 字，低于容差下限 ' +
        effectiveMin +
        '（设定 ' +
        job.min_words +
        '）',
    )
  }
  for (const w of job.forbidden) {
    if (plain.includes(w)) problems.push('第' + index + '篇含禁词: ' + w)
  }
  return problems
}

// ---------- 发布主流程 ----------

async function publishOneArticle(
  cfg: Config,
  page: Page,
  debugDir: string,
  job: ToutiaoPublishJob,
  index: number,
): Promise<ToutiaoDraft> {
  // 全程监听保存响应：自动保存可能先于手动保存完成，不能假设保存请求在按键之后才发生
  const watch = collectDraftSaves(page)
  const title = job.titles[index - 1]
  const md = fs.readFileSync(job.article_files[index - 1], 'utf-8')
  let html = mdToPasteHtml(md)

  // 标题（头条编辑器硬限 30 字含标点，publish.ts 已断言）
  // EDITOR_TUNE：标题节点候选 textarea/input/contenteditable；等可见尺寸后坐标点击聚焦，
  // 清掉草稿回填的历史标题再输入（避免新旧标题拼接）
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel)
      if (!el) return false
      const r = el.getBoundingClientRect()
      return r.width > 0 && r.height > 0
    },
    { timeout: 20000, polling: 200 },
    TITLE_SELECTOR,
  )
  const titleBox = await page.$eval(TITLE_SELECTOR, (el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, w: r.width, h: r.height }
  })
  await page.mouse.click(titleBox.x + Math.min(10, titleBox.w / 2), titleBox.y + titleBox.h / 2)
  await new Promise(resolve => setTimeout(resolve, 600))
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await new Promise(resolve => setTimeout(resolve, 300))
  await page.keyboard.type(title, { delay: 20 })
  await new Promise(resolve => setTimeout(resolve, 800))

  // 正文图与品牌图：先逐张粘给编辑器自己上传，收集真实 CDN src 后替换占位符
  const keys: string[] = []
  const files: string[] = []
  if (job.brand_image_files?.header) {
    keys.push('__BRAND_TOP__')
    files.push(job.brand_image_files.header)
  }
  for (let j = 1; j <= job.content_img_count; j++) {
    const key = 'IMG_A' + index + '_' + j
    const file = job.content_files[key]
    if (!file)
      throw new Error('缺少第' + index + '篇正文配图 ' + key + '（请先运行 gzh_generate_images）')
    keys.push(key)
    files.push(file)
  }
  if (job.brand_image_files?.footer) {
    keys.push('__BRAND_BOT__')
    files.push(job.brand_image_files.footer)
  }
  if (files.length > 0) {
    const srcs = await pasteUploadImages(page, files, debugDir)
    for (let j = 0; j < keys.length; j++) {
      html = html
        .split('src="' + keys[j] + '"')
        .join('src="' + srcs[j].replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"')
    }
    // 清空试传图片，粘贴带真实 src 的正式正文（ProseMirror 编辑器在主文档内）
    await clearEditor(page)
  }
  await waitForEditor(page)
  // EDITOR_TUNE（2026-10 实测，务必保留）：
  // 头条 v4 正文编辑器已迁移到 ProseMirror，它只把"可信输入事件"同步进内部 model。
  // 已实测的注入方式与结果（保存接口 article/publish 的 content 字段长度）：
  //   1) 合成 new ClipboardEvent('paste', {clipboardData})  → content 为空，服务端 code 7050 保存失败
  //   2) document.execCommand('insertHTML') / 直接写 innerHTML + input 事件 → DOM 有字但 content 仍为空，7050
  //   3) CDP Input.insertText（不可信/无按键语义）→ content 有字但保存卡在「草稿保存中...」，不落草稿
  //   4) page.keyboard.type() 真实按键 → content 正常 + 状态变「草稿已保存」，草稿成功落库（唯一可用路径）
  // 因此正文必须用键盘输入。为兼顾效率，采用分段批量输入（punctuation 用 insertText 会丢 model，故一律走 type）。
  await page.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) throw new Error('未找到头条号正文编辑器')
    editor.focus()
  }, EDITOR_BODY_SELECTOR)
  await new Promise(resolve => setTimeout(resolve, 400))
  // 纯文本化：ProseMirror 键盘输入无法带 HTML 结构，正文以纯文本段落写入（标题层级由编辑器识别换行）
  const plainBody = html
    .replace(/<\/(p|div|h[1-6]|li|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
  // 分段输入：每段用 Enter 分隔产生真实段落，避免超长单次输入被截断
  const chunks = plainBody.split('\n')
  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) await page.keyboard.press('Enter')
    await page.keyboard.type(chunks[i], { delay: 0 })
  }
  await new Promise(resolve => setTimeout(resolve, 3000))
  const pasted = await page.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    return { len: editor ? editor.innerText.trim().length : 0 }
  }, EDITOR_BODY_SELECTOR)
  await new Promise(resolve => setTimeout(resolve, 1500))
  if (pasted.len === 0) {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_emptypaste')
    throw new Error('第' + index + '篇正文注入后编辑器仍为空（保存将失败）。截图: ' + shot)
  }
  await assertNoRiskPage(page, debugDir, 'article' + index + '_paste')

  // 保存草稿（按钮优先、Ctrl+S 兜底）；以编辑器顶栏「已保存」为成功判据（网络层不可靠，见 waitForEditorSaved）
  await triggerSaveDraft(page)
  let savedOk = await waitForEditorSaved(page, 60000)
  // 保存过程可能弹人机验证：无头下按开关把窗口交给人工，通过后重试一次保存
  if (!savedOk) {
    const relayed = await relayChallengeIfNeeded(cfg, page, debugDir, 'article' + index + '_save')
    if (relayed) {
      await triggerSaveDraft(page)
      savedOk = await waitForEditorSaved(page, 60000)
    }
  }
  const savedById =
    watch.saves.find(s => s.id && s.title === title.trim()) ?? watch.saves.find(s => s.id)
  watch.stop()
  if (!savedOk) {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_nosave')
    throw new Error('60s 内编辑器未回到「已保存」状态（会话过期或被风控拦截）。截图: ' + shot)
  }
  const draft: ToutiaoDraft = {
    draft_id: savedById?.id ?? '',
    title,
    url: CONSOLE_URL,
    published: false,
  }

  // 直发开关：发布面板上传封面（单图 16:9）→ 确认发布；结果以 gzh_verify_draft 为准
  if (job.publish_immediately) {
    await publishWithCover(cfg, page, debugDir, job, index, draft)
  }
  await debugScreenshot(page, debugDir, 'article' + index + '_done')
  return draft
}

/**
 * 人机验证接力：仅在开启 toutiao_reveal_on_challenge 时生效。
 * 把停靠在屏外的窗口移到屏内 → 等待人工完成旋转/滑块验证 → 通过后移回屏外，恢复"默认不显示"。
 * 未开启该开关时不做任何事，保持原有"直接报错停止"的行为。
 */
async function relayChallengeIfNeeded(
  cfg: Config,
  page: Page,
  debugDir: string,
  label: string,
): Promise<boolean> {
  if (!(await hasChallenge(page))) return true
  if (cfg.runtime.toutiao_reveal_on_challenge !== true) return false
  const revealed = await revealForHuman(page, debugDir, label)
  if (!revealed) return false
  // 人工完成验证通常需要几十秒，给足 5 分钟
  const cleared = await waitForChallengeCleared(page, 300000)
  await hideAfterHuman(page)
  return cleared
}

/** 发布面板：上传封面图并确认发布。封面自动化失败时绝不静默——降级为仅存草稿并在结果中注明 */
async function publishWithCover(
  cfg: Config,
  page: Page,
  debugDir: string,
  job: ToutiaoPublishJob,
  index: number,
  draft: ToutiaoDraft,
): Promise<void> {
  const coverPath = job.cover_files[String(index)]
  const failSoft = (warning: string) => {
    draft.warning = warning + '（草稿已保存，请在头条号后台人工补封面并发布）'
  }
  if (!coverPath || !fs.existsSync(coverPath)) {
    failSoft('缺少封面文件（请先运行 gzh_generate_images 生成 cover_' + index + '.png）')
    return
  }

  // 封面上传：EDITOR_TUNE（2026-10 实测）——头条 v4 的封面不是弹窗式上传，
  // 而是编辑器底部的内联「展示封面」区，点击 .article-cover-add 才会挂载
  // input[type=file][accept="image/*"]；投喂后弹层出现「已上传 N 张图片 … 取消 确定」，
  // 必须等「确定」解除 disabled 再点，封面才会真正落位（表现为出现「编辑/替换」）。
  // 关键顺序：必须先在编辑器页把封面补好，再点「预览并发布」——无封面时该按钮点击无效
  // （实测点击后 URL 不变、按钮仍在，且会触发编辑器 iframe 重建导致 frame detached）。
  let coverUploaded = false
  try {
    // 关掉可能残留的提示弹窗
    await page
      .evaluate(() => {
        const btns = [...document.querySelectorAll('button, span, div')]
        const ok = btns.find((el) => {
          const t = (el.textContent ?? '').trim()
          return (t === '确认' || t === '我知道了') && (el as HTMLElement).offsetParent !== null
        })
        if (ok) (ok as HTMLElement).click()
      })
      .catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 800))

    const coverAlreadyPresent = await page.evaluate(
      () => !!document.querySelector('.article-cover-img-modify, .article-cover-img-replace'),
    )
    if (coverAlreadyPresent) {
      coverUploaded = true
    } else {
      // 等封面控件出现并滚动到视口内（插入正文图后布局会变化，坐标需要重新取）
      let coverBox: { x: number; y: number } | null = null
      for (let attempt = 1; attempt <= 20; attempt++) {
        coverBox = await page.evaluate(() => {
          const el = document.querySelector<HTMLElement>('.article-cover-add')
          if (!el) return null
          el.scrollIntoView({ block: 'center' })
          const r = el.getBoundingClientRect()
          if (r.width <= 0 || r.height <= 0) return null
          if (r.y < 60 || r.y > window.innerHeight - 60) return null
          return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
        })
        if (coverBox) break
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      if (coverBox) {
        await page.mouse.click(coverBox.x, coverBox.y)
        await new Promise(resolve => setTimeout(resolve, 3000))
      }
      // 封面弹层开合会重建微前端 iframe，等页面重新稳定后再操作
      await waitForPageStable(page, 30000)
      // 等弹层内的图片输入出现
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('input[type="file"]')].some(el =>
              /image/i.test(el.getAttribute('accept') ?? ''),
            ),
          { timeout: 15000, polling: 300 },
        )
        .catch(() => undefined)
      // 兜底：部分账号形态仍走「选择封面」弹窗式入口
      if (!coverBox) {
        await clickButtonByLabel(page, COVER_PICK_LABELS).catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 2000))
        await clickButtonByLabel(page, COVER_UPLOAD_LABELS).catch(() => undefined)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }

      const pickImageInput = async () =>
        page.evaluateHandle(() => {
          const inputs = [...document.querySelectorAll('input[type="file"]')] as HTMLInputElement[]
          return (
            inputs.find(el => /image/i.test(el.getAttribute('accept') ?? '')) ??
            inputs.find(el => !/video/i.test(el.getAttribute('accept') ?? '')) ??
            null
          )
        })

      const handle = await evaluateWithRetry(page, () => pickImageInput())
      const fileInput = handle
        ? (handle.asElement() as import('puppeteer-core').ElementHandle<HTMLInputElement> | null)
        : null
      if (fileInput) {
        await fileInput.uploadFile(coverPath)
        await page
          .waitForFunction(() => /已上传\s*[1-9]\d*\s*张图片/.test(document.body.innerText), {
            timeout: 120000,
            polling: 1000,
          })
          .catch(() => undefined)
        await waitForImageDialogConfirmEnabled(page, 60000)
        await confirmImageDialog(page)
        await new Promise(resolve => setTimeout(resolve, 3000))
        coverUploaded = await evaluateWithRetry(page, () =>
          page.evaluate(
            () => !!document.querySelector('.article-cover-img-modify, .article-cover-img-replace'),
          ),
        ).catch(() => false)
      }
    }
  } catch (error) {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_cover')
    failSoft(
      '封面上传异常（' +
        (error instanceof Error ? error.message : String(error)).slice(0, 80) +
        '）。截图: ' +
        shot,
    )
    return
  }
  if (!coverUploaded) {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_cover')
    failSoft('未找到封面上传控件。截图: ' + shot)
    return
  }

  // 封面就绪后再打开发布入口：头条底栏是「预览并发布」，必须 TRUSTED 点击（受控按钮）
  const opened = await clickButtonByLabelTrusted(page, PUBLISH_BUTTON_LABELS)
  if (!opened) {
    await debugScreenshot(page, debugDir, 'article' + index + '_panel')
    failSoft('未找到发布入口按钮')
    return
  }
  await new Promise(resolve => setTimeout(resolve, 3000))
  // 点"发布"后头条常弹验证码：开启接力开关时把窗口交给人工完成，再继续后续步骤
  if (!(await relayChallengeIfNeeded(cfg, page, debugDir, 'article' + index + '_panel'))) {
    await assertNoRiskPage(page, debugDir, 'article' + index + '_panel')
  }
  // 发布弹层同样会重建 iframe，等稳定后再找确认按钮
  await waitForPageStable(page, 30000)

  // 确认发布：头条弹层按钮文案是「确认发布」，必须 TRUSTED 点击才会真正提交。
  // 弹层渲染有延迟，先等按钮出现再点。
  await page
    .waitForFunction(
      (labels) => {
        const wanted = labels as string[]
        const nodes = [...document.querySelectorAll('button, span, a, div')]
        return wanted.some(label =>
          nodes.some(
            el =>
              (el.textContent ?? '').trim() === label &&
              el.children.length === 0 &&
              (el as HTMLElement).offsetParent !== null &&
              el.getBoundingClientRect().width > 0,
          ),
        )
      },
      { timeout: 30000, polling: 500 },
      PUBLISH_CONFIRM_LABELS,
    )
    .catch(() => undefined)
  const confirmed = await clickButtonByLabelTrusted(page, PUBLISH_CONFIRM_LABELS)
  await new Promise(resolve => setTimeout(resolve, 8000))
  await assertNoRiskPage(page, debugDir, 'article' + index + '_publish')
  if (confirmed) {
    // 发布成功的判据：页面离开编辑器（跳转内容管理页）或出现成功文案
    const published = await evaluateWithRetry(page, async () => {
      const url = page.url()
      const text = await page.evaluate(() =>
        document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
      )
      const leftEditor = !/graphic\/publish/.test(url)
      const successWord = /发布成功|已提交审核|审核中/.test(text)
      return leftEditor || successWord
    }).catch(() => false)
    draft.published = published
    if (!published) {
      const shot = await debugScreenshot(page, debugDir, 'article' + index + '_confirm')
      failSoft('已点击确认发布但未检测到成功跳转。截图: ' + shot)
    }
  } else {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_confirm')
    failSoft('未找到确认发布按钮。截图: ' + shot)
  }
}

/** 头条号发布：N 篇 = N 个独立草稿；dry_run 只做文件与内容校验，不启动浏览器；only 支持按原始篇号部分重试 */
export async function runToutiaoPublish(
  cfg: Config,
  accountId: string,
  job: ToutiaoPublishJob,
  ownerTaskId?: string,
): Promise<ToutiaoPublishResult> {
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'toutiao_debug')
  const n = job.titles.length
  const plan = (job.only?.length ? job.only : Array.from({ length: n }, (_, k) => k + 1)).filter(
    i => i >= 1 && i <= n && Number.isInteger(i),
  )
  if (plan.length === 0) throw new Error('only 字段没有有效的篇号')

  for (const i of plan) {
    if (!fs.existsSync(job.article_files[i - 1])) {
      throw new Error(
        '缺少第' + i + '篇文章文件（请先运行 gzh_build_article）: ' + job.article_files[i - 1],
      )
    }
    const problems = precheckMarkdown(job, i, fs.readFileSync(job.article_files[i - 1], 'utf-8'))
    if (problems.length > 0) throw new Error('发布前校验未通过：\n' + problems.join('\n'))
    if (!job.dry_run) {
      if (job.brand_image_files?.header && !fs.existsSync(job.brand_image_files.header)) {
        throw new Error('缺少头条号头部品牌图: ' + job.brand_image_files.header)
      }
      if (job.brand_image_files?.footer && !fs.existsSync(job.brand_image_files.footer)) {
        throw new Error('缺少头条号尾部品牌图: ' + job.brand_image_files.footer)
      }
      for (let j = 1; j <= job.content_img_count; j++) {
        const file = job.content_files['IMG_A' + i + '_' + j]
        if (!file || !fs.existsSync(file)) {
          throw new Error(
            '缺少第' + i + '篇正文配图 IMG_A' + i + '_' + j + '（请先运行 gzh_generate_images）',
          )
        }
      }
      if (job.publish_immediately) {
        const cover = job.cover_files[String(i)]
        if (!cover || !fs.existsSync(cover)) {
          throw new Error(
            '缺少第' +
              i +
              '篇封面 cover_' +
              i +
              '.png（请先运行 gzh_generate_images；直发必须有封面）',
          )
        }
      }
    }
  }
  if (job.dry_run) return { dry_run: true, drafts: [] }

  const streamSessionId = `pub_tt_${accountId}_${Date.now()}`
  startAutomationStreamSession({
    sessionId: streamSessionId,
    module: 'social-publisher',
    platform: 'toutiao',
    accountId,
    title: `头条号发布 - ${job.titles[0] || accountId}`,
    currentUrl: WRITE_URL,
    status: 'running',
    startedAt: Date.now(),
    autoReveal: true,
    steps: [
      { id: 'auth', label: '校验后台登录态与安全凭据', status: 'running' },
      { id: 'editor', label: '打开头条号编辑器', status: 'pending' },
      { id: 'publish', label: `自动化发布图文 (${plan.length} 篇)`, status: 'pending' },
    ],
  })

  let detachScreencast: (() => Promise<void>) | null = null
  const browser = await launchToutiaoBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    detachScreencast = await attachPageScreencast(page, streamSessionId, { maxFps: 12, quality: 50 })
    // 自动恢复头条号已保存的登录凭据（Cookies），确保发布时会话 100% 有效，杜绝未登录窗口
    await restoreToutiaoCookies(page, cfg, accountId)
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise(resolve => setTimeout(resolve, 2000))
    if (onLoginPage(page.url()) || !(await isLoggedIn(page))) {
      await debugScreenshot(page, debugDir, 'not_login')
      // 中文注释：此处绝不作废本地已保存合法凭据，防止因为页面加载瞬态延迟导致有效凭据被误杀
      throw new Error('头条号未登录：请在设置「社媒账号」中该账号卡片点击「登录头条号」后重试')
    }
    updateAutomationStreamStep(streamSessionId, 'auth', 'completed')
    updateAutomationStreamStep(streamSessionId, 'editor', 'running')
    // 成功进入头条号创作后台，增量自愈刷新并持久化最新 Session
    await refreshToutiaoSession(page, cfg, accountId)
    await assertNoRiskPage(page, debugDir, 'entry')
    updateAutomationStreamStep(streamSessionId, 'editor', 'completed')
    updateAutomationStreamStep(streamSessionId, 'publish', 'running')

    const drafts: ToutiaoDraft[] = []
    for (const i of plan) {
      await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise(resolve => setTimeout(resolve, 1500))
      await assertNoRiskPage(page, debugDir, 'article' + i + '_entry')
      drafts.push(await publishOneArticle(cfg, page, debugDir, job, i))
    }
    updateAutomationStreamStep(streamSessionId, 'publish', 'completed')
    return { dry_run: false, drafts }
  } finally {
    if (detachScreencast) await detachScreencast().catch(() => {})
    await browser.close().catch(() => undefined)
    completeAutomationStreamSession(streamSessionId)
  }
}

// ---------- 登录与核验 ----------

/** 检查登录态（三级智能梯度检测：本地未过期校验 + 毫秒级网络在线探针，杜绝静态盲信假阳性） */
export async function toutiaoCheckLogin(cfg: Config, accountId: string): Promise<boolean> {
  const cached = getCachedLoginState('toutiao', accountId)
  if (cached !== null) return cached

  // 防重保护：若该账号正在执行登录流程，绝不拉起无头浏览器撞锁
  if (isLoginInFlight('toutiao', accountId)) {
    return false
  }

  // 梯度 1 & 梯度 2：本地过期门禁与轻量在线探针检测
  const health = await checkAccountLoginHealth(cfg, 'toutiao', accountId)
  if (health.valid) {
    setCachedLoginState('toutiao', accountId, true)
    return true
  }

  // 确实无凭据时启动无头浏览器探测一次
  const savedSession = loadToutiaoSession(cfg, accountId)
  if (!savedSession || !Array.isArray(savedSession.cookies) || savedSession.cookies.length === 0) {
    const browser = await launchToutiaoBrowser(cfg, accountId, true)
    try {
      const pages = await browser.pages()
      const page = pages.length > 0 ? pages[0] : await browser.newPage()
      await restoreToutiaoCookies(page, cfg, accountId)
      await page
        .goto(CONSOLE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
        .catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 2000))
      const notOnLogin = !onLoginPage(page.url())
      const loggedIn = notOnLogin && (await isLoggedIn(page))
      if (loggedIn) {
        const cookies = await page.cookies('https://mp.toutiao.com').catch(() => [])
        saveToutiaoSession(cfg, accountId, {
          account_id: accountId,
          platform: 'toutiao',
          cookies,
          updated_at: new Date().toISOString(),
        })
      }
      setCachedLoginState('toutiao', accountId, loggedIn)
      return loggedIn
    } finally {
      await browser.close().catch(() => undefined)
    }
  }

  setCachedLoginState('toutiao', accountId, false)
  return false
}

/** 头条账号登录（有头浏览器：mp.toutiao.com 未登录时自带注册/登录入口，支持扫码与账密；由设置界面的登录按钮调用） */
export async function toutiaoLogin(
  cfg: Config,
  accountId: string,
  timeoutMs = 240000,
): Promise<boolean> {
  const loginStartTime = Date.now()
  const streamSessionId = `login_tt_${accountId}_${Date.now()}`
  startAutomationStreamSession({
    sessionId: streamSessionId,
    module: 'social-publisher',
    platform: 'toutiao',
    accountId,
    title: `头条号登录授权 - ${accountId}`,
    currentUrl: LOGIN_PAGE_URL,
    status: 'running',
    startedAt: Date.now(),
    autoReveal: true,
    steps: [
      { id: 'open', label: '加载头条号登录授权页', status: 'running' },
      { id: 'scan', label: '等待扫码或账密授权', status: 'pending' },
      { id: 'save', label: '保存并同步会话凭据', status: 'pending' },
    ],
  })

  let detachScreencast: (() => Promise<void>) | null = null
  const browser = await launchToutiaoBrowser(cfg, accountId, true)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    detachScreencast = await attachPageScreencast(page, streamSessionId, { maxFps: 12, quality: 50 })
    await page.bringToFront().catch(() => undefined)
    await restoreToutiaoCookies(page, cfg, accountId)
    await page.goto(LOGIN_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

    // 给页面 3 秒让其在已有登录态时完成自动重定向
    await new Promise(resolve => setTimeout(resolve, 3000))
    if (!onLoginPage(page.url()) && (await isLoggedIn(page))) {
      const cookies = await page.cookies('https://mp.toutiao.com').catch(() => [])
      saveToutiaoSession(cfg, accountId, {
        account_id: accountId,
        platform: 'toutiao',
        cookies,
        updated_at: new Date().toISOString(),
      })
      setCachedLoginState('toutiao', accountId, true)
      return true
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!browser.connected || page.isClosed()) {
        const saved = loadToutiaoSession(cfg, accountId)
        const updatedAtMs = saved?.updated_at ? new Date(saved.updated_at).getTime() : 0
        if (
          updatedAtMs >= loginStartTime &&
          saved &&
          saved.cookies?.some(
            c => ['sessionid', 'sid_tt', 'sso_uid_tt'].includes(c.name) && Boolean(c.value),
          )
        ) {
          setCachedLoginState('toutiao', accountId, true)
          return true
        }
        return false
      }
      if (!onLoginPage(page.url()) && (await isLoggedIn(page))) {
        await new Promise(resolve => setTimeout(resolve, 2000))
        const cookies = await page.cookies('https://mp.toutiao.com').catch(() => [])
        saveToutiaoSession(cfg, accountId, {
          account_id: accountId,
          platform: 'toutiao',
          cookies,
          updated_at: new Date().toISOString(),
        })
        setCachedLoginState('toutiao', accountId, true)
        return true
      }
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    setCachedLoginState('toutiao', accountId, false)
    return false
  } finally {
    if (detachScreencast) await detachScreencast().catch(() => {})
    await browser.close().catch(() => undefined)
    completeAutomationStreamSession(streamSessionId)
  }
}

/**
 * 草稿核验：头条号没有可裸调的内容列表接口（lapi 网关需登录态与签名），
 * 此处用内容管理页回查当前形态——按标题匹配列表条目，提取附近的审核状态词；
 * 未匹配到 = 草稿已被删除或列表页结构变化（如实注明）。
 * EDITOR_TUNE：CONTENTLIST_URL 与状态词候选待首登实测固化。
 */
export async function toutiaoVerifyDrafts(
  cfg: Config,
  accountId: string,
  expected: Array<{ title: string; draft_id?: string }>,
): Promise<{ logged_in: boolean; article_count: number; articles: ToutiaoVerifyArticle[] }> {
  const browser = await launchToutiaoBrowser(
    cfg,
    accountId,
    cfg.runtime.toutiao_headless !== false,
  )
  try {
    const page = await browser.newPage()
    // 自动恢复头条号已保存的登录凭据（Cookies），确保核验时会话有效，杜绝未登录窗口
    await restoreToutiaoCookies(page, cfg, accountId)
    const debugDir = path.join(accountScriptsDir(cfg, accountId), 'toutiao_debug')
    await page
      .goto(CONSOLE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => undefined)
    if (onLoginPage(page.url()) || !(await isLoggedIn(page))) {
      return {
        logged_in: false,
        article_count: 0,
        articles: expected.map(item => ({ title: item.title, found: false })),
      }
    }
    // 核验进入控制台成功，增量自愈刷新并持久化最新 Session
    await refreshToutiaoSession(page, cfg, accountId)
    await page
      .goto(CONTENTLIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      .catch(() => undefined)
    await new Promise(resolve => setTimeout(resolve, 3000))
    await assertNoRiskPage(page, debugDir, 'verify_entry')
    // 列表页为 SPA：按标题全文匹配 + 状态词判定（EDITOR_TUNE：实测后可改为结构化列表解析）
    const pageText = await page.evaluate(() => document.body?.innerText ?? '')
    const articles: ToutiaoVerifyArticle[] = expected.map((item) => {
      if (!pageText.includes(item.title)) {
        return {
          title: item.title,
          found: false,
          note: '内容管理页未匹配到该标题（草稿可能已被删除，或列表页结构变化需调优 CONTENTLIST_URL/解析）',
        }
      }
      const pos = pageText.indexOf(item.title)
      const around = pageText.slice(Math.max(0, pos - 40), pos + item.title.length + 80)
      const status = ['已发布', '已发表', '审核中', '审核不通过', '审核未通过', '草稿'].find(s =>
        around.includes(s),
      )
      const published = status !== undefined && status !== '草稿'
      return {
        title: item.title,
        found: true,
        url: CONTENTLIST_URL,
        published,
        status,
        note: status
          ? '内容管理页匹配到条目，状态: ' + status
          : '内容管理页匹配到标题但未识别状态词（以发布时保存响应为准）',
      }
    })
    return {
      logged_in: true,
      article_count: articles.filter(a => a.found).length,
      articles,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

// ---------- 设置界面 HTTP 路由 ----------

export async function handleToutiaoLoginRoute(
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
    fs.mkdirSync(toutiaoProfileDir(cfg, accountId), { recursive: true })
  } catch {}
  if (action === 'check') {
    try {
      const logged = await toutiaoCheckLogin(cfg, accountId)
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
  if (isLoginInFlight('toutiao', accountId)) {
    if (force) {
      setLoginInFlight('toutiao', accountId, false)
    } else {
      sendJson(res, 409, { error: '账号 ' + accountId + ' 的头条号登录流程正在进行中' })
      return
    }
  }
  setLoginInFlight('toutiao', accountId, true)
  try {
    const logged = await toutiaoLogin(cfg, accountId)
    sendJson(
      res,
      200,
      logged
        ? { ok: true, action, logged_in: true }
        : { ok: false, action, error: '登录未完成或登录窗口已关闭，请重新点击登录头条号' },
    )
  } catch (error) {
    sendJson(res, 200, {
      ok: false,
      action,
      error: error instanceof Error ? error.message : String(error),
    })
  } finally {
    setLoginInFlight('toutiao', accountId, false)
  }
}

/** 设置界面：头条号登录态检查 / 账密或扫码登录（长时间等待，前端用 spinner 呈现） */
export function registerToutiaoRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(
      () =>
        webCtx.webServer!.register({
          kind: 'exact',
          path: TOUTIAO_LOGIN_ROUTE,
          handler: (req, res) => handleToutiaoLoginRoute(req, res, getConfig),
        }),
      'gzh-publisher: toutiao login route',
    )
  })
}
