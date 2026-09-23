// 微信公众号后台浏览器自动化适配器：基于 puppeteer-core + 本机 Chrome/Edge。
// 用于在公众号草稿创建成功后，模拟登录公众号后台，进入该草稿编辑页，
// 自动执行用户脚本：逐篇开启文字原创、填入作者、勾选协议并保存草稿。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer, { type Browser, type Page } from 'puppeteer-core'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { Config } from './config.ts'
import { resolveAccount } from './config-runtime.ts'
import { accountScriptsDir, wechatProfileDir } from './sync.ts'
import { renderJson, RESULT_FILE } from './tools/shared.ts'
import { findBrowserExecutable } from './zhihu.ts'

export const WECHAT_LOGIN_ROUTE = '/api/gzh-publisher/wechat-login'

const MP_LOGIN_URL = 'https://mp.weixin.qq.com/'

export interface WechatOriginalResult {
  success: boolean
  article_count: number
  completed: string[]
  error?: string
  screenshot?: string
  /** 逐草稿明细：本次处理的每个「文章」草稿的结果 */
  drafts?: Array<{ appmsgid: string; title: string; articles: number; enabled: number; skipped: number; status: 'ok' | 'failed'; error?: string }>
  /** 汇总：草稿数（总数/成功/失败）与文章数 */
  summary?: { drafts_total: number; drafts_ok: number; drafts_failed: number; articles_total: number }
  /** 本次实际采用的处理范围：targeted=定向单个草稿，all=草稿箱全部草稿 */
  scope?: 'targeted' | 'all'
  note?: string
}

interface DraftRef { appmsgid: string; title: string }

const DRAFT_LIST_PAGE_SIZE = 20
/** 草稿箱「文章」列表 URL：type=77 只返回图文文章草稿，天然不含小绿书（贴图）草稿 */
function draftListUrl(token: string, begin: number): string {
  return 'https://mp.weixin.qq.com/cgi-bin/appmsg?begin=' + begin
    + '&count=' + DRAFT_LIST_PAGE_SIZE
    + '&type=77&action=list_card&token=' + encodeURIComponent(token) + '&lang=zh_CN'
}

function draftEditUrl(token: string, appmsgid: string): string {
  return 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit'
    + '&type=10&appmsgid=' + encodeURIComponent(appmsgid)
    + '&token=' + encodeURIComponent(token) + '&lang=zh_CN'
}

