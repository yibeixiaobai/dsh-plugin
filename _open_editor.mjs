// Open the draft editor for the newest 6-article draft and report the 原创声明 state.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = 'D:\\666\\gzh\\dsh-plugin\\tasks\\default\\accounts\\wyxst\\wechat_profile'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const OUT = 'D:\\666\\gzh\\dsh-plugin\\diag-out'
fs.mkdirSync(OUT, { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const APPMSG_ID = process.argv[2]

const browser = await puppeteer.launch({
  executablePath: EXE, headless: true, userDataDir: PROFILE,
  defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000,
  args: ['--window-size=1600,1000'],
})
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4500)
  const token = new URL(page.url()).searchParams.get('token')
  console.log('token ok')

  await page.goto(`https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit&action=edit&type=10&appmsgid=${APPMSG_ID}&token=${token}&lang=zh_CN`,
    { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(12000)
  await page.evaluate(() => document.querySelectorAll('.education-dialog, .weui-desktop-dialog__wrp, .weui-desktop-mask').forEach((el) => { el.style.display = 'none' }))

  const info = await page.evaluate(() => {
    const vis = (el) => el && el.offsetParent !== null && el.getBoundingClientRect().height > 0
    const items = Array.from(document.querySelectorAll('.js_appmsg_item'))
    const orig = Array.from(document.querySelectorAll('.js_original_type')).find(vis)
    return {
      url: location.search.slice(0, 120),
      appmsgItems: items.length,
      titles: items.map((it) => (it.querySelector('.js_appmsg_title') || {}).innerText || '').slice(0, 8),
      originalArea: orig ? {
        text: (orig.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
        unset: !!Array.from(orig.querySelectorAll('.js_unset_original_title')).find(vis),
        cls: orig.className,
      } : null,
      saveBtn: Array.from(document.querySelectorAll('button')).filter(vis).map((b) => b.textContent.trim()).filter((t) => /保存|预览|群发/.test(t)),
    }
  })
  console.log(JSON.stringify(info, null, 2))
  await page.screenshot({ path: path.join(OUT, 'editor_' + APPMSG_ID + '.png') })
} finally {
  await browser.close()
}
