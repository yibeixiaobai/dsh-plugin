/**
 * 浏览器与网络真实素材图片搜索器 (Browser & Web Image Searcher)
 * 用于在文章/笔记插图中混合插入网络真实素材图片，打破全篇 100% 依赖 AI 绘图的机器特征。
 * 策略：免登搜索引擎协议极速探测 + 受控无头浏览器渲染保底。
 */
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import https from 'node:https'
import { DEFAULT_DESKTOP_CHROME_UA } from '../stealth/fingerprintProfile.ts'
import { findBrowserExecutable, launchBrowserSafely } from '../zhihu.ts'
import type { Config } from '../config.ts'

export interface ImageSearchResult {
  success: boolean
  localPath?: string
  sourceUrl?: string
  width?: number
  height?: number
  error?: string
}

export interface ImageSearchOptions {
  minWidth?: number
  minHeight?: number
  timeoutMs?: number
  cfg?: Config
  userDataDir?: string
  articleIndex?: number
  usedUrls?: Set<string>
}

/**
 * 校验下载的二进制数据是否为合法的图片格式 (JPEG / PNG / WebP)
 */
function isValidImageBuffer(buf: Buffer): boolean {
  if (!buf || buf.length < 1024) return false
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true
  // WEBP: RIFF....WEBP
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return true
  return false
}

/**
 * 安全下载网络图片至本地文件（支持跟随最多 3 次 30x 重定向）
 */
function downloadFile(url: string, destPath: string, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    let redirects = 0
    const fetchUrl = (currentUrl: string) => {
      if (redirects++ > 3) {
        resolve(false)
        return
      }

      const client = currentUrl.startsWith('https:') ? https : http
      const req = client.get(
        currentUrl,
        {
          headers: {
            'User-Agent': DEFAULT_DESKTOP_CHROME_UA,
            Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
            Referer: 'https://www.bing.com/',
          },
          timeout: timeoutMs,
        },
        (res) => {
          if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode)) {
            const loc = res.headers.location
            if (loc) {
              const next = new URL(loc, currentUrl).toString()
              fetchUrl(next)
              return
            }
          }

          if (res.statusCode !== 200) {
            resolve(false)
            return
          }

          const chunks: Buffer[] = []
          res.on('data', chunk => chunks.push(chunk))
          res.on('end', () => {
            const buf = Buffer.concat(chunks)
            if (isValidImageBuffer(buf)) {
              try {
                fs.mkdirSync(path.dirname(destPath), { recursive: true })
                fs.writeFileSync(destPath, buf)
                resolve(true)
              } catch {
                resolve(false)
              }
            } else {
              resolve(false)
            }
          })
        },
      )

      req.on('error', () => resolve(false))
      req.on('timeout', () => {
        req.destroy()
        resolve(false)
      })
    }

    fetchUrl(url)
  })
}

/**
 * 通过免登 Bing 图片协议快速解析候选真实图片 URL
 * 【中文修复依据】：Bing 图片搜索页面返回的图片属性为 HTML 属性 m="..."，
 * 其中的双引号被转义为 HTML 实体 &quot;（如 &quot;murl&quot;:&quot;https:...&quot;）。
 * 必须使用兼容原生双引号与 &quot; 实体的正则进行提取，并对 URL 中的 &amp; 实体及反斜杠进行解码归一化。
 */
export async function searchByProtocol(keyword: string): Promise<string[]> {
  const searchUrl = `https://cn.bing.com/images/search?q=${encodeURIComponent(keyword)}&first=1&scenario=ImageBasicHover`
  return new Promise((resolve) => {
    const req = https.get(
      searchUrl,
      {
        headers: {
          'User-Agent': DEFAULT_DESKTOP_CHROME_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          resolve([])
          return
        }
        let html = ''
        res.on('data', (chunk) => {
          html += chunk
        })
        res.on('end', () => {
          const urls: string[] = []
          // 匹配 murl（高清原图）：同时兼容 &quot;murl&quot; 与 "murl"
          const murlMatches =
            html.match(
              /(?:&quot;|")murl(?:&quot;|"):\s*(?:&quot;|")(https?:\\?\/\\?[^"&]+)(?:&quot;|")/gi,
            ) || []
          for (const m of murlMatches) {
            try {
              const matched = m.match(/(?:&quot;|")murl(?:&quot;|"):\s*(?:&quot;|")([^"&]+)/i)
              if (matched && matched[1]) {
                // 解码 URL 中的转义斜杠与 HTML 实体
                const u = matched[1].replace(/\\\/|\//g, '/').replace(/&amp;/g, '&');
                if (u.startsWith('http') && !u.includes('.svg')) {
                  urls.push(u)
                }
              }
            } catch {}
          }
          resolve(urls.slice(0, 8))
        })
      },
    )
    req.on('error', () => resolve([]))
    req.on('timeout', () => {
      req.destroy()
      resolve([])
    })
  })
}