/** 读取草稿箱「文章」列表的某一页（type=77 天然不含小绿书/贴图草稿） */
async function fetchDraftListPage(page: Page, token: string, begin: number): Promise<DraftRef[]> {
  await page.goto(draftListUrl(token, begin), { waitUntil: 'networkidle2', timeout: 60000 })
  await new Promise((resolve) => setTimeout(resolve, 2200))
  return page.evaluate(() => {
    return Array.from(document.querySelectorAll('.weui-desktop-card')).map((card) => {
      const id = card.getAttribute('data-appid') || card.getAttribute('data-appmsgid') || ''
      const titleEl = card.querySelector('.weui-desktop-publish__cover__title span, .weui-desktop-publish__cover__title')
      return { appmsgid: id, title: (titleEl?.textContent || '').trim() }
    }).filter((item) => item.appmsgid)
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

  const wanted = targetTitles.map((t) => t.trim()).filter(Boolean)
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

    const hit = collected.find((draft) =>
      draft.title !== '' && wanted.some((t) => draft.title === t || draft.title.includes(t) || t.includes(draft.title)),
    )
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

/** 启动公众号自动化专用的浏览器实例（登录态保存在账号独立 wechat_profile 目录） */
export async function launchWechatBrowser(cfg: Config, accountId: string, headless: boolean): Promise<Browser> {
  const profileDir = wechatProfileDir(cfg, accountId)
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
      throw new Error('微信公众号浏览器目录被占用（可能已有任务在运行）。请等待其结束后重试：' + profileDir)
    }
    throw new Error('启动微信浏览器失败：' + message)
  }
}

/** 检查微信公众平台登录态（无头，快速判断 URL 或关键 Cookie） */
export async function wechatCheckLogin(cfg: Config, accountId: string): Promise<boolean> {
  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const currentUrl = page.url()
    if (currentUrl.includes('token=')) return true
    const cookies = await page.cookies(MP_LOGIN_URL)
    return cookies.some((c) => (c.name === 'data_ticket' || c.name === 'slave_user' || c.name === 'slave_sid') && Boolean(c.value))
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/** 微信公众平台扫码登录（有头浏览器，等待扫码并检测 token） */
export async function wechatLogin(cfg: Config, accountId: string, timeoutMs = 240000): Promise<boolean> {
  const browser = await launchWechatBrowser(cfg, accountId, false)
  try {
    const page = await browser.newPage()
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const currentUrl = page.url()
      if (currentUrl.includes('token=')) return true
      const cookies = await page.cookies(MP_LOGIN_URL)
      const hasSession = cookies.some((c) => (c.name === 'data_ticket' || c.name === 'slave_user' || c.name === 'slave_sid') && Boolean(c.value))
      if (hasSession && !currentUrl.includes('/cgi-bin/loginpage')) return true
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }
    return false
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/** 注册微信公众平台登录态检测与扫码登录 HTTP 路由 */
export function registerWechatRoutes(ctx: Context, getConfig: () => Config): void {
  ctx.inject(['webServer'], (webCtx) => {
    if (!webCtx.webServer) return
    webCtx.effect(() => webCtx.webServer!.register({
      kind: 'exact',
      path: WECHAT_LOGIN_ROUTE,
      handler: async (req, res) => {
        if (req.method !== 'POST') {
          res.writeHead(405, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: '不支持的请求方法' }))
          return
        }
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        let body: { account_id?: string; action?: string } = {}
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
        } catch {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: '请求体不是合法 JSON' }))
          return
        }
        const accountId = String(body.account_id ?? '').trim()
        const action = body.action === 'check' ? 'check' : 'login'
        const cfg = getConfig()
        const account = cfg.accounts[accountId]
        if (!account) {
          res.writeHead(400, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: '账号不存在: ' + accountId }))
          return
        }
        if (action === 'check') {
          try {
            const logged = await wechatCheckLogin(cfg, accountId)
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: true, action, logged_in: logged }))
          } catch (error) {
            res.writeHead(200, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ ok: false, action, error: error instanceof Error ? error.message : String(error) }))
          }
          return
        }
        try {
          const logged = await wechatLogin(cfg, accountId)
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify(logged
            ? { ok: true, action, logged_in: true }
            : { ok: false, action, error: '登录超时（4 分钟内未检测到扫码成功），请重试' }))
        } catch (error) {
          res.writeHead(200, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ ok: false, action, error: error instanceof Error ? error.message : String(error) }))
        }
      },
    }), 'gzh-publisher: wechat login route')
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
    const DEFAULT_AUTHOR = authorName || '文映学术win00.cn'
    const STEP_TIMEOUT = 25000

    let stopRequested = false
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
      return style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        Number(style.opacity || 1) !== 0 &&
        rect.width > 0 && rect.height > 0
    }

    function all(selector: string, root: Document | Element = document): Element[] {
      return Array.from(root.querySelectorAll(selector))
    }

    function visible(selector: string, root: Document | Element = document): Element | null {
      return all(selector, root).find(isVisible) || null
    }

    function elementByText(selector: string, text: string, root: Document | Element = document): Element | null {
      return all(selector, root).find((element) =>
        isVisible(element) && element.textContent?.trim() === text,
      ) || null
    }

    async function waitFor<T>(getter: () => T | null | undefined | false, description: string, timeout = STEP_TIMEOUT): Promise<T> {
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
      const cards = all('.card_appmsg_inner').filter((card) => card.querySelector('strong'))
      if (cards.length) return cards

      return all('strong')
        .map((strong) => strong.closest('.card_appmsg_inner'))
        .filter((card, index, list): card is Element => Boolean(card) && list.indexOf(card) === index)
    }

    function articleTitle(card: Element, index: number): string {
      return card.querySelector('strong')?.textContent?.trim() || `第 ${index + 1} 篇`
    }

    function findArticleCard(title: string): Element | null {
      return articleCards().find((card, index) =>
        normalizeText(articleTitle(card, index)) === normalizeText(title),
      ) || null
    }

    async function selectArticle(title: string): Promise<void> {
      const card = await waitFor(
        () => findArticleCard(title),
        `查找文章：${title}`,
      )
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

    function getOriginalState(): { area: Element; state: 'unset' | 'enabled'; unset: HTMLElement | null } | null {
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

      const switchArea = (visible('.js_original_apply', originalState.area) || originalState.unset) as HTMLElement | null
      if (!switchArea) throw new Error(`未找到“${title}”的原创设置入口按钮`)
      switchArea.click()

      const dialog = await waitFor(
        () => all('.weui-desktop-dialog').find((item) =>
          isVisible(item) && (item.textContent?.includes('声明类型') || item.textContent?.includes('原创声明')),
        ),
        '原创声明窗口',
      )

      const textOriginal = dialog.querySelector('input[type="radio"][value="0"]') as HTMLInputElement | null
      if (textOriginal && !textOriginal.checked) textOriginal.click()

      const author = dialog.querySelector('input.js_counter.js_author, input[placeholder="请输入作者"]') as HTMLInputElement | null
      if (author && !author.value.trim()) {
        author.value = DEFAULT_AUTHOR
        author.dispatchEvent(new Event('input', { bubbles: true }))
        author.dispatchEvent(new Event('change', { bubbles: true }))
      }

      const agreement = dialog.querySelector('input.weui-desktop-form__checkbox') as HTMLInputElement | null
      if (agreement && !agreement.checked) agreement.click()

      const confirm = elementByText('button', '确定', dialog) as HTMLButtonElement | null
      if (!confirm) throw new Error(`“${title}”的原创窗口没有找到确定按钮`)
      if (confirm.disabled) throw new Error(`“${title}”的原创确定按钮不可用`)

      confirm.click()
      await waitFor(() => !isVisible(dialog), '关闭原创声明窗口')
      await waitFor(
        () => getOriginalState()?.state === 'enabled',
        `确认“${title}”已开启原创`,
      )
      return '已开启'
    }

    async function saveDraft(): Promise<void> {
      const button = await waitFor(
        () => elementByText('button', '保存为草稿'),
        '保存为草稿按钮',
      ) as HTMLButtonElement

      if (button.disabled) throw new Error('保存为草稿按钮不可用')
      button.click()

      await waitFor(
        () => visible('#js_save_success, #js_save_success_with_ad, #js_save_success_with_ad_op'),
        '“已保存”提示',
        25000,
      )

      const errorText = all('.weui-desktop-dialog, .weui-desktop-toast, .weui-desktop-tips')
        .filter(isVisible)
        .map((element) => element.textContent?.trim() || '')
        .find((text) => /保存失败|系统错误|请重试|内容违规/.test(text))
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

  const headless = cfg.runtime.gzh_headless !== false
  const browser = await launchWechatBrowser(cfg, accountId, headless)
  let page: Page | null = null

  try {
    page = await browser.newPage()
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))

    let currentUrl = page.url()
    let token = new URL(currentUrl).searchParams.get('token')

    if (!token) {
      // 若首页无 token，再次等待或检查重定向
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined)
      currentUrl = page.url()
      token = new URL(currentUrl).searchParams.get('token')
    }

    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'not_logged_in')
      throw new Error(
        '微信公众号后台未检测到有效登录态（未获取到 token）。请在设置界面点击「扫码登录微信公众号后台」完成扫码，或在浏览器中登录后重试。截图已存：' + shot,
      )
    }

    // 1. 解析目标草稿：默认只定位命中的那一个；scope='all' 才枚举全部草稿
    const { drafts: allDrafts, matchedByTitle } = await resolveTargetDrafts(page, token, targetTitles, scope)
    if (allDrafts.length === 0) {
      const shot = await debugScreenshot(page, debugDir, 'draft_not_found')
      throw new Error('微信公众号草稿箱中未找到任何「文章」草稿。截图已存：' + shot)
    }

    // 2. 逐个草稿：进入编辑页 → 逐篇开启文字原创 → 保存草稿
    const finalAuthor = authorName || cfg.accounts[accountId]?.author_name || '文映学术win00.cn'
    const completed: string[] = []
    const draftDetails: NonNullable<WechatOriginalResult['drafts']> = []
    let articlesTotal = 0
    let draftsOk = 0
    let draftsFailed = 0

    for (let index = 0; index < allDrafts.length; index += 1) {
      const draft = allDrafts[index]
      const label = `[${index + 1}/${allDrafts.length}] ${draft.title || draft.appmsgid}`
      try {
        await page.goto(draftEditUrl(token, draft.appmsgid), { waitUntil: 'domcontentloaded', timeout: 60000 })
        await new Promise((resolve) => setTimeout(resolve, 2500))

        const isEditor = await page.evaluate(() => {
          const search = window.location.search
          return search.includes('action=edit') || search.includes('t=media/appmsg_edit')
        })
        if (!isEditor) throw new Error('未能进入编辑页，当前 URL: ' + page.url())

        await page.waitForSelector('#title, textarea.js_title, .card_appmsg_inner', { timeout: 30000 })
        await new Promise((resolve) => setTimeout(resolve, 1200))

        const result = await runOriginalScriptInPage(page, finalAuthor)
        const enabled = result.completed.filter((line) => line.includes('已开启') && !line.includes('跳过')).length
        articlesTotal += result.completed.length
        draftsOk += 1
        completed.push(...result.completed.map((line) => `${draft.title || draft.appmsgid} → ${line}`))
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
        await debugScreenshot(page, debugDir, 'draft_failed_' + draft.appmsgid).catch(() => undefined)
      }
    }

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
      note: scope === 'all'
        ? '已遍历草稿箱全部「文章」草稿（小绿书/图片消息草稿不在 type=77 列表中，按要求跳过）'
        : matchedByTitle
          ? `已按标题定向处理 1 个草稿（未全量枚举；如需处理全部草稿请传 scope='all'）`
          : `未匹配到指定标题，已回退处理最新 1 个草稿（未全量枚举；如需处理全部草稿请传 scope='all'）`,
      ...(draftsFailed > 0 ? { error: `${draftsFailed}/${allDrafts.length} 个草稿处理失败，详见 drafts` } : {}),
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
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
    await browser.close().catch(() => undefined)
  }
}

/** 供 Agent 随时单独调用的开启草稿原创工具 */
export function enableOriginalTool(cfg: Config) {
  return defineTool<{ titles?: string[]; author?: string; account_id?: string; scope?: 'targeted' | 'all' }, WechatOriginalResult>({
    name: 'gzh_enable_original',
    description: '为微信公众号草稿箱中的草稿开启文字原创声明并保存。默认只定位处理指定标题（或最新）的那 1 个草稿，开销小；仅当明确需要「开启所有草稿的原创」时传 scope="all"，才会枚举草稿箱「文章」标签下的全部草稿（含历史草稿）逐个处理。草稿箱列表按 type=77 只含图文文章，小绿书/图片消息草稿不在列表中，天然跳过。',
    parameters: {
      titles: {
        type: 'array',
        description: '可选：目标草稿的标题（草稿内首篇标题，支持精确或包含匹配）；留空则取最新 1 个草稿。仅在 scope="all" 时忽略',
        items: { type: 'string' },
      },
      scope: {
        type: 'string',
        description: '可选处理范围：targeted（默认）只处理命中的 1 个草稿，不枚举全部；all 枚举草稿箱全部「文章」草稿逐个开启原创',
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
    output: { schema: { type: 'json' }, render: renderJson },
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

