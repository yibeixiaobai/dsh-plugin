// 为公众号草稿箱「文章」标签下的全部草稿逐条开启文字原创并保存。
// type=77 action=list_card 只返回图文「文章」草稿，天然排除小绿书（贴图）草稿。
//
// 用法：
//   node enable-original-all.mjs <profileDir> <accountLabel> <authorName> [--dry]
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = process.argv[2]
const LABEL = process.argv[3] || 'account'
const AUTHOR = process.argv[4] || '文映学术win00.cn'
const DRY = process.argv.includes('--dry')
const OUT = 'D:\\666\\gzh\\dsh-plugin\\diag-out'

if (!PROFILE) throw new Error('usage: node enable-original-all.mjs <profileDir> <accountLabel> <authorName> [--dry]')

const EXE_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const exe = EXE_CANDIDATES.find((p) => p && fs.existsSync(p))
if (!exe) throw new Error('未找到本机 Chrome/Edge')

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const log = (...a) => console.log(`[${LABEL}]`, ...a)

fs.mkdirSync(path.join(OUT, LABEL), { recursive: true })

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: PROFILE,
  defaultViewport: { width: 1440, height: 900 },
  protocolTimeout: 240000,
  args: ['--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
})

/** 页面内执行：对当前草稿内的每一篇文章开启文字原创，最后保存草稿 */
async function runOriginalOnOpenDraft(page, authorName) {
  return page.evaluate(async (AUTHOR_NAME) => {
    const STEP_TIMEOUT = 30000
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
    const normalizeText = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
    const all = (sel, root = document) => Array.from(root.querySelectorAll(sel))
    const isVisible = (el) => {
      if (!el) return false
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return s.display !== 'none' && s.visibility !== 'hidden' && Number(s.opacity || 1) !== 0 && r.width > 0 && r.height > 0
    }
    const visible = (sel, root = document) => all(sel, root).find(isVisible) || null
    const elementByText = (sel, text, root = document) =>
      all(sel, root).find((el) => isVisible(el) && el.textContent?.trim() === text) || null

    async function waitFor(getter, desc, timeout = STEP_TIMEOUT) {
      const started = Date.now()
      while (Date.now() - started < timeout) {
        const v = getter()
        if (v) return v
        await sleep(150)
      }
      throw new Error(`等待“${desc}”超时`)
    }

    const TITLE_SEL = '#title, textarea.js_title, textarea[name="title"], input[name="title"]'

    function articleCards() {
      const cards = all('.card_appmsg_inner').filter((c) => c.querySelector('strong'))
      if (cards.length) return cards
      return all('strong')
        .map((s) => s.closest('.card_appmsg_inner'))
        .filter((c, i, l) => Boolean(c) && l.indexOf(c) === i)
    }
    const articleTitle = (card, i) => card.querySelector('strong')?.textContent?.trim() || `第 ${i + 1} 篇`
    const findCard = (title) =>
      articleCards().find((c, i) => normalizeText(articleTitle(c, i)) === normalizeText(title)) || null

    async function selectArticle(title) {
      const card = await waitFor(() => findCard(title), `查找文章：${title}`)
      const clickable = card.querySelector('.card_appmsg_hd, strong') || card
      clickable.click()
      await waitFor(() => {
        const cur = findCard(title)
        return cur?.closest('.js_appmsg_item')?.classList.contains('current')
      }, `选中文章：${title}`)
      await waitFor(() => {
        const f = document.querySelector(TITLE_SEL)
        return normalizeText(f?.value || f?.textContent) === normalizeText(title)
      }, `切换到文章：${title}`)
      await sleep(250)
    }

    function getOriginalState() {
      const area = visible('.js_original_type')
      if (!area) return null
      const unset = visible('.js_unset_original_title', area)
      if (unset) return { area, state: 'unset', unset }
      if (normalizeText(area.textContent).includes('文字原创')) return { area, state: 'enabled', unset: null }
      return null
    }

    async function getStableState(title) {
      let prev = ''
      let since = 0
      return waitFor(() => {
        const f = document.querySelector(TITLE_SEL)
        if (normalizeText(f?.value || f?.textContent) !== normalizeText(title)) return null
        const st = getOriginalState()
        if (!st) return null
        const key = `${st.state}|${normalizeText(st.area.textContent)}`
        if (key !== prev) { prev = key; since = Date.now(); return null }
        return Date.now() - since >= 450 ? st : null
      }, `稳定“${title}”的原创状态`)
    }

    async function enableOriginal(title) {
      const st = await getStableState(title)
      if (st.state === 'enabled') return '已开启，跳过'

      const switchArea = visible('.js_original_apply', st.area) || st.unset
      if (!switchArea) throw new Error(`未找到“${title}”的原创设置入口按钮`)
      switchArea.click()

      const dialog = await waitFor(
        () => all('.weui-desktop-dialog').find((d) =>
          isVisible(d) && (d.textContent?.includes('声明类型') || d.textContent?.includes('原创声明'))),
        '原创声明窗口',
      )
      const radio = dialog.querySelector('input[type="radio"][value="0"]')
      if (radio && !radio.checked) radio.click()

      const author = dialog.querySelector('input.js_counter.js_author, input[placeholder="请输入作者"]')
      if (author && !author.value.trim()) {
        author.value = AUTHOR_NAME
        author.dispatchEvent(new Event('input', { bubbles: true }))
        author.dispatchEvent(new Event('change', { bubbles: true }))
      }
      const agreement = dialog.querySelector('input.weui-desktop-form__checkbox')
      if (agreement && !agreement.checked) agreement.click()

      const confirm = elementByText('button', '确定', dialog)
      if (!confirm) throw new Error(`“${title}”的原创窗口没有找到确定按钮`)
      if (confirm.disabled) throw new Error(`“${title}”的原创确定按钮不可用`)
      confirm.click()

      await waitFor(() => !isVisible(dialog), '关闭原创声明窗口')
      await waitFor(() => getOriginalState()?.state === 'enabled', `确认“${title}”已开启原创`)
      return '已开启'
    }

    async function saveDraft() {
      const button = await waitFor(() => elementByText('button', '保存为草稿'), '保存为草稿按钮')
      if (button.disabled) throw new Error('保存为草稿按钮不可用')
      button.click()
      await waitFor(() => visible('#js_save_success, #js_save_success_with_ad, #js_save_success_with_ad_op'), '“已保存”提示', 30000)
      const err = all('.weui-desktop-dialog, .weui-desktop-toast, .weui-desktop-tips')
        .filter(isVisible).map((e) => e.textContent?.trim() || '')
        .find((t) => /保存失败|系统错误|请重试|内容违规/.test(t))
      if (err) throw new Error(err)
    }

    const completed = []
    const cards = articleCards()
    if (cards.length > 0) {
      const titles = cards.map(articleTitle)
      for (let i = 0; i < titles.length; i += 1) {
        await selectArticle(titles[i])
        completed.push(`${i + 1}. ${titles[i]}：${await enableOriginal(titles[i])}`)
      }
    } else {
      const f = document.querySelector(TITLE_SEL)
      const single = f?.value || f?.textContent || '当前文章'
      completed.push(`1. ${single}：${await enableOriginal(single)}`)
    }
    await saveDraft()
    return { completed }
  }, authorName)
}

