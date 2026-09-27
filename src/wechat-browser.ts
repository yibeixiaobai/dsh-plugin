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

export interface WechatBrowserPublishJob {
  account_id: string
  article_type: 'news' | 'newspic'
  titles: string[]
  digests: string[]
  article_files: string[] // 绝对路径
  cover_files: string[]   // 绝对路径
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
}

function imageToDataUri(filePath: string): string {
  if (!filePath || !fs.existsSync(filePath)) return ''
  const ext = path.extname(filePath).toLowerCase()
  const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
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
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg'
    const b64 = fs.readFileSync(file).toString('base64')
    const name = path.basename(file)
    try {
      const url = await page.evaluate(async (data: string, fname: string, mt: string) => {
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
        const res = await fetch(`/cgi-bin/uploadimg2cdn?lang=zh_CN&token=${token}&t=${Math.random()}`, {
          method: 'POST',
          credentials: 'include',
          body: fd,
        })
        const text = await res.text()
        try {
          const j = JSON.parse(text)
          return typeof j.url === 'string' ? j.url : ''
        } catch {
          return ''
        }
      }, b64, name, mime)
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
    if (unique.some((k) => k === '__BRAND_TOP__') && !(job.brand_top_enabled && job.brand_top && fs.existsSync(job.brand_top))) {
      reasons.push(`头部品牌图未替换（brand_top_enabled=${job.brand_top_enabled}, path=${job.brand_top}, exists=${job.brand_top ? fs.existsSync(job.brand_top) : false}）`)
    }
    if (unique.some((k) => k === '__BRAND_BOT__') && !(job.brand_bot_enabled && job.brand_bot && fs.existsSync(job.brand_bot))) {
      reasons.push(`尾部品牌图未替换（brand_bot_enabled=${job.brand_bot_enabled}, path=${job.brand_bot}, exists=${job.brand_bot ? fs.existsSync(job.brand_bot) : false}）`)
    }
    const missingContent = Object.entries(job.content_files)
      .filter(([, p]) => !fs.existsSync(p))
      .map(([k]) => k)
    if (missingContent.length > 0) reasons.push(`正文配图文件缺失: ${missingContent.join(', ')}`)
    throw new Error(
      '文章图片占位符未完全替换，拒绝发布以免产生空白配图草稿。残留: ' + unique.join(', ') +
      (reasons.length > 0 ? '\n原因: ' + reasons.join('；') : ''),
    )
  }
  return html
}

