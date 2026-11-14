// 文章构建器共享类型定义与纯文本工具函数（Zero-Dependency Article Types）

export interface ArticleDocIntro {
  pre?: string
  hl?: string
  post?: string
  author?: string
  quote?: string
  text?: string
  lead?: string
}

export interface ArticleDocBlock {
  p?: Array<string | [string, string]>
  card?: string
  card_ul?: {
    title?: string
    items?: string[]
  }
  img?: {
    src?: string
    caption?: string
  }
  hr?: boolean
}

export interface ArticleDocSection {
  h2?: string
  text?: string
  blocks?: ArticleDocBlock[]
}

export interface ArticleDocSpec {
  index: number | string
  theme?: string
  article_type?: 'news' | 'newspic'
  title?: string
  content?: string
  intro?: ArticleDocIntro | string
  toc?: string[]
  sections?: ArticleDocSection[]
  cards?: any[]
  visual_blueprint?: any[]
  sign_off?: string
}

export interface BuildArticleOptions {
  doc: ArticleDocSpec
  platform?: string
  articleType?: 'news' | 'newspic'
  contentImgCount?: number
  minWords?: number
  brandName?: string
  requireBrand?: boolean
  forbidden?: string[]
  theme?: string
  typography?: Record<string, string>
  brandImages?: {
    header?: { enabled?: boolean; file?: string; width?: number; height?: number }
    footer?: { enabled?: boolean; file?: string; width?: number; height?: number }
  }
}

export interface BuildArticleResult {
  index: number
  platform: string
  article_type?: 'news' | 'newspic'
  title?: string
  content?: string
  cards?: any[]
  markdown?: string
  html?: string
  plain_chars: number
  img_count: number
  problems: string[]
}

/** 剥离 Markdown 与 HTML 语法计算纯文字字数 */
export function countPlainChars(text: string): number {
  let txt = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  txt = txt.replace(/<[^>]+>/g, '')
  txt = txt.replace(/^#{1,6}\s+/gm, '')
  txt = txt.replace(/^>\s?/gm, '')
  txt = txt.replace(/^\s*[-*]\s+/gm, '')
  txt = txt.replace(/^\s*-{3,}\s*$/gm, '')
  txt = txt.replace(/\*\*/g, '')
  return txt.replace(/\s+/g, '').length
}

/** 确保 doc 中配图占位符规范自愈 */
export function ensureDocImages(doc: ArticleDocSpec, idx: number, targetCount: number): void {
  if (!Array.isArray(doc.sections) || doc.sections.length === 0) {
    doc.sections = [{ h2: '01', text: '正文', blocks: [] }]
  }

  const sections = doc.sections
  const imgRefs: Array<{ secIdx: number; blockIdx: number; img: { src?: string; caption?: string } }> = []

  for (let sIdx = 0; sIdx < sections.length; sIdx++) {
    const sec = sections[sIdx]
    if (!Array.isArray(sec.blocks)) sec.blocks = []
    for (let bIdx = 0; bIdx < sec.blocks.length; bIdx++) {
      const b = sec.blocks[bIdx]
      if (b && typeof b === 'object' && b.img) {
        imgRefs.push({ secIdx: sIdx, blockIdx: bIdx, img: b.img })
      }
    }
  }

  if (targetCount <= 0) {
    for (const sec of sections) {
      sec.blocks = (sec.blocks || []).filter(b => !(b && typeof b === 'object' && b.img))
    }
    return
  }

  if (imgRefs.length > targetCount) {
    const surplusSet = new Set(imgRefs.slice(targetCount).map(item => item.img))
    for (const sec of sections) {
      sec.blocks = (sec.blocks || []).filter(b => !(b && b.img && surplusSet.has(b.img)))
    }
    imgRefs.length = targetCount
  }

  for (let j = 0; j < imgRefs.length; j++) {
    const item = imgRefs[j]
    item.img.src = `IMG_A${idx}_${j + 1}`
    if (!item.img.caption) item.img.caption = `配图${j + 1}`
  }

  const needed = targetCount - imgRefs.length
  if (needed > 0) {
    const existingSecIndices = new Set(imgRefs.map(item => item.secIdx))
    const numSecs = sections.length
    for (let step = 0; step < needed; step++) {
      const j = imgRefs.length + step + 1
      const src = `IMG_A${idx}_${j}`
      let candidateSec: number | null = null
      for (let sIdx = 0; sIdx < numSecs; sIdx++) {
        if (!existingSecIndices.has(sIdx)) {
          candidateSec = sIdx
          break
        }
      }
      if (candidateSec === null) {
        candidateSec = Math.min(numSecs - 1, Math.floor(((j - 1) * numSecs) / targetCount))
      }
      existingSecIndices.add(candidateSec)

      const secTitle = String(sections[candidateSec].text || '').trim()
      const caption = secTitle ? `${secTitle}示意图` : `配图${j}`
      const imgBlock: ArticleDocBlock = { img: { src, caption } }

      const secBlocks = sections[candidateSec].blocks || []
      if (secBlocks.length >= 2) {
        secBlocks.splice(Math.min(secBlocks.length, 2), 0, imgBlock)
      } else {
        secBlocks.push(imgBlock)
      }
    }
  }
}
