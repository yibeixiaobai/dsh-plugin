// 百家号发布适配器：浏览器自动化（puppeteer-core + 本机 Chrome/Edge）。
// 百家号没有对个人开放的发布 API（内容开放平台门槛高，面向企业服务商），HTTP 逆向路线需百度签名且频繁变动不可持续；
// 浏览器路线由百家号页面自身 JS 处理签名与风控，登录态持久化在账号独立 userDataDir（百度账号登录一次长期有效）。
// 发布终点默认只存草稿箱（账号级 publish_immediately 开关可改为直接发布），与公众号"不直接群发"哲学一致。
// 注意：编辑器 selector 与保存接口正则为候选值，实测阶段（首登后）逐项固化——搜 EDITOR_TUNE 标记。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { accountScriptsDir, baijiahaoProfileDir } from './sync.ts'
import { getCachedLoginState, setCachedLoginState, isLoginInFlight, setLoginInFlight } from './login-state.ts'
import { cleanStaleChromeLocks, findBrowserExecutable, mdToPasteHtml } from './zhihu.ts'
import { handleCors, sendJson, readBodyText } from './http-helpers.ts'

const CONSOLE_URL = 'https://baijiahao.baidu.com/'
const WRITE_URL = 'https://baijiahao.baidu.com/builder/rc/edit'
// 百家号自有登录页（实测：未访问任何后台页时统一重定向到这里，同域；页面内嵌百度扫码/账密登录）
const LOGIN_PAGE_URL = 'https://baijiahao.baidu.com/builder/theme/bjh/login'
// 内容管理页候选（实测：/builder/app/content 与 /builder/app/contentlist 为 404，/builder/rc/content 未登录时跳登录页=路径存在；登录后实测确认）
const CONTENTLIST_URL = 'https://baijiahao.baidu.com/builder/rc/content'
// 编辑器保存草稿/自动保存接口：候选覆盖 builderinner 网关下的保存类请求，实测阶段固化
// 实测（2026-09）：正文保存走百度加密传输网关 banti.baidu.com/cdr，响应体仅 "OK" 且不含文章 id，
// 原正则只匹配 baijiahao.baidu.com 下的 draft|save|article，永远匹配不到，导致保存成功仍判定超时。
const DRAFT_SAVE_RE = /(?:baijiahao\.baidu\.com\/[^\s]*?(?:draft|save|article))|(?:banti\.baidu\.com\/(?:cdr|dr))/i
const PASSPORT_HOST_RE = /^https?:\/\/(passport|wappass)\.baidu\.com/
const LOGIN_PAGE_RE = /\/builder\/theme\/bjh\/login/
const RISK_PATTERNS = ['安全验证', '异常流量', '环境异常', '访问异常']
// EDITOR_TUNE：百家号编辑器/发布面板候选 selector，实测阶段固化
// 实测（2026-09）：编辑器改版为 /builder/rc/edit?type=news，标题为 Lexical contenteditable DIV，
// 不再是带 placeholder="标题"/maxlength="64" 的 input/textarea，旧选择器必然超时。
const TITLE_SELECTOR = '[data-testid="news-title-input"] [contenteditable="true"], .client_components_titleInput [contenteditable="true"]'
// 正文为 UEditor iframe（#ueditor_0）内的 contenteditable body；主文档内的 contenteditable 只有标题，故必须走 iframe。
const EDITOR_IFRAME_SELECTOR = '#ueditor_0'
const EDITOR_BODY_SELECTOR = 'body.view.news-editor-pc[contenteditable="true"], body[contenteditable="true"]'
const SAVE_BUTTON_LABELS = ['保存草稿', '存草稿', '保存']
const PUBLISH_BUTTON_LABELS = ['发布', '提交发布', '下一步']
const PUBLISH_CONFIRM_LABELS = ['确认发布', '发布', '确定']
const COVER_UPLOAD_LABELS = ['本地上传', '上传封面', '上传图片', '本地图']
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export const BAIJIAHAO_LOGIN_ROUTE = '/api/gzh-publisher/baijiahao-login'

export interface BaijiahaoDraft {
  draft_id: string
  title: string
  url: string
  published?: boolean
  warning?: string
}

