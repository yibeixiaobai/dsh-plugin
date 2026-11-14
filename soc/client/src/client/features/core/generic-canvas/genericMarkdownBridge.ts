import type { GenericSectionBlock } from './genericCanvasTypes.js'

function generateBlockId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}_${Date.now().toString(36)}`
}

/**
 * 清理并反转义 Markdown 内容，防止外部 JSON 字符串包裹或残渣干扰
 */
export function cleanMarkdownContent(raw: string): string {
  if (!raw || typeof raw !== 'string') return ''
  let text = raw.trim()

  // 若首尾带有引号，说明是被 JSON 字符串二次包裹
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1)
  }

  // 恢复转义换行与引号
  return text.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\'/g, "'")
}

/**
 * 将长图文专栏的 Markdown 内容拆分为结构化排版块 (Blocks)
 * 供原地所见即所得画纸逐段独立渲染与直接打字编辑
 */
export function parseMarkdownToGenericBlocks(content: string): GenericSectionBlock[] {
  if (!content || !content.trim()) return []

  let sanitized = cleanMarkdownContent(content)

  // 清除无效空图片与漏网的代码块配置字典
  sanitized = sanitized.replace(/!\[.*?\]\(\s*\)/g, '')
  sanitized = sanitized
    .replace(/```(?:json)?\s*\{[\s\S]*?"cards"[\s\S]*?\}\s*```/gi, '')
    .replace(/```(?:json)?\s*\[[\s\S]*?"role"[\s\S]*?\]\s*```/gi, '')
    .trim()

  const lines = sanitized.split(/\r?\n/)
  const blocks: GenericSectionBlock[] = []
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join('\n').trim()
      if (text) {
        blocks.push({
          id: generateBlockId('blk_p'),
          type: 'p',
          text,
        })
      }
      paragraphBuffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i]
    if (typeof rawLine !== 'string') continue
    const trimmed = rawLine.trim()

    if (!trimmed) {
      flushParagraph()
      continue
    }

    // 1. 品牌头图/尾图占位符
    if (/^!\[.*?\]\(.*?(?:__?BRAND_TOP__?|brand_top).*?\)$/i.test(trimmed)) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_brand_top'),
        type: 'brand_top',
        rawText: trimmed,
      })
      continue
    }

    if (/^!\[.*?\]\(.*?(?:__?BRAND_BOT__?|brand_bot).*?\)$/i.test(trimmed)) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_brand_bot'),
        type: 'brand_bot',
        rawText: trimmed,
      })
      continue
    }

    // 2. 正文插图 ![alt](src)
    const imgMatch = trimmed.match(/^!\[(.*?)\]\((.*?)\)$/)
    if (imgMatch && imgMatch[2]) {
      flushParagraph()
      const alt = imgMatch[1] || ''
      const rawTarget = imgMatch[2].trim()
      const urlMatch = rawTarget.match(/^(\S+)(?:\s+["'](.*)["'])?$/)
      const src = (urlMatch && urlMatch[1]) ? urlMatch[1] : rawTarget

      // 【中文修复依据】：严禁将封面图作为正文插图解析！封面由画布顶部专用展位呈现
      const isCover =
        alt.includes('封面') ||
        /(?:cover_\d+|cover\.|IMG_COVER|COVER_IMG|_COVER_)/i.test(src)
      if (isCover) {
        continue
      }

      blocks.push({
        id: generateBlockId('blk_img'),
        type: 'img',
        alt,
        src,
        rawText: trimmed,
      })
      continue
    }

    // 3. 标题
    if (trimmed.startsWith('#### ')) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_h4'),
        type: 'h4',
        text: trimmed.replace(/^####\s+/, '').trim(),
      })
      continue
    }
    if (trimmed.startsWith('### ')) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_h3'),
        type: 'h3',
        text: trimmed.replace(/^###\s+/, '').trim(),
      })
      continue
    }
    if (trimmed.startsWith('## ')) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_h2'),
        type: 'h2',
        text: trimmed.replace(/^##\s+/, '').trim(),
      })
      continue
    }
    if (trimmed.startsWith('# ')) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_h1'),
        type: 'h1',
        text: trimmed.replace(/^#\s+/, '').trim(),
      })
      continue
    }

    // 4. 引用块
    if (trimmed.startsWith('>')) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_quote'),
        type: 'blockquote',
        text: trimmed.replace(/^>\s*/, '').trim(),
      })
      continue
    }

    // 5. 列表项
    const listMatch = trimmed.match(/^([-*]|\d+\.)\s+(.+)$/)
    if (listMatch && listMatch[2]) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_li'),
        type: 'li',
        text: listMatch[2].trim(),
      })
      continue
    }

    // 6. 分割线
    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph()
      blocks.push({
        id: generateBlockId('blk_hr'),
        type: 'hr',
      })
      continue
    }

    // 7. 普通段落行（累积入缓冲）
    paragraphBuffer.push(trimmed)
  }

  flushParagraph()
  return blocks
}

/**
 * 将排版块 (Blocks) 重新编译组合为规范的标准 Markdown
 * 实现用户原地打字修改后实时无缝同步回文章数据源与持久化沙箱
 */
export function compileGenericBlocksToMarkdown(blocks: GenericSectionBlock[]): string {
  if (!blocks || blocks.length === 0) return ''

  const lines: string[] = []

  for (const b of blocks) {
    switch (b.type) {
      case 'brand_top':
        lines.push('![头部品牌图](__BRAND_TOP__)', '')
        break
      case 'brand_bot':
        lines.push('![尾部品牌图](__BRAND_BOT__)', '')
        break
      case 'h1':
        if (b.text?.trim()) lines.push(`# ${b.text.trim()}`, '')
        break
      case 'h2':
        if (b.text?.trim()) lines.push(`## ${b.text.trim()}`, '')
        break
      case 'h3':
        if (b.text?.trim()) lines.push(`### ${b.text.trim()}`, '')
        break
      case 'h4':
        if (b.text?.trim()) lines.push(`#### ${b.text.trim()}`, '')
        break
      case 'blockquote':
        if (b.text?.trim()) lines.push(`> ${b.text.trim()}`, '')
        break
      case 'li':
        if (b.text?.trim()) lines.push(`- ${b.text.trim()}`, '')
        break
      case 'img':
        if (b.src) lines.push(`![${b.alt || ''}](${b.src})`, '')
        break
      case 'hr':
        lines.push('---', '')
        break
      case 'p':
      default:
        if (b.text?.trim()) lines.push(b.text.trim(), '')
        break
    }
  }

  return lines.join('\n').trimEnd() + '\n'
}
