import fs from 'node:fs'
import path from 'node:path'
import type { Config } from './config.ts'
import { workspaceDir } from './tools/shared.ts'
import { readAccountPublishRecords } from './publish-history.ts'
import { loadWechatScheduledTasks } from './schedule-manager.ts'
import { type WechatDraftCard } from './wechat-draft-parser.ts'
import { deleteWechatDraftByBrowser } from './wechat-browser.ts'
import { normalizeArticleTitle } from './title-normalizer.ts'
import { isPlaceholderTemplateDraft, findPlaceholderTemplateDraftIds } from './template-sweeper.ts'

export const WECHAT_DRAFTS_FILE = 'wechat_drafts.json'

/** 重复草稿项详情 */
export interface DuplicateDraftItem {
  id: string
  appmsgid: string
  title: string
  update_time_str: string
  updated_at: number
  article_count: number
  is_complete: boolean
  can_publish: boolean
  cover_url?: string
  is_recommended_keep: boolean
  selected_for_delete: boolean
}

/** 重复草稿分组 */
export interface DuplicateDraftGroup {
  group_key: string
  normalized_title: string
  items: DuplicateDraftItem[]
  redundant_count: number
}

/** 重复扫描预检结果 */
export interface DuplicateScanResult {
  account_id: string
  total_drafts_scanned: number
  duplicate_groups_count: number
  total_redundant_count: number
  groups: DuplicateDraftGroup[]
}

/** 批量清理结果 */
export interface BatchCleanDraftsResponse {
  ok: boolean
  account_id: string
  requested_count: number
  deleted_count: number
  failed_ids: string[]
  remaining_drafts_count: number
  error?: string
}

export function getWechatDraftsFilePath(cfg: Config, accountId?: string): string {
  const ws = workspaceDir(cfg)
  if (accountId && accountId !== 'all') {
    return path.join(ws, 'accounts', accountId, WECHAT_DRAFTS_FILE)
  }
  return path.join(ws, WECHAT_DRAFTS_FILE)
}

/**
 * 加载当前账号或全局已持久化的微信草稿箱数据
 */
export function loadWechatDrafts(cfg: Config, accountId?: string): WechatDraftCard[] {
  const drafts: WechatDraftCard[] = []
  const seenIds = new Set<string>()

  const processItems = (raw: any[], filterAccount?: boolean) => {
    if (!Array.isArray(raw)) return
    for (const item of raw) {
      const id = item?.appmsgid || item?.id
      if (id && !seenIds.has(id)) {
        if (filterAccount && accountId && accountId !== 'all' && item.account_id !== accountId) continue
        seenIds.add(id)
        drafts.push(item)
      }
    }
  }

  // 1. 优先尝试读取账号专用文件
  if (accountId && accountId !== 'all') {
    const accPath = getWechatDraftsFilePath(cfg, accountId)
    if (fs.existsSync(accPath)) {
      try { processItems(JSON.parse(fs.readFileSync(accPath, 'utf-8'))) } catch {}
    }
  }

  // 2. 尝试读取全局汇总文件
  const globalPath = getWechatDraftsFilePath(cfg)
  if (fs.existsSync(globalPath)) {
    try { processItems(JSON.parse(fs.readFileSync(globalPath, 'utf-8')), true) } catch {}
  }

  return drafts.sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
}

/**
 * 保存微信草稿箱数据至账号专用目录及全局目录
 */
export function saveWechatDrafts(
  cfg: Config,
  accountId: string,
  newDrafts: WechatDraftCard[],
): void {
  // 1. 写入账号隔离目录
  const accPath = getWechatDraftsFilePath(cfg, accountId)
  fs.mkdirSync(path.dirname(accPath), { recursive: true })
  fs.writeFileSync(accPath, JSON.stringify(newDrafts, null, 2) + '\n', 'utf-8')

  // 2. 合并写入全局汇总文件
  try {
    const globalPath = getWechatDraftsFilePath(cfg)
    let existingGlobal: WechatDraftCard[] = []
    if (fs.existsSync(globalPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(globalPath, 'utf-8'))
        if (Array.isArray(parsed)) existingGlobal = parsed
      } catch {}
    }
    // 剔除当前账号旧记录，追加新记录
    const otherAccDrafts = existingGlobal.filter(t => t.account_id !== accountId)
    const merged = [...otherAccDrafts, ...newDrafts].sort(
      (a, b) => (b.updated_at || 0) - (a.updated_at || 0),
    )
    fs.writeFileSync(globalPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8')
  } catch {}
}

/**
 * 规范化标题用于去重与特征比对：
 * 忽略【】标签前缀、标点符号、空白字符、换行与大小写，全链路统一（复用 title-normalizer）
 */
