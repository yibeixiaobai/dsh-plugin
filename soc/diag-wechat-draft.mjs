// 临时只读诊断：打开公众号后台草稿箱，dump 结构与草稿标题，判断“编辑”入口定位失败原因。
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
fs.mkdirSync(OUT, { recursive: true })
console.log('browser exe:', exe)
console.log('profile:', PROFILE)

const browser = await puppeteer.launch({
  executablePath: exe,
  headless: true,
  userDataDir: PROFILE,
  defaultViewport: { width: 1440, height: 900 },
  protocolTimeout: 180000,
  args: ['--window-size=1440,900', '--disable-blink-features=AutomationControlled'],
})

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(2500)
  let url = page.url()
  console.log('after home url:', url)
  let token = new URL(url).searchParams.get('token')
  if (!token) {
    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 8000 }).catch(() => {})
    url = page.url()
    token = new URL(url).searchParams.get('token')
    console.log('after wait url:', url)
  }
  console.log('token:', token ? 'FOUND' : 'MISSING')
  if (!token) { await page.screenshot({ path: path.join(OUT, 'no-token.png') }); process.exit(2) }

  // 当前登录的公众号昵称
  const who = await page.evaluate(() => {
    const el = document.querySelector('.weui-desktop-account__info, .account_name, .weui-desktop-account__nickname')
    return el ? el.textContent.trim() : (document.title || '')
  })
  console.log('logged-in account hint:', who)

  const targets = [
    ['list_card', `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&type=77&action=list_card&token=${token}&lang=zh_CN`],
    ['list_ex', `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=10&t=media/appmsg_edit&action=list_ex&type=77&token=${token}&lang=zh_CN`],
  ]

  for (const [label, target] of targets) {
    console.log('\n===== ' + label + ' =====')
    console.log('goto:', target.replace(token, 'TOKEN'))
    await page.goto(target, { waitUntil: 'networkidle2', timeout: 60000 }).catch((e) => console.log('goto err', e.message))
    await sleep(3000)
    console.log('final url:', page.url().replace(token, 'TOKEN'))
    await page.screenshot({ path: path.join(OUT, label + '.png'), fullPage: false }).catch(() => {})

    const info = await page.evaluate(() => {
      const q = (s) => document.querySelectorAll(s).length
      const selectors = ['.weui-desktop-card', '.appmsg_card', '.js_appmsg_item', '.appmsg_col', '.weui-desktop-media',
        '.weui-desktop-card__title', '.appmsg_title', 'a[href*="action=edit"]', '[data-appid]', '[data-appmsgid]']
      const counts = {}
      for (const s of selectors) counts[s] = q(s)
      const titles = Array.from(document.querySelectorAll('.weui-desktop-card__title, .appmsg_title, .js_title, .weui-desktop-media__title'))
        .slice(0, 15).map((e) => e.textContent.trim())
      const bodyText = (document.body ? document.body.innerText : '').slice(0, 1200)
      return { counts, titles, bodyText, htmlLen: document.documentElement.outerHTML.length }
    })
    console.log('counts:', JSON.stringify(info.counts))
    console.log('titles:', JSON.stringify(info.titles, null, 1))
    console.log('htmlLen:', info.htmlLen)
    console.log('bodyText >>>')
    console.log(info.bodyText)
    console.log('<<< end bodyText')
    fs.writeFileSync(path.join(OUT, label + '.html'), await page.content())
  }
} finally {
  await browser.close().catch(() => {})
}
