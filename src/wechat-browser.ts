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
 * 自动定位刚发布的草稿并执行批量开启原创与保存
 */
export async function enableWechatDraftOriginal(
  cfg: Config,
  accountId: string,
  targetTitles: string[],
  authorName?: string,
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

    // 1. 进入草稿箱列表页面
    const draftBoxUrl = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&type=77&action=list_card&token=${token}&lang=zh_CN`
    await page.goto(draftBoxUrl, { waitUntil: 'networkidle2', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // 2. 在草稿箱中查找刚发布的草稿卡片（根据标题匹配，或默认首条最新草稿）
    const firstTargetTitle = targetTitles[0] || ''
    const editorLink = await page.evaluate((targetTitle) => {
      // 遍历草稿卡片
      const cards = Array.from(document.querySelectorAll('.appmsg_card, .weui-desktop-card, .js_appmsg_item, .appmsg_col'))
      let matchedCard: Element | null = null

      if (targetTitle) {
        for (const card of cards) {
          if (card.textContent && card.textContent.includes(targetTitle)) {
            matchedCard = card
            break
          }
        }
      }
      if (!matchedCard && cards.length > 0) {
        matchedCard = cards[0]
      }

      const root = matchedCard || document
      // 优先从匹配的卡片中寻找编辑链接
      const editAnchor = root.querySelector<HTMLAnchorElement>('a[href*="action=edit"], a[href*="appmsg_edit"]')
      if (editAnchor && editAnchor.href) return editAnchor.href

      // 次选：包含“编辑”文字的链接或按钮
      const allAnchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a'))
      const textEdit = allAnchors.find((a) => a.textContent?.trim() === '编辑' || a.title?.trim() === '编辑')
      return textEdit?.href || null
    }, firstTargetTitle)

    if (!editorLink) {
      const shot = await debugScreenshot(page, debugDir, 'draft_not_found')
      throw new Error(
        '在微信公众号草稿箱中未找到目标草稿的“编辑”按钮。请检查草稿是否已成功生成。截图已存：' + shot,
      )
    }

    // 3. 打开草稿编辑页
    await page.goto(editorLink, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await new Promise((resolve) => setTimeout(resolve, 3000))

    // 验证是否已成功进入编辑页
    const isEditor = await page.evaluate(() => {
      const search = window.location.search
      return search.includes('action=edit') || search.includes('t=media/appmsg_edit')
    })
    if (!isEditor) {
      const shot = await debugScreenshot(page, debugDir, 'editor_entry_failed')
      throw new Error('未能进入微信图文编辑页，当前 URL: ' + page.url() + '。截图：' + shot)
    }

    // 等待编辑器主界面就绪
    await page.waitForSelector('#title, textarea.js_title, .card_appmsg_inner', { timeout: 30000 })

    // 4. 执行批量开启文字原创并保存脚本
    const finalAuthor = authorName || cfg.accounts[accountId]?.author_name || '文映学术win00.cn'
    const result = await runOriginalScriptInPage(page, finalAuthor)

    return {
      success: true,
      article_count: result.completed.length,
      completed: result.completed,
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
  return defineTool<{ titles?: string[]; author?: string; account_id?: string }, WechatOriginalResult>({
    name: 'gzh_enable_original',
    description: '通过浏览器自动化进入微信公众号后台草稿箱，为草稿逐篇开启文字原创、填入作者并保存草稿（基于油猴自动化脚本）。',
    parameters: {
      titles: {
        type: 'array',
        description: '可选：草稿中包含的文章标题列表（用于在草稿箱定位草稿，留空则自动从最近发布记录读取或定位最新草稿）',
        items: { type: 'string' },
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
      let titles = args.titles || []
      if (titles.length === 0) {
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
      return await enableWechatDraftOriginal(cfg, account.id, titles, author)
    },
  })
}

