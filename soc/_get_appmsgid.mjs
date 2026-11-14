// Extract the numeric appmsgid list from the draft-box page (new UI).
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
})
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4500)
  const token = new URL(page.url()).searchParams.get('token')

  // Draft box UI uses a Vue app fed by an internal endpoint; capture the raw response.
  const captured = []
  page.on('response', async (resp) => {
    const u = resp.url()
    if (/appmsg|draft|material/.test(u) && /cgi-bin/.test(u)) {
      try {
        const t = await resp.text()
        if (/appmsgid|app_msg_id/.test(t)) captured.push({ url: u.slice(0, 160), body: t.slice(0, 1500) })
      } catch {}
    }
  })

  await page.goto(`https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list&type=77&begin=0&count=20&token=${token}&lang=zh_CN`,
    { waitUntil: 'networkidle2', timeout: 60000 })
  await sleep(8000)

  const links = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('a[href*="appmsgid"], [data-appmsgid], [data-id]').forEach((el) => {
      const h = el.getAttribute('href') || ''
      const m = h.match(/appmsgid[=\s"':]+(\d+)/) || (el.getAttribute('data-appmsgid') || '').match(/^(\d+)$/)
      if (m) out.push({ id: m[1], href: h.slice(0, 120) })
    })
    return out.slice(0, 20)
  })
  console.log('links:', JSON.stringify(links, null, 2))
  console.log('captured responses:', captured.length)
  captured.slice(0, 3).forEach((c) => {
    console.log('---', c.url)
    console.log(c.body.replace(/\s+/g, ' ').slice(0, 700))
  })
  await page.screenshot({ path: path.join(OUT, 'draftbox.png') })
} finally {
  await browser.close()
}
