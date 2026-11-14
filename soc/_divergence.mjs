// Compare the API-draft pool vs the UI draft box to explain the divergence.
import puppeteer from 'puppeteer-core'

const PROFILE = 'D:\\666\\gzh\\dsh-plugin\\tasks\\default\\accounts\\wyxst\\wechat_profile'
const EXE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await puppeteer.launch({
  executablePath: EXE, headless: true, userDataDir: PROFILE,
  defaultViewport: { width: 1600, height: 1200 }, protocolTimeout: 300000,
})
try {
  const page = await browser.newPage()
  await page.goto('https://mp.weixin.qq.com/', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await sleep(4000)
  const token = new URL(page.url()).searchParams.get('token')

  // who am I / what account is this browser session bound to
  const who = await page.evaluate(() => {
    const el = document.querySelector('.weui-desktop-account__info, .account_name, .weui-desktop-account__nickname')
    return el ? el.textContent.trim() : document.title
  })
  console.log('browser session account:', who)

  // the newer draft-list endpoint used by the Vue 草稿箱
  const probes = [
    'https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_list&action=list&type=77&begin=0&count=20&f=json&ajax=1',
    'https://mp.weixin.qq.com/cgi-bin/appmsgpublish?sub=list&begin=0&count=20&type=77&f=json&ajax=1',
    'https://mp.weixin.qq.com/cgi-bin/masssendpage?t=mass/list&action=history&begin=0&count=20&f=json&ajax=1',
  ]
  for (const p of probes) {
    const u = p + '&token=' + token + '&lang=zh_CN'
    const r = await page.evaluate(async (url) => {
      try {
        const resp = await fetch(url, { credentials: 'include' })
        const t = await resp.text()
        return { status: resp.status, head: t.replace(/\s+/g, ' ').slice(0, 240) }
      } catch (e) { return { err: String(e).slice(0, 120) } }
    }, u)
    console.log('\n>>>', p.split('?')[0].split('/').pop(), JSON.stringify(r).slice(0, 300))
  }
} finally {
  await browser.close()
}
