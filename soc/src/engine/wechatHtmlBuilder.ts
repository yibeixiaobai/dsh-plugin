// 公众号行内样式富文本 HTML 构建器（Zero-Dependency Wechat HTML Builder）
import {
  countPlainChars,
  ensureDocImages,
  type BuildArticleOptions,
  type BuildArticleResult,
} from './articleTypes.ts'

export const GZH_THEMES: Record<string, { main: string; light: string; ul: string; gold: string; name: string }> = {
  wenying: { main: '#991B1B', light: '#FEF2F2', ul: '#E7C878', gold: '#B8860B', name: '典雅深红' },
  olive: { main: '#1e1f23', light: '#eeefe9', ul: '#ed7b2f', gold: '#ed7b2f', name: '橄榄手记' },
  graphite: { main: '#52525B', light: '#FAFAFA', ul: '#52525B', gold: '#F97316', name: '石墨极简' },
  moyu: { main: '#059669', light: '#ECFDF5', ul: '#A7F3D0', gold: '#059669', name: '摸鱼绿' },
  redwhite: { main: '#DC2626', light: '#FEF2F2', ul: '#FECACA', gold: '#DC2626', name: '红白色系' },
  zen: { main: '#4A5D52', light: '#F4F6F3', ul: '#B5C8BC', gold: '#4A5D52', name: '留白禅意' },
}

function leaf(text: string): string {
  return `<span leaf="">${text}</span>`
}

/**
 * 构建微信公众号富文本 HTML 格式（零换行、行内样式、span leaf）
 */