export interface BaijiahaoPublishJob {
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

export interface BaijiahaoPublishResult {
  dry_run: boolean
  drafts: BaijiahaoDraft[]
}

export interface BaijiahaoVerifyArticle {
  title: string
  found: boolean
  url?: string
  published?: boolean
  status?: string
  note?: string
}

// ---------- 浏览器启动与页面级工具 ----------

async function launchBaijiahaoBrowser(cfg: Config, accountId: string, headless: boolean): Promise<Browser> {
  const profileDir = baijiahaoProfileDir(cfg, accountId)
  fs.mkdirSync(profileDir, { recursive: true })
  cleanStaleChromeLocks(profileDir)
  // 「按需显示」模式：有头启动但停靠在屏幕外，用户默认看不到；遇到人机验证时再移回屏内。
  // 必须 headless:false —— headless 的浏览器没有真实窗口，事后无法变得可见（实测）。
  const offscreen = headless && cfg.runtime.baijiahao_reveal_on_challenge === true
  const effectiveHeadless = headless && !offscreen
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
  ]
  if (!effectiveHeadless) {
    args.push('--start-maximized')
  } else {
    args.push('--window-size=1440,900')
  }
  if (offscreen) {
    // 覆盖 --start-maximized 的摆放：停到主屏外，保持不可见
    args.push('--window-position=-2400,-2400', '--window-size=1440,900')
  }
  try {
    return await puppeteer.launch({
      executablePath: findBrowserExecutable(cfg),
      headless: effectiveHeadless,
      userDataDir: profileDir,
      defaultViewport: effectiveHeadless ? { width: 1440, height: 900 } : null,
      protocolTimeout: 240000,
      args,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/user data directory|ProcessSingleton|SingletonLock/i.test(message)) {
      throw new Error('百家号浏览器目录被占用（可能已有百家号任务在运行）。请等待其结束后重试：' + profileDir)
    }
    throw new Error('启动浏览器失败：' + message)
  }
}

/** 百度登录态：BDUSS cookie（.baidu.com 域共享，百家号/passport 均可读到） */
async function isLoggedIn(page: Page): Promise<boolean> {
  const cookies = await page.cookies('https://baijiahao.baidu.com', 'https://www.baidu.com')
  return cookies.some((c) => c.name === 'BDUSS' && Boolean(c.value))
}

/** 是否处于登录页（百家号自有登录页同域跳转，或 passport/wappass 凭据页） */
function onLoginPage(url: string): boolean {
  return LOGIN_PAGE_RE.test(url) || PASSPORT_HOST_RE.test(url)
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
  const hit = RISK_PATTERNS.find((p) => content.includes(p))
  if (hit) {
    const shot = await debugScreenshot(page, debugDir, label + '_risk')
    throw new Error('百家号出现风控/验证页面（' + hit + '），已停止。截图: ' + shot + '。请人工在浏览器完成验证后重试。')
  }
}

/** 当前页面是否停在人机验证（滑块/扫码）上 */
async function hasChallenge(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const text = document.body ? document.body.innerText.replace(/\s+/g, ' ') : ''
    if (/请完成下方验证|拖动左侧滑块|百度安全验证|扫码验证/.test(text)) return true
    // 验证弹层常挂在 iframe / 独立容器里，补一道结构探测
    return Boolean(document.querySelector('[class*="vcode"], [class*="captcha"], [id*="captcha"]'))
  }).catch(() => false)
}

/**
 * 无头运行下遇到人机验证时，把浏览器窗口"显示"出来交给人工完成。
 *
 * 关键约束（实测）：以 headless:true 启动的浏览器**没有真实 OS 窗口**，CDP 的
 * Browser.setWindowBounds 对它无效，事后无法变可见。因此采用「有头 + 屏外停靠」：
 * 有头启动但用 --window-position=-2400,-2400 把窗口停在屏幕外（用户看不到），
 * 需要时再用 CDP 把它移回屏内并置前。
 */