function precheckArticle(
  html: string,
  index: number,
  job: WechatBrowserPublishJob,
): string[] {
  const problems: string[] = []
  const txt = html.replace(/<[^>]+>/g, '')
  const plain = txt.replace(/\s+/g, '')
  const effectiveMin = Math.floor(job.min_words * 0.85)
  if (plain.length < effectiveMin) {
    problems.push(`文章${index} 纯文字 ${plain.length} 字，低于容差下限 ${effectiveMin}（设定 ${job.min_words} 字）`)
  }
  for (const w of job.forbidden) {
    if (w && plain.includes(w)) {
      problems.push(`文章${index} 含有禁词: ${w}`)
    }
  }
  if (job.brand_name && !plain.includes(job.brand_name)) {
    problems.push(`文章${index} 缺少品牌引导语: ${job.brand_name}`)
  }
  return problems
}

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
  const headless = cfg.runtime.gzh_headless !== false

  const mediaIds: string[] = []
  const draftUrls: string[] = []
  const results: Array<{ media_id: string; titles: string[]; status: string }> = []
  const browser = await launchWechatBrowser(cfg, accountId, headless)

  try {
    const page = await browser.newPage()
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2500))
    const token = new URL(page.url()).searchParams.get('token')
    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'newspic_not_logged_in')
      throw new Error('微信公众号后台未检测到有效登录态（未获取到 token）。截图已存：' + shot)
    }

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
      for (let j = 1; j <= cardCount; j += 1) {
        let found = ''
        for (const ext of ['.png', '.jpg', '.jpeg']) {
          const cand = path.resolve(sdir, `pic_${i + 1}_${j}${ext}`)
          if (fs.existsSync(cand)) { found = cand; break }
        }
        if (!found) throw new Error(`缺少小绿书卡片图: pic_${i + 1}_${j}`)
        pics.push(found)
      }
      if (pics.length === 0) throw new Error(`小绿书第 ${i + 1} 篇没有卡片图`)

      // 小绿书内容校验：纯文字下限、禁词、品牌引导语
      const plain = desc.replace(/\s/g, '')
      const limit = job.min_words > 500 ? 80 : Math.max(10, Math.floor(job.min_words * 0.8))
      const problems: string[] = []
      if (plain.length < limit) problems.push(`小绿书第 ${i + 1} 篇纯文字 ${plain.length} 字，低于下限 ${limit}`)
      for (const w of job.forbidden) {
        if (w && (plain.includes(w) || title.includes(w))) problems.push(`小绿书第 ${i + 1} 篇含禁词: ${w}`)
      }
      if (title.length > 32) problems.push(`小绿书第 ${i + 1} 篇标题超 32 字（${title.length}）`)
      if (problems.length > 0) throw new Error('小绿书发布前校验未通过:\n' + problems.join('\n'))

      const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=8&token=${encodeURIComponent(token)}&lang=zh_CN`
      await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await new Promise((resolve) => setTimeout(resolve, 7000))

      // 关掉新手引导遮罩（会拦截点击）
      await page.evaluate(() => {
        document.querySelectorAll('.education-dialog, .weui-desktop-dialog__wrp, .weui-desktop-mask').forEach((el) => {
          ;(el as HTMLElement).style.display = 'none'
        })
      })
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // 关键：使用动态创建的图片上传控件（父级 id 以 rt_rt_ 开头）
      const fileInputs = await page.$$('input[type="file"]')
      let target: (typeof fileInputs)[number] | null = null
      for (const input of fileInputs) {
        const isRt = await page.evaluate((el) => /^rt_rt_/.test(String((el.parentElement as HTMLElement | null)?.id || '')), input)
        if (isRt) { target = input; break }
      }
      if (!target) target = fileInputs[fileInputs.length - 1] || null
      if (!target) throw new Error('未找到图片消息上传控件（input[type=file]）')
      await target.uploadFile(...pics)

      // 等待全部卡片图上传完成
      let uploaded = 0
      for (let w = 0; w < 30; w += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2500))
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
        throw new Error(`小绿书第 ${i + 1} 篇卡片图上传未完成（${uploaded}/${pics.length}）。截图已存：${shot}`)
      }

      // 关掉可能的裁剪/确认弹窗
      for (let round = 0; round < 3; round += 1) {
        const acted = await page.evaluate(() => {
          const done: string[] = []
          document.querySelectorAll('.weui-desktop-dialog__wrp, .weui-desktop-dialog').forEach((dlg) => {
            const r = (dlg as HTMLElement).getBoundingClientRect()
            if (r.width === 0 || r.height === 0 || getComputedStyle(dlg).display === 'none') return
            for (const b of Array.from(dlg.querySelectorAll('button, a, div, span'))) {
              const own = Array.from(b.childNodes).filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()
              if (own && /^(确定|完成|保存|确认|我知道了)$/.test(own)) {
                const rr = (b as HTMLElement).getBoundingClientRect()
                if (rr.width > 0 && rr.height > 0) { (b as HTMLElement).click(); done.push(own); break }
              }
            }
          })
          return done
        })
        if (acted.length === 0) break
        await new Promise((resolve) => setTimeout(resolve, 3000))
      }

      // 标题 + 描述：两个 .ProseMirror
      const setPm = async (idx: number, val: string) => page.evaluate((i2: number, v: string) => {
        const el = Array.from(document.querySelectorAll('.ProseMirror'))[i2] as HTMLElement | undefined
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
      }, idx, val)

      await setPm(0, title)
      await new Promise((resolve) => setTimeout(resolve, 900))
      if (desc) {
        await setPm(1, desc)
        await new Promise((resolve) => setTimeout(resolve, 1200))
      }

      // 保存为草稿
      await page.evaluate(() => {
        const hits: HTMLElement[] = []
        document.querySelectorAll('a, button, div, span').forEach((e) => {
          const own = Array.from(e.childNodes).filter((x) => x.nodeType === 3).map((x) => x.textContent).join('').trim()
          const r = (e as HTMLElement).getBoundingClientRect()
          if (r.width > 0 && r.height > 0 && own === '保存为草稿') hits.push(e as HTMLElement)
        })
        if (hits.length > 0) hits[hits.length - 1].click()
      })

      let appmsgid: string | null = null
      for (let w = 0; w < 45; w += 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000))
        appmsgid = new URL(page.url()).searchParams.get('appmsgid')
        if (appmsgid) break
      }
      if (!appmsgid) {
        const shot = await debugScreenshot(page, debugDir, `newspic_save_${i + 1}`)
        throw new Error(`小绿书第 ${i + 1} 篇保存未生效：未获得 appmsgid。截图已存：${shot}`)
      }

      // 回读核验：卡片图必须真的落库（否则视为失败）
      await page.goto(
        `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&appmsgid=${encodeURIComponent(appmsgid)}&token=${encodeURIComponent(token)}&lang=zh_CN`,
        { waitUntil: 'domcontentloaded', timeout: 60000 },
      )
      await new Promise((resolve) => setTimeout(resolve, 8000))
      const check = await page.evaluate(() => {
        const tags = document.querySelector('.image-selector__tags')
        const t = tags ? (tags as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : ''
        const m = t.match(/(\d+)\s+(\d+)/)
        return {
          cards: m ? Number(m[2]) : 0,
          pmLens: Array.from(document.querySelectorAll('.ProseMirror')).map((e) => (e.textContent || '').trim().length),
          zoneEmpty: /选择或拖拽图片/.test((document.querySelector('#js_content_top') as HTMLElement | null)?.innerText || ''),
        }
      })
      if (check.zoneEmpty || check.cards < pics.length) {
        const shot = await debugScreenshot(page, debugDir, `newspic_verify_${i + 1}`)
        throw new Error(
          `小绿书第 ${i + 1} 篇保存后核验未通过：卡片图 ${check.cards}/${pics.length}（图片未落库）。截图已存：${shot}`,
        )
      }

      mediaIds.push(appmsgid)
      draftUrls.push(draftEditUrl(token, appmsgid))
      results.push({ media_id: appmsgid, titles: [title], status: 'ok' })
      console.log(`[social-publisher] 账号 ${accountId} 小绿书第 ${i + 1}/${n} 篇草稿已创建：${appmsgid}（卡片图 ${check.cards} 张）`)
      await new Promise((resolve) => setTimeout(resolve, 2500))
    }

    return {
      dry_run: false,
      media_id: mediaIds[0],
      media_ids: mediaIds,
      article_count: n,
      titles: job.titles,
      draft_url: draftUrls[0],
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
  const headless = cfg.runtime.gzh_headless !== false

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
  const tempDrafts: string[] = []

  try {
    page = await browser.newPage()

    // 捕获保存请求（用于取得字段模板）
    await page.evaluateOnNewDocument(() => {
      const w = window as unknown as { __spReqs: Array<{ m: string; u: string; body: string }> }
      w.__spReqs = []
      const xopen = XMLHttpRequest.prototype.open
      const xsend = XMLHttpRequest.prototype.send
      XMLHttpRequest.prototype.open = function (this: unknown, m: string, u: string) {
        const self = this as { __spU?: string; __spM?: string }
        self.__spU = String(u)
        self.__spM = m
        // eslint-disable-next-line prefer-rest-params
        return xopen.apply(this as never, arguments as never)
      }
      XMLHttpRequest.prototype.send = function (this: unknown, body?: unknown) {
        const self = this as { __spU?: string; __spM?: string }
        try {
          w.__spReqs.push({ m: self.__spM || 'GET', u: String(self.__spU || ''), body: body == null ? '' : String(body) })
        } catch { /* ignore */ }
        // eslint-disable-next-line prefer-rest-params
        return xsend.apply(this as never, arguments as never)
      }
      const ofetch = window.fetch
      window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
        try {
          w.__spReqs.push({
            m: (init && init.method) || 'GET',
            u: String(input),
            body: init && init.body ? String(init.body) : '',
          })
        } catch { /* ignore */ }
        // eslint-disable-next-line prefer-rest-params
        return ofetch.apply(this as never, arguments as never)
      }
    })

    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    token = new URL(page.url()).searchParams.get('token')
    if (!token) {
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined)
      token = new URL(page.url()).searchParams.get('token')
    }
    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'merge_not_logged_in')
      throw new Error('微信公众号后台未检测到有效登录态（未获取到 token）。请先扫码登录后重试。截图已存：' + shot)
    }

    // 2. 打开新建草稿页，上传各篇设计封面以取得 CDN 地址
    const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${encodeURIComponent(token)}&lang=zh_CN`
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 8000))
    await page.evaluate(() => {
      document.querySelectorAll('.education-dialog, .weui-desktop-dialog__wrp, .weui-desktop-mask')
        .forEach((el) => { (el as HTMLElement).style.display = 'none' })
    })

    const coverFiles: string[] = []
    for (let i = 0; i < n; i += 1) {
      const c = job.cover_files[i]
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
      console.log(`[social-publisher] 账号 ${accountId} 正在上传 ${allLocalImages.length} 张配图到微信 CDN...`)
      const urls = await uploadImagesToCdn(page, allLocalImages)
      let okCount = 0
      allLocalImages.forEach((p, i) => {
        const u = urls[i]
        if (u) {
          cdnUrls.set(p, u)
          okCount += 1
        }
      })
      console.log(`[social-publisher] 账号 ${accountId} 配图上传完成：${okCount}/${allLocalImages.length} 成功`)
      const failed = allLocalImages.filter((p) => !cdnUrls.get(p))
      if (failed.length > 0) {
        throw new Error(
          '配图上传微信 CDN 失败（若继续发布，这些图片在草稿中会整片空白）：' +
          failed.map((p) => path.basename(p)).join(', '),
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
      const inputs = await page.$$('input[type="file"][name="file"]')
      const target = inputs.length > 0 ? inputs[0] : (await page.$$('input[type="file"]'))[0]
      if (target) await target.uploadFile(...coverFiles).catch(() => undefined)
      // 轮询等待 N 张封面全部上传完成
      for (let t = 0; t < 40; t += 1) {
        await new Promise((resolve) => setTimeout(resolve, 1500))
        coverUrls = await page.evaluate(() => {
          const out: string[] = []
          document.querySelectorAll('.ProseMirror img').forEach((img) => {
            const src = (img as HTMLImageElement).src || ''
            if (src.includes('mmbiz.qpic.cn') && !out.includes(src)) out.push(src)
          })
          return out
        })
        if (coverUrls.length >= coverFiles.length) break
      }
    }
    console.log(`[social-publisher] 账号 ${accountId} 合并多图文：封面已上传 ${coverUrls.length}/${n}`)

    // 3. 保存一次以抓取真实保存请求作为字段模板，随后删除该临时草稿
    await page.evaluate(() => {
      const input = document.querySelector('#title') as HTMLInputElement | null
      if (input) {
        input.value = 'SP-TEMPLATE'
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    })
    await page.evaluate(() => {
      const w = window as unknown as { __spReqs: unknown[] }
      w.__spReqs = []
    })
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a, div, span'))
        .find((el) => (el.textContent || '').trim() === '保存为草稿')
      if (btn) (btn as HTMLElement).click()
    })

    let template: { u: string; body: string } | null = null
    for (let t = 0; t < 24 && !template; t += 1) {
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const reqs = await page.evaluate(() => ((window as unknown as { __spReqs?: Array<{ m: string; u: string; body: string }> }).__spReqs || []))
      template = reqs.find((r) => /sub=create/.test(r.u)) || null
    }
    if (!template) {
      const shot = await debugScreenshot(page, debugDir, 'merge_template_failed')
      throw new Error('合并多图文失败：未能捕获保存请求模板（编辑器保存逻辑可能已变更）。截图已存：' + shot)
    }
    const tplUrl = template.u.replace(/^https:\/\/mp\.weixin\.qq\.com/, '')
    const tplId = new URL(page.url()).searchParams.get('appmsgid')
    if (tplId && tplId !== '0') tempDrafts.push(tplId)

    // 4. 解析模板并按 N 篇复制索引字段
    const GLOBALS = new Set([
      'token', 'lang', 'f', 'ajax', 'fingerprint', 'random', 'AppMsgId', 'count',
      'data_seq', 'operate_from', 'isnew', 'articlenum', 'pre_timesend_set', 'req',
      'remind_flag', 'is_auto_type_setting', 'save_type', 'isneedsave',
    ])
    const fields = template.body.split('&').map((p) => {
      const idx = p.indexOf('=')
      return [p.slice(0, idx), p.slice(idx + 1)] as [string, string]
    })
    const globals = fields.filter(([k]) => GLOBALS.has(k))
    const indexed = fields.filter(([k]) => !GLOBALS.has(k) && /0$/.test(k))
    if (indexed.length === 0) {
      throw new Error('合并多图文失败：保存请求模板中未找到按篇索引的字段（编辑器保存逻辑可能已变更）')
    }
    const globalMap = new Map(globals)

    // req.idx_infos 需与篇数一致
    let reqJson: { idx_infos: unknown[] } = { idx_infos: [] }
    const reqRaw = globalMap.get('req')
    if (reqRaw) {
      try {
        const parsed = JSON.parse(decodeURIComponent(reqRaw)) as { idx_infos?: unknown[] }
        reqJson = { idx_infos: Array.isArray(parsed.idx_infos) ? parsed.idx_infos : [] }
      } catch { reqJson = { idx_infos: [] } }
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
    const resp = await page.evaluate(async (u: string, b: string) => {
      const r = await fetch(u, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: b,
      })
      return await r.text()
    }, tplUrl, mergedBody)

    let parsed: { appMsgId?: number | string; ret?: number | string; base_resp?: { ret?: number | string } } | null = null
    try { parsed = JSON.parse(resp) } catch { parsed = null }
    const retCode = parsed ? String(parsed.ret ?? (parsed.base_resp && parsed.base_resp.ret)) : ''
    const newId = parsed && parsed.appMsgId ? String(parsed.appMsgId) : ''
    if (!parsed || retCode !== '0' || !newId) {
      const shot = await debugScreenshot(page, debugDir, 'merge_create_failed')
      throw new Error('合并多图文失败：接口返回 ' + resp.slice(0, 300) + (shot ? '；截图已存：' + shot : ''))
    }

    // 6. 复读草稿核验篇数 / 标题 / 封面
    await page.goto(draftEditUrl(token, newId), { waitUntil: 'domcontentloaded', timeout: 60000 })
    // 编辑器是异步渲染正文的：先等 ProseMirror 出现，再等其中的图片数稳定，
    // 否则会在「正文刚挂载、图片尚未插入」的瞬间读到 0 张而产生误报。
    await page.waitForSelector('.ProseMirror', { timeout: 45000 }).catch(() => undefined)
    await page.waitForFunction(() => {
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
    }, { timeout: 60000, polling: 500 }).catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const check = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('.js_appmsg_item'))
      // 正文配图必须到编辑器正文容器（.ProseMirror）里数：
      // .js_appmsg_item 是左侧「文章标题卡片」，本身不含正文图片，
      // 在那里查询会恒为 0 并产生误报。
      const editors = Array.from(document.querySelectorAll('.ProseMirror'))
      const isBodyImg = (img: Element): boolean => {
        const src = (img as HTMLImageElement).src || ''
        return src.includes('mmbiz.qpic.cn') || src.includes('mmbiz.qlogo.cn') || src.startsWith('data:image')
      }
      const countBodyImgs = (root: Element) =>
        Array.from(root.querySelectorAll('img')).filter(isBodyImg).length
      return {
        count: items.length,
        titles: items.map((e) => ((e.querySelector('.js_appmsg_title') as HTMLElement | null)?.innerText || '').trim()),
        covers: items.map((e) => {
          const t = e.querySelector('.card_appmsg_thumb')
          return t ? getComputedStyle(t).backgroundImage.replace(/^url\("?/, '').replace(/"?\)$/, '') : ''
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
    const matched = check.count === n && check.titles.every((t, i) => t === job.titles[i])
    if (!matched) {
      const shot = await debugScreenshot(page, debugDir, 'merge_verify_failed')
      throw new Error(
        `合并多图文核验未通过：期望 ${n} 篇，实际 ${check.count} 篇；标题=${JSON.stringify(check.titles)}。截图已存：${shot}`,
      )
    }
    const coversOk = check.covers.filter((c) => c.includes('mmbiz.qpic.cn')).length
    // 每篇期望内联图：2 张正文配图 + 头部/尾部品牌图（启用时）
    const expectedInline = (job.brand_top_enabled ? 1 : 0) + (job.brand_bot_enabled ? 1 : 0) +
      Object.keys(job.content_files).length / Math.max(1, n)
    // 编辑器实例数与篇数一致时逐篇校验，否则只校验总量（避免结构差异导致误报）
    const perEditor = check.bodyImgsPerEditor
    const thin = perEditor.length === n
      ? perEditor.map((c, i) => ({ i: i + 1, c })).filter((x) => x.c < expectedInline)
      : []
    const totalThin = perEditor.length !== n && check.bodyImgsTotal < expectedInline
    if (thin.length > 0 || totalThin) {
      const shot = await debugScreenshot(page, debugDir, 'merge_verify_thin_images')
      const detail = thin.length > 0
        ? `第 ${thin.map((t) => t.i).join(',')} 篇正文内联图片数不足（期望 ≥${expectedInline}，实际 ${thin.map((t) => t.c).join(',')}）`
        : `正文内联图片总数不足（期望 ≥${expectedInline}，实际 ${check.bodyImgsTotal}）`
      throw new Error(
        `合并多图文核验未通过：${detail}。` +
        `这通常意味着图片占位符未替换或配图丢失。` +
        `（诊断：正文 img 数=${check.bodyImgsTotal}，src 样本=${JSON.stringify(check.imgSummary.slice(0, 6))}）` +
        `截图已存：${shot}`,
      )
    }
    console.log(`[social-publisher] 账号 ${accountId} 已合并 ${n} 篇为单条多图文草稿：${newId}（封面已设置 ${coversOk}/${n}，正文内联图 ${perEditor.join('/') || check.bodyImgsTotal}）`)

    // 7. 自动开启文字原创声明（若启用）
    // 说明：多图文草稿此前完全没有走这一步（仅单篇路径实现），
    // 导致 6 篇合并草稿永远拿不到原创声明。此处补齐，脚本内部会逐篇切换并保存。
    let originalResult: WechatOriginalResult | undefined
    if (job.auto_enable_original) {
      try {
        console.log(`[social-publisher] 账号 ${accountId} 正在免 API 模式下为多图文草稿开启文字原创...`)
        const orig = await runOriginalScriptInPage(page, job.author || '文映学术win00.cn')
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
        console.log(`[social-publisher] 账号 ${accountId} 多图文原创声明完成：${orig.completed.length} 篇`)
      } catch (e) {
        console.warn(`[social-publisher] 免 API 模式下为多图文开启原创异常（草稿已保存）: `, e)
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
    // 删除仅用于抓取字段模板的临时草稿，避免污染草稿箱
    if (page && token) {
      for (const id of tempDrafts) {
        await page.evaluate(async (tid: string, tk: string) => {
          await fetch('/cgi-bin/operate_appmsg?token=' + tk + '&lang=zh_CN&sub=del&type=77&appmsgid=' + tid + '&operate=del', {
            credentials: 'include',
          }).catch(() => undefined)
        }, id, token).catch(() => undefined)
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
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => undefined)
      currentUrl = page.url()
      token = new URL(currentUrl).searchParams.get('token')
    }

    if (!token) {
      const shot = await debugScreenshot(page, debugDir, 'publish_not_logged_in')
      throw new Error(
        '微信公众号后台未检测到有效登录态（未获取到 token）。请在设置界面点击「扫码登录微信公众号」完成扫码后重试。截图已存：' + shot,
      )
    }

    // 2. 导航至新建草稿页
    const editorUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=77&createType=0&token=${encodeURIComponent(token)}&lang=zh_CN`
    await page.goto(editorUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 3000))

    await page.waitForSelector('#title, textarea.js_title, input[name="title"], .card_appmsg_inner', { timeout: 45000 })
    await new Promise((resolve) => setTimeout(resolve, 1500))

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
      localImages.forEach((p, i) => { if (urls[i]) cdnUrls.set(p, urls[i]) })
      const failed = localImages.filter((p) => !cdnUrls.get(p))
      if (failed.length > 0) {
        throw new Error('配图上传微信 CDN 失败：' + failed.map((p) => path.basename(p)).join(', '))
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
          const addBtn = document.querySelector('.create_access, .js_add_appmsg, #js_add_appmsg, .weui-desktop-icon-plus')
            || Array.from(document.querySelectorAll('a, button, div')).find((el) => {
              const txt = el.textContent?.trim()
              return txt === '新建图文' || txt === '+ 新建图文' || txt === '+'
            })
          if (addBtn) (addBtn as HTMLElement).click()
        })
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      // 填充表单与正文
      await page.evaluate((titleVal: string, authorVal: string, digestVal: string, htmlVal: string) => {
        // 标题
        const titleInput = document.querySelector('#title, textarea.js_title, input[name="title"]') as HTMLInputElement | HTMLTextAreaElement | null
        if (titleInput) {
          titleInput.value = titleVal
          titleInput.dispatchEvent(new Event('input', { bubbles: true }))
          titleInput.dispatchEvent(new Event('change', { bubbles: true }))
        }

        // 作者
        const authorInput = document.querySelector('#author, input[name="author"], .js_author') as HTMLInputElement | null
        if (authorInput) {
          authorInput.value = authorVal
          authorInput.dispatchEvent(new Event('input', { bubbles: true }))
          authorInput.dispatchEvent(new Event('change', { bubbles: true }))
        }

        // 摘要
        const digestInput = document.querySelector('#js_description, #digest, textarea[name="digest"], .js_desc') as HTMLTextAreaElement | null
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
            if (typeof instances[0].fireEvent === 'function') instances[0].fireEvent('contentChange')
            setOk = true
          }
        }
        if (!setOk) {
          const pmNodes = Array.from(document.querySelectorAll('.ProseMirror')) as HTMLElement[]
          const scored = pmNodes
            .map((el) => {
              const rect = el.getBoundingClientRect()
              const inEditor = el.closest('#js_editor, .edit_area, .appmsg_content, #js_mp_editor, .edui-body-container') ? 1 : 0
              return { el, rect, score: inEditor * 100000 + rect.height }
            })
            .filter((item) => item.rect.width > 0 && item.rect.height > 40)
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
            if (inserted || el.querySelectorAll('img').length > 0 || (el.textContent || '').trim().length > 0) {
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
          const edDiv = document.querySelector('#js_content, .edui-body-container') as HTMLElement | null
          if (edDiv) {
            edDiv.innerHTML = htmlVal
            edDiv.dispatchEvent(new Event('input', { bubbles: true }))
            edDiv.dispatchEvent(new Event('change', { bubbles: true }))
            setOk = true
          }
        }
      }, title, job.author || '文映学术win00.cn', digest, html)

      // 封面文件上传
      if (coverPath && fs.existsSync(coverPath)) {
        try {
          const fileInputs = await page.$$('input[type="file"]')
          for (const input of fileInputs) {
            await input.uploadFile(coverPath).catch(() => undefined)
          }
          await new Promise((resolve) => setTimeout(resolve, 1500))
          await page.evaluate(() => {
            const dialog = Array.from(document.querySelectorAll('.weui-desktop-dialog')).find((el) => {
              const rect = el.getBoundingClientRect()
              return rect.width > 0 && rect.height > 0
            })
            if (dialog) {
              const confirmBtn = Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent?.trim() === '确定' || b.textContent?.trim() === '下一步')
              if (confirmBtn && !confirmBtn.disabled) confirmBtn.click()
            }
          })
        } catch {
          // 封面图片上传为增强项，遇到 DOM 差异时不阻断整体草稿生成
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
    }

    // 4. 自动开启文字原创声明（若启用）
    let originalResult: WechatOriginalResult | undefined
    if (job.auto_enable_original) {
      try {
        console.log(`[social-publisher] 账号 ${accountId} 正在免 API 模式下批量开启文字原创...`)
        const orig = await runOriginalScriptInPage(page, job.author || '文映学术win00.cn')
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
        console.warn(`[social-publisher] 免 API 模式下开启原创异常（继续保存草稿）: `, e)
      }
    }

    // 5. 点击保存为草稿
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button, a')).find((el) => el.textContent?.trim() === '保存为草稿')
      if (btn) (btn as HTMLElement).click()
    })

    await page.waitForFunction(() => {
      const success = document.querySelector('#js_save_success, #js_save_success_with_ad, #js_save_success_with_ad_op')
      if (success && (success as HTMLElement).offsetWidth > 0) return true
      return window.location.search.includes('appmsgid=')
    }, { timeout: 35000 }).catch(() => undefined)

    await new Promise((resolve) => setTimeout(resolve, 2500))

    // 6. 获取新生成的草稿 ID
    // 只认「本次保存后 URL 上真实出现的 appmsgid」。绝不回退去取草稿列表里的最新一条：
    // 保存失败时那条通常是历史遗留草稿，会让调用方误以为本次发布成功。
    let appmsgid = new URL(page.url()).searchParams.get('appmsgid')
    if (!appmsgid) {
      // 再给页面一次机会（保存请求可能在网络回环后稍晚才跳转）
      await page.waitForFunction(() => window.location.search.includes('appmsgid='), { timeout: 15000 })
        .catch(() => undefined)
      await new Promise((resolve) => setTimeout(resolve, 1500))
      appmsgid = new URL(page.url()).searchParams.get('appmsgid')
    }
    if (!appmsgid) {
      const shot = await debugScreenshot(page, debugDir, 'publish_save_failed').catch(() => '')
      throw new Error(
        '草稿保存未生效：保存后仍未获得 appmsgid（正文可能未真正写入编辑器）。'
        + '请检查编辑器结构是否变化' + (shot ? '，页面截图已存：' + shot : ''),
      )
    }

    const finalMediaId = appmsgid
    const draftUrl = draftEditUrl(token, finalMediaId)

    return {
      dry_run: false,
      media_id: finalMediaId,
      media_ids: [finalMediaId],
      article_count: n,
      titles: job.titles,
      draft_url: draftUrl,
      original_result: originalResult,
      verify: {
        checked: true,
        article_count: n,
        results: [{ media_id: finalMediaId, titles: job.titles, status: 'ok' }],
      },
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    let shot: string | undefined
    if (page) {
      shot = await debugScreenshot(page, debugDir, 'browser_publish_error').catch(() => undefined)
    }
    throw new Error('免 API 浏览器发布失败: ' + errorMsg + (shot ? ` (截图已存: ${shot})` : ''))
  } finally {
    await browser.close().catch(() => undefined)
  }
}

/**
 * 免 API 浏览器模式下的草稿核验：进入草稿箱检查最新草稿标题与状态
 */
export async function wechatVerifyDrafts(
  cfg: Config,
  accountId: string,
  targetTitles: string[],
): Promise<{ checked: boolean; found: number; total: number; details: Array<{ title: string; found: boolean; appmsgid?: string }> }> {
  if (cfg.runtime.dry_run) {
    return {
      checked: true,
      found: targetTitles.length,
      total: targetTitles.length,
      details: targetTitles.map((t) => ({ title: t, found: true })),
    }
  }
  const browser = await launchWechatBrowser(cfg, accountId, true)
  try {
    const page = await browser.newPage()
    await page.goto(MP_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))
    const token = new URL(page.url()).searchParams.get('token')
    if (!token) throw new Error('未检测到微信登录态（未获取到 token）')
    const drafts = await fetchDraftListPage(page, token, 0)
    const details = targetTitles.map((t) => {
      const match = drafts.find((d) => d.title === t || d.title.includes(t) || t.includes(d.title))
      return {
        title: t,
        found: Boolean(match),
        appmsgid: match?.appmsgid,
      }
    })
    const found = details.filter((d) => d.found).length
    return {
      checked: true,
      found,
      total: targetTitles.length,
      details,
    }
  } finally {
    await browser.close().catch(() => undefined)
  }
}

