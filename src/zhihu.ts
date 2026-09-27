// 知乎专栏发布适配器：浏览器自动化（puppeteer-core + 本机 Chrome/Edge）。
// 知乎没有官方发布 API，HTTP 逆向路线因 x-zse-96 签名频繁变动不可持续；
// 浏览器路线由知乎页面自身 JS 处理签名与风控，登录态持久化在账号独立 userDataDir（扫码一次长期有效）。
// 发布终点默认只存草稿箱（账号级 publish_immediately 开关可改为直接发布），与公众号"不直接群发"哲学一致。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import type { Context } from '@deepseek-ai/cordis'
import type { Config } from './config.ts'
import { accountScriptsDir, zhihuProfileDir } from './sync.ts'
import { getCachedLoginState, setCachedLoginState, isLoginInFlight, setLoginInFlight } from './login-state.ts'

const WRITE_URL = 'https://zhuanlan.zhihu.com/write'
const DRAFT_SAVE_RE = /zhuanlan\.zhihu\.com\/api\/articles\/drafts/
const RISK_PATTERNS = ['安全验证', '验证码', '异常流量', '环境异常']
const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
}

export const ZHIHU_LOGIN_ROUTE = '/api/gzh-publisher/zhihu-login'

export interface ZhihuDraft {
  draft_id: string
  title: string
  url: string
  published?: boolean
}

export interface ZhihuPublishJob {
  account_id: string
  titles: string[]
  article_files: string[] // 绝对路径（article_v2_N.md）
  content_files: Record<string, string> // IMG_A{i}_{j} → 绝对路径
  content_img_count: number
  publish_immediately: boolean
  dry_run: boolean
  min_words: number
  forbidden: string[]
  only?: number[] // 按原始篇号部分重试（缺省全部）；篇号决定 IMG_A{i} 占位符映射，必须与文件一致
}

export interface ZhihuPublishResult {
  dry_run: boolean
  drafts: ZhihuDraft[]
}

export interface ZhihuVerifyArticle {
  title: string
  found: boolean
  url?: string
  published?: boolean
  note?: string
}

// ---------- Chrome 发现与浏览器启动 ----------

const BROWSER_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]

export function findBrowserExecutable(cfg: Config): string {
  const configured = String(cfg.runtime.chrome_path ?? '').trim()
  if (configured) {
    if (!fs.existsSync(configured)) throw new Error('设置中的 chrome_path 不存在: ' + configured)
    return configured
  }
  for (const candidate of BROWSER_CANDIDATES) {
    if (candidate && fs.existsSync(candidate)) return candidate
  }
  throw new Error('未找到本机 Chrome/Edge：请在设置「运行」填写 chrome_path（浏览器可执行文件路径）')
}

