// 精确诊断：目标草稿在草稿箱 DOM 中的分组卡片、data-appid 归属，以及贴图标签页差异。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = process.argv[2]
const TITLE = process.argv[3] || ''
const OUT = 'D:\\666\\gzh\\dsh-plugin\\diag-out\\precise'
const EXE_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const exe = EXE_CANDIDATES.find((p) => p && fs.existsSync(p))
fs.mkdirSync(OUT, { recursive: true })

const browser = await puppeteer.launch({
  executablePath: exe, headless: true, userDataDir: PROFILE,
  defaultViewport: { width: 1440, height: 900 }, protocolTimeout: 180000,
  args: ['--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
})
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2500)
  const token = new URL(page.url()).searchParams.get('token')
  console.log('token:', token ? 'FOUND' : 'MISSING')

  for (const [label, type] of [['tab_article_77', 77], ['tab_pic_8', 8], ['tab_pic_10', 10]]) {
    const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&type=${type}&action=list_card&token=${token}&lang=zh_CN`
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {})
    await sleep(3500)
    const info = await page.evaluate((target) => {
      const cards = Array.from(document.querySelectorAll('.weui-desktop-card'))
      const cardInfo = cards.map((c, i) => ({
        i,
        appid: c.getAttribute('data-appid') || c.getAttribute('data-appmsgid') || null,
        cls: c.className.slice(0, 80),
        titles: Array.from(c.querySelectorAll('.weui-desktop-card__title, .appmsg_title, strong, .weui-desktop-media__title'))
          .map((t) => t.textContent.trim()).filter(Boolean).slice(0, 12),
        hasDataAttrs: Array.from(c.attributes).map((a) => a.name).filter((n) => n.startsWith('data-')),
      }))
      // 目标标题出现在哪里
      const hits = []
      for (const c of cards) {
        if (target && c.textContent.includes(target)) {
          hits.push({ appid: c.getAttribute('data-appid'), cls: c.className.slice(0, 80) })
        }
      }
      const globalHit = target && document.body.textContent.includes(target)
      // 找所有可能的可点击编辑入口
      const editLike = Array.from(document.querySelectorAll('*'))
        .filter((e) => (e.textContent || '').trim() === '编辑' || (e.textContent || '').trim() === '修改')
        .slice(0, 12)
        .map((e) => ({ tag: e.tagName, cls: (e.className || '').toString().slice(0, 60), href: e.getAttribute('href') || null, visible: e.getBoundingClientRect().width > 0 }))
      const anchors = Array.from(document.querySelectorAll('a[href]'))
        .map((a) => a.getAttribute('href'))
        .filter((h) => /edit|appmsg/.test(h || '')).slice(0, 10)
      return { nCards: cards.length, cardInfo, hits, globalHit, editLike, anchors }
    }, TITLE)
    console.log('\n===== ' + label + ' (type=' + type + ') =====')
    console.log('nCards:', info.nCards, '| target on page:', info.globalHit)
    console.log('cards:', JSON.stringify(info.cardInfo, null, 1))
    console.log('target-group hits:', JSON.stringify(info.hits))
    console.log('edit-like:', JSON.stringify(info.editLike))
    console.log('anchors:', JSON.stringify(info.anchors))
    await page.screenshot({ path: path.join(OUT, label + '.png') }).catch(() => {})
  }
} finally {
  await browser.close().catch(() => {})
}
