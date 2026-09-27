// Query the WeChat draft APIs directly to see what actually exists.
import fs from 'node:fs'
import puppeteer from 'puppeteer-core'

const PROFILE = 'D:\\666\\gzh\\dsh-plugin\\tasks\\default\\accounts\\wyxst\\wechat_profile'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: true, userDataDir: PROFILE,
  defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000,
})
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  const token = new URL(page.url()).searchParams.get('token')
  console.log('token ok')

  // raw HTML of the draft-list response
  const res = await page.evaluate(async (tk) => {
    const u = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=0&count=20&type=77&action=list_card&token=${tk}&lang=zh_CN&f=json&ajax=1`
    const r = await fetch(u, { credentials: 'include' })
    return { status: r.status, text: (await r.text()).slice(0, 1200) }
  }, token)
  console.log('--- appmsg list_card (ajax) status', res.status)
  console.log(res.text.slice(0, 900))
} finally {
  await browser.close()
}