async function launchZhihuBrowser(cfg: Config, accountId: string, headless: boolean): Promise<Browser> {
  const profileDir = zhihuProfileDir(cfg, accountId)
  fs.mkdirSync(profileDir, { recursive: true })
  try {
    return await puppeteer.launch({
      executablePath: findBrowserExecutable(cfg),
      headless,
      userDataDir: profileDir,
      defaultViewport: { width: 1440, height: 900 },
      protocolTimeout: 180000,
      args: ['--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (/user data directory|ProcessSingleton|SingletonLock/i.test(message)) {
      throw new Error('知乎浏览器目录被占用（可能已有知乎任务在运行）。请等待其结束后重试：' + profileDir)
    }
    throw new Error('启动浏览器失败：' + message)
  }
}

// ---------- 页面级工具 ----------

async function isLoggedIn(page: Page): Promise<boolean> {
  const cookies = await page.cookies('https://www.zhihu.com', 'https://zhuanlan.zhihu.com')
  return cookies.some((c) => c.name === 'z_c0' && Boolean(c.value))
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
    throw new Error('知乎出现风控/验证页面（' + hit + '），已停止。截图: ' + shot + '。请人工在浏览器完成验证后重试。')
  }
}

/**
 * 正文图上传：交给知乎编辑器自身的粘贴上传链路完成。
 * 旧接口 zhuanlan.zhihu.com/api/uploaded_images 已废弃（一律 422 code 4000，与 xsrf/MIME 无关）；
 * 新版编辑器内部走 api.zhihu.com/images（颁发 OSS STS token）→ zhimg 直传 → 轮询处理，
 * 全程含签名与风控处理，把图片以剪贴板文件粘给编辑器即可，最后从 DOM 收集插入的真实 <img> src。
 */
async function pasteUploadImages(page: Page, filePaths: string[], debugDir: string): Promise<string[]> {
  const countHttpImgs = () => page.evaluate(() => {
    const editor = document.querySelector('div[contenteditable="true"]')
    if (!editor) return -1
    return Array.from(editor.querySelectorAll('img'))
      .filter((el) => /^https?:\/\//.test(el.getAttribute('src') ?? '')).length
  })
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('div[contenteditable="true"]')
    if (!editor) throw new Error('未找到知乎正文编辑器')
    editor.focus()
  })
  const srcs: string[] = []
  for (const filePath of filePaths) {
    const before = await countHttpImgs()
    if (before < 0) throw new Error('未找到知乎正文编辑器')
    const b64 = fs.readFileSync(filePath).toString('base64')
    const name = path.basename(filePath)
    const mime = MIME_BY_EXT[path.extname(name).toLowerCase()] ?? 'image/png'
    await page.evaluate(async (b64, name, mime) => {
      const bin = atob(b64)
      const bytes = new Uint8Array(bin.length)
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
      const editor = document.querySelector<HTMLElement>('div[contenteditable="true"]')
      if (!editor) throw new Error('未找到知乎正文编辑器')
      editor.focus()
      const dt = new DataTransfer()
      dt.items.add(new File([bytes], name, { type: mime }))
      editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
    }, b64, name, mime)
    try {
      await page.waitForFunction((before) => {
        const editor = document.querySelector('div[contenteditable="true"]')
        if (!editor) return false
        return Array.from(editor.querySelectorAll('img'))
          .filter((el) => /^https?:\/\//.test(el.getAttribute('src') ?? '')).length > before
      }, { timeout: 120000, polling: 1000 }, before)
    } catch {
      const shot = await debugScreenshot(page, debugDir, 'upload_' + name)
      throw new Error('正文图 ' + name + ' 在 120s 内未完成编辑器上传（网络或风控原因，见截图）。截图: ' + shot)
    }
    const src = await page.evaluate(() => {
      const editor = document.querySelector('div[contenteditable="true"]')
      const imgs = Array.from(editor?.querySelectorAll('img') ?? [])
        .map((el) => el.getAttribute('src') ?? '')
        .filter((s) => /^https?:\/\//.test(s))
      return imgs[imgs.length - 1] ?? ''
    })
    if (!src) throw new Error('编辑器上传完成后未取到图片 src: ' + name)
    srcs.push(src)
  }
  return srcs
}

/** 清空编辑器（试传图片收集完 src 后、粘贴正式正文前调用） */
async function clearEditor(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = document.querySelector<HTMLElement>('div[contenteditable="true"]')
    if (!editor) throw new Error('未找到知乎正文编辑器')
    editor.focus()
  })
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyA')
  await page.keyboard.up('Control')
  await page.keyboard.press('Delete')
  await new Promise((resolve) => setTimeout(resolve, 600))
}

/**
 * 监听知乎保存响应：zhuanlan 同源接口 /api/articles/drafts 的 POST/PUT/PATCH 响应体直接携带 draft id
 * （列表型 v4 API 需要 x-zse-96 签名，裸 fetch 会 401/403，不可用）。编辑器自动保存与 Ctrl+S 都会走到这里。
 */
