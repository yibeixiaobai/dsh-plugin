// List real draft entries (appmsgid + title) from the new draft-box Vue app.
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
  defaultViewport: { width: 1600, height: 1200 }, protocolTimeout: 300000,
  args: ['--window-size=1600,1200'],
})
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  const token = new URL(page.url()).searchParams.get('token')

  // The new draft box is a SPA route; navigate there and let it render.
  await page.goto(`https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list&type=77&begin=0&count=20&token=${token}&lang=zh_CN`,
    { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(10000)

  const info = await page.evaluate(() => {
    const txt = (el) => (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    const boxes = Array.from(document.querySelectorAll('div,li,a')).filter((el) => {
      const t = txt(el)
      return t.length > 4 && t.length < 120 && /被退|约谈|初审|书稿|署名|AIGC|投稿避坑/.test(t)
    })
    return {
      bodyHasNoData: (document.body.innerText || '').includes('暂无'),
      matches: boxes.slice(0, 15).map((el) => ({ tag: el.tagName, cls: el.className.toString().slice(0, 70), t: txt(el).slice(0, 80) })),
    }
  })
  console.log(JSON.stringify(info, null, 2))

  const all = await page.evaluate(() => (document.body.innerText || '').replace(/\s+/g, ' ').slice(0, 600))
  console.log('\nBODY:', all)
  await page.screenshot({ path: path.join(OUT, 'draftbox2.png'), fullPage: true })
} finally {
  await browser.close()
}
