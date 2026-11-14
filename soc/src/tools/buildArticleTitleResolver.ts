import { isInvalidPlaceholderTitle } from '../title-adapter.ts'

/**
 * 【中文修复依据】：彻底废除「文章_${idx}」伪造标题兜底，严格解析真实业务标题；若缺失则从正文小节自愈提取，严防脏数据污染沙箱与下游生图
 */
export function resolveSafeArticleTitle(
  builtTitle: unknown,
  doc: Record<string, unknown>,
  idx: number,
  platform: string,
): string {
  const candidates = [
    typeof builtTitle === 'string' ? builtTitle.trim() : '',
    typeof doc.title === 'string' ? doc.title.trim() : '',
    typeof doc.topic === 'string' ? doc.topic.trim() : '',
    typeof doc.name === 'string' ? doc.name.trim() : '',
    typeof doc.subject === 'string' ? doc.subject.trim() : '',
  ].filter(Boolean)

  for (const c of candidates) {
    if (!isInvalidPlaceholderTitle(c)) {
      return c
    }
  }

  // 尝试从 doc.sections[0].text 自愈提取主题
  if (Array.isArray(doc.sections) && doc.sections[0] && typeof doc.sections[0].text === 'string') {
    const sectionText = doc.sections[0].text.trim()
    if (sectionText && !isInvalidPlaceholderTitle(sectionText)) {
      return sectionText
    }
  }

  throw new Error(
    '【文章构建安全拦截】：第 ' +
      idx +
      ' 篇文章缺少有效业务标题（title），严禁使用「文章_' +
      idx +
      '」调试占位符生成！请在 doc spec 中提供明确真实的 title 字段。',
  )
}