function collectDraftSaves(page: Page): { saves: Array<{ id: string; title: string }>; stop: () => void } {
  const saves: Array<{ id: string; title: string }> = []
  const handler = (res: import('puppeteer-core').HTTPResponse) => {
    const method = res.request().method()
    if (!DRAFT_SAVE_RE.test(res.url()) || (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') || res.status() !== 200) return
    void res.json().then((body) => {
      const id = body && typeof body.id === 'string' ? body.id : ''
      if (!id) return
      saves.push({ id, title: body && typeof body.title === 'string' ? body.title : '' })
    }).catch(() => undefined)
  }
  page.on('response', handler)
  return { saves, stop: () => page.off('response', handler) }
}

// ---------- Markdown → 粘贴富文本（受限子集转换器，只处理 zhihu_components.py 的输出语法） ----------

function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function mdInline(s: string): string {
  return htmlEscape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
}

export function mdToPasteHtml(md: string): string {
  const blocks: string[] = []
  let para: string[] = []
  let list: string[] = []
  const flushPara = () => {
    if (para.length) {
      blocks.push('<p>' + para.map(mdInline).join('<br>') + '</p>')
      para = []
    }
  }
  const flushList = () => {
    if (list.length) {
      blocks.push('<ul>' + list.map((li) => '<li>' + mdInline(li) + '</li>').join('') + '</ul>')
      list = []
    }
  }
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) {
      flushPara()
      flushList()
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = line.match(/^([#]{2,3})\s+(.+)$/))) {
      flushPara()
      flushList()
      blocks.push('<h' + m[1].length + '>' + mdInline(m[2]) + '</h' + m[1].length + '>')
    } else if ((m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/))) {
      flushPara()
      flushList()
      blocks.push('<img src="' + htmlEscape(m[2]) + '" alt="' + htmlEscape(m[1]) + '">')
    } else if (/^-{3,}$/.test(line)) {
      flushPara()
      flushList()
      blocks.push('<hr>')
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushPara()
      flushList()
      blocks.push('<blockquote><p>' + mdInline(m[1]) + '</p></blockquote>')
    } else if ((m = line.match(/^[-*]\s+(.+)$/))) {
      flushPara()
      list.push(m[1])
    } else {
      flushList()
      para.push(line)
    }
  }
  flushPara()
  flushList()
  return blocks.join('\n')
}

/** 发布边界二次防线的字数口径（与 zhihu_components.plain_text 一致） */
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

function precheckMarkdown(job: ZhihuPublishJob, index: number, md: string): string[] {
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
  job: ZhihuPublishJob,
  index: number,
): Promise<ZhihuDraft> {
  // 全程监听保存响应：自动保存可能先于 Ctrl+S 完成，不能假设保存请求在按键之后才发生
  const watch = collectDraftSaves(page)
  const title = job.titles[index - 1]
  const md = fs.readFileSync(job.article_files[index - 1], 'utf-8')
  let html = mdToPasteHtml(md)

  // 标题（知乎上限 100 字，publish.ts 已断言）
  const titleHandle = await page.waitForSelector('textarea', { timeout: 20000 })
  if (!titleHandle) throw new Error('未找到知乎标题输入框')
  await titleHandle.click()
  await page.keyboard.type(title, { delay: 20 })

  // 正文图：先逐张粘给编辑器自己上传（旧上传接口已废弃），收集真实 CDN src 后替换占位符
  const keys: string[] = []
  const files: string[] = []
  for (let j = 1; j <= job.content_img_count; j++) {
    const key = 'IMG_A' + index + '_' + j
    const file = job.content_files[key]
    if (!file) throw new Error('缺少第' + index + '篇正文配图 ' + key + '（请先运行 gzh_generate_images）')
    keys.push(key)
    files.push(file)
  }
  const srcs = await pasteUploadImages(page, files, debugDir)
  for (let j = 0; j < keys.length; j++) {
    html = html.split('src="' + keys[j] + '"').join('src="' + htmlEscape(srcs[j]) + '"')
  }

  // 清空试传图片，粘贴带真实 src 的正式正文
  await clearEditor(page)

  // 正文粘贴（DataTransfer paste 事件，知乎编辑器把富文本转为自有格式并保留知乎图床 URL）
  await page.waitForSelector('div[contenteditable="true"]', { timeout: 20000 })
  await page.evaluate((html) => {
    const editor = document.querySelector<HTMLElement>('div[contenteditable="true"]')
    if (!editor) throw new Error('未找到知乎正文编辑器')
    editor.focus()
    const dt = new DataTransfer()
    dt.setData('text/html', html)
    dt.setData('text/plain', html.replace(/<[^>]+>/g, ' '))
    editor.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: dt }))
  }, html)
  await new Promise((resolve) => setTimeout(resolve, 2500))
  await assertNoRiskPage(page, debugDir, 'article' + index + '_paste')

  // Ctrl+S 显式保存；自动保存若先行完成也已被监听到，按标题匹配取 draft id
  await page.keyboard.down('Control')
  await page.keyboard.press('KeyS')
  await page.keyboard.up('Control')
  const deadline = Date.now() + 60000
  let saved = watch.saves.find((s) => s.title === title.trim())
  while (!saved && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 500))
    saved = watch.saves.find((s) => s.title === title.trim())
  }
  watch.stop()
  if (!saved) {
    const shot = await debugScreenshot(page, debugDir, 'article' + index + '_nosave')
    throw new Error('60s 内未收到《' + title + '》的知乎保存响应（会话过期或被风控拦截）。截图: ' + shot)
  }
  const draft: ZhihuDraft = {
    draft_id: saved.id,
    title,
    url: 'https://zhuanlan.zhihu.com/p/' + saved.id,
    published: false,
  }

  // 直发开关（best-effort）：点击发布 → 仅当出现"确认"按钮才点击；结果以 gzh_verify_draft 为准
  if (job.publish_immediately) {
    const clicked = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find((el) => (el.textContent ?? '').trim() === '发布')
      if (btn) {
        btn.click()
        return true
      }
      return false
    })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (clicked) {
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find((el) => {
          const label = (el.textContent ?? '').trim()
          return (label === '确认' || label === '确认发布') && el.offsetParent !== null
        })
        if (btn) btn.click()
      })
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    await assertNoRiskPage(page, debugDir, 'article' + index + '_publish')
  }
  await debugScreenshot(page, debugDir, 'article' + index + '_done')
  return draft
}