/**
 * 通过受控无头浏览器渲染图片搜索页保底抓取候选真实图片
 */
async function searchByBrowser(
  keyword: string,
  cfg?: Config,
  profileDir?: string,
): Promise<string[]> {
  if (!cfg || !profileDir) return []
  try {
    const browser = await launchBrowserSafely({
      executablePath: findBrowserExecutable(cfg),
      headless: true,
      userDataDir: profileDir,
      defaultViewport: { width: 1440, height: 900 },
      args: ['--disable-blink-features=AutomationControlled'],
      platformDisplayName: '真实图片搜索器',
    })

    try {
      const page = await browser.newPage()
      const targetUrl = `https://cn.bing.com/images/search?q=${encodeURIComponent(keyword)}&first=1`
      await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await new Promise(r => setTimeout(r, 2000))

      const imgUrls: string[] = await page.evaluate(() => {
        const results: string[] = []
        const links = Array.from(document.querySelectorAll('a.iusc, a[m]'))
        for (const a of links) {
          const mAttr = a.getAttribute('m')
          if (mAttr) {
            try {
              const parsed = JSON.parse(mAttr)
              if (parsed.murl && parsed.murl.startsWith('http')) {
                results.push(parsed.murl)
              }
            } catch {}
          }
        }
        return results
      })
      return imgUrls.slice(0, 8)
    } finally {
      await browser.close().catch(() => {})
    }
  } catch {
    return []
  }
}

/**
 * 执行网络真实素材图片搜索并下载至指定产物路径
 * @param keyword 搜索关键词（如：“深度学习Transformer架构图”、“故宫雪景摄影”）
 * @param outputFile 输出目标文件绝对路径
 * @param options 搜索与下载配置选项
 */
export async function searchAndDownloadWebImage(
  keyword: string,
  outputFile: string,
  options: ImageSearchOptions = {},
): Promise<ImageSearchResult> {
  const cleanKeyword = keyword.replace(/[#\s/\\<>:"|?*]/g, ' ').trim()
  if (!cleanKeyword) {
    return { success: false, error: '搜索关键词不能为空' }
  }

  // 1. 协议通道快速探测
  let candidateUrls = await searchByProtocol(cleanKeyword)

  // 2. 协议通道未取到时，回退至受控无头浏览器渲染抓取
  if (candidateUrls.length === 0 && options.cfg && options.userDataDir) {
    candidateUrls = await searchByBrowser(cleanKeyword, options.cfg, options.userDataDir)
  }

  if (candidateUrls.length === 0) {
    return {
      success: false,
      error: `未通过网络搜索到关键词「${cleanKeyword}」的合适真实素材`,
    }
  }

  // 3. [中文修复依据]：按文章序号偏移打散，并剔除批次已用 URL，确保多篇文章插图绝不雷同
  const articleIndex = Math.max(1, options.articleIndex ?? 1)
  const totalCandidates = candidateUrls.length
  const offset = (articleIndex - 1) % totalCandidates
  const rotatedUrls = [
    ...candidateUrls.slice(offset),
    ...candidateUrls.slice(0, offset),
  ]

  for (const imgUrl of rotatedUrls) {
    if (options.usedUrls && options.usedUrls.has(imgUrl)) {
      continue
    }
    const ok = await downloadFile(imgUrl, outputFile, options.timeoutMs || 15000)
    if (ok) {
      options.usedUrls?.add(imgUrl)
      return {
        success: true,
        localPath: outputFile,
        sourceUrl: imgUrl,
      }
    }
  }

  return {
    success: false,
    error: `关键词「${cleanKeyword}」找到了候选图，但下载或图片格式校验未通过`,
  }
}