const drafts = []
const summary = { label: LABEL, drafts_total: 0, drafts_ok: 0, drafts_failed: 0, articles: [], failures: [] }

try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2500)
  let token = new URL(page.url()).searchParams.get('token')
  if (!token) {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {})
    token = new URL(page.url()).searchParams.get('token')
  }
  if (!token) {
    await page.screenshot({ path: path.join(OUT, LABEL, 'not-logged-in.png') })
    throw new Error('未检测到登录态（无 token），请先扫码登录')
  }
  const who = await page.evaluate(() => {
    const el = document.querySelector('.weui-desktop-account__info, .account_name, .weui-desktop-account__nickname')
    return el ? el.textContent.trim() : document.title
  })
  log('已登录公众号：', who)

  // 1) 分页枚举「文章」草稿（type=77 不含小绿书贴图）
  const seen = new Set()
  for (let begin = 0; begin < 3000; begin += 20) {
    const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=${begin}&count=20&type=77&action=list_card&token=${token}&lang=zh_CN`
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
    await sleep(2200)
    const items = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('.weui-desktop-card')).map((c) => {
        const id = c.getAttribute('data-appid') || c.getAttribute('data-appmsgid') || ''
        const t = c.querySelector('.weui-desktop-publish__cover__title span, .weui-desktop-publish__cover__title')
        return { id, title: (t?.textContent || '').trim() }
      }).filter((x) => x.id)
    })
    if (items.length === 0) break
    let added = 0
    for (const it of items) {
      if (seen.has(it.id)) continue
      seen.add(it.id)
      drafts.push(it)
      added += 1
    }
    if (added === 0) break
    if (items.length < 20) break
  }
  summary.drafts_total = drafts.length
  log('枚举到「文章」草稿共', drafts.length, '个')
  drafts.forEach((d, i) => log(`  ${i + 1}. [${d.id}] ${d.title}`))

  if (DRY) {
    summary.dry_run = true
    console.log('###SUMMARY### ' + JSON.stringify(summary))
    process.exit(0)
  }

  // 2) 逐个草稿：进入编辑页 → 逐篇开启原创 → 保存
  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i]
    const editUrl = 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit'
      + '&type=10&appmsgid=' + encodeURIComponent(d.id)
      + '&token=' + encodeURIComponent(token) + '&lang=zh_CN'
    try {
      log(`\n=== [${i + 1}/${drafts.length}] ${d.title} (appmsgid=${d.id}) ===`)
      await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
      await sleep(2500)

      const isEditor = await page.evaluate(() => {
        const s = location.search
        return s.includes('action=edit') || s.includes('t=media/appmsg_edit')
      })
      if (!isEditor) throw new Error('未能进入编辑页，当前 URL: ' + page.url())

      await page.waitForSelector('#title, textarea.js_title, .card_appmsg_inner', { timeout: 30000 })
      await sleep(1200)

      const res = await runOriginalOnOpenDraft(page, AUTHOR)
      for (const line of res.completed) {
        log('   ', line)
        summary.articles.push(`${d.title} → ${line}`)
      }
      summary.drafts_ok += 1
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      log('    ❌ 失败：', msg)
      summary.drafts_failed += 1
      summary.failures.push({ appmsgid: d.id, title: d.title, error: msg })
      await page.screenshot({
        path: path.join(OUT, LABEL, `fail-${d.id}-${Date.now()}.png`),
      }).catch(() => {})
    }
  }
} finally {
  await browser.close().catch(() => {})
}

console.log('\n###SUMMARY### ' + JSON.stringify(summary, null, 2))