/** 知乎发布：N 篇 = N 个独立草稿；dry_run 只做文件与内容校验，不启动浏览器；only 支持按原始篇号部分重试 */
export async function runZhihuPublish(cfg: Config, accountId: string, job: ZhihuPublishJob): Promise<ZhihuPublishResult> {
  const sdir = accountScriptsDir(cfg, accountId)
  const debugDir = path.join(sdir, 'zhihu_debug')
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
      for (let j = 1; j <= job.content_img_count; j++) {
        const file = job.content_files['IMG_A' + i + '_' + j]
        if (!file || !fs.existsSync(file)) {
          throw new Error('缺少第' + i + '篇正文配图 IMG_A' + i + '_' + j + '（请先运行 gzh_generate_images）')
        }
      }
    }
  }
  if (job.dry_run) return { dry_run: true, drafts: [] }

  const browser = await launchZhihuBrowser(cfg, accountId, cfg.runtime.zhihu_headless !== false)
  try {
    const page = await browser.newPage()
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (page.url().includes('/signin') || !(await isLoggedIn(page))) {
      await debugScreenshot(page, debugDir, 'not_login')
      throw new Error('知乎未登录：请在设置「公众号账号」中该账号卡片点击「扫码登录知乎」后重试')
    }
    await assertNoRiskPage(page, debugDir, 'entry')

    const drafts: ZhihuDraft[] = []
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
export async function zhihuCheckLogin(cfg: Config, accountId: string): Promise<boolean> {
  const cached = getCachedLoginState('zhihu', accountId)
  if (cached !== null) return cached
  const browser = await launchZhihuBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    await page.goto('https://www.zhihu.com', { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined)
    const loggedIn = await isLoggedIn(page)
    setCachedLoginState('zhihu', accountId, loggedIn)
    return loggedIn
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/** 扫码登录（有头浏览器，轮询 z_c0 cookie；由设置界面的登录按钮调用） */
export async function zhihuLogin(cfg: Config, accountId: string, timeoutMs = 240000): Promise<boolean> {
  const browser = await launchZhihuBrowser(cfg, accountId, false)
  try {
    const page = await browser.newPage()
    await page.goto('https://www.zhihu.com/signin?next=%2Fwrite', { waitUntil: 'domcontentloaded', timeout: 60000 })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (await isLoggedIn(page)) {
        setCachedLoginState('zhihu', accountId, true)
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    setCachedLoginState('zhihu', accountId, false)
    return false
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 草稿核验：知乎不提供可裸调的草稿列表接口（v4 需 x-zse-96 签名，zhuanlan 旧接口仅支持 POST 创建），
 * 创建证据以发布时的保存响应为准（响应含 draft id）；此处再用 /p/<id> 的访问状态判别当前形态——
 * 未重定向回首页 = 已公开发布；重定向回首页 = 草稿态或已被删除（远程无法区分，如实注明）。
 */
export async function zhihuVerifyDrafts(
  cfg: Config,
  accountId: string,
  expected: Array<{ title: string; draft_id?: string }>,
): Promise<{ logged_in: boolean; article_count: number; articles: ZhihuVerifyArticle[] }> {
  const browser = await launchZhihuBrowser(cfg, accountId, cfg.runtime.zhihu_headless !== false)
  try {
    const page = await browser.newPage()
    const debugDir = path.join(accountScriptsDir(cfg, accountId), 'zhihu_debug')
    await page.goto(WRITE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => undefined)
    if (page.url().includes('/signin') || !(await isLoggedIn(page))) {
      return { logged_in: false, article_count: 0, articles: expected.map((item) => ({ title: item.title, found: false })) }
    }
    const articles: ZhihuVerifyArticle[] = []
    for (const item of expected) {
      if (!item.draft_id) {
        articles.push({ title: item.title, found: false, note: '发布记录缺少 draft id（保存响应未捕获），无法远程核验' })
        continue
      }
      const url = 'https://zhuanlan.zhihu.com/p/' + item.draft_id
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
        await new Promise((resolve) => setTimeout(resolve, 1500))
        await assertNoRiskPage(page, debugDir, 'verify_' + item.draft_id)
        // /p/<id> 对不可公开访问的内容（草稿/已删除）不重定向，而是渲染 404 页"没有知识存在的荒原"
        const is404 = await page.evaluate(() => /没有知识存在的荒原/.test(document.body?.innerText ?? ''))
        const published = !is404
        articles.push({
          title: item.title,
          found: true,
          url,
          published,
          note: published ? '已公开发布' : '知乎已在发布时确认创建；当前不可公开访问（草稿态或已被删除）',
        })
      } catch (error) {
        articles.push({
          title: item.title,
          found: true,
          url,
          published: false,
          note: '访问 /p 页面失败（' + (error instanceof Error ? error.message : String(error)).slice(0, 120) + '），以发布时保存响应为准',
        })
      }
    }
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

function sendJson(res: import('node:http').ServerResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

/** 设置界面：知乎登录态检查 / 扫码登录（长时间等待，前端用 spinner 呈现） */
export function registerZhihuRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: ZHIHU_LOGIN_ROUTE,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { error: '不支持的请求方法' })
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        let body: { account_id?: string; action?: string } = {}
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
        } catch {
          sendJson(res, 400, { error: '请求体不是合法 JSON' })
          return
        }
        const accountId = String(body.account_id ?? '').trim()
        const action = body.action === 'check' ? 'check' : 'login'
        const cfg = getConfig()
        try {
          const account = resolveAccountSafe(cfg, accountId)
          if (account.profile.platform !== 'zhihu') {
            sendJson(res, 400, { error: '账号 ' + accountId + ' 不是知乎平台（platform=zhihu 才支持扫码登录）' })
            return
          }
        } catch (error) {
          sendJson(res, 400, { error: error instanceof Error ? error.message : String(error) })
          return
        }
        if (action === 'check') {
          try {
            const logged = await zhihuCheckLogin(cfg, accountId)
            sendJson(res, 200, { ok: true, action, logged_in: logged })
          } catch (error) {
            sendJson(res, 200, { ok: false, action, error: error instanceof Error ? error.message : String(error) })
          }
          return
        }
        if (isLoginInFlight('zhihu', accountId)) {
          sendJson(res, 409, { error: '账号 ' + accountId + ' 的知乎登录流程正在进行中' })
          return
        }
        setLoginInFlight('zhihu', accountId, true)
        try {
          const logged = await zhihuLogin(cfg, accountId)
          sendJson(res, 200, logged
            ? { ok: true, action, logged_in: true }
            : { ok: false, action, error: '登录超时（4 分钟内未检测到登录成功），请重试' })
        } catch (error) {
          sendJson(res, 200, { ok: false, action, error: error instanceof Error ? error.message : String(error) })
        } finally {
          setLoginInFlight('zhihu', accountId, false)
        }
      },
    }), 'gzh-publisher: zhihu login route')
  })
}

function resolveAccountSafe(cfg: Config, accountId: string) {
  const profile = cfg.accounts[accountId]
  if (!profile) throw new Error('账号不存在: ' + accountId)
  return { id: accountId, profile }
}