async function revealForHuman(page: Page, debugDir: string, label: string): Promise<boolean> {
  await debugScreenshot(page, debugDir, label + '_challenge')
  try {
    const session = await page.target().createCDPSession()
    const { windowId } = await session.send('Browser.getWindowForTarget')
    await session.send('Browser.setWindowBounds', {
      windowId,
      bounds: { windowState: 'normal', left: 80, top: 60, width: 1440, height: 900 },
    })
    await session.detach().catch(() => undefined)
    await page.bringToFront().catch(() => undefined)
    return true
  } catch {
    return false
  }
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
    await new Promise((resolve) => setTimeout(resolve, 1000))
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
      // 实测：百家号工具栏里"发布"外层是可点的 <button>，内层还有一个 <span> 文案节点。
      // 若直接点内层 span，事件不会冒泡成有效点击（面板不展开）。因此优先点击真正的
      // 可交互祖先（button / [role=button] / 带 data-testid 的元素），取不到再退回首个命中项。
      const pick =
        hits.find((el) => el.tagName === 'BUTTON' || el.getAttribute('role') === 'button') ??
        hits.find((el) => el.hasAttribute('data-testid')) ??
        hits.find((el) => {
          const p = el.closest('button, [role="button"], [data-testid]')
          return p !== null && p !== el
        })
      const target = pick ?? hits[0]
      const clickable =
        (target.closest('button, [role="button"], [data-testid]') as HTMLElement | null) ?? (target as HTMLElement)
      ;(clickable as HTMLElement).click()
      return true
    }
    return false
  }, labels)
}

/**
 * 取得正文编辑器所在的 frame（UEditor iframe #ueditor_0）。
 * 实测：主文档里的 contenteditable 只有标题，正文在 iframe 内，必须穿透 frame 操作。
 */
async function getEditorFrame(page: Page): Promise<import('puppeteer-core').Frame> {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) {
    const handle = await page.$(EDITOR_IFRAME_SELECTOR).catch(() => null)
    if (handle) {
      const frame = await handle.contentFrame().catch(() => null)
      if (frame) {
        const ready = await frame.$(EDITOR_BODY_SELECTOR).catch(() => null)
        if (ready) return frame
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error('未找到百家号正文编辑器（UEditor iframe 未就绪）')
}

/** 正文图上传：交给百家号编辑器自身的粘贴上传链路完成，从 DOM 收集插入的真实 <img> src */
async function pasteUploadImages(page: Page, filePaths: string[], debugDir: string): Promise<string[]> {
  const frame = await getEditorFrame(page)
  const countHttpImgs = () => frame.evaluate((sel) => {
    const editor = document.querySelector(sel)
    if (!editor) return -1
    return Array.from(editor.querySelectorAll('img'))
      .filter((el) => /^https?:\/\//.test(el.getAttribute('src') ?? '')).length
  }, EDITOR_BODY_SELECTOR)
  await frame.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) throw new Error('未找到百家号正文编辑器')
    editor.focus()
  }, EDITOR_BODY_SELECTOR)
  const srcs: string[] = []
  for (const filePath of filePaths) {
    const before = await countHttpImgs()
    if (before < 0) throw new Error('未找到百家号正文编辑器')
    const b64 = fs.readFileSync(filePath).toString('base64')
    const name = path.basename(filePath)
    const mime = MIME_BY_EXT[path.extname(name).toLowerCase()] ?? 'image/png'
    await frame.evaluate(async (b64, name, mime, sel) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const editor = document.querySelector<HTMLElement>(sel)
      if (!editor) throw new Error('未找到百家号正文编辑器')
      editor.focus()
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], name, { type: mime }))
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
    }, b64, name, mime, EDITOR_BODY_SELECTOR)
    try {
      await frame.waitForFunction((sel, before) => {
        const editor = document.querySelector(sel)
        if (!editor) return false
        return Array.from(editor.querySelectorAll('img'))
          .filter((el) => /^https?:\/\//.test(el.getAttribute('src') ?? '')).length > before
      }, { timeout: 120000, polling: 1000 }, EDITOR_BODY_SELECTOR, before)
    } catch {
      const shot = await debugScreenshot(page, debugDir, 'upload_' + name)
      throw new Error('正文图 ' + name + ' 在 120s 内未完成编辑器上传（网络或风控原因，见截图）。截图: ' + shot)
    }
    const src = await frame.evaluate((sel) => {
      const editor = document.querySelector(sel)
      const imgs = Array.from(editor?.querySelectorAll('img') ?? [])
        .map((el) => el.getAttribute('src') ?? '')
        .filter((s) => /^https?:\/\//.test(s))
      return imgs[imgs.length - 1] ?? ''
    }, EDITOR_BODY_SELECTOR)
    if (!src) throw new Error('编辑器上传完成后未取到图片 src: ' + name)
    srcs.push(src)
  }
  return srcs
}

