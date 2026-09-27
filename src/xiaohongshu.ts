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
const PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish'
const RISK_PATTERNS = ['验证', '滑块', '安全检测', '账号异常', '环境异常']

export const XHS_LOGIN_ROUTE = '/api/gzh-publisher/xhs-login'

export interface XhsNote {
  note_id: string
  title: string
  url: string
  published?: boolean
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
      protocolTimeout: 240000,
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

async function isLoggedIn(page: Page): Promise<boolean> {
  const cookies = await page.cookies(CREATOR_URL)
  return cookies.some((c) => c.name === 'web_session' && Boolean(c.value))
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
  const fileInput = await page.waitForSelector('input[type="file"]', { timeout: 20000 })
  if (!fileInput) throw new Error('未找到小红书图片上传入口')
  await fileInput.uploadFile(...filePaths)
  const deadline = Date.now() + 120000
  while (Date.now() < deadline) {
    const uploaded = await page.evaluate(() => {
      const thumbnails = document.querySelectorAll('[class*="thumbnail"], [class*="image-item"], [class*="upload-item"]')
      return thumbnails.length
    })
    if (uploaded >= filePaths.length) return
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  const shot = await debugScreenshot(page, debugDir, 'upload_timeout')
  throw new Error('小红书图片上传超时（120s 内未完成 ' + filePaths.length + ' 张）。截图: ' + shot)
}

function precheckContent(job: XhsPublishJob, index: number, text: string): string[] {
  const problems: string[] = []
  const plain = text.replace(/\s+/g, '')
  const effectiveMin = Math.floor(job.min_words * 0.85)
  if (plain.length < effectiveMin) {
    problems.push('第' + index + '篇纯文字 ' + plain.length + ' 字，低于容差下限 ' + effectiveMin + '（设定 ' + job.min_words + '）')
  }
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
  const imageKeys = job.image_files['IMG_A' + index] ?? []
  const imagePaths = imageKeys.map((k) => {
    const p = job.image_files[k]?.[0]
    if (!p || !fs.existsSync(p)) throw new Error('缺少第' + index + '篇图片 ' + k)
    return p
  })

  await page.goto(PUBLISH_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await new Promise((resolve) => setTimeout(resolve, 2000))
  await assertNoRiskPage(page, debugDir, 'note' + index + '_entry')

  const imageTab = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll('[class*="tab"], [role="tab"]'))
    const imageTab = tabs.find((el) => (el.textContent ?? '').includes('图文'))
    if (imageTab) {
      (imageTab as HTMLElement).click()
      return true
    }
    return false
  })
  if (!imageTab) {
    await debugScreenshot(page, debugDir, 'note' + index + '_no_tab')
  }
  await new Promise((resolve) => setTimeout(resolve, 1000))

  if (imagePaths.length > 0) {
    await uploadImages(page, imagePaths, debugDir)
    await new Promise((resolve) => setTimeout(resolve, 2000))
  }

  const titleInput = await page.waitForSelector('[placeholder*="标题"], [class*="title"] input, [class*="title"] textarea', { timeout: 20000 })
  if (!titleInput) throw new Error('未找到小红书标题输入框')
  await titleInput.click()
  await page.keyboard.type(title, { delay: 20 })

  const contentEditor = await page.waitForSelector('[contenteditable="true"], [class*="content"] textarea, [placeholder*="正文"]', { timeout: 20000 })
  if (!contentEditor) throw new Error('未找到小红书正文编辑区')
  await contentEditor.click()
  const fullText = job.tags.length > 0
    ? text.trimEnd() + '\n\n' + job.tags.map((t) => '#' + t + ' ').join('').trim()
    : text
  await page.keyboard.type(fullText, { delay: 10 })
  await new Promise((resolve) => setTimeout(resolve, 1000))
  await assertNoRiskPage(page, debugDir, 'note' + index + '_content')

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

  const note: XhsNote = {
    note_id: noteId || 'pending_' + index,
    title,
    url: noteId ? 'https://www.xiaohongshu.com/explore/' + noteId : '',
    published: false,
  }

  if (job.publish_immediately) {
    const clicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'))
      const publishBtn = buttons.find((el) => {
        const label = (el.textContent ?? '').trim()
        return label === '发布' || label === '发布笔记'
      })
      if (publishBtn) {
        (publishBtn as HTMLElement).click()
        return true
      }
      return false
    })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (clicked) {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'))
        const confirmBtn = buttons.find((el) => {
          const label = (el.textContent ?? '').trim()
          return (label === '确认' || label === '确认发布') && (el as HTMLElement).offsetParent !== null
        })
        if (confirmBtn) (confirmBtn as HTMLElement).click()
      })
      await new Promise((resolve) => setTimeout(resolve, 3000))
    }
    await assertNoRiskPage(page, debugDir, 'note' + index + '_publish')
    note.published = true
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
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    if (!(await isLoggedIn(page))) {
      await debugScreenshot(page, debugDir, 'not_login')
      throw new Error('小红书未登录：请在设置「公众号账号」中该账号卡片点击「扫码登录小红书」后重试')
    }
    await assertNoRiskPage(page, debugDir, 'entry')

    const notes: XhsNote[] = []
    for (const i of plan) {
      notes.push(await publishOneNote(cfg, page, debugDir, job, i))
    }
    return { dry_run: false, notes }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function xhsCheckLogin(cfg: Config, accountId: string): Promise<boolean> {
  const cached = getCachedLoginState('xiaohongshu', accountId)
  if (cached !== null) return cached
  const browser = await launchXhsBrowser(cfg, accountId, true)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    await page.goto(CREATOR_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const currentUrl = page.url()
    const notOnLogin = !currentUrl.includes('/login')
    const logged = notOnLogin && (await isLoggedIn(page))
    setCachedLoginState('xiaohongshu', accountId, logged)
    return logged
  } finally {
    await browser.close().catch(() => undefined)
  }
}

export async function xhsLogin(cfg: Config, accountId: string, timeoutMs = 240000): Promise<boolean> {
  const browser = await launchXhsBrowser(cfg, accountId, false)
  try {
    const pages = await browser.pages()
    const page = pages.length > 0 ? pages[0] : await browser.newPage()
    await page.bringToFront().catch(() => undefined)
    await page.goto(CREATOR_URL + '/login', { waitUntil: 'domcontentloaded', timeout: 60000 })
    
    // 给页面 3 秒让其在已有登录态时自动重定向
    await new Promise((resolve) => setTimeout(resolve, 3000))
    const initialUrl = page.url()
    if (!initialUrl.includes('/login') && (await isLoggedIn(page))) {
      setCachedLoginState('xiaohongshu', accountId, true)
      return true
    }

    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      if (!browser.connected || page.isClosed()) {
        return false
      }
      const currentUrl = page.url()
      if (!currentUrl.includes('/login') && (await isLoggedIn(page))) {
        await new Promise((resolve) => setTimeout(resolve, 3000))
        setCachedLoginState('xiaohongshu', accountId, true)
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
    setCachedLoginState('xiaohongshu', accountId, false)
    return false
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
      const logged = await xhsCheckLogin(cfg, accountId)
      sendJson(res, 200, { ok: true, action, logged_in: logged })
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
    const logged = await xhsLogin(cfg, accountId)
    sendJson(res, 200, logged
      ? { ok: true, action, logged_in: true }
      : { ok: false, action, error: '登录未完成或登录窗口已关闭，请重新点击扫码登录' })
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
