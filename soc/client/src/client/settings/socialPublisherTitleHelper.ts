/**
 * 规范化社媒草稿标题用于查重比对（遵循办公模式与编程模式硬隔离规范）
 */
export function normalizeSocialDraftTitle(title: string): string {
  return title
    .replace(/^【.*?】/, "")
    .trim()
    .toLowerCase()
    .replace(/[\s，。、：；！？!?:;,.\-—_（）()【】[\]"'"'“”‘’《》/\\|`~@#$%^&*+=<>]/g, "");
}