/** 清空编辑器（试传图片收集完 src 后、粘贴正式正文前调用） */
async function clearEditor(page: Page): Promise<void> {
  const frame = await getEditorFrame(page)
  await frame.evaluate((sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) throw new Error('未找到百家号正文编辑器')
    editor.focus()
  }, EDITOR_BODY_SELECTOR)
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Delete')
  await new Promise((resolve) => setTimeout(resolve, 600))
}

/**
 * 等待编辑器自报"已保存"。
 * 实测（2026-09）：新版编辑器正文保存在百度加密网关（banti.baidu.com/cdr）上完成，响应体仅 "OK"
 * 且不含任何文章 id，网络层无法可靠区分"某次保存完成"与"仍在保存中"；而底部状态栏会明确显示
 * 「字数 N 保存中」→「字数 N 已保存」。因此以编辑器官方的 UI 状态为准，而不是猜网络响应。
 */
async function waitForEditorSaved(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const state = await page.evaluate(() => {
      const text = document.body.innerText.replace(/\s+/g, ' ')
      if (/字数\s*\d+\s*已保存/.test(text)) return 'saved'
      if (/保存中/.test(text)) return 'saving'
      return 'unknown'
    }).catch(() => 'unknown')
    if (state === 'saved') return true
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  return false
}

/**
 * 监听百家号保存响应（辅助信号）：保存类接口的响应体可能携带文章 id。
 * 注意：新版编辑器保存走加密网关且回 "OK" 无 id，故本监听仅用于尽量补全 draft_id，
 * 成功与否一律以 waitForEditorSaved 的编辑器状态为准，避免把"保存中"误判为已完成。
 */
