// Capture ALL XHR/fetch traffic on the draft box page to find the data source.
import fs from 'node:fs'
import path from 'node:path'
import puppeteer from 'puppeteer-core'

const PROFILE = 'D:\\666\\gzh\\dsh-plugin\\tasks\\default\\accounts\\wyxst\\wechat_profile'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: true, userDataDir: PROFILE,
  defaultViewport: { width: 1600, height: 1000 }, protocolTimeout: 300000,
  args: ['--window-size=1600,1000'],
})
try {
  const page = await browser.newPage()
  const hits = []
  page.on('response', async (resp) => {
    const u = resp.url()
    if (!/cgi-bin|cgi_data|micromsg/.test(u)) return
    try {
      const ct = resp.headers()['content-type'] || ''
      if (!/json|javascript|text/.test(ct)) return
      const t = await resp.text()
      hits.push({ url: u.replace(/token=\d+/, 'token=***'), len: t.length, head: t.replace(/\s+/g, ' ').slice(0, 260) })
    } catch {}
  })

  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  const token = new URL(page.url()).searchParams.get('token')
  await page.goto(`https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list&type=77&begin=0&count=20&token=${token}&lang=zh_CN`,
    { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(9000)

  console.log('hits:', hits.length)
  hits.forEach((h, i) => {
    if (!/appmsgid|\"item\"|draft|app_msg/.test(h.head)) return
    console.log(`\n[${i}] len=${h.len} ${h.url.slice(0, 150)}`)
    console.log('   ', h.head.slice(0, 240))
  })
} finally {
  await browser.close()
}
