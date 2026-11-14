// 原生纯 TypeScript 排版规范与违禁词校验引擎（Zero-Dependency HTML Validator）
// 彻底摆脱对外部 Python check_html.py 的依赖
import fs from 'node:fs'
import path from 'node:path'
import { countPlainChars } from './articleTypes.ts'

export interface ValidateHtmlOptions {
  content?: string
  filePath?: string
  platform?: string
  minWords?: number
  brandName?: string
  requireBrand?: boolean
  forbidden?: string[]
  expectedImgCount?: number
}

export interface ValidateHtmlResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  plain_chars: number
  img_count: number
  ghost_cards_detected?: number
}

/**
 * 【中文修复依据】：扫描并清洗单行 HTML 中的幽灵空白卡片（即除了单纯双引号、装饰标点或空白外无实质文字的 section）
 */
export function sanitizeGhostEmptySections(html: string): { cleanHtml: string; ghostCount: number } {
  if (!html || !html.includes('<section')) {
    return { cleanHtml: html, ghostCount: 0 }
  }
  let ghostCount = 0
  const cleanHtml = html.replace(/<section\b[^>]*>([\s\S]*?)<\/section>/gi, (match, inner) => {
    // 包含图片、SVG、多媒体或表单的卡片保留
    if (/<(?:img|svg|input|table|canvas)\b/i.test(inner)) {
      return match
    }
    // 提取纯文本内容（剥离所有 HTML 标签）
    const textOnly = inner.replace(/<[^>]+>/g, '').trim()
    // 去除常见装饰性标点符号（包括英文双引号、中文双引号、单引号、破折号、全半角空格等）
    const substantiveText = textOnly.replace(/["'“”‘’「」『』—\s]/g, '').trim()
    // 如果去除标点后没有任何汉字、字母或数字，视为幽灵空白卡片，予以安全清洗
    if (substantiveText.length === 0) {
      ghostCount++
      return ''
    }
    // 【中文修复依据】：特殊情况防御，若为大双引号引言卡片（含 Georgia 字体或 line-height:0.6），但去除了作者署名后正文金句为空，同样判定为残缺空白卡片予以安全清洗
    if (/Georgia,serif|line-height:\s*0\.6/i.test(inner)) {
      const bodyWithoutAuthor = textOnly.replace(/——\s*[\S\s]*$/, '').replace(/["'“”‘’「」『』\s]/g, '').trim()
      if (bodyWithoutAuthor.length === 0) {
        ghostCount++
        return ''
      }
    }
    return match
  })
  return { cleanHtml, ghostCount }
}

/**
 * 校验文章内容（HTML 或 Markdown）排版合规性与违禁词
 */
export function validateArticleContentNative(opts: ValidateHtmlOptions): ValidateHtmlResult {
  const {
    filePath,
    platform = 'zhihu',
    minWords = 1500,
    brandName = '',
    requireBrand = false,
    forbidden = [],
    expectedImgCount = 2,
  } = opts

  let text = opts.content || ''
  if (!text && filePath && fs.existsSync(filePath)) {
    try {
      text = fs.readFileSync(filePath, 'utf-8')
    } catch {
      return {
        ok: false,
        errors: [`无法读取待校验文件: ${filePath}`],
        warnings: [],
        plain_chars: 0,
        img_count: 0,
      }
    }
  }

  const errors: string[] = []
  const warnings: string[] = []
  const isGzh = platform === 'gzh'

  // 1. 公众号零换行铁律
  if (isGzh && /[\r\n]/.test(text)) {
    warnings.push('公众号文章 HTML 中存在多余换行符，已在渲染层自动清洗为单行')
  }

  // 2. 正文字数核算
  const plainChars = countPlainChars(text)
  const effectiveMin = Math.floor(minWords * 0.85)
  if (plainChars < effectiveMin) {
    errors.push(`正文纯文字字数不足: ${plainChars} < ${effectiveMin}（设定下限 ${minWords} 字，允许 15% 容差）`)
  }

  // 3. 配图占位符统计
  let imgCount = 0
  if (isGzh) {
    const imgMatches = text.match(/<img\s+[^>]*>/gi) || []
    imgCount = imgMatches.length
  } else {
    const mdImgMatches = text.match(/!\[[^\]]*\]\([^)]+\)/g) || []
    imgCount = mdImgMatches.length
  }

  if (expectedImgCount > 0 && imgCount < expectedImgCount) {
    warnings.push(`配图数量（${imgCount}）略低于预期（${expectedImgCount}）`)
  }

  // 4. 品牌词校验
  if (requireBrand && brandName && !text.includes(brandName)) {
    errors.push(`正文缺少必需的品牌引导语: "${brandName}"`)
  }

  // 5. 违禁词扫描
  for (const fb of forbidden) {
    if (fb && text.includes(fb)) {
      errors.push(`文章包含违禁词: "${fb}"`)
    }
  }

  // 6. 占位符残留检测 (发布前若有未替换的占位符应给出警告)
  const unreplaced = text.match(/IMG_A\d+_\d+/g)
  if (unreplaced && unreplaced.length > 0) {
    warnings.push(`检测到待上传图片占位符: ${Array.from(new Set(unreplaced)).join(', ')}`)
  }

  // 7. 【中文修复依据】：幽灵空白卡片严格检测，阻断包含无文字空卡片或孤立双引号的 HTML
  let ghostDetected = 0
  if (isGzh) {
    const { ghostCount } = sanitizeGhostEmptySections(text)
    if (ghostCount > 0) {
      ghostDetected = ghostCount
      errors.push(`排版安全拦截：检测到 ${ghostCount} 处无实质正文内容的幽灵空白卡片或孤立双引号组件，违反排版防空白铁律`)
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    plain_chars: plainChars,
    img_count: imgCount,
    ghost_cards_detected: ghostDetected,
  }
}
