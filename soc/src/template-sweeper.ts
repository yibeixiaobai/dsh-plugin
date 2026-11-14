/**
 * 微信官方草稿箱占位模板废稿识别与过滤纯函数
 * 【修复依据与原因】：
 * 杜绝与自动销毁因合并多图文抓取模板或历史未完成任务遗留在草稿箱中的 SP-TEMPLATE 垃圾文章。
 * 作为纯净叶子工具模块，绝不反向依赖 draft-manager，避免形成循环引用。
 */

import type { WechatDraftCard } from './wechat-draft-parser.ts'
import { isInvalidPlaceholderTitle } from './title-adapter.ts'

/**
 * 严格判断是否为无用的占位/模板废稿（例如 SP-TEMPLATE、无标题、无封面且未完成）
 */
export function isPlaceholderTemplateDraft(title?: string, card?: WechatDraftCard): boolean {
  const t = (title || card?.articles?.[0]?.title || (card as any)?.title || '').trim()
  if (!t) return true
  if (/^SP-TEMPLATE/i.test(t)) return true
  if (isInvalidPlaceholderTitle(t)) return true
  if (t === '无标题' && card && !card.articles?.[0]?.cover_url) return true
  return false
}

/**
 * 从草稿列表中提取所有待销毁的僵尸模板草稿 ID
 */
export function findPlaceholderTemplateDraftIds(drafts: WechatDraftCard[]): string[] {
  const ids: string[] = []
  for (const d of drafts) {
    const mainTitle = d.articles?.[0]?.title || (d as any).title || ''
    if (isPlaceholderTemplateDraft(mainTitle, d)) {
      const id = d.appmsgid || d.id
      if (id && !ids.includes(id)) {
        ids.push(id)
      }
    }
  }
  return ids
}
