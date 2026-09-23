// 只读核验：重新打开草稿箱中每个「文章」草稿，逐篇读取原创声明状态（不修改任何内容）。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = process.argv[2]
const LABEL = process.argv[3] || 'account'
const OUT = 'D:\\666\\gzh\\dsh-plugin\\diag-out'

const EXE_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const exe = EXE_CANDIDATES.find((p) => p && fs.existsSync(p))
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

const report = { label: LABEL, drafts: [], totals: { articles: 0, enabled: 0, not_enabled: 0 } }

try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2500)
  let token = new URL(page.url()).searchParams.get('token')
  if (!token) {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {})
    token = new URL(page.url()).searchParams.get('token')
  }
  if (!token) throw new Error('未检测到登录态')

  const drafts = []
  const seen = new Set()
  for (let begin = 0; begin < 3000; begin += 20) {
    const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=${begin}&count=20&type=77&action=list_card&token=${token}&lang=zh_CN`
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
    await sleep(2200)
    const items = await page.evaluate(() => Array.from(document.querySelectorAll('.weui-desktop-card')).map((c) => {
      const id = c.getAttribute('data-appid') || ''
      const t = c.querySelector('.weui-desktop-publish__cover__title span, .weui-desktop-publish__cover__title')
      return { id, title: (t?.textContent || '').trim() }
    }).filter((x) => x.id))
    if (!items.length) break
    let added = 0
    for (const it of items) { if (!seen.has(it.id)) { seen.add(it.id); drafts.push(it); added += 1 } }
    if (!added || items.length < 20) break
  }
  log('核验「文章」草稿共', drafts.length, '个')

  for (let i = 0; i < drafts.length; i += 1) {
    const d = drafts[i]
    const editUrl = 'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit'
      + '&type=10&appmsgid=' + encodeURIComponent(d.id) + '&token=' + encodeURIComponent(token) + '&lang=zh_CN'
    await page.goto(editUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await sleep(2500)
    await page.waitForSelector('#title, textarea.js_title, .card_appmsg_inner', { timeout: 30000 })
    await sleep(1000)

    const res = await page.evaluate(async () => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
      const norm = (t) => String(t || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim()
      const all = (s, r = document) => Array.from(r.querySelectorAll(s))
      const isVisible = (el) => {
        if (!el) return false
        const st = getComputedStyle(el); const rc = el.getBoundingClientRect()
        return st.display !== 'none' && st.visibility !== 'hidden' && Number(st.opacity || 1) !== 0 && rc.width > 0 && rc.height > 0
      }
      const visible = (s, r = document) => all(s, r).find(isVisible) || null
      const TITLE = '#title, textarea.js_title, textarea[name="title"], input[name="title"]'

      function cards() {
        const c = all('.card_appmsg_inner').filter((x) => x.querySelector('strong'))
        return c.length ? c : all('strong').map((s) => s.closest('.card_appmsg_inner')).filter((x, i, l) => x && l.indexOf(x) === i)
      }
      const titleOf = (c, i) => c.querySelector('strong')?.textContent?.trim() || `第 ${i + 1} 篇`
      const out = []
      const list = cards()
      const titles = list.map(titleOf)
      for (let k = 0; k < titles.length; k += 1) {
        const target = titles[k]
        const card = list.find((c, idx) => norm(titleOf(c, idx)) === norm(target))
        if (card) { (card.querySelector('.card_appmsg_hd, strong') || card).click() }
        // 等标题切换
        const started = Date.now()
        while (Date.now() - started < 15000) {
          const f = document.querySelector(TITLE)
          if (norm(f?.value || f?.textContent) === norm(target)) break
          await sleep(150)
        }
        await sleep(700)
        const area = visible('.js_original_type')
        const unset = area ? visible('.js_unset_original_title', area) : null
        let state = 'unknown'
        if (area) {
          if (unset) state = '未开启'
          else if (norm(area.textContent).includes('文字原创')) state = '已开启(文字原创)'
          else state = '其他:' + norm(area.textContent).slice(0, 40)
        }
        out.push({ title: target, state, areaText: area ? norm(area.textContent).slice(0, 80) : '' })
      }
      return out
    })

    const enabled = res.filter((r) => r.state.startsWith('已开启')).length
    report.totals.articles += res.length
    report.totals.enabled += enabled
    report.totals.not_enabled += res.length - enabled
    report.drafts.push({ appmsgid: d.id, title: d.title, articles: res, enabled, total: res.length })
    log(`[${i + 1}/${drafts.length}] ${d.title} → ${enabled}/${res.length} 已开启`)
    for (const r of res) log(`     - ${r.title} → ${r.state}`)
  }
} finally {
  await browser.close().catch(() => {})
}

console.log('\n###VERIFY### ' + JSON.stringify(report.totals))
fs.writeFileSync(path.join(OUT, LABEL, 'verify-original.json'), JSON.stringify(report, null, 2))