export function buildWechatHtmlNative(opts: BuildArticleOptions): BuildArticleResult {
  const {
    doc,
    theme = 'wenying',
    contentImgCount = 2,
    forbidden = [],
    brandImages,
  } = opts

  const idx = Number(doc.index) || 1
  ensureDocImages(doc, idx, contentImgCount)

  const c = GZH_THEMES[theme] || GZH_THEMES.wenying
  const parts: string[] = []

  // 头部品牌图
  if (brandImages?.header?.enabled !== false) {
    parts.push('<p style="text-align:center;margin:0;padding:0;"><img src="__BRAND_TOP__" style="width:100%;max-width:100%;display:block;margin:0 auto;" /></p>')
  }

  // 【中文修复依据】：引言卡片防御，严格执行纯文本有效性校验，杜绝全空字段进入导致输出孤立双引号与空白卡片
  const rawIntro = doc.intro
  if (rawIntro && typeof rawIntro === 'object') {
    const pre = String(rawIntro.pre || '').trim()
    const hl = String(rawIntro.hl || '').trim()
    const post = String(rawIntro.post || '').trim()
    const author = String(rawIntro.author || '').trim()
    const quote = String(rawIntro.quote || rawIntro.text || '').trim()
    const lead = String(rawIntro.lead || '').trim()

    // 1. 标准三段式大双引号导语卡片
    if (pre || hl || post) {
      const hlSpan = hl
        ? `<span style="background:${c.light};color:${c.main};padding:2px 6px;border-radius:3px;font-weight:800;">${leaf(hl)}</span>`
        : ''
      const authorP = author
        ? `<p style="text-align:right;font-size:11px;color:#9CA3AF;margin:8px 0 0;letter-spacing:1px;">${leaf('—— ' + author)}</p>`
        : ''

      parts.push(
        '<section style="margin:14px 0;background:#ffffff;border-radius:8px;box-shadow:0 3px 16px -2px rgba(0,0,0,0.06);padding:20px 18px 16px;border:1px solid #E5E7EB;overflow:hidden;">' +
        `<p style="font-size:26px;color:${c.main};font-family:Georgia,serif;font-weight:900;margin:0;line-height:0.6;">${leaf('"')}</p>` +
        `<p style="font-size:14px;font-weight:700;color:#1C1917;margin:10px 0 8px;line-height:1.75;">${leaf(pre)}${hlSpan}${leaf(post)}</p>` +
        authorP +
        '</section>',
      )
    } else if (quote) {
      // 2. 单句金句卡
      const authorP = author
        ? `<p style="text-align:right;font-size:11px;color:#9CA3AF;margin:8px 0 0;letter-spacing:1px;">${leaf('—— ' + author)}</p>`
        : ''
      parts.push(
        `<section style="margin:14px 0;background:#ffffff;border-radius:8px;border-left:4px solid ${c.main};box-shadow:0 3px 16px -3px rgba(0,0,0,0.06);padding:16px 18px;overflow:hidden;border:1px solid #E5E7EB;border-left:4px solid ${c.main};">` +
        `<p style="font-size:14px;font-weight:700;color:#1C1917;margin:0;line-height:1.8;">${leaf(quote)}</p>` +
        authorP +
        '</section>',
      )
    } else if (lead) {
      // 3. 导言强调段
      parts.push(
        `<p style="margin:0 0 12px 0;padding:9px 14px;background:${c.light};border-left:3px solid ${c.main};border-radius:0 4px 4px 0;font-size:13px;line-height:22px;font-weight:600;color:#1F2937;">` +
        leaf(lead) +
        '</p>',
      )
    }
    // 否则全为空：静默跳过，绝不渲染空 card 或孤立引号
  } else if (typeof rawIntro === 'string' && rawIntro.trim()) {
    parts.push(
      `<p style="margin:0 0 12px 0;padding:9px 14px;background:${c.light};border-left:3px solid ${c.main};border-radius:0 4px 4px 0;font-size:13px;line-height:22px;font-weight:600;color:#1F2937;">` +
      leaf(rawIntro.trim()) +
      '</p>',
    )
  }

  // 【中文修复依据】：目录看点防御，过滤空字符串项，只有包含有效看点时才输出卡片
  if (Array.isArray(doc.toc)) {
    const validItems = doc.toc
      .map(item => String(item || '').trim())
      .filter(item => item.length > 0)
      .slice(0, 3)

    if (validItems.length > 0) {
      const cells = validItems
        .map((item, i) => {
          const num = i < 9 ? `0${i + 1}` : `${i + 1}`
          return (
            `<div style="flex:1;background:${c.light};border-radius:6px;padding:8px 10px;margin-right:${i < validItems.length - 1 ? '8px' : '0'};">` +
            `<p style="font-size:10px;color:${c.main};font-weight:800;margin:0 0 2px;">${leaf(num)}</p>` +
            `<p style="font-size:12px;color:#374151;font-weight:600;margin:0;line-height:1.4;">${leaf(item)}</p>` +
            '</div>'
          )
        })
        .join('')

      parts.push(
        '<section style="margin:16px 0;padding:12px 14px;background:#F9FAFB;border-radius:8px;border:1px solid #F3F4F6;">' +
        `<p style="font-size:11px;color:#6B7280;margin:0 0 8px;font-weight:700;letter-spacing:1px;">${leaf('本文核心看点速览')}</p>` +
        `<div style="display:flex;">${cells}</div>` +
        '</section>',
      )
    }
  }

  // 章节与内容流自适应构建
  let actualImgCount = 0
  let headingCount = 0

  for (const sec of doc.sections || []) {
    const rawSec = sec as any
    const isExplicitP = rawSec.type === 'p' || rawSec.type === 'paragraph'
    const secH2 = String(sec.h2 || '').trim()
    const secText = String(sec.text || rawSec.content || '').trim()
    const hasBlocks = Array.isArray(sec.blocks) && sec.blocks.length > 0
    const hasNumPrefix = /^([0-9]{1,2}[\.\、\s]|一|二|三|四|五|六|七|八|九|十|第[一二三四五六七八九十0-9]+[章节篇部]|STEP|STAGE|CASE|PART)/i.test(secText)
    // 【中文修复依据】：严谨识别真实章节标题。若为扁平段落（type=p 或字数>32且无序号/无blocks），自愈为普通正文，严禁套用 01 徽章
    const isRealHeading = !isExplicitP && (Boolean(secH2) || (secText.length <= 32 && (hasNumPrefix || hasBlocks)))

    if (!isRealHeading && secText) {
      parts.push(`<p style="font-size:14px;line-height:26px;color:#374151;margin:0 0 16px 0;text-align:justify;">${leaf(secText)}</p>`)
    } else if (isRealHeading && (secH2 || secText)) {
      headingCount++
      const numStr = secH2 || (headingCount < 10 ? `0${headingCount}` : String(headingCount))
      parts.push(
        '<section style="margin:28px 0 16px 0;">' +
        '<div style="display:flex;align-items:flex-start;">' +
        `<span style="background:${c.main};color:#ffffff;font-size:11px;font-weight:800;padding:2px 7px;border-radius:4px;margin-right:8px;margin-top:3px;flex-shrink:0;">${leaf(numStr)}</span>` +
        `<h2 style="font-size:17px;font-weight:800;color:#111827;margin:0;letter-spacing:0.5px;line-height:1.4;">${leaf(secText)}</h2>` +
        '</div>' +
        '</section>',
      )
    }

    for (const b of (sec.blocks || []) as any[]) {
      if (b.p) {
        const segs: string[] = []
        const pArr = Array.isArray(b.p) ? b.p : [b.p]
        for (const part of pArr) {
          if (Array.isArray(part) && part.length >= 2) {
            const kind = String(part[0])
            const str = String(part[1])
            if (kind === 'b') {
              segs.push(`<strong style="color:${c.main};font-weight:800;">${leaf(str)}</strong>`)
            } else if (kind === 'hl') {
              segs.push(`<span style="background:${c.light};color:${c.main};padding:1px 4px;border-radius:2px;font-weight:700;">${leaf(str)}</span>`)
            } else if (kind === 'kw') {
              segs.push(`<span style="border-bottom:2px solid ${c.ul};padding-bottom:1px;font-weight:700;">${leaf(str)}</span>`)
            } else {
              segs.push(leaf(str))
            }
          } else {
            segs.push(leaf(String(part)))
          }
        }
        parts.push(`<p style="font-size:14px;line-height:26px;color:#374151;margin:0 0 16px 0;text-align:justify;">${segs.join('')}</p>`)
      } else if (b.lead) {
        const leadStr = String(b.lead).trim()
        if (leadStr) {
          parts.push(`<p style="margin:0 0 14px 0;padding:10px 14px;background:${c.light};border-left:4px solid ${c.main};border-radius:0 4px 4px 0;font-size:13px;line-height:22px;font-weight:600;color:#1F2937;">${leaf(leadStr)}</p>`)
        }
      } else if (b.versus) {
        const v = b.versus
        const title = leaf(v.title || '认知辨析与实践规范')
        const wrong = leaf(v.wrong || '')
        const right = leaf(v.right || '')
        parts.push(
          '<section style="margin:16px 0;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.03);">' +
          `<section style="background:${c.light};padding:9px 14px;border-bottom:1px solid #E5E7EB;"><p style="margin:0;font-size:12px;font-weight:700;color:${c.main};letter-spacing:0.5px;">【 ${title} 】</p></section>` +
          `<section style="padding:10px 14px;background:#F9FAFB;border-bottom:1px solid #E5E7EB;"><p style="margin:0;font-size:13px;line-height:21px;color:#4B5563;"><strong style="color:#374151;">· 常见偏差：</strong>${wrong}</p></section>` +
          `<section style="padding:10px 14px;background:${c.light};"><p style="margin:0;font-size:13px;line-height:21px;color:#1F2937;"><strong style="color:${c.main};">· 实践规范：</strong>${right}</p></section>` +
          '</section>',
        )
      } else if (b.checklist) {
        const ck = b.checklist
        const items = (ck.items || []).map((it: any) => String(it || '').trim()).filter(Boolean)
        if (items.length > 0) {
          const lis = items.map((it: string) => `<p style="margin:5px 0;font-size:13px;line-height:21px;color:#374151;"><span style="color:${c.main};font-weight:900;margin-right:8px;">▪</span>${leaf(it)}</p>`).join('')
          parts.push(
            `<section style="margin:18px 0;padding:14px 16px;background:${c.light};border-radius:8px;border-left:4px solid ${c.main};">` +
            `<p style="margin:0 0 10px;font-size:12px;font-weight:700;color:${c.main};letter-spacing:0.5px;">【 ${leaf(ck.title || '关键自查基线')} 】</p>` +
            lis +
            '</section>',
          )
        }
      } else if (b.warning) {
        const w = b.warning
        const wTitle = leaf(typeof w === 'object' && w.title ? w.title : '避坑特别提醒')
        const wText = leaf(typeof w === 'object' && w.text ? w.text : String(w))
        parts.push(
          '<section style="margin:14px 0;padding:12px 16px;background:#FFFBEB;border-left:4px solid #D97706;border-radius:0 8px 8px 0;box-shadow:0 1px 4px rgba(217,119,6,0.08);">' +
          `<p style="margin:0 0 4px;font-size:12px;font-weight:700;color:#B45309;letter-spacing:0.5px;">【 ${wTitle} 】</p>` +
          `<p style="margin:0;font-size:13px;line-height:21px;color:#78350F;">${wText}</p>` +
          '</section>',
        )
      } else if (b.qa) {
        const qText = leaf(b.qa.q || '')
        const aText = leaf(b.qa.a || '')
        parts.push(
          '<section style="margin:18px 0;background:#ffffff;border:1px solid #E5E7EB;border-radius:8px;padding:14px 16px;box-shadow:0 2px 8px rgba(0,0,0,0.03);">' +
          `<p style="margin:0 0 8px;font-size:13px;font-weight:700;line-height:22px;color:#1C1917;"><span style="display:inline-block;background:${c.main};color:#FFFFFF;font-size:11px;font-weight:800;padding:1px 7px;border-radius:4px;margin-right:8px;">Q</span>${qText}</p>` +
          `<p style="margin:0;font-size:13px;line-height:22px;color:#4B5563;"><span style="display:inline-block;background:${c.light};color:${c.main};font-size:11px;font-weight:800;padding:1px 7px;border-radius:4px;margin-right:8px;border:1px solid ${c.ul};">A</span>${aText}</p>` +
          '</section>',
        )
      } else if (b.stat) {
        const metric = leaf(b.stat.metric || '')
        const label = leaf(b.stat.label || '')
        const descHtml = b.stat.desc ? `<p style="margin:4px 0 0;font-size:12px;color:#6B7280;line-height:18px;">${leaf(b.stat.desc)}</p>` : ''
        parts.push(
          `<section style="margin:18px 0;background:${c.light};border-radius:8px;padding:16px;border:1px solid ${c.ul};text-align:center;">` +
          `<p style="margin:0;font-size:28px;font-weight:900;color:${c.main};letter-spacing:1px;line-height:1.2;">${metric}</p>` +
          `<p style="margin:4px 0 0;font-size:12px;font-weight:700;color:#1C1917;letter-spacing:1px;">${label}</p>` +
          descHtml +
          '</section>',
        )
      } else if (b.quote) {
        const qText = leaf(typeof b.quote === 'object' ? b.quote.text || '' : String(b.quote))
        const author = typeof b.quote === 'object' && b.quote.author ? `<p style="text-align:right;font-size:11px;color:#9CA3AF;margin:8px 0 0;letter-spacing:1px;">${leaf('—— ' + b.quote.author)}</p>` : ''
        parts.push(
          `<section style="margin:16px 0;background:#ffffff;border-radius:8px;border-left:4px solid ${c.main};box-shadow:0 2px 8px rgba(0,0,0,0.03);padding:14px 16px;border:1px solid #E5E7EB;border-left:4px solid ${c.main};">` +
          `<p style="font-size:13px;font-weight:700;color:#1C1917;margin:0;line-height:1.8;">${qText}</p>` +
          author +
          '</section>',
        )
      } else if (b.card) {
        const cardText = String(b.card || '').trim()
        if (cardText) {
          parts.push(
            `<section style="margin:16px 0;background:#F9FAFB;border-left:4px solid ${c.main};padding:12px 14px;border-radius:0 6px 6px 0;">` +
            `<p style="font-size:13px;color:#4B5563;line-height:22px;margin:0;font-weight:600;">${leaf(cardText)}</p>` +
            '</section>',
          )
        }
      } else if (b.card_ul) {
        const titleText = String(b.card_ul.title || '').trim()
        const items = (b.card_ul.items || []).map((it: any) => String(it || '').trim()).filter(Boolean)
        if (titleText || items.length > 0) {
          const itemHtml = items.map((it: string) => `<li style="font-size:13px;line-height:22px;color:#4B5563;margin-bottom:6px;">${leaf(it)}</li>`).join('')
          parts.push(
            '<section style="margin:16px 0;background:#F9FAFB;padding:14px 16px;border-radius:6px;border:1px solid #E5E7EB;">' +
            (titleText ? `<p style="font-size:13px;font-weight:700;color:${c.main};margin:0 0 10px 0;">${leaf(titleText)}</p>` : '') +
            (items.length > 0 ? `<ul style="margin:0;padding-left:18px;">${itemHtml}</ul>` : '') +
            '</section>',
          )
        }
      } else if (b.img) {
        const src = String(b.img.src || '')
        const caption = String(b.img.caption || '').trim()
        parts.push(
          '<section style="margin:20px 0;text-align:center;">' +
          `<img src="${src}" style="width:100%;max-width:100%;border-radius:6px;display:block;margin:0 auto;" />` +
          (caption ? `<p style="font-size:12px;color:#9CA3AF;margin:8px 0 0;text-align:center;">${leaf(caption)}</p>` : '') +
          '</section>',
        )
        actualImgCount++
      } else if (b.hr) {
        parts.push('<hr style="border:0;border-top:1px dashed #E5E7EB;margin:24px 0;" />')
      }
    }
  }

  // 【中文修复依据】：结尾引导语防御，去除空白字符后必须包含有效正文才渲染
  const signOffText = String(doc.sign_off || '').trim()
  if (signOffText) {
    parts.push(
      `<section style="margin:28px 0 20px 0;padding:16px;background:${c.light};border-radius:8px;text-align:center;">` +
      `<p style="font-size:13px;color:${c.main};font-weight:700;line-height:22px;margin:0;">${leaf(signOffText)}</p>` +
      '</section>',
    )
  }

  // 尾部品牌图
  if (brandImages?.footer?.enabled !== false) {
    parts.push('<p style="text-align:center;margin:20px 0 0 0;padding:0;"><img src="__BRAND_BOT__" style="width:auto;max-width:100%;height:auto;object-fit:contain;object-position:center;display:block;margin:0 auto;border-radius:0px;" /></p>')
  }

  const html = parts.join('').replace(/[\r\n]+/g, '')
  const plainChars = countPlainChars(html)

  const problems: string[] = []
  for (const w of forbidden) {
    if (w && html.includes(w)) {
      problems.push(`含禁词: ${w}`)
    }
  }

  return {
    index: idx,
    platform: 'gzh',
    html,
    plain_chars: plainChars,
    img_count: actualImgCount,
    problems,
  }
}
