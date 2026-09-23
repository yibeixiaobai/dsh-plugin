// 只读诊断：枚举公众号草稿箱全部草稿，输出卡片结构、appmsgid 与图片消息(小绿书)标记。
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = process.argv[2]
const OUT = process.argv[3] || 'D:\\666\\gzh\\dsh-plugin\\diag-out'

const EXE_CANDIDATES = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
]
const exe = EXE_CANDIDATES.find((p) => p && fs.existsSync(p))
if (!exe) throw new Error('no browser found')
fs.mkdirSync(OUT, { recursive: true })
console.log('browser exe:', exe)
console.log('profile:', PROFILE)

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: PROFILE,
  defaultViewport: { width: 1440, height: 900 },
  protocolTimeout: 180000,
  args: ['--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
})

try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2500)
  let url = page.url()
  let token = new URL(url).searchParams.get('token')
  if (!token) {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {})
    url = page.url()
    token = new URL(url).searchParams.get('token')
  }
  console.log('token:', token ? 'FOUND' : 'MISSING')
  if (!token) {
    await page.screenshot({ path: path.join(OUT, 'no-token.png') })
    process.exit(2)
  }

  const who = await page.evaluate(() => {
    const el = document.querySelector('.weui-desktop-account__info, .account_name, .weui-desktop-account__nickname')
    return el ? el.textContent.trim() : (document.title || '')
  })
  console.log('logged-in account hint:', who)

  const COUNT = 20
  const collected = []
  for (let p = 0; p < 12; p += 1) {
    const begin = p * COUNT
    const target = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=${begin}&count=${COUNT}&type=77&action=list_card&token=${token}&lang=zh_CN`
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {})
    await sleep(2500)

    const info = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.weui-desktop-card, .js_appmsg_item, .appmsg_card, .appmsg_col, .weui-desktop-media'))
      const seen = new Set()
      const items = []
      for (const c of cards) {
        if (seen.has(c)) continue
        seen.add(c)
        const attrs = {}
        for (const n of c.getAttributeNames()) attrs[n] = c.getAttribute(n)
        const titles = Array.from(c.querySelectorAll('.weui-desktop-card__title, .appmsg_title, .js_title, .weui-desktop-media__title, strong'))
          .map((e) => (e.textContent || '').trim())
          .filter(Boolean)
        const anchors = Array.from(c.querySelectorAll('a')).map((a) => a.getAttribute('href')).filter(Boolean).slice(0, 8)
        const imgs = Array.from(c.querySelectorAll('img')).map((i) => (i.getAttribute('src') || '').slice(0, 120)).slice(0, 4)
        items.push({
          cls: String(c.className).slice(0, 200),
          attrs,
          titles: titles.slice(0, 8),
          anchors,
          imgs,
          text: (c.innerText || '').replace(/\s+/g, ' ').slice(0, 260),
          html: c.outerHTML.slice(0, 1800),
        })
      }
      const bodyText = (document.body ? document.body.innerText : '').replace(/\r/g, '').slice(0, 2500)
      return { count: items.length, items, bodyText, finalUrl: location.href.replace(/token=[^&]+/, 'token=TOKEN') }
    })

    console.log(`\n===== begin=${begin} cards=${info.count} =====`)
    console.log('final url:', info.finalUrl)
    for (const it of info.items) {
      console.log(JSON.stringify({ cls: it.cls, attrs: it.attrs, titles: it.titles, anchors: it.anchors, text: it.text }))
    }
    fs.writeFileSync(path.join(OUT, `draftbox_${begin}.json`), JSON.stringify(info, null, 2))
    collected.push({ begin, ...info })
    if (info.count === 0) break
  }

  fs.writeFileSync(path.join(OUT, 'draftbox_all.json'), JSON.stringify(collected, null, 2))
  await page.screenshot({ path: path.join(OUT, 'draftbox.png'), fullPage: true }).catch(() => {})
  console.log('\nBODY TEXT (first page) >>>')
  console.log((collected[0]?.bodyText || '').slice(0, 2500))
  console.log('<<< END BODY TEXT')
} finally {
  await browser.close().catch(() => {})
}
