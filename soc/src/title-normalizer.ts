/**
 * 规范化社媒文章与草稿标题用于查重与特征比对（遵循办公模式与编程模式硬隔离规范）：
 * 忽略【】标签前缀、标点符号、空白字符、换行与大小写，全链路统一
 */
export function normalizeArticleTitle(title: string): string {
  if (!title) return ''
  return title
    .replace(/^【.*?】/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s，。、：；！？!?:;,.\-—_（）()【】[\]"'"'“”‘’《》/\\|`~@#$%^&*+=<>]/g, '')
}
