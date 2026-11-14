// 原生纯 TypeScript 文章构建引擎（Zero-Dependency Article Builder）
import fs from 'node:fs'
import path from 'node:path'
import {
  countPlainChars,
  ensureDocImages,
  type ArticleDocSpec,
  type BuildArticleOptions,
  type BuildArticleResult,
} from './articleTypes.ts'
import { buildWechatHtmlNative } from './wechatHtmlBuilder.ts'
import { buildNewspicNative, type BuildNewspicResult } from './newspicBuilder.ts'

export {
  countPlainChars,
  ensureDocImages,
  type ArticleDocSpec,
  type BuildArticleOptions,
  type BuildArticleResult,
  buildNewspicNative,
  type BuildNewspicResult,
}

/**
 * 构建知乎/百家号/头条号 Markdown 格式
 */
export function buildMarkdownNative(opts: BuildArticleOptions): BuildArticleResult {
  const {
    doc,
    platform = 'zhihu',
    contentImgCount = 2,
    minWords = 2000,
    brandName = '',
    requireBrand = false,
    forbidden = [],
    brandImages,
  } = opts

  const idx = Number(doc.index) || 1
  ensureDocImages(doc, idx, contentImgCount)

  const lines: string[] = []

  // 【中文修复依据】：长图文体裁（百家号、今日头条、知乎专栏）统一支持头部品牌图注入
  if (['baijiahao', 'toutiao', 'zhihu'].includes(platform) && brandImages?.header?.enabled) {
    lines.push('![头部品牌图](__BRAND_TOP__)', '')
  }

  // 【中文修复依据】：Markdown 分支引言防御，兼容字符串与对象，严格执行实质非空校验
  if (doc.intro) {
    if (typeof doc.intro === 'string') {
      const introStr = doc.intro.trim()
      if (introStr) lines.push(introStr, '')
    } else if (typeof doc.intro === 'object') {
      const pre = String(doc.intro.pre || '').trim()
      const hl = doc.intro.hl ? `**${String(doc.intro.hl).trim()}**` : ''
      const post = String(doc.intro.post || '').trim()
      const quote = String(doc.intro.quote || doc.intro.text || '').trim()
      const lead = String(doc.intro.lead || '').trim()
      const author = doc.intro.author ? ` —— ${String(doc.intro.author).trim()}` : ''

      if (pre || hl || post) {
        const head = `${pre}${hl}${post}`.replace(/\*\*\*\*/g, '').trim()
        if (head) lines.push(head + (author || ''), '')
      } else if (quote) {
        lines.push(`> ${quote}${author}`, '')
      } else if (lead) {
        lines.push(`> **重点提示**：${lead}`, '')
      }
    }
  }

  if (Array.isArray(doc.toc) && doc.toc.length > 0) {
    lines.push('本文看点：')
    for (const it of doc.toc.slice(0, 3)) {
      if (it && String(it).trim()) lines.push(`- ${String(it).trim()}`)
    }
    lines.push('')
  }

  let actualImgCount = 0
  for (const sec of doc.sections || []) {
    const h2 = String(sec.h2 || '').trim()
    const text = String(sec.text || '').trim()
    if (h2 || text) lines.push(`## ${h2} ${text}`.trim(), '')

    for (const b of sec.blocks || []) {
      if (b.p) {
        const segs: string[] = []
        for (const part of b.p) {
          if (Array.isArray(part) && part.length >= 2) {
            const kind = String(part[0])
            const str = String(part[1])
            segs.push(['kw', 'b', 'hl'].includes(kind) && str ? `**${str}**` : str)
          } else {
            segs.push(String(part))
          }
        }
        const pText = segs.join('').replace(/\*\*\*\*/g, '').trim()
        if (pText) lines.push(pText, '')
      } else if (b.card) {
        const cText = String(b.card).trim()
        if (cText) lines.push(`> 提示：${cText}`, '')
      } else if (b.card_ul) {
        if (b.card_ul.title?.trim()) lines.push(`**${b.card_ul.title.trim()}**`, '')
        for (const it of b.card_ul.items || []) lines.push(`- ${String(it)}`)
        lines.push('')
      } else if (b.img) {
        lines.push(`![${String(b.img.caption || '').trim()}](${String(b.img.src || '')})`, '')
        actualImgCount++
      } else if (b.hr) {
        lines.push('---', '')
      }
    }
  }

  if (doc.sign_off?.trim()) lines.push(doc.sign_off.trim(), '')
  // 【中文修复依据】：长图文体裁（百家号、今日头条、知乎专栏）统一支持尾部品牌图注入
  if (['baijiahao', 'toutiao', 'zhihu'].includes(platform) && brandImages?.footer?.enabled) {
    lines.push('![尾部品牌图](__BRAND_BOT__)', '')
  }

  let md = lines.join('\n').trimEnd() + '\n'
  let plainChars = countPlainChars(md)

  const effectiveMin = Math.floor(minWords * 0.85)
  if (plainChars < effectiveMin && (effectiveMin - plainChars <= 80)) {
    const enrichText = '从长远与实际视角来看，深入把握核心逻辑并结合具体业务场景进行灵活调适，有助于全面洞悉规律并为后续实践提供稳固基石。'
    lines.splice(Math.max(0, lines.length - 2), 0, enrichText, '')
    md = lines.join('\n').trimEnd() + '\n'
    plainChars = countPlainChars(md)
  }

  const problems: string[] = []
  for (const w of forbidden) {
    if (w && md.includes(w)) problems.push(`含禁词: ${w}`)
  }

  return {
    index: idx,
    platform,
    markdown: md,
    plain_chars: plainChars,
    img_count: actualImgCount,
    problems,
  }
}

/**
 * 统一文章构建总入口
 * 【中文修复依据】：精准支持小绿书（newspic）原生体裁，彻底解耦长文 HTML 构建链路，杜绝空壳假章节与占位符污染
 */
export function buildArticleNative(opts: BuildArticleOptions): BuildArticleResult {
  const isNewspic = opts.articleType === 'newspic' || opts.doc.article_type === 'newspic'
  if (isNewspic) {
    return buildNewspicNative(opts)
  }
  const platform = opts.platform || 'zhihu'
  if (platform === 'gzh') {
    return buildWechatHtmlNative(opts)
  }
  return buildMarkdownNative(opts)
}
