// Enumerate draft-box numeric appmsgids by paging the UI list, then read each title.
import fs from 'node:fs'
import path from 'node:path'
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

  // The list endpoint returns JSON items when requested with f=json&ajax=1
  const out = await page.evaluate(async (tk) => {
    const res = []
    for (let begin = 0; begin < 200; begin += 20) {
      const u = `https://mp.weixin.qq.com/cgi-bin/appmsg?begin=${begin}&count=20&type=77&action=list_card&token=${tk}&lang=zh_CN&f=json&ajax=1`
      const r = await fetch(u, { credentials: 'include' })
      const j = await r.json()
      const items = j?.app_msg_info?.item || []
      res.push({ begin, cnt: items.length, total: j?.app_msg_info?.file_cnt?.app_msg_cnt,
                 draft_count: j?.app_msg_info?.file_cnt?.draft_count,
                 sample: items.slice(0, 3).map((x) => ({ id: x.appmsgid, t: (x.title || '').slice(0, 40), idx: x.itemidx })) })
      if (items.length < 20) break
    }
    return res
  }, token)
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