function collectDraftSaves(page: Page): { saves: Array<{ id: string; title: string; url: string }>; stop: () => void } {
  const saves: Array<{ id: string; title: string; url: string }> = []
  const handler = (res: import('puppeteer-core').HTTPResponse) => {
    const method = res.request().method()
    if (!DRAFT_SAVE_RE.test(res.url()) || (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') || res.status() !== 200) return
    void res.text().then((raw) => {
      let body: unknown = null
      try { body = JSON.parse(raw) } catch { return /* 加密网关回 "OK"：无 id 可取，交由 UI 状态判定 */ }
      if (!body || typeof body !== 'object') return
      const data = (body as Record<string, unknown>).data
      const scope = (typeof data === 'object' && data !== null ? data : body) as Record<string, unknown>
      // 保存响应的文章 id 字段候选：id / article_id / thread_id / save_id（字符串或数字）
      let id = ''
      for (const v of [scope.id, scope.article_id, scope.thread_id, scope.save_id]) {
        if (typeof v === 'string' && v) { id = v; break }
        if (typeof v === 'number' && Number.isFinite(v)) { id = String(v); break }
      }
      if (!id) return
      saves.push({
        id,
        title: typeof scope.title === 'string' ? scope.title : '',
        url: res.url(),
      })
    }).catch(() => undefined)
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

function precheckMarkdown(job: BaijiahaoPublishJob, index: number, md: string): string[] {
  const problems: string[] = []
  const plain = mdPlain(md)
  const effectiveMin = Math.floor(job.min_words * 0.85)
  if (plain.length < effectiveMin) {
    problems.push('第' + index + '篇纯文字 ' + plain.length + ' 字，低于容差下限 ' + effectiveMin + '（设定 ' + job.min_words + '）')
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
  job: BaijiahaoPublishJob,
  index: number,
): Promise<BaijiahaoDraft> {
  // 全程监听保存响应：自动保存可能先于手动保存完成，不能假设保存请求在按键之后才发生
  const watch = collectDraftSaves(page)
  const title = job.titles[index - 1]
  const md = fs.readFileSync(job.article_files[index - 1], 'utf-8')
  let html = mdToPasteHtml(md)

  // 标题（百家号编辑器硬限 64 字，publish.ts 已断言）
  // 实测：新版编辑器标题是 Lexical contenteditable DIV（非 input）。该节点在挂载瞬间尺寸为 0，
  // 直接 ElementHandle.click() 会抛 "Node is either not clickable or not an Element"，
  // 故等待其具备可见尺寸后用坐标点击聚焦。
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
  await new Promise((resolve) => setTimeout(resolve, 600))
  // 清掉草稿回填的历史标题，避免新旧标题拼接
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await new Promise((resolve) => setTimeout(resolve, 300))
  await page.keyboard.type(title, { delay: 20 })
  await new Promise((resolve) => setTimeout(resolve, 800))

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
    if (!file) throw new Error('缺少第' + index + '篇正文配图 ' + key + '（请先运行 gzh_generate_images）')
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
      html = html.split('src="' + keys[j] + '"').join('src="' + srcs[j].replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"')
    }
    // 清空试传图片，粘贴带真实 src 的正式正文（正文在 UEditor iframe 内）
    await clearEditor(page)
  }
  const editorFrame = await getEditorFrame(page)
  await editorFrame.evaluate((html, sel) => {
    const editor = document.querySelector<HTMLElement>(sel)
    if (!editor) throw new Error('未找到百家号正文编辑器')
    editor.focus()
    const dt = new DataTransfer()
    dt.setData('text/html', html)
    dt.setData('text/plain', html.replace(/<[^>]+>/g, ' '))
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
  }, html, EDITOR_BODY_SELECTOR)
  await new Promise((resolve) => setTimeout(resolve, 2500))
  await assertNoRiskPage(page, debugDir, 'article' + index + '_paste')

  // 保存草稿（按钮优先、Ctrl+S 兜底）；以编辑器底部状态「已保存」为成功判据（网络层不可靠，见 waitForEditorSaved）
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
  const savedById = watch.saves.find((s) => s.id && s.title === title.trim()) ?? watch.saves.find((s) => s.id)
  watch.stop()
  if (!savedOk) {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_nosave')
    throw new Error('60s 内编辑器未回到「已保存」状态（会话过期或被风控拦截）。截图: ' + shot)
  }
  const draft: BaijiahaoDraft = {
    draft_id: savedById?.id ?? '',
    title,
    url: CONSOLE_URL,
    published: false,
  }

  // 直发开关：发布面板上传封面（百家号发文封面必选）→ 确认发布；结果以 gzh_verify_draft 为准
  if (job.publish_immediately) {
    await publishWithCover(cfg, page, debugDir, job, index, draft)
  }
  await debugScreenshot(page, debugDir, 'article' + index + '_done')
  return draft
}

/**
 * 人机验证接力：仅在开启 baijiahao_reveal_on_challenge 时生效。
 * 把停靠在屏外的窗口移到屏内 → 等待人工拖滑块 → 通过后移回屏外，恢复"默认不显示"。
 * 未开启该开关时不做任何事，保持原有"直接报错停止"的行为。
 */
async function relayChallengeIfNeeded(
  cfg: Config,
  page: Page,
  debugDir: string,
  label: string,
): Promise<boolean> {
  if (!(await hasChallenge(page))) return true
  if (cfg.runtime.baijiahao_reveal_on_challenge !== true) return false
  const revealed = await revealForHuman(page, debugDir, label)
  if (!revealed) return false
  // 人工完成滑块通常需要几十秒，给足 5 分钟
  const cleared = await waitForChallengeCleared(page, 300000)
  await hideAfterHuman(page)
  return cleared
}

/** 发布面板：上传封面图并确认发布。封面自动化失败时绝不静默——降级为仅存草稿并在结果中注明 */
async function publishWithCover(
  cfg: Config,
  page: Page,
  debugDir: string,
  job: BaijiahaoPublishJob,
  index: number,
  draft: BaijiahaoDraft,
): Promise<void> {
  const coverPath = job.cover_files[String(index)]
  const failSoft = (warning: string) => {
    draft.warning = warning + '（草稿已保存，请在百家号后台人工补封面并发布）'
  }
  // 打开发布面板：百家号编辑器点"发布"进入封面/分类设置面板
  const opened = await clickButtonByLabel(page, PUBLISH_BUTTON_LABELS)
  if (!opened) {
    await debugScreenshot(page, debugDir, 'article' + index + '_panel')
    failSoft('未找到发布入口按钮')
    return
  }
  await new Promise((resolve) => setTimeout(resolve, 2000))
  // 点"发布"后百家号常弹滑块人机验证：开启接力开关时把窗口交给人工完成，再继续后续步骤
  if (!(await relayChallengeIfNeeded(cfg, page, debugDir, 'article' + index + '_panel'))) {
    await assertNoRiskPage(page, debugDir, 'article' + index + '_panel')
  }

  // 封面上传：面板里存在多个 input[type=file]（实测第 0 个是"视频"输入，accept="video/*"），
  // 直接取 page.$('input[type=file]') 会把图片塞给视频控件，弹出"视频格式不正确"提示并卡住流程。
  // 因此必须按 accept 精确挑选图片输入。
  if (coverPath && fs.existsSync(coverPath)) {
    let uploaded = false
    try {
      // 先关掉可能存在的提示弹窗（例如上一轮误传视频留下的提示）
      await page.evaluate(() => {
        const btns = [...document.querySelectorAll('button, span, div')]
        const ok = btns.find((el) => {
          const t = (el.textContent ?? '').trim()
          return (t === '确认' || t === '我知道了') && (el as HTMLElement).offsetParent !== null
        })
        if (ok) (ok as HTMLElement).click()
      }).catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 800))

      // 关键：封面 file input 只在"选择封面"弹窗打开后才存在于 DOM，
      // 不先点开弹窗就会判定"未找到封面上传控件"。实测弹窗入口文案为"选择封面"。
      await page.evaluate(() => {
        const nodes = [...document.querySelectorAll('*')]
        const entry = nodes.find((el) => {
          const t = (el.textContent ?? '').trim()
          return t === '选择封面' && el.children.length === 0 && (el as HTMLElement).offsetParent !== null
        })
        if (entry) {
          entry.scrollIntoView({ block: 'center' })
          ;(entry as HTMLElement).click()
        }
      }).catch(() => undefined)
      // 等弹窗内的图片输入出现
      await page
        .waitForFunction(
          () => [...document.querySelectorAll('input[type="file"]')].some((el) => /image/i.test(el.getAttribute('accept') ?? '')),
          { timeout: 15000, polling: 300 },
        )
        .catch(() => undefined)

      const pickImageInput = async () =>
        page.evaluateHandle(() => {
          const inputs = [...document.querySelectorAll('input[type="file"]')] as HTMLInputElement[]
          return (
            inputs.find((el) => /image/i.test(el.getAttribute('accept') ?? '')) ??
            inputs.find((el) => !/video/i.test(el.getAttribute('accept') ?? '')) ??
            null
          )
        })

      let handle = await pickImageInput()
      let fileInput = handle ? (handle.asElement() as import('puppeteer-core').ElementHandle<HTMLInputElement> | null) : null
      // 兜底：点"本地上传"让图片输入出现后再挑
      if (!fileInput) {
        await clickButtonByLabel(page, COVER_UPLOAD_LABELS)
        await new Promise((resolve) => setTimeout(resolve, 2000))
        handle = await pickImageInput()
        fileInput = handle ? (handle.asElement() as import('puppeteer-core').ElementHandle<HTMLInputElement> | null) : null
      }
      if (fileInput) {
        await fileInput.uploadFile(coverPath)
        uploaded = true
        await new Promise((resolve) => setTimeout(resolve, 6000))
        // 上传后弹窗内需要点"确定"确认封面选择
        await page.evaluate(() => {
          const btns = [...document.querySelectorAll('button, span, div')]
          const cands = btns.filter((el) => {
            const t = (el.textContent ?? '').trim()
            return /^确定/.test(t) && (el as HTMLElement).offsetParent !== null
          })
          const last = cands[cands.length - 1]
          if (last) (last as HTMLElement).click()
        }).catch(() => undefined)
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    } catch (error) {
      const shot = await debugScreenshot(page, debugDir, 'article' + index + '_cover')
      failSoft('封面上传异常（' + (error instanceof Error ? error.message : String(error)).slice(0, 80) + '）。截图: ' + shot)
      return
    }
    if (!uploaded) {
      const shot = await debugScreenshot(page, debugDir, 'article' + index + '_cover')
      failSoft('未找到封面上传控件。截图: ' + shot)
      return
    }
  } else {
    failSoft('缺少封面文件（请先运行 gzh_generate_images 生成 cover_' + index + '.png）')
    return
  }

  // 确认发布：仅当出现确认类按钮才点击；发布成功与否以 gzh_verify_draft 内容管理页回查为准
  const confirmed = await clickButtonByLabel(page, PUBLISH_CONFIRM_LABELS)
  await new Promise((resolve) => setTimeout(resolve, 5000))
  await assertNoRiskPage(page, debugDir, 'article' + index + '_publish')
  if (confirmed) {
    draft.published = true
  } else {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_confirm')
    failSoft('未找到确认发布按钮。截图: ' + shot)
  }
}

/** 百家号发布：N 篇 = N 个独立草稿；dry_run 只做文件与内容校验，不启动浏览器；only 支持按原始篇号部分重试 */
export async function runBaijiahaoPublish(cfg: Config, accountId: string, job: BaijiahaoPublishJob): Promise<BaijiahaoPublishResult> {
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'baijiahao_debug')
  const n = job.titles.length
  const plan = (job.only?.length ? job.only : Array.from({ length: n }, (_, k) => k + 1))
    .filter((i) => i >= 1 && i <= n && Number.isInteger(i))
  if (plan.length === 0) throw new Error('only 字段没有有效的篇号')

  for (const i of plan) {
    if (!fs.existsSync(job.article_files[i - 1])) {
      throw new Error('缺少第' + i + '篇文章文件（请先运行 gzh_build_article）: ' + job.article_files[i - 1])
    }
    const problems = precheckMarkdown(job, i, fs.readFileSync(job.article_files[i - 1], 'utf-8'))
    if (problems.length > 0) throw new Error('发布前校验未通过：\n' + problems.join('\n'))
    if (!job.dry_run) {
      if (job.brand_image_files?.header && !fs.existsSync(job.brand_image_files.header)) {
        throw new Error('缺少百家号头部品牌图: ' + job.brand_image_files.header)
      }
      if (job.brand_image_files?.footer && !fs.existsSync(job.brand_image_files.footer)) {
        throw new Error('缺少百家号尾部品牌图: ' + job.brand_image_files.footer)
      }
      for (let j = 1; j <= job.content_img_count; j++) {
        const file = job.content_files['IMG_A' + i + '_' + j]
        if (!file || !fs.existsSync(file)) {
          throw new Error('缺少第' + i + '篇正文配图 IMG_A' + i + '_' + j + '（请先运行 gzh_generate_images）')
        }
      }
      if (job.publish_immediately) {
        const cover = job.cover_files[String(i)]
        if (!cover || !fs.existsSync(cover)) {
          throw new Error('缺少第' + i + '篇封面 cover_' + i + '.png（请先运行 gzh_generate_images；直发必须有封面）')
        }
      }
    }
  }
  if (job.dry_run) return { dry_run: true, drafts: [] }

  const browser = await launchBaijiahaoBrowser(cfg, accountId, cfg.runtime.baijiahao_headless !== false)
  try {
    const page = await browser.newPage()
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (onLoginPage(page.url()) || !(await isLoggedIn(page))) {
      await debugScreenshot(page, debugDir, 'not_login')
      throw new Error('百家号未登录：请在设置「社媒账号」中该账号卡片点击「登录百家号」后重试')
    }
    await assertNoRiskPage(page, debugDir, 'entry')

    const drafts: BaijiahaoDraft[] = []
    for (const i of plan) {
      await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise((resolve) => setTimeout(resolve, 1500))
      await assertNoRiskPage(page, debugDir, 'article' + i + '_entry')
      drafts.push(await publishOneArticle(cfg, page, debugDir, job, i))
    }
    return { dry_run: false, drafts }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

// ---------- 登录与核验 ----------

/** 检查登录态（无头，几秒返回；60s 内重复检查直接返回缓存，不启动浏览器） */
export async function baijiahaoCheckLogin(cfg: Config, accountId: string): Promise<boolean> {
  const cached = getCachedLoginState('baijiahao', accountId)
  if (cached !== null) return cached
  const browser = await launchBaijiahaoBrowser(cfg, accountId, true)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const notOnLogin = !onLoginPage(page.url())
    const loggedIn = notOnLogin && (await isLoggedIn(page))
    setCachedLoginState('baijiahao', accountId, loggedIn)
    return loggedIn
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/** 百度账号登录（有头浏览器：百家号自有登录页支持扫码与账密，等待登录完成；由设置界面的登录按钮调用） */
export async function baijiahaoLogin(cfg: Config, accountId: string, timeoutMs = 240000): Promise<boolean> {
  const browser = await launchBaijiahaoBrowser(cfg, accountId, false)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    await page.bringToFront().catch(() => undefined)
    await page.goto(LOGIN_PAGE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })

    // 给页面 3 秒让其在已有登录态时完成自动重定向
    await new Promise((resolve) => setTimeout(resolve, 3000))
    if (!onLoginPage(page.url()) && (await isLoggedIn(page))) {
      setCachedLoginState('baijiahao', accountId, true)
      return true
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!browser.connected || page.isClosed()) {
        return false
      }
      if (!onLoginPage(page.url()) && (await isLoggedIn(page))) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        setCachedLoginState('baijiahao', accountId, true)
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    setCachedLoginState('baijiahao', accountId, false)
    return false
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 草稿核验：百家号没有可裸调的内容列表接口（builderinner 网关需登录态与签名），
 * 创建证据以发布时的保存响应为准（响应含文章 id）；此处再用内容管理页回查当前形态——
 * 按标题匹配列表条目，提取附近的审核状态词；未匹配到 = 草稿已被删除或列表页结构变化（如实注明）。
 */
export async function baijiahaoVerifyDrafts(
  cfg: Config,
  accountId: string,
  expected: Array<{ title: string; draft_id?: string }>,
): Promise<{ logged_in: boolean; article_count: number; articles: BaijiahaoVerifyArticle[] }> {
  const browser = await launchBaijiahaoBrowser(cfg, accountId, cfg.runtime.baijiahao_headless !== false)
  try {
    const page = await browser.newPage()
    const debugDir = path.join(accountScriptsDir(cfg, accountId), 'baijiahao_debug')
    await page.goto(CONSOLE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined)
    if (onLoginPage(page.url()) || !(await isLoggedIn(page))) {
      return { logged_in: false, article_count: 0, articles: expected.map((item) => ({ title: item.title, found: false })) }
    }
    await page.goto(CONTENTLIST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 3000))
    await assertNoRiskPage(page, debugDir, 'verify_entry')
    // 列表页为 SPA：按标题全文匹配 + 状态词判定（EDITOR_TUNE：实测后可改为结构化列表解析）
    const pageText = await page.evaluate(() => document.body?.innerText ?? '')
    const articles: BaijiahaoVerifyArticle[] = expected.map((item) => {
      if (!pageText.includes(item.title)) {
        return {
          title: item.title,
          found: false,
          note: '内容管理页未匹配到该标题（草稿可能已被删除，或列表页结构变化需调优 CONTENTLIST_URL/解析）',
        }
      }
      const pos = pageText.indexOf(item.title)
      const around = pageText.slice(Math.max(0, pos - 40), pos + item.title.length + 80)
      const status = ['发布成功', '已发表', '审核中', '审核不通过', '草稿'].find((s) => around.includes(s))
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
      article_count: articles.filter((a) => a.found).length,
      articles,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

// ---------- 设置界面 HTTP 路由 ----------

export async function handleBaijiahaoLoginRoute(
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
    fs.mkdirSync(baijiahaoProfileDir(cfg, accountId), { recursive: true })
  } catch {}
  if (action === 'check') {
    try {
      const logged = await baijiahaoCheckLogin(cfg, accountId)
      sendJson(res, 200, { ok: true, action, logged_in: logged })
    } catch (error) {
      sendJson(res, 200, { ok: false, action, error: error instanceof Error ? error.message : String(error) })
    }
    return
  }
  if (isLoginInFlight('baijiahao', accountId)) {
    if (force) {
      setLoginInFlight('baijiahao', accountId, false)
    } else {
      sendJson(res, 409, { error: '账号 ' + accountId + ' 的百家号登录流程正在进行中' })
      return
    }
  }
  setLoginInFlight('baijiahao', accountId, true)
  try {
    const logged = await baijiahaoLogin(cfg, accountId)
    sendJson(res, 200, logged
      ? { ok: true, action, logged_in: true }
      : { ok: false, action, error: '登录未完成或登录窗口已关闭，请重新点击登录百家号' })
  } catch (error) {
    sendJson(res, 200, { ok: false, action, error: error instanceof Error ? error.message : String(error) })
  } finally {
    setLoginInFlight('baijiahao', accountId, false)
  }
}

/** 设置界面：百家号登录态检查 / 账密或扫码登录（长时间等待，前端用 spinner 呈现） */
export function registerBaijiahaoRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: BAIJIAHAO_LOGIN_ROUTE,
      handler: (req, res) => handleBaijiahaoLoginRoute(req, res, getConfig),
    }), 'gzh-publisher: baijiahao login route')
  })
}
