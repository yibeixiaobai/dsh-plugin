// 【中文修复依据】：微信小绿书原生纯文本构建器，彻底拔除长文假章节与「01正文正文示意图」占位符，支持纯文本段落、话题标签与结构化多图卡片
import { countPlainChars, type BuildArticleOptions, type BuildArticleResult } from './articleTypes.ts'

export interface NewspicCardItem {
  index: number
  role: 'cover' | 'card'
  title?: string
  prompt?: string
}

export interface BuildNewspicResult extends BuildArticleResult {
  article_type: 'newspic'
  title: string
  content: string
  cards: NewspicCardItem[]
}

/**
 * 原生小绿书文章构建器
 * 严格按照微信官方图片消息（Photo Post）标准：
 * 1. 标题强制 ≤ 32 字符；
 * 2. 正文为纯文本（严禁任何 HTML 标签），保留段落空行与 #话题标签；
 * 3. 产出结构化 cards 数组用于 3:4 竖版多图画廊生图。
 */
export function buildNewspicNative(opts: BuildArticleOptions): BuildNewspicResult {
  const { doc, forbidden = [], brandName, requireBrand, minWords = 100 } = opts
  const rawIdx = Number(doc.index)
  const idx = Number.isInteger(rawIdx) && rawIdx >= 1 ? rawIdx : 1

  // 1. 校验与清洗标题
  let title = String(doc.title || (doc as any).topic || '').trim()
  if (!title) {
    throw new Error('【小绿书构建安全拦截】：缺少有效业务标题（title），小绿书严禁空标题生成！')
  }
  // 微信小绿书标题规范：推荐 20 字以内，上限 32 字
  if (title.length > 32) {
    title = title.slice(0, 32).trim()
  }

  // 2. 校验与清洗纯文本正文
  let content = String(
    doc.content ||
      (doc as any).text ||
      (typeof doc.intro === 'string' ? doc.intro : '') ||
      (doc.intro && typeof doc.intro === 'object' ? (doc.intro as any).lead || (doc.intro as any).quote || '' : '') ||
      '',
  ).trim()

  // 若模型在 doc.sections 中提供了段落，自愈拼接为高质量纯文本
  if (!content && Array.isArray(doc.sections) && doc.sections.length > 0) {
    const textLines: string[] = []
    for (const sec of doc.sections) {
      const secH2 = sec.h2 ? `${sec.h2} ` : ''
      const secTitle = sec.text ? `${secH2}${sec.text}`.trim() : ''
      if (secTitle && secTitle !== '正文' && secTitle !== '01') {
        textLines.push(`📌 ${secTitle}`)
      }
      for (const b of sec.blocks || []) {
        if (b.p) {
          const pStr = b.p.map(item => (Array.isArray(item) ? item[1] || item[0] : String(item))).join('').trim()
          if (pStr) textLines.push(pStr)
        } else if (b.card) {
          const cStr = String(b.card).trim()
          if (cStr) textLines.push(`💡 提示：${cStr}`)
        } else if (b.card_ul) {
          if (b.card_ul.title?.trim()) textLines.push(`✅ ${b.card_ul.title.trim()}`)
          for (const it of b.card_ul.items || []) {
            const itStr = String(it).trim()
            if (itStr) textLines.push(`• ${itStr}`)
          }
        }
      }
      textLines.push('')
    }
    content = textLines.join('\n').trim()
  }

  // 彻底剔除任何残留的 HTML 标签
  if (content.includes('<') && content.includes('>')) {
    content = content.replace(/<[^>]+>/g, '').trim()
  }
  // 剥除长文可能残留的假占位符
  content = content.replace(/IMG_A\d+_\d+/g, '').replace(/正文示意图/g, '').trim()

  // 话题标签保证：若末尾无话题，自动补充核心话题
  const hasTag = /#([^\s#]+)/.test(content)
  if (!hasTag) {
    const defaultTag = title.length > 6 ? `#${title.slice(0, 10).replace(/[,，、\s]/g, '')}` : '#干货分享'
    content = `${content}\n\n${defaultTag} #新媒体干货`
  }

  // 3. 卡片列表规范化
  const rawCards = Array.isArray((doc as any).cards)
    ? (doc as any).cards
    : Array.isArray((doc as any).visual_blueprint)
      ? (doc as any).visual_blueprint
      : []

  const targetCardCount = Math.max(2, Math.min(8, opts.contentImgCount || 4))
  const cards: NewspicCardItem[] = []

  for (let cIdx = 0; cIdx < targetCardCount; cIdx++) {
    const cardNum = cIdx + 1
    const rawCard = rawCards[cIdx] || {}
    const isCover = cardNum === 1
    cards.push({
      index: cardNum,
      role: isCover ? 'cover' : 'card',
      title: rawCard.title || (isCover ? title : `核心要点拆解 0${cardNum - 1}`),
      prompt: rawCard.prompt || rawCard.generation_prompt || rawCard.generationPrompt || '',
    })
  }

  const plainChars = countPlainChars(content)
  const problems: string[] = []

  if (plainChars < minWords) {
    problems.push(`字数偏少: ${plainChars} 字 (要求至少 ${minWords} 字)`)
  }

  if (requireBrand && brandName && !content.includes(brandName)) {
    problems.push(`正文未包含必须的品牌名: ${brandName}`)
  }

  for (const w of forbidden) {
    if (w && (content.includes(w) || title.includes(w))) {
      problems.push(`含禁词: ${w}`)
    }
  }

  return {
    index: idx,
    platform: 'gzh',
    article_type: 'newspic',
    title,
    content,
    cards,
    plain_chars: plainChars,
    img_count: cards.length,
    problems,
  }
}