export function normalizeDraftTitle(title: string): string {
  return normalizeArticleTitle(title)
}

/** 跨库查重诊断结果 */
export interface DuplicationCheckResult {
  hasDuplication: boolean
  conflictSource?: 'publish_history' | 'scheduled_tasks' | 'draft_box'
  conflictTitle?: string
  conflictDetail?: string
}

/**
 * 全景三库穿透查重门禁：
 * 统一比对 历史发文库 (publish_history) + 微信后台排期库 (scheduled_tasks) + 微信存量草稿箱 (draft_box)
 */
export function checkTitleDuplicationInAllSources(
  cfg: Config,
  accountId: string,
  title: string,
  options?: { excludeAppmsgid?: string },
): DuplicationCheckResult {
  const cleanTitle = (title || '').trim()
  if (!cleanTitle) return { hasDuplication: false }
  const normTitle = normalizeDraftTitle(cleanTitle)
  if (!normTitle || normTitle.length < 3) return { hasDuplication: false }

  // 1. 比对历史已发布库 (publish_history.json)
  const history = readAccountPublishRecords(cfg, accountId)
  for (const rec of history) {
    for (const art of rec.articles || []) {
      if (normalizeDraftTitle(art) === normTitle) {
        return {
          hasDuplication: true,
          conflictSource: 'publish_history',
          conflictTitle: art,
          conflictDetail: `已于 ${rec.timestamp || '历史记录'} 成功发表过该文章`,
        }
      }
    }
  }

  // 2. 比对后台已排期库 (wechat_scheduled_tasks.json)
  const tasks = loadWechatScheduledTasks(cfg, accountId)
  for (const t of tasks) {
    for (const art of t.articles || []) {
      if (normalizeDraftTitle(art.title) === normTitle) {
        return {
          hasDuplication: true,
          conflictSource: 'scheduled_tasks',
          conflictTitle: art.title,
          conflictDetail: `已在微信官方定时发表排期中（时间：${t.display_time || t.scheduled_time || '未来排期'}）`,
        }
      }
    }
  }

  // 3. 比对微信存量草稿箱 (wechat_drafts.json)
  const drafts = loadWechatDrafts(cfg, accountId)
  for (const d of drafts) {
    if (options?.excludeAppmsgid && (d.appmsgid === options.excludeAppmsgid || d.id === options.excludeAppmsgid)) {
      continue
    }
    for (const art of d.articles || []) {
      if (normalizeDraftTitle(art.title) === normTitle) {
        return {
          hasDuplication: true,
          conflictSource: 'draft_box',
          conflictTitle: art.title,
          conflictDetail: `微信草稿箱中已存在该草稿（更新于 ${d.update_time_str || '近期'}）`,
        }
      }
    }
  }

  return { hasDuplication: false }
}

/**
 * 智能扫描并分组当前账号下的重复草稿
 * @param strategy 保留策略：keep_latest（最新优先，默认）、keep_complete（完整无报错优先）、keep_oldest（最早创建优先）
 */
export function scanDuplicateDrafts(
  cfg: Config,
  accountId: string,
  strategy: 'keep_latest' | 'keep_oldest' | 'keep_complete' = 'keep_latest',
): DuplicateScanResult {
  const drafts = loadWechatDrafts(cfg, accountId)
  const map = new Map<string, WechatDraftCard[]>()

  // 1. 按规范化主标题分组
  for (const draft of drafts) {
    const mainTitle = draft.articles?.[0]?.title || (draft as any).title || ''
    const key = normalizeDraftTitle(mainTitle)
    if (!key) continue
    const list = map.get(key) || []
    list.push(draft)
    map.set(key, list)
  }

  const groups: DuplicateDraftGroup[] = []
  let totalRedundant = 0

  // 2. 筛选出至少包含 2 篇草稿的重复组
  for (const [key, rawItems] of map.entries()) {
    if (rawItems.length <= 1) continue

    // 依据策略对组内草稿排序，排序后位于第 1 位的项为算法推荐保留项
    const sorted = [...rawItems].sort((a, b) => {
      // 若包含 keep_complete 策略或默认策略，完整度优先
      if (strategy === 'keep_complete' || strategy === 'keep_latest') {
        const aComplete = a.is_complete !== false
        const bComplete = b.is_complete !== false
        if (aComplete !== bComplete) {
          return aComplete ? -1 : 1
        }
      }
      if (strategy === 'keep_oldest') {
        return (a.updated_at || 0) - (b.updated_at || 0)
      }
      // 默认 keep_latest：时间最近者优先
      return (b.updated_at || 0) - (a.updated_at || 0)
    })

    const items: DuplicateDraftItem[] = sorted.map((d, index) => {
      const title = d.articles?.[0]?.title || (d as any).title || '无标题'
      const isPlaceholder = isPlaceholderTemplateDraft(title, d)
      return {
        id: d.id,
        appmsgid: d.appmsgid,
        title,
        update_time_str: d.update_time_str || '',
        updated_at: d.updated_at || 0,
        article_count: d.articles?.length || 1,
        is_complete: d.is_complete !== false && !isPlaceholder,
        can_publish: d.can_publish !== false && !isPlaceholder,
        cover_url: d.articles?.[0]?.cover_url,
        is_recommended_keep: index === 0 && !isPlaceholder,
        selected_for_delete: index > 0 || isPlaceholder,
      }
    })

    groups.push({
      group_key: key,
      normalized_title: items[0].title,
      items,
      redundant_count: items.length - 1,
    })
    totalRedundant += items.length - 1
  }

  return {
    account_id: accountId,
    total_drafts_scanned: drafts.length,
    duplicate_groups_count: groups.length,
    total_redundant_count: totalRedundant,
    groups,
  }
}

