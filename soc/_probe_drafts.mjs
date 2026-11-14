// Probe the draft-list page: what selectors/attributes actually exist now.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = 'D:\\666\\gzh\\dsh-plugin\\tasks\\default\\accounts\\wyxst\\wechat_profile'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'D:\\666\\gzh\\dsh-plugin\\diag-out'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: true, userDataDir: PROFILE,
  defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000,
  args: ['--window-size=1600,1000'],
})
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  const token = new URL(page.url()).searchParams.get('token')
  console.log('token:', token ? 'ok' : 'MISSING')

  const url = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=20&type=77&action=list_card&token=${token}&lang=zh_CN`
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(4000)

  await page.screenshot({ path: path.join(OUT, 'draftlist.png'), fullPage: false })

  const info = await page.evaluate(() => {
    const counts = {}
    for (const sel of ['.weui-desktop-card', '.weui-desktop-publish__cover__title',
                       '[data-appid]', '[data-appmsgid]', '.appmsg_item_list li',
                       '.weui-desktop-appmsg-card', '.js_appmsg_item', 'li']) {
      counts[sel] = document.querySelectorAll(sel).length
    }
    const sample = Array.from(document.querySelectorAll('li, .weui-desktop-card')).slice(0, 8).map((el) => ({
      cls: el.className.toString().slice(0, 80),
      attrs: Array.from(el.attributes).map((a) => a.name + '=' + a.value.slice(0, 40)).join(' | ').slice(0, 220),
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
    }))
    return { url: location.href, title: document.title, counts, sample,
             bodyHead: (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 400) }
  })
  console.log(JSON.stringify(info, null, 2))
} finally {
  await browser.close()
}