/**
 * 单项草稿删除管理入口：调用远端微信驱动物理删除，并原子更新本地 JSON
 */
export async function deleteWechatDraft(
  cfg: Config,
  accountId: string,
  appmsgid: string,
  articleType: 'news' | 'newspic' = 'news',
): Promise<{ ok: boolean; deleted_id: string; remaining_count: number; error?: string }> {
  // 1. 调用远端微信后台删除驱动
  const res = await deleteWechatDraftByBrowser(cfg, accountId, appmsgid, articleType)
  if (!res.ok && !cfg.runtime.dry_run) {
    return { ok: false, deleted_id: appmsgid, remaining_count: 0, error: res.error }
  }

  // 2. 从本地持久化存储中原子剔除该项
  const current = loadWechatDrafts(cfg, accountId)
  const filtered = current.filter(item => item.appmsgid !== appmsgid && item.id !== appmsgid)
  saveWechatDrafts(cfg, accountId, filtered)

  return {
    ok: true,
    deleted_id: appmsgid,
    remaining_count: filtered.length,
  }
}

/**
 * 批量清理重复草稿管理入口：带频控逐篇执行远端物理删除，并原子更新本地 JSON
 */
export async function batchDeleteWechatDrafts(
  cfg: Config,
  accountId: string,
  appmsgids: string[],
): Promise<BatchCleanDraftsResponse> {
  const failedIds: string[] = []
  let deletedCount = 0

  for (const appmsgid of appmsgids) {
    try {
      const res = await deleteWechatDraftByBrowser(cfg, accountId, appmsgid)
      if (res.ok || cfg.runtime.dry_run) {
        deletedCount++
      } else {
        failedIds.push(appmsgid)
      }
    } catch {
      failedIds.push(appmsgid)
    }
    // 留出 150ms 微间隔，避免高频请求触发微信后台风控
    await new Promise(r => setTimeout(r, 150))
  }

  // 从本地持久化存储中原子移除已删除的草稿项
  const current = loadWechatDrafts(cfg, accountId)
  const remaining = current.filter((item) => {
    const wasDeleted = appmsgids.includes(item.appmsgid) && !failedIds.includes(item.appmsgid)
    return !wasDeleted
  })
  saveWechatDrafts(cfg, accountId, remaining)

  return {
    ok: failedIds.length === 0,
    account_id: accountId,
    requested_count: appmsgids.length,
    deleted_count: deletedCount,
    failed_ids: failedIds,
    remaining_drafts_count: remaining.length,
  }
}

/**
 * 历史残留脏模板草稿主动清道夫 (Active Template Sweeper)
 */
export async function sweepPlaceholderTemplateDrafts(
  cfg: Config,
  accountId: string,
): Promise<{ swept_count: number; swept_ids: string[]; failed_ids: string[] }> {
  const drafts = loadWechatDrafts(cfg, accountId)
  const zombieIds = findPlaceholderTemplateDraftIds(drafts)
  if (zombieIds.length === 0) return { swept_count: 0, swept_ids: [], failed_ids: [] }
  const delRes = await batchDeleteWechatDrafts(cfg, accountId, zombieIds)
  return {
    swept_count: delRes.deleted_count,
    swept_ids: zombieIds.filter(id => !delRes.failed_ids.includes(id)),
    failed_ids: delRes.failed_ids,
  }
}
export { isPlaceholderTemplateDraft, findPlaceholderTemplateDraftIds }
